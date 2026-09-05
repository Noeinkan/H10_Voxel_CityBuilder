import type { WebGLRenderer } from 'three';
import type { FrameTiming } from '../engine/FrameTiming';
import type { InspectView } from '../engine/InspectView';
import { INSPECT_MODE } from '../engine/inspect';
import type { IsoCameraController } from '../engine/IsoCameraController';
import type { PostProcessingHandle } from '../engine/PostProcessing';
import type { QualityProfile, RenderQualityController } from '../engine/RenderQuality';
import { StreetCameraController } from '../engine/street/StreetCameraController';
import { StreetView } from '../engine/street/StreetView';
import { eyePoint, eyeRefusal } from '../engine/street/streetEye';
import type { SurfaceCell } from '../game/surfacePick';
import type { GameHud } from '../ui/GameHud';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { SELECT_CLICK_SLOP } from './pointerPick';

/**
 * La discesa a terra: armarla, posare l'occhio, risalire.
 *
 * Lo stato e' un flag solo — «il prossimo clic scende?» — piu' l'ancora del
 * gesto, e proprio per questo va posseduto qui: `Esc`, il tasto `O`, il clic sul
 * canvas e l'uscita automatica lo scrivono da quattro punti diversi, e finche'
 * stava fra i `let` della radice nessuno di quei quattro poteva dire di
 * comandarlo.
 *
 * Il modulo costruisce anche la `StreetView`: il suo controller vuole un
 * `onLockChange` che rimanda alla targa a schermo, e quella targa e' roba di qui.
 * Chi lo monta si riprende l'oggetto e continua a usarlo come prima.
 */
export interface StreetEyeDeps {
  readonly camera: IsoCameraController;
  readonly element: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly post: PostProcessingHandle;
  readonly renderQuality: RenderQualityController;
  readonly frameTiming: FrameTiming;
  /**
   * Le viste d'ispezione arrivano come funzione, e non e' pigrizia: nascono con
   * la rete stradale, cioe' dopo il terreno, mentre la discesa deve esistere gia'
   * prima — il gating di qualita' le chiede se si sta guardando da terra.
   */
  readonly inspect: () => InspectView;
  readonly hud: () => GameHud | null;
  readonly map: () => TerrainMap | null;
  readonly pointedCellAt: (clientX: number, clientY: number) => SurfaceCell | null;
  readonly syncResolution: () => void;
  readonly applyQuality: (profile: QualityProfile) => void;
  /** Il profilo in vigore, per rimetterlo quando la qualita' non e' cambiata. */
  readonly quality: () => QualityProfile;
  readonly voxelSize: number;
  readonly width: number;
  readonly height: number;
  /**
   * Il piano lontano e' la **diagonale del mondo** e non una distanza di disegno
   * scelta a mano: la nebbia dei temi e' cosi' rada che il velo si chiude dopo
   * migliaia di voxel, quindi tagliare prima mostrerebbe il taglio invece di
   * nasconderlo. A limitare il costo c'e' il campo visivo, piu' il culling per
   * chunk che gira gia' sul frustum della camera.
   */
  readonly far: number;
}

export interface StreetEye {
  readonly streetView: StreetView;
  /**
   * Arma o disarma la discesa, e da terra la annulla.
   *
   * Un tasto solo per tre stati perche' sono la stessa domanda — «voglio guardare
   * da terra?» — e tre tasti per una domanda sola sarebbero tre cose da ricordare.
   */
  toggle(): void;
  /** `Esc`: disarma o risale. Falso se non c'era niente da chiudere. */
  escape(): boolean;
  attach(): void;
}

export function createStreetEye(deps: StreetEyeDeps): StreetEye {
  const { renderer, post, renderQuality, frameTiming } = deps;

  /**
   * Lo strumento che scende a terra: si arma, poi si clicca dove ci si vuole
   * mettere.
   *
   * Sono due tempi come in Block focus, e per la stessa ragione: puntare non e'
   * scegliere. Armato, il prossimo clic posa l'occhio; disarmato, il clic torna a
   * scegliere un edificio. Senza i due tempi ogni clic sulla citta' sarebbe una
   * discesa, e non ci sarebbe piu' modo di aprire la scheda di un isolato.
   */
  let armed = false;
  let pointerDown = false;
  let pointerX = 0;
  let pointerY = 0;

  /**
   * La targa che resta a schermo quando tutto il resto e' sparito.
   *
   * Dice due cose diverse a seconda che lo sguardo sia agganciato o no, e la
   * seconda e' quella che conta: perso il lock — `Esc`, un alt-tab — muovere il
   * mouse non fa piu' niente, e senza una riga che dica «clicca» sembrerebbe che
   * la vista si sia rotta.
   */
  function syncHint(locked: boolean): void {
    if (!streetView.active) return;
    deps.hud()?.setStreetView(
      true,
      locked
        ? 'Move to look · wheel to zoom · F levels the horizon · Esc to leave'
        : 'Click to look around · Esc to leave',
    );
  }

  const streetView = new StreetView(
    deps.camera,
    deps.element,
    new StreetCameraController(deps.width, deps.height, {
      voxelSize: deps.voxelSize,
      far: deps.far,
      onLockChange: (locked) => syncHint(locked),
    }),
    deps.voxelSize,
  );

  /**
   * Le conseguenze del cambio di modo, in un posto solo.
   *
   * Nessuna appartiene a `StreetView`, che sa solo quale camera sta disegnando: il
   * composer disegna con la camera che gli si dice, e quanto si puo' spendere per
   * fotogramma lo decide `RenderQuality` guardando i tempi.
   *
   * **La vista ferma vale una resa migliore, e non e' un regalo.** Da terra la
   * camera non si muove: la coda di remesh si ordina una volta e poi mai, nessun
   * chunk nuovo entra nel frustum, e la scatola dell'ombra si stringe attorno
   * all'occhio invece di coprire mezza isola — la pass d'ombra ne esce piu' leggera
   * di prima. Quel margine si spende dove si vede, cioe' sopra la densita' dello
   * schermo, che e' l'unica manopola che tocchi gli spigoli dei voxel. Il controllo
   * adattivo continua a sorvegliare e a scendere se il frame non tiene: qui si
   * sposta il punto di partenza dell'isteresi, non la si scavalca.
   */
  function syncView(): void {
    post.setCamera(streetView.view);
    deps.hud()?.setStreetView(streetView.active, null);
    if (streetView.active) syncHint(streetView.controller.looking);
    const quality = streetView.active
      ? renderQuality.enterBoost(performance.now())
      : renderQuality.exitBoost(performance.now());
    if (quality.changed) {
      renderer.setPixelRatio(quality.pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      post.setSize(window.innerWidth, window.innerHeight, quality.pixelRatio);
      deps.syncResolution();
      frameTiming.reset();
    }
    // Dopo il pixel ratio, perche' la dimensione della shadow map dipende dal modo
    // e il profilo puo' essere appena cambiato con lui.
    deps.applyQuality(quality.changed ? quality.profile : deps.quality());
    // A terra il toast e' nascosto insieme al resto dell'HUD: a dire come si esce
    // c'e' la targa. Il messaggio serve solo a chi e' appena risalito.
    if (!streetView.active) deps.hud()?.showTransientFeedback('Back to the city.');
  }

  /** Risale, e restituisce l'inquadratura esattamente com'era. */
  function exit(): void {
    armed = false;
    if (!streetView.active) return;
    streetView.exit();
    syncView();
  }

  /** Posa l'occhio sul punto puntato, se ci si puo' stare. */
  function placeEye(clientX: number, clientY: number): void {
    const map = deps.map();
    if (map === null) return;
    const cell = deps.pointedCellAt(clientX, clientY);
    const refusal = eyeRefusal(cell, (x, y) => map.waterTopAt(x, y));
    if (refusal !== null || cell === null) {
      deps.hud()?.showFeedback(
        refusal === 'underwater' ? 'Nowhere to stand: that is water.' : 'Nothing to stand on there.',
        'neutral',
      );
      return;
    }

    armed = false;
    // Le viste d'ispezione reggono la **stessa** camera e ne catturano lo stato per
    // restituirlo: lasciarne una aperta vorrebbe dire due proprietari della stessa
    // inquadratura, e chi esce per ultimo rimette quella sbagliata. Per lo stesso
    // motivo un taglio non sopravvive alla discesa — da terra si guarderebbe
    // dentro una citta' a cui manca meta' del volume.
    deps.inspect().setMode(INSPECT_MODE.off);

    const [x, y, z] = eyePoint(cell);
    streetView.enter(x, y, z);
    syncView();
  }

  return {
    streetView,

    toggle(): void {
      if (streetView.active) {
        exit();
        return;
      }
      armed = !armed;
      deps.hud()?.showTransientFeedback(
        armed ? 'Street view · click where to stand.' : 'Street view cancelled.',
      );
    },

    escape(): boolean {
      if (!armed && !streetView.active) return false;
      exit();
      return true;
    },

    attach(): void {
      // Registrato per primo fra i `pointerup` di gioco: armato, la discesa si
      // prende il clic e la selezione non deve nemmeno provarci.
      deps.element.addEventListener('pointerdown', (event: PointerEvent) => {
        pointerDown = event.button === 0;
        pointerX = event.clientX;
        pointerY = event.clientY;
      });
      deps.element.addEventListener('pointerup', (event: PointerEvent) => {
        if (!pointerDown || event.button !== 0) return;
        pointerDown = false;
        if (!armed) return;
        // Stessa soglia del clic che sceglie: il tasto sinistro e' gia' un pan, e
        // fino al rilascio non si sa se il gesto fosse un clic o una rotazione.
        const moved = Math.abs(event.clientX - pointerX) + Math.abs(event.clientY - pointerY);
        if (moved > SELECT_CLICK_SLOP) return;
        placeEye(event.clientX, event.clientY);
      });
    },
  };
}
