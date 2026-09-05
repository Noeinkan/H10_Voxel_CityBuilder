import type { InfluenceOverlay } from '../engine/InfluenceOverlay';
import type { InspectView } from '../engine/InspectView';
import { INSPECT_MODE } from '../engine/inspect';
import { SelectionOutline } from '../engine/SelectionOutline';
import type { CoachSuggestion } from '../game/coach';
import type { GrowthScene } from '../game/growthScene';
import { resolveSelection, type Selection } from '../game/selection';
import type { SurfaceCell } from '../game/surfacePick';
import type { GameHud } from '../ui/GameHud';
import { SelectionPanel } from '../ui/SelectionPanel';
import { extentOf, type SelectionActionId, type SelectionSectionId } from '../ui/SelectionPanelModel';
import type { StreetNetwork } from '../world/streets/StreetNetwork';
import { TERRAIN } from '../world/terrain/config';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { SELECT_CLICK_SLOP } from './pointerPick';

/**
 * Cosa il giocatore ha scelto, e le tre superfici che lo raccontano.
 *
 * La cella scelta e' un valore solo, ma tiene insieme la scheda, il contorno
 * in-world e il campo di desiderabilita' del landmark: chi la scrive li muove
 * tutti e tre, e chi ne muove uno solo lascia la citta' a raccontare due cose
 * diverse. Qui dentro c'e' anche l'artefatto del coach, e non e' fuori posto:
 * scrive lo **stesso** `InfluenceOverlay` della scelta, e due proprietari per
 * una superficie sola erano il modo in cui il cerchio del suggerimento
 * sopravviveva a una scheda aperta sopra.
 *
 * Si conserva la cella e non la selezione risolta: quest'ultima invecchia a ogni
 * tick, e la scheda la rifa' alla cadenza dell'HUD.
 */
export interface SelectionSceneDeps {
  readonly container: HTMLElement;
  readonly element: HTMLElement;
  readonly world: VoxelWorld;
  readonly map: () => TerrainMap | null;
  readonly streets: StreetNetwork | null;
  readonly seed: number;
  readonly scene: () => GrowthScene | null;
  readonly hud: () => GameHud | null;
  readonly inspect: InspectView;
  readonly influence: InfluenceOverlay | null;
  readonly pointedCellAt: (clientX: number, clientY: number) => SurfaceCell | null;
  /** Da terra il clic ha un altro mestiere, e uno strumento in mano ne ha un terzo. */
  readonly streetActive: () => boolean;
  readonly toolActive: () => boolean;
}

export interface SelectionScene {
  /** Il contorno di cio' che e' scelto: lo aggiunge alla scena chi costruisce il mondo. */
  readonly group: SelectionOutline['group'];
  update(dt: number): void;
  /** Riscrive la scheda alla propria cadenza; il ciclo di frame la chiama e basta. */
  tick(time: number): void;
  clear(): void;
  /** Rilegge la scelta e ne rimette in campo l'influenza: la chiama il cursore a mano vuota. */
  syncInfluence(): void;
  /**
   * Porta in-world l'artefatto del coach, alla cadenza dell'HUD.
   *
   * **Il cursore di piazzamento ha precedenza.** Quando uno strumento e' in mano
   * il coach si nasconde — l'evidenza della portata appartiene a cio' che si sta
   * per posare — e ricompare appena lo si molla. Si disegna solo al cambio di
   * suggerimento, non a ogni refresh.
   */
  syncCoach(coach: CoachSuggestion | null): void;
  attach(): void;
}

export function createSelectionScene(deps: SelectionSceneDeps): SelectionScene {
  const { inspect, influence } = deps;

  /** La cella scelta, non la selezione risolta: quest'ultima invecchia a ogni tick. */
  let selectedCell: SurfaceCell | null = null;
  let pointerDown = false;
  let pointerX = 0;
  let pointerY = 0;
  /** Id del suggerimento del coach gia' disegnato in-world, per non ridisegnarlo. */
  let paintedCoachId: string | null = null;

  /**
   * Il contorno di cio' che il giocatore ha scelto.
   *
   * Separato dalle guide di ispezione perche' risponde a un'altra domanda — «cosa
   * ho scelto» invece di «dov'e' puntata la lente» — e le due possono essere accese
   * insieme su due cose diverse.
   */
  const outline = new SelectionOutline(
    (x, y) => Math.max(TERRAIN.seaLevel, deps.map()?.heightAt(x, y) ?? TERRAIN.seaLevel),
  );

  /** La pila sotto la cella scelta, oppure `null` se non c'e' piu' niente da dire. */
  function resolvePicked(): Selection | null {
    const map = deps.map();
    if (selectedCell === null || map === null || deps.streets === null) return null;
    const scene = deps.scene();
    const registry = scene?.registry;
    const state = scene?.simState;
    if (registry === undefined || state === undefined) return null;
    return resolveSelection({
      cell: selectedCell,
      world: deps.world,
      map,
      registry,
      streets: deps.streets,
      state,
      seed: deps.seed,
    });
  }

  /** Il campo completo compare solo quando il click ha scelto un vero landmark. */
  function syncInfluence(picked: Selection | null): void {
    const catalyst = picked?.structure?.catalyst;
    const scene = deps.scene();
    if (catalyst === undefined || catalyst === null || scene === null) {
      influence?.hideCursor();
      return;
    }
    influence?.showSelection(catalyst, scene.simState.reach);
  }

  /** L'isolato che la vista sta studiando, se ce n'e' uno: la scheda ne fa un interruttore. */
  function isolatedBlockKey(): string | null {
    return inspect.locked ? inspect.blockKey : null;
  }

  function paintOutline(section: SelectionSectionId): void {
    const picked = resolvePicked();
    if (picked === null) {
      outline.hide();
      return;
    }
    outline.show(extentOf(picked, section));
  }

  function clear(): void {
    selectedCell = null;
    panel.close();
    outline.hide();
    influence?.hideCursor();
    deps.hud()?.setSelectionOpen(false);
  }

  /**
   * Il gesto della scheda, tradotto in vista e camera.
   *
   * Sta qui e non nel pannello perche' e' il punto in cui i due strati si toccano:
   * la scheda sa cosa il giocatore ha scelto, la vista sa come si guarda, e nessuno
   * dei due importa l'altro.
   *
   * L'andata e' in due mosse e l'ordine non e' libero: `lockBlock` si rifiuta se il
   * modo non e' gia' Block focus, perche' agganciare un isolato che nessuna vista
   * sta ritagliando muoverebbe la camera senza che a schermo cambi niente.
   *
   * Il ritorno spegne la vista invece di mollare e basta. Mollare lascerebbe acceso
   * il velo che insegue il cursore — utile a chi era entrato dal picker per
   * scegliere un isolato, ma qui il giocatore non ha mai chiesto una vista: ha
   * chiesto *questo* isolato, e uscendone si aspetta la sua citta'. `setMode` molla
   * comunque, e restituisce l'inquadratura di partenza.
   */
  function runAction(action: SelectionActionId): void {
    if (action === 'release-block') {
      inspect.setMode(INSPECT_MODE.off);
      return;
    }
    if (selectedCell === null) return;
    inspect.setMode(INSPECT_MODE.block);
    // La cella scelta e non la colonna sotto il cursore: si isola l'isolato che la
    // scheda sta descrivendo, e il mouse nel frattempo puo' essere ovunque — sul
    // bottone, per esempio, che sta sopra un'altra parte della citta'.
    inspect.lockBlock(selectedCell);
  }

  const panel = new SelectionPanel(deps.container, {
    onSection: (section) => paintOutline(section),
    onAction: (action) => runAction(action),
    onClose: () => clear(),
  });

  /**
   * Il clic che sceglie, e quello che non ha scelto niente.
   *
   * Le tre guardie sono quelle del clic di studio, e nessuna e' di troppo: il
   * tasto sinistro pana, uno strumento in mano sta piazzando — e il suo
   * `stopImmediatePropagation` non protegge questo listener, perche' sta su
   * `pointerdown` e gli eventi qui partono in ordine di registrazione — e un
   * trascinamento non e' un clic.
   */
  function onPointerUp(event: PointerEvent): void {
    if (!pointerDown || event.button !== 0) return;
    pointerDown = false;
    // A terra il clic ha un mestiere solo: riagganciare lo sguardo dopo un `Esc`
    // o un cambio di finestra. Sotto pointer lock il puntatore non ha nemmeno una
    // posizione da cui scegliere qualcosa, e senza questa riga il primo clic per
    // riprendere a guardare aprirebbe la scheda di un edificio a caso.
    if (deps.streetActive()) return;
    if (deps.toolActive()) return;
    const moved = Math.abs(event.clientX - pointerX) + Math.abs(event.clientY - pointerY);
    if (moved > SELECT_CLICK_SLOP) return;

    // Su cio' che si vede, non sul terreno: cliccando una torre si sceglie la
    // torre, e non la terra che le sta dietro a tante colonne quanto e' alta.
    const cell = deps.pointedCellAt(event.clientX, event.clientY);
    if (cell === null) {
      clear();
      return;
    }
    selectedCell = cell;
    const picked = resolvePicked();
    if (picked === null) {
      clear();
      return;
    }
    // La scheda si apre sul bordo destro, dove stanno anche i cassetti: chiuderli
    // prima che compaia e' cio' che la tiene leggibile invece di sovrapposta.
    const hud = deps.hud();
    hud?.dismissPanels();
    panel.show(picked, performance.now(), isolatedBlockKey());
    syncInfluence(picked);
    hud?.setSelectionOpen(true);
  }

  return {
    group: outline.group,

    update(dt: number): void {
      outline.update(dt);
    },

    /**
     * Gira alla cadenza dell'HUD e non per frame: la citta' cambia a dieci tick al
     * secondo, e la sola parte che costa — l'aggregato dell'isolato — non ha ragione
     * di girare sessanta volte per dire lo stesso numero.
     */
    tick(time: number): void {
      if (!panel.needsPaint(time)) return;
      const picked = resolvePicked();
      if (picked === null) {
        clear();
        return;
      }
      panel.update(picked, time, isolatedBlockKey());
      syncInfluence(picked);
      paintOutline(panel.section);
    },

    clear,

    syncInfluence(): void {
      syncInfluence(resolvePicked());
    },

    syncCoach(coach: CoachSuggestion | null): void {
      const scene = deps.scene();
      if (deps.toolActive() || coach === null || scene === null || influence === null) {
        if (paintedCoachId !== null) {
          paintedCoachId = null;
          influence?.hideCoach();
        }
        return;
      }
      if (coach.id === paintedCoachId) return;
      paintedCoachId = coach.id;
      influence.showCoach(coach, scene.simState.reach);
    },

    attach(): void {
      deps.element.addEventListener('pointerdown', (event: PointerEvent) => {
        pointerDown = event.button === 0;
        pointerX = event.clientX;
        pointerY = event.clientY;
      });
      deps.element.addEventListener('pointerup', onPointerUp);
    },
  };
}
