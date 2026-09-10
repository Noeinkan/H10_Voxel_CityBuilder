import type { Group } from 'three';
import { OccupancyOverlay } from '../engine/OccupancyOverlay';
import type { CarpetBox } from '../engine/roofCarpet';
import type { GrowthScene } from '../game/growthScene';
import type { CatalystId } from '../sim/catalysts';
import { footprintDepth, type BuildingRecord } from '../world/buildings/BuildingRegistry';
import type { LandmarkRefusal } from '../world/buildings/landmarkDriver';
import { STRUCTURE_KIND, structureKindOf } from '../world/buildings/structureKind';

/**
 * Le caselle prese, mentre un monumento e' in mano.
 *
 * **Il rifiuto esisteva e non aveva un posto sulla mappa.** «A landmark already
 * stands here» e' una frase vera che, in mezzo a una citta' matura, non dice ne'
 * quale monumento sta occupando il riquadro ne' dove sia il prossimo posto
 * libero: si finiva a spazzolare l'isola col puntatore aspettando che il rosso
 * diventasse verde. Qui il rifiuto diventa un luogo.
 *
 * Possiede l'overlay e la memoria del gesto, come [demolishGesture] possiede il
 * riquadro della gomma: chi tiene lo strumento non deve sapere quando ridisegnare
 * ne' cosa e' gia' disegnato.
 *
 * **Due tempi diversi, e per questo due chiavi.** L'elenco dei monumenti gia' in
 * piedi cambia solo quando ne nasce uno, e si rilegge quando lo strumento entra
 * in mano; chi ferma il riquadro cambia con la colonna sotto il puntatore, che
 * si muove molto piu' fitto delle celle che attraversa. Senza la chiave, ogni
 * pixel di movimento rifarebbe il conto del riquadro.
 */
export interface PlotBlockersDeps {
  readonly scene: () => GrowthScene | null;
}

export interface PlotBlockers {
  /** L'overlay: lo aggiunge alla scena chi costruisce il mondo. */
  readonly groups: readonly Group[];
  /**
   * Lo strumento del monumento e' in mano: accende le caselle gia' prese.
   *
   * Da rifare dopo ogni posa riuscita, che e' l'unico momento in cui l'elenco
   * cresce senza che lo strumento cambi.
   */
  arm(): void;
  /**
   * Il riquadro sotto il puntatore, con il verdetto che il cursore ha gia' in
   * mano: solo un rifiuto ha qualcosa da accendere, e chiederlo quando il posto
   * e' libero pagherebbe un secondo giro di riquadro per non disegnare niente.
   */
  hover(x: number, y: number, kind: CatalystId, refusal: LandmarkRefusal | null): void;
  /** Il puntatore non punta piu' un riquadro: le caselle prese restano. */
  clearHover(): void;
  /** Lo strumento non e' piu' in mano: si spegne tutto. */
  hide(): void;
}

export function createPlotBlockers(deps: PlotBlockersDeps): PlotBlockers {
  const overlay = new OccupancyOverlay();

  /** true fra `arm` e `hide`: fuori di li' `hover` non ha niente da accendere. */
  let armed = false;
  /** I monumenti gia' fondati a terra, riletti a ogni `arm`. */
  let taken: readonly BuildingRecord[] = [];
  /** Colonna e ruolo gia' misurati, per non rifare il riquadro a ogni pixel. */
  let hoverKey = '';
  let blocking: readonly BuildingRecord[] = [];
  let immovable: readonly BuildingRecord[] = [];

  /** Il tetto di un record, che e' dove il tappeto si stende. */
  function roofOf(record: BuildingRecord): CarpetBox {
    return {
      x: record.x,
      y: record.y,
      sizeX: record.footprint,
      sizeY: footprintDepth(record),
      z: record.baseZ + record.height,
    };
  }

  /**
   * Riscrive i tre strati.
   *
   * Chi ferma il riquadro esce dal fioco: sono tappeti complanari, e lasciarlo
   * sotto sommerebbe due velature dello stesso rosso invece di mostrarne una
   * piena.
   */
  function draw(): void {
    const blocked = new Set(blocking.map((record) => record.id));
    overlay.show(
      taken.filter((record) => !blocked.has(record.id)).map(roofOf),
      blocking.map(roofOf),
      immovable.map(roofOf),
    );
  }

  function forget(): void {
    hoverKey = '';
    blocking = [];
    immovable = [];
  }

  return {
    groups: [overlay.group],

    arm(): void {
      const scene = deps.scene();
      if (scene === null) return;
      // I monumenti sul tetto non entrano: non prendono il suolo delle proprie
      // colonne — sotto c'e' chi li ospita, e quello il suolo se l'e' gia'
      // preso — quindi non sono una casella occupata per chi posa a terra.
      taken = [...scene.registry.all].filter(
        (record) => structureKindOf(record) === STRUCTURE_KIND.landmark,
      );
      armed = true;
      forget();
      draw();
    },

    hover(x: number, y: number, kind: CatalystId, refusal: LandmarkRefusal | null): void {
      if (!armed) return;
      // Il terreno che non regge e la facciata sono rifiuti che non parlano di
      // cio' che e' costruito: li' non c'e' niente da accendere, e il riquadro
      // non si chiede nemmeno.
      const blocks = refusal === 'landmark-in-the-way' || refusal === 'structure-in-the-way';
      const key = blocks ? `${x},${y},${kind}` : '';
      if (key === hoverKey) return;
      hoverKey = key;
      if (!blocks) {
        blocking = [];
        immovable = [];
        draw();
        return;
      }
      const scene = deps.scene();
      if (scene === null) return;
      const found = scene.catalystBlockers(x, y, kind);
      blocking = found.landmarks;
      immovable = found.structures;
      draw();
    },

    clearHover(): void {
      if (!armed || hoverKey === '') return;
      forget();
      draw();
    },

    hide(): void {
      armed = false;
      taken = [];
      forget();
      overlay.hide();
    },
  };
}
