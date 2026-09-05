import type { IsoCameraController } from '../engine/IsoCameraController';
import { SelectionOutline } from '../engine/SelectionOutline';
import type { Ray3 } from '../game/surfacePick';
import type { SwatchOverlayFrame, SwatchVoxel } from '../ui/SwatchOverlay';
import { CELL_HEIGHT, SWATCH } from '../world/scenes/swatchLayout';
import {
  SWATCH_FOCUS,
  SWATCH_ITEM_GAP,
  swatchExtent,
  swatchFocusExtent,
  swatchSubjectAt,
  type SwatchFocus,
  type SwatchSubject,
} from '../world/scenes/swatchCatalog';
import { firstSolidVoxel } from '../world/scenes/swatchPick';
import { cellDetail, type SwatchDetail } from '../world/scenes/swatchProbe';
import type { VoxelWorld } from '../world/VoxelWorld';
import { SELECT_CLICK_SLOP } from './pointerPick';

/**
 * Il campionario: una scena che non e' la citta', e che ha uno stato tutto suo.
 *
 * Cinque valori che nessun altro strato legge — il soggetto sotto il cursore,
 * quello scelto, il voxel colpito, la fascia inquadrata e il tempo dell'ultimo
 * clic — piu' il contorno che li disegna. Stanno insieme perche' si scrivono a
 * vicenda: un clic cambia scelta, contorno e inquadratura nello stesso gesto, e
 * `Esc` li rimette tutti e tre dov'erano.
 *
 * Vive solo in `?scene=swatch`. Fuori di li' l'oggetto non nasce affatto, che e'
 * il modo in cui il resto della radice non deve piu' chiedersi in quale scena si
 * trova.
 */
export interface SwatchSceneDeps {
  readonly element: HTMLElement;
  readonly world: VoxelWorld;
  readonly camera: IsoCameraController;
  readonly cursorRay: (clientX: number, clientY: number) => Ray3;
}

export interface SwatchScene {
  /** Il contorno del soggetto: lo aggiunge alla scena chi costruisce il mondo. */
  readonly group: SelectionOutline['group'];
  /** Va aggiornato a ogni frame come gli altri contorni: la cometa vive in un `uTime`. */
  update(dt: number): void;
  /** L'unica lettura del campionario: la consumano overlay e `__voxelSwatch()`. */
  frame(): SwatchOverlayFrame;
  /**
   * Inquadra una fascia, con un margine che non appartiene agli oggetti.
   *
   * Il perno va a **meta' dell'altezza della fascia**, non sul basamento: le
   * arcologie arrivano a settecentotrentasette voxel, e con il centro
   * dell'inquadratura a terra la loro punta restava fuori campo perfino premendo
   * il pulsante che dovrebbe mostrarle. Sotto, l'altezza spesa sul vuoto era
   * altrettanta.
   */
  frameFocus(focus: SwatchFocus): void;
  /**
   * La prima immagine: il campionario completo, che e' anche la fascia di
   * partenza. Non e' un caso a parte di `frameFocus`, e' la stessa chiamata sul
   * valore da cui la fascia nasce.
   */
  frameInitial(): void;
  /**
   * Molla la scelta e torna alla fascia da cui si era partiti; falso se non
   * c'era niente da mollare, e allora `Esc` prosegue verso gli altri handler.
   *
   * Il ritorno all'inquadratura non e' cortesia: dopo un doppio clic la scelta
   * **e'** anche l'inquadratura, e mollarla restando addosso al soggetto
   * lascerebbe la camera su qualcosa che non e' piu' scelto.
   */
  releaseSelection(): boolean;
  /** Registra i gesti sul canvas. Va chiamata dove stavano prima, che l'ordine conta. */
  attach(): void;
}

/** Finestra del doppio clic: il default di Windows, che e' quello che si ha nelle dita. */
const DOUBLE_CLICK_MS = 500;

/**
 * Prismi di dettaglio della cella indicata, o null fuori dalla matrice.
 *
 * Solo la matrice: stratigrafia, scala e gallerie non sono provini della stessa
 * sagoma, e un conteggio li' risponderebbe a una domanda che nessuno ha fatto.
 * `cellDetail` memoizza, quindi ripassare sulla stessa cella non rimisura.
 *
 * Sta fuori dalla scena perche' non legge niente di suo: la interroga anche
 * l'hook globale, su un soggetto che il cursore non sta indicando.
 */
export function swatchDetailOf(subject: SwatchSubject | null): SwatchDetail | null {
  if (subject === null || subject.kind !== 'matrix') return null;
  return cellDetail(subject.row, subject.col);
}

export function createSwatchScene(deps: SwatchSceneDeps): SwatchScene {
  const { world, camera } = deps;

  /** Soggetto sotto il cursore; lo leggono overlay e hook globale. */
  let subject: SwatchSubject | null = null;
  /** Soggetto scelto con un clic: sopravvive alla navigazione fra le fasce. */
  let selection: SwatchSubject | null = null;
  /** Il voxel davvero colpito dal raggio, con il referto per la scheda. */
  let voxel: SwatchVoxel | null = null;
  /** Fascia inquadrata dai pulsanti; si parte da «Tutto». */
  let focus: SwatchFocus = SWATCH_FOCUS.all;
  /** Braccio anti-pan: sotto la soglia il rilascio e' un clic, non una rotazione. */
  let pointerDown = false;
  let pointerX = 0;
  let pointerY = 0;
  /**
   * Quando e' arrivato il clic precedente, per riconoscere il doppio.
   *
   * Il doppio clic si conta qui e non su `dblclick`: `CameraInput` annulla il
   * `pointerdown` per tenersi il trascinamento, e da li' in poi quali eventi
   * composti il browser continui a sintetizzare non e' piu' una garanzia su cui
   * appoggiare l'unico gesto che inquadra un soggetto.
   */
  let lastClickMs = Number.NEGATIVE_INFINITY;

  /**
   * Il contorno della scelta.
   *
   * Riusa la stessa vista della citta' ma con una quota di suolo piatta: il
   * basamento del campionario e' uniforme, quindi `heightAt` risponde sempre
   * `SWATCH.groundZ`. Il riquadro del soggetto scelto arriva da `swatchSubjectAt`.
   */
  const outline = new SelectionOutline(() => SWATCH.groundZ);

  /**
   * Quale soggetto sta sotto il cursore, e su quale voxel esatto.
   *
   * Una sola traversata di raggio per entrambe le risposte: il voxel colpito dice
   * *dove* si e' puntato, il soggetto si ricava dalla colonna di quel voxel. Il
   * vuoto fra due soggetti non appartiene a nessuno — il basamento sotto il vuoto
   * si attraversa ma `swatchSubjectAt` non lo assegna a nulla.
   */
  function pickAt(
    clientX: number,
    clientY: number,
  ): { readonly subject: SwatchSubject | null; readonly voxel: SwatchVoxel | null } | null {
    const ray = deps.cursorRay(clientX, clientY);
    const extent = swatchExtent();
    const hit = firstSolidVoxel(
      {
        ox: ray.origin[0],
        oy: ray.origin[1],
        oz: ray.origin[2],
        dx: ray.direction[0],
        dy: ray.direction[1],
        dz: ray.direction[2],
      },
      {
        minX: extent.minX,
        minY: extent.minY,
        minZ: 0,
        maxX: extent.minX + extent.sizeX,
        maxY: extent.minY + extent.sizeY,
        maxZ: extent.sizeZ,
      },
      (x, y, z) => world.getBlock(x, y, z) !== 0,
    );
    if (hit === null) return null;
    return {
      subject: swatchSubjectAt(hit.x, hit.y),
      voxel: {
        x: hit.x,
        y: hit.y,
        z: hit.z,
        palette: world.getBlock(hit.x, hit.y, hit.z),
        surface: world.getSurfaceKind(hit.x, hit.y, hit.z),
      },
    };
  }

  /**
   * Il contorno segue la scelta persistente; senza, l'eventuale hover.
   *
   * Una scelta sopravvive alla navigazione fra le fasce e al cursore che se ne va:
   * il contorno continua a dire cosa si sta guardando finche' non si deseleziona.
   */
  function refreshOutline(): void {
    const shown = selection ?? subject;
    if (shown === null) {
      outline.hide();
      return;
    }
    outline.show({
      x0: shown.rect.x0,
      y0: shown.rect.y0,
      x1: shown.rect.x1 - 1,
      y1: shown.rect.y1 - 1,
      z0: SWATCH.groundZ,
      z: shown.z1,
    });
  }

  function frameFocus(next: SwatchFocus): void {
    focus = next;
    const e = swatchFocusExtent(next);
    camera.frameRegion(
      e.minX + e.sizeX / 2,
      e.minY + e.sizeY / 2,
      e.sizeX,
      e.sizeY,
      e.sizeZ,
      (SWATCH.groundZ + e.sizeZ) / 2,
    );
  }

  /**
   * Inquadra un solo soggetto, dal basamento alla punta.
   *
   * E' l'unico modo di guardare da vicino una megastruttura: la fascia intera
   * mette quindici arcologie una accanto all'altra, e avvicinarsi con la rotella
   * taglia proprio la cima, perche' lo zoom stringe attorno al centro
   * dell'inquadratura. Qui il soggetto **e'** l'inquadratura.
   */
  function frameSubject(chosen: SwatchSubject): void {
    const margin = SWATCH_ITEM_GAP * 2;
    camera.frameRegion(
      (chosen.rect.x0 + chosen.rect.x1) / 2,
      (chosen.rect.y0 + chosen.rect.y1) / 2,
      chosen.rect.x1 - chosen.rect.x0 + margin,
      chosen.rect.y1 - chosen.rect.y0 + margin,
      chosen.z1 - chosen.z0,
      (chosen.z0 + chosen.z1) / 2,
    );
  }

  /**
   * Il rilascio che sceglie, con la stessa soglia anti-pan del clic di gioco.
   *
   * Il secondo clic ravvicinato sullo **stesso** soggetto inquadra: il primo ha
   * gia' il suo mestiere — riempire la scheda del referto — e prendersi anche
   * l'inquadratura vorrebbe dire strattonare la camera a chi stava solo leggendo.
   */
  function onPointerUp(event: PointerEvent): void {
    if (!pointerDown || event.button !== 0) return;
    pointerDown = false;
    const moved = Math.abs(event.clientX - pointerX) + Math.abs(event.clientY - pointerY);
    if (moved > SELECT_CLICK_SLOP) return;

    const pick = pickAt(event.clientX, event.clientY);
    const picked = pick?.subject ?? null;
    const doubled = picked !== null
      && picked === selection
      && performance.now() - lastClickMs <= DOUBLE_CLICK_MS;
    lastClickMs = performance.now();
    selection = picked;
    voxel = pick?.voxel ?? null;
    refreshOutline();
    if (doubled) frameSubject(picked);
  }

  return {
    group: outline.group,

    update(dt: number): void {
      outline.update(dt);
    },

    frame(): SwatchOverlayFrame {
      const shown = subject ?? selection;
      return {
        focus,
        subject: shown,
        selection,
        voxel,
        detail: swatchDetailOf(shown),
      };
    },

    frameFocus,

    frameInitial(): void {
      frameFocus(focus);
    },

    releaseSelection(): boolean {
      if (selection === null) return false;
      selection = null;
      refreshOutline();
      frameFocus(focus);
      return true;
    },

    attach(): void {
      deps.element.addEventListener('pointermove', (event: PointerEvent) => {
        const pick = pickAt(event.clientX, event.clientY);
        subject = pick?.subject ?? null;
        voxel = pick?.voxel ?? null;
        refreshOutline();
      });
      deps.element.addEventListener('pointerleave', () => {
        subject = null;
        voxel = null;
        refreshOutline();
      });
      deps.element.addEventListener('pointerdown', (event: PointerEvent) => {
        pointerDown = event.button === 0;
        pointerX = event.clientX;
        pointerY = event.clientY;
      });
      deps.element.addEventListener('pointerup', onPointerUp);
    },
  };
}

/**
 * Il perno della camera nel campionario, che e' quasi piatto.
 *
 * Sta qui e non fra le costanti della radice perche' e' una proprieta' di questa
 * scena: un perno a ventiquattro voxel — quello dell'isola — la farebbe ruotare
 * attorno a un punto sospeso sopra la griglia.
 */
export const SWATCH_PIVOT = SWATCH.groundZ + CELL_HEIGHT / 2;
