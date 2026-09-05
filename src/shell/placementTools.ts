import type { Group } from 'three';
import type { InfluenceOverlay } from '../engine/InfluenceOverlay';
import type { InspectView } from '../engine/InspectView';
import { PLACEMENT_FACADES, PLACEMENT_SURFACE, PlacementCursor } from '../engine/PlacementCursor';
import type { GrowthScene } from '../game/growthScene';
import { pickFacade } from '../game/facadePick';
import { coastalSectorAt, type CoastalSector } from '../game/sectors';
import type { Ray3, SurfaceCell } from '../game/surfacePick';
import { BALANCE } from '../sim/balance';
import { catalystById, defaultCatalystOfClass } from '../sim/catalysts';
import type { GameHud, GameTool } from '../ui/GameHud';
import { unlockLines } from '../ui/prospects';
import { viewAfterToolPicked, viewLabel } from '../ui/ViewMenuModel';
import type { AerialFace } from '../world/aerial/terracePlan';
import { footprintDepth, type BuildingRecord } from '../world/buildings/BuildingRegistry';
import { isGroundStructure } from '../world/buildings/structureKind';
import { typologiesForUses } from '../world/buildings/typology';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { Region } from '../world/terrain/region';
import {
  actionFailureLabel,
  classLabel,
  groundNote,
  landmarkNote,
  reachNote,
} from './actionLabels';
import { createDemolishGesture } from './demolishGesture';

/**
 * Lo strumento in mano, e tutto cio' che il puntatore ne fa.
 *
 * E' il proprietario di `selectedTool`, che prima era il `let` piu' letto della
 * radice: lo scrivono il dock, il tasto `Esc`, la cifra sulla tastiera e ogni
 * posa riuscita, e lo leggono la scheda, il coach e le viste d'ispezione. Adesso
 * lo scrive **solo** questo modulo, e chi lo legge lo chiede.
 *
 * Il mirino di posa e' suo; il gesto della gomma no — quello ha una memoria
 * propria e vive in [demolishGesture]. Qui resta chi decide *quale* dei due sta
 * rispondendo al puntatore, che e' la domanda che `selectedTool` pone.
 */
export interface PlacementToolsDeps {
  readonly element: HTMLElement;
  readonly map: () => TerrainMap | null;
  readonly scene: () => GrowthScene | null;
  readonly hud: () => GameHud | null;
  /**
   * Le viste d'ispezione arrivano come funzione: nascono con la rete stradale,
   * cioe' dopo il terreno, e il mirino esiste gia' prima di loro.
   */
  readonly inspect: () => InspectView;
  readonly influence: InfluenceOverlay | null;
  readonly region: Region;
  readonly surfaceCellAt: (clientX: number, clientY: number) => SurfaceCell | null;
  readonly pointedCellAt: (clientX: number, clientY: number) => SurfaceCell | null;
  readonly cursorRay: (clientX: number, clientY: number) => Ray3;
  readonly streetActive: () => boolean;
  /** Finche' l'isola arriva a blocchi non si compra terra: il rifiuto lo dice. */
  readonly generationDone: () => boolean;
  /** Il cursore a mano vuota non piazza niente: rimette in campo la scelta. */
  readonly onIdleMove: () => void;
  /** Il settore e' pagato: il terreno nuovo lo genera chi possiede lo streamer. */
  readonly onExpansion: (sector: CoastalSector) => void;
}

export interface PlacementTools {
  readonly tool: GameTool;
  /** Il mirino, il riquadro della gomma e i suoi tappeti: da aggiungere alla scena. */
  readonly groups: readonly Group[];
  update(dt: number): void;
  /** Lo strumento scelto dal dock, con le viste che gli fanno spazio. */
  pickTool(tool: GameTool): void;
  /** Molla lo strumento: lo chiede il dock, che la propria tessera la spegne da se'. */
  cancel(): void;
  /** Come sopra, ma dicendolo anche al dock: lo chiede chi molla lo strumento al posto suo. */
  releaseTool(): void;
  attach(): void;
}

export function createPlacementTools(deps: PlacementToolsDeps): PlacementTools {
  const { influence } = deps;

  let selectedTool: GameTool = { kind: 'none' };

  const preview = new PlacementCursor();
  const demolish = createDemolishGesture({
    map: deps.map,
    scene: deps.scene,
    hud: deps.hud,
    pointedCellAt: deps.pointedCellAt,
  });

  /** I segnaposto si spengono sempre insieme: uno acceso da solo mente. */
  function hideCues(): void {
    preview.hide();
    demolish.cancel();
    influence?.hideCursor();
  }

  /**
   * L'edificio ordinario sotto la colonna, o null.
   *
   * Lo stesso filtro di `buildingAt` nel driver, e adesso alla lettera lo stesso
   * predicato: campate, impalcati e landmark non hanno una facciata su cui
   * appendersi, e sotto di loro si cerca l'ospite.
   */
  function facadeHostAt(x: number, y: number): BuildingRecord | null {
    const scene = deps.scene();
    if (scene === null) return null;
    return scene.registry.at(x, y).find(isGroundStructure) ?? null;
  }

  /** Il fronte dell'edificio ordinario puntato; null lascia il mirino sul terreno. */
  function facadeFacingAt(x: number, y: number): number | null {
    const record = facadeHostAt(x, y);
    return record === null ? null : record.facing ?? 0;
  }

  /**
   * La faccia dell'edificio sotto il puntatore, dal raggio e non dal record.
   *
   * E' la risposta che mancava: il fronte strada e' una proprieta' dell'edificio,
   * e puntare il suo retro lo mostrava li' — sulla faccia opposta a quella sotto
   * il mouse. Qui entra la geometria: il punto d'ingresso del raggio nella
   * scatola dell'edificio dice da che parte si sta guardando. Null quando non
   * c'e' un ospite o la faccia non si distingue, e chi chiama ricade sul fronte.
   */
  function facadeUnderPointer(
    clientX: number,
    clientY: number,
    cell: SurfaceCell,
  ): AerialFace | null {
    const host = facadeHostAt(cell.x, cell.y);
    if (host === null) return null;
    return pickFacade(deps.cursorRay(clientX, clientY), {
      x: host.x,
      y: host.y,
      sizeX: host.footprint,
      sizeY: footprintDepth(host),
      baseZ: host.baseZ,
      height: host.height,
    });
  }

  /**
   * Su quale colonna cade un catalizzatore: il terreno, o la facciata che si sta
   * puntando.
   *
   * **Un solo strumento, due strutture, e adesso e' il modo a scegliere.** Il
   * selettore di posa decide fra suolo e tetto prima del click: a terra conta la
   * colonna del terreno, in quota quella dell'edificio puntato. Il resto lo decide
   * `src/world/` guardando cosa c'e' sotto.
   */
  function catalystTarget(
    clientX: number,
    clientY: number,
    fallback: SurfaceCell,
    aloft: boolean,
  ): SurfaceCell {
    if (!aloft) return fallback;
    return deps.pointedCellAt(clientX, clientY) ?? fallback;
  }

  function onPointerMove(event: PointerEvent): void {
    if (deps.streetActive()) return;
    const scene = deps.scene();
    const hud = deps.hud();
    if (selectedTool.kind === 'none' || scene === null || deps.map() === null) {
      preview.hide();
      deps.onIdleMove();
      hud?.updateCursor(0, 0, null);
      return;
    }
    const cell = deps.surfaceCellAt(event.clientX, event.clientY);
    if (cell === null) {
      preview.hide();
      influence?.hideCursor();
      hud?.updateCursor(event.clientX, event.clientY, {
        title: 'No surface',
        details: 'Move the cursor over the island.',
        valid: false,
        reason: 'No selectable column.',
      });
      return;
    }
    let valid = false;
    if (selectedTool.kind === 'catalyst') {
      const catalyst = catalystById(selectedTool.id ?? defaultCatalystOfClass(selectedTool.class));
      const aloft = (selectedTool.mode ?? 'ground') === 'aloft';
      // In quota la colonna che conta e' quella dell'edificio, non del terreno
      // dietro di lui: e' la stessa distinzione della mensola, e per la stessa
      // ragione — la heightmap attraversa una torre come se fosse vetro e si
      // ferma sulla terra dietro. A terra vale il suolo, come per ogni altro ruolo.
      const target = catalystTarget(event.clientX, event.clientY, cell, aloft);
      // La faccia sotto il puntatore entra nella domanda: senza, il mirino e il
      // click cadrebbero sul fronte strada anche puntando il lato opposto della
      // torre. E' la stessa risposta per il rifiuto e per l'orientamento del
      // mirino, quindi le due non possono divergere.
      const preferred = aloft
        ? facadeUnderPointer(event.clientX, event.clientY, target) ?? undefined
        : undefined;
      const failure = scene.catalystFailure(target.x, target.y, catalyst.id, aloft, preferred);
      const radius = catalyst.radius;
      const site = scene.catalystSiteCost(target.x, target.y, catalyst.id);
      const cost = site === null ? catalyst.cost : site.cost;
      valid = failure === null;
      const coverage = influence?.showCursor(
        target.x,
        target.y,
        radius,
        valid,
        scene.simState.reach,
      );
      const facade = aloft
        ? scene.aloftFacingAt(target.x, target.y, catalyst.id, preferred) ??
          facadeFacingAt(target.x, target.y)
        : null;
      preview.show(
        target.x,
        target.y,
        target.hitZ,
        valid,
        facade === null
          ? PLACEMENT_SURFACE.horizontal
          : PLACEMENT_FACADES[facade] ?? PLACEMENT_SURFACE.east,
      );
      hud?.updateCursor(event.clientX, event.clientY, {
        title: catalyst.label,
        details: `${cost} funds${groundNote(site)} · ${reachNote(radius, coverage)} · mainly ${classLabel(catalyst.class)}`,
        favours: catalyst.favours.map(classLabel),
        penalises: catalyst.penalises.map(classLabel),
        typologies: typologiesForUses(catalyst.favours),
        unlocks: unlockLines(catalyst.id),
        valid,
        reason: failure !== null
          ? actionFailureLabel(failure)
          // Il piazzamento e' valido comunque: cio' che cambia e' cosa comparira'
          // e cosa costera' alla citta'. Dirlo qui e' il punto — dopo il click e'
          // troppo tardi, ed e' esattamente il difetto muto che questa fase chiude.
          : landmarkNote(scene.catalystSite(target.x, target.y, catalyst.id, aloft, preferred)),
      });
      return;
    } else if (selectedTool.kind === 'terrace') {
      // La colonna che conta e' quella dell'**edificio**, non quella del terreno
      // dietro di lui: una mensola si appende a un corpo, e chi la posa punta il
      // corpo. E' la stessa distinzione che le viste di ispezione hanno gia'
      // dovuto fare — la heightmap attraversa una torre come se fosse vetro.
      const pointed = deps.pointedCellAt(event.clientX, event.clientY) ?? cell;
      // La faccia sotto il puntatore si prova per prima: puntare il retro della
      // torre appende la mensola li', non sul fronte strada. Dove non regge, il
      // mondo ricade sul fronte e il mirino mostra quella faccia — la stessa che
      // il click piazzera'.
      const preferred = facadeUnderPointer(event.clientX, event.clientY, pointed) ?? undefined;
      const failure = scene.terraceFailure(pointed.x, pointed.y, preferred);
      const facing = scene.terraceFacingAt(pointed.x, pointed.y, preferred) ??
        facadeFacingAt(pointed.x, pointed.y) ?? 0;
      valid = failure === null;
      influence?.hideCursor();
      hud?.updateCursor(event.clientX, event.clientY, {
        title: 'Terrace',
        details: `${BALANCE.gameplay.terrace.cost} funds · a floor above the street`,
        valid,
        reason: failure === null
          ? 'This facade can carry a floor. The building stops growing once it does.'
          : actionFailureLabel(failure),
      });
      // **Il mirino va alla quota del puntatore, non a quella della colonna.** In
      // isometrica la z e' tutta verticale sullo schermo: disegnato a `z`, sotto
      // una torre di quaranta voxel finiva trecento pixel piu' in basso, in mezzo
      // agli edifici davanti, e sembrava puntare un altro isolato. Era il motivo
      // per cui una mensola si posava a tentativi.
      preview.show(
        pointed.x,
        pointed.y,
        pointed.hitZ,
        valid,
        PLACEMENT_FACADES[facing] ?? PLACEMENT_SURFACE.east,
      );
      return;
    } else if (selectedTool.kind === 'ropeway') {
      // La colonna del **terreno**, non quella dell'edificio: una funivia parte da
      // una riva, e la riva e' suolo. E' l'opposto della mensola, ed e' la ragione
      // per cui qui non si passa da `pointedCellAt`.
      const failure = scene.ropewayFailure(cell.x, cell.y);
      valid = failure === null;
      influence?.hideCursor();
      hud?.updateCursor(event.clientX, event.clientY, {
        title: 'Ropeway',
        details: `${BALANCE.gameplay.ropeway.cost} funds · a crossing that takes no ground`,
        valid,
        reason: failure === null
          ? 'Two towers and a cable: the water below stops counting.'
          : actionFailureLabel(failure),
      });
      preview.show(cell.x, cell.y, cell.z, valid);
      return;
    } else if (selectedTool.kind === 'demolish') {
      // Un gesto in due tempi: il clic che preme fissa l'ancora, lo striscio
      // allarga il riquadro e il rilascio demolisce. Finche' il pulsante e' su,
      // il cursore mostra una cella sola e chiede il gesto.
      // Si punta cio' che si vede, edifici compresi: demolire una torre cercandone
      // il piede attraverso la sagoma sarebbe la parallasse di sempre.
      const pointed = deps.pointedCellAt(event.clientX, event.clientY) ?? cell;
      influence?.hideCursor();
      demolish.hover(event.clientX, event.clientY, pointed);
      preview.show(pointed.x, pointed.y, pointed.z, true);
      return;
    } else {
      const sector = coastalSectorAt(cell.x, cell.y, deps.region, BALANCE.gameplay.expansion.size);
      const failure = deps.generationDone()
        ? scene.expansionFailure(sector.id)
        : 'terrain-loading';
      valid = failure === null;
      influence?.hideCursor();
      hud?.updateCursor(event.clientX, event.clientY, {
        title: `Sector ${sector.id}`,
        details: `${BALANCE.gameplay.expansion.cost} funds · ${sector.region.sizeX}×${sector.region.sizeY} voxels`,
        valid,
        reason: failure === null ? 'New buildable land connected to the coast.' : actionFailureLabel(failure),
      });
    }
    preview.show(cell.x, cell.y, cell.z, valid);
  }

  function onPointerDown(event: PointerEvent): void {
    if (deps.streetActive()) return;
    if (event.button !== 0 || selectedTool.kind === 'none') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const scene = deps.scene();
    const hud = deps.hud();
    if (scene === null || deps.map() === null) return;
    const cell = deps.surfaceCellAt(event.clientX, event.clientY);
    if (cell === null) {
      hud?.showPickingFailure();
      return;
    }

    if (selectedTool.kind === 'catalyst') {
      const role = selectedTool.id ?? defaultCatalystOfClass(selectedTool.class);
      const aloft = (selectedTool.mode ?? 'ground') === 'aloft';
      const target = catalystTarget(event.clientX, event.clientY, cell, aloft);
      // La stessa faccia che il mirino ha mostrato: il click non ricalcola da
      // solo, o piazzerebbe dove non ha detto.
      const preferred = aloft
        ? facadeUnderPointer(event.clientX, event.clientY, target) ?? undefined
        : undefined;
      const result = scene.placeCatalyst(target.x, target.y, role, aloft, preferred);
      if (!result.success) hud?.showFailure(result.reason);
      else {
        hud?.clearFeedback();
        influence?.refreshCatalysts(scene.simState.catalysts, scene.simState.reach);
        // Lo strumento resta in mano, come la mensola: chi ha scelto un landmark
        // dal dock quasi mai ne posa uno solo, e tornare a ripescare la stessa
        // tessera dopo ogni colpo era il giro in piu' che si notava. Il toast lo
        // promette gia' — «Esc to cancel» — e resta l'unico modo di posarlo.
        preview.hide();
        influence?.hideCursor();
        hud?.updateCursor(0, 0, null);
      }
      return;
    }

    if (selectedTool.kind === 'terrace') {
      const pointed = deps.pointedCellAt(event.clientX, event.clientY) ?? cell;
      const preferred = facadeUnderPointer(event.clientX, event.clientY, pointed) ?? undefined;
      const result = scene.placeTerrace(pointed.x, pointed.y, preferred);
      if (!result.success) {
        hud?.showFailure(result.reason);
        return;
      }
      hud?.clearFeedback();
      // Lo strumento resta in mano: una mensola sola non fa un piano di citta', e
      // chi ne vuole una fila la posa un edificio dopo l'altro. Come per il
      // catalizzatore, e al contrario della funivia.
      preview.hide();
      hud?.updateCursor(0, 0, null);
      return;
    }

    if (selectedTool.kind === 'ropeway') {
      const result = scene.placeRopeway(cell.x, cell.y);
      if (!result.success) {
        hud?.showFailure(result.reason);
        return;
      }
      hud?.clearFeedback();
      // Lo strumento si posa dopo l'uso, come il settore costiero e al contrario
      // della mensola e del catalizzatore: una funivia costa quanto una scelta di
      // partita, e lasciarla in mano vorrebbe dire tirarne una seconda per un
      // click di troppo.
      selectedTool = { kind: 'none' };
      hud?.setTool(selectedTool);
      preview.hide();
      hud?.updateCursor(0, 0, null);
      return;
    }

    if (selectedTool.kind === 'demolish') {
      // Il clic fissa l'ancora; la demolizione avviene al rilascio, dopo che lo
      // striscio ha deciso il riquadro. Niente succede qui: la gomma si vede e
      // si misura, non si applica a un colpo solo.
      const pointed = deps.pointedCellAt(event.clientX, event.clientY) ?? cell;
      demolish.begin(event.clientX, event.clientY, pointed);
      return;
    }

    if (!deps.generationDone()) {
      hud?.showFailure('terrain-loading');
      return;
    }
    const sector = coastalSectorAt(cell.x, cell.y, deps.region, BALANCE.gameplay.expansion.size);
    const paid = scene.buyExpansion(sector.id, sector.region);
    if (!paid.success) {
      hud?.showFailure(paid.reason);
      return;
    }
    deps.onExpansion(sector);
  }

  /**
   * Il rilascio che demolisce.
   *
   * Vive su `pointerup` e non su `pointerdown` perche' e' un gesto in due tempi: il
   * clic fissa l'ancora, lo striscio allarga il riquadro e solo qui si sa l'area
   * definitiva. E' lo stesso motivo del clic che sceglie un isolato — fino al
   * rilascio non si distingue un clic da uno striscio.
   */
  function onPointerUp(event: PointerEvent): void {
    if (deps.streetActive()) return;
    if (event.button !== 0 || !demolish.dragging) return;
    demolish.release(event.clientX, event.clientY, selectedTool.kind === 'demolish');
  }

  return {
    get tool(): GameTool {
      return selectedTool;
    },

    groups: [preview.group, ...demolish.groups],

    update(dt: number): void {
      preview.update(dt);
      demolish.update(dt);
    },

    pickTool(tool: GameTool): void {
      const hud = deps.hud();
      // Con la citta' tagliata il terreno vero sotto il cursore e' nascosto: si
      // piazzerebbe alla cieca, in un punto che non si vede. Le viste a velo
      // sopravvivono, perche' li' il suolo si legge ancora sotto il retino.
      const inspect = deps.inspect();
      const kept = viewAfterToolPicked(inspect.mode);
      if (kept !== inspect.mode) {
        const closed = viewLabel(inspect.mode);
        inspect.setMode(kept);
        hud?.setSelectionNote(`${closed} closed so you can see the ground`);
      } else if (inspect.locked) {
        // Stesso motivo, un gradino piu' in basso: un isolato scelto **taglia**,
        // quindi il terreno attorno non c'e' piu' e si costruirebbe alla cieca.
        // Basta mollarlo, senza spegnere anche la vista: quella vela e si legge.
        inspect.unlockBlock();
        hud?.setSelectionNote('Block released so you can see the ground');
      }
      selectedTool = tool;
      hideCues();
      influence?.hideCoach();
    },

    cancel(): void {
      selectedTool = { kind: 'none' };
      hideCues();
      influence?.hideCoach();
      deps.hud()?.updateCursor(0, 0, null);
    },

    releaseTool(): void {
      selectedTool = { kind: 'none' };
      const hud = deps.hud();
      hud?.setTool(selectedTool);
      preview.hide();
      influence?.hideCursor();
      hud?.updateCursor(0, 0, null);
    },

    attach(): void {
      deps.element.addEventListener('pointermove', onPointerMove, { capture: true });
      deps.element.addEventListener('pointerdown', onPointerDown, { capture: true });
      deps.element.addEventListener('pointerup', onPointerUp);
      deps.element.addEventListener('pointerleave', () => {
        preview.hide();
        demolish.hide();
        influence?.hideCursor();
        deps.hud()?.updateCursor(0, 0, null);
      });
    },
  };
}
