import type { InfoViewOverlay } from '../engine/InfoViewOverlay';
import type { GrowthScene } from '../game/growthScene';
import { createInfoSampler } from '../game/infoViews';
import { infoViewSpecOf, infoViewVersion, nextInfoView, type InfoViewKind } from '../sim/infoViews';
import type { GameHud } from '../ui/GameHud';
import type { InfoViewLegend } from '../ui/InfoViewLegend';

/**
 * La vista informativa accesa sopra la citta': quale, e chi la ricostruisce.
 *
 * Sono due valori soli — la vista scelta e la versione del campo gia' disegnata —
 * ma li scrivono quattro superfici diverse: la tessera del dock, il tasto `I`,
 * il ciclo di frame e l'hook globale. Tenerli qui dentro e' cio' che rende vero
 * il commento di `advance`: la heatmap si ricostruisce **solo** quando il campo
 * cambia, e nessuno puo' azzerare la memoria della versione senza passare da
 * `setView`.
 */
export interface InfoViewSceneDeps {
  readonly overlay: InfoViewOverlay | null;
  readonly legend: InfoViewLegend | null;
  readonly hud: () => GameHud | null;
  readonly scene: () => GrowthScene | null;
  /** Quota del budget per frame riservata alla costruzione della heatmap. */
  readonly budgetMs: number;
}

export interface InfoViewScene {
  readonly kind: InfoViewKind;
  /**
   * Cambia la vista informativa e allinea legenda e overlay.
   *
   * L'overlay vero lo sincronizza `advance` nel ciclo di frame, quando sa che la
   * versione del campo e' cambiata: qui si decide solo *quale* vista accesa e si
   * svuota la memoria della versione, cosi' la heatmap riparte.
   */
  setView(kind: InfoViewKind): void;
  /**
   * Il giro delle viste informative da tastiera, `I`.
   *
   * Come `V` per le viste di ispezione, e' un comando di gioco: leggere la
   * propria citta' per dato non e' una misura, quindi sta fuori dal gate del
   * debug. Il toast nomina cio' che si sta guardando, che da tastiera non ha
   * un picker aperto a dirlo.
   */
  cycle(): void;
  /**
   * Allinea l'overlay alla vista attiva e al campo, e ne fa avanzare la
   * costruzione a budget.
   *
   * Ricostruisce il campionatore solo quando la versione del campo cambia — un
   * edificio, un catalizzatore, una policy, un lotto — mai per pan o zoom. Il
   * campionatore del cibo rastrella i lotti del mondo, quindi si paga solo in
   * quel momento e non a ogni frame.
   */
  advance(): void;
  /** Il valore della vista attiva su una colonna: lo interroga l'hook globale. */
  sample(x: number, y: number): number | null;
}

export function createInfoViewScene(deps: InfoViewSceneDeps): InfoViewScene {
  /** Vista informativa attiva, ciclata con `I`. `off` e' la citta' nuda. */
  let kind: InfoViewKind = 'off';
  /** Ultima versione del campo sincronizzata sull'overlay, per non ricostruire. */
  let fieldVersion = '';

  function setView(next: InfoViewKind): void {
    kind = next;
    fieldVersion = '';
    deps.legend?.setView(next);
    deps.hud()?.setInfoView(next);
    // La visibilita' e' anche il gate del budget di costruzione: senza questa riga
    // `update` esce subito, la heatmap non campiona mai e scegliere una vista
    // accendeva solo la legenda. Va prima di `clear`, che spegne il gruppo da se'.
    deps.overlay?.setVisible(next !== 'off');
    if (next === 'off') deps.overlay?.clear();
  }

  return {
    get kind(): InfoViewKind {
      return kind;
    },

    setView,

    cycle(): void {
      const next = nextInfoView(kind);
      setView(next);
      const hud = deps.hud();
      if (next === 'off') {
        hud?.showTransientFeedback('City data overlay off · I to turn back on');
        return;
      }
      const spec = infoViewSpecOf(next);
      hud?.showTransientFeedback(`${spec.label} · ${spec.description}`);
    },

    advance(): void {
      const overlay = deps.overlay;
      if (overlay === null || kind === 'off') return;
      const scene = deps.scene();
      if (scene === null) return;

      const version = infoViewVersion(scene.simState);
      if (version !== fieldVersion) {
        fieldVersion = version;
        const sampler = createInfoSampler(kind, scene.simState, scene.farmPlots);
        overlay.setView(sampler, `${kind}|${version}`);
      }
      overlay.update(deps.budgetMs);
    },

    sample(x: number, y: number): number | null {
      const scene = deps.scene();
      if (scene === null || kind === 'off') return null;
      const sampler = createInfoSampler(kind, scene.simState, scene.farmPlots);
      return sampler.sample(Math.round(x), Math.round(y));
    },
  };
}
