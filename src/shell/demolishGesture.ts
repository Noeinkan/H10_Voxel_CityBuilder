import type { Group } from 'three';
import { DemolitionOverlay } from '../engine/DemolitionOverlay';
import { SelectionOutline } from '../engine/SelectionOutline';
import type { GrowthScene } from '../game/growthScene';
import type { SurfaceCell } from '../game/surfacePick';
import type { GameHud } from '../ui/GameHud';
import { footprintDepth } from '../world/buildings/BuildingRegistry';
import { TERRAIN } from '../world/terrain/config';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { SELECT_CLICK_SLOP } from './pointerPick';

/**
 * La gomma, che e' l'unico strumento in due tempi.
 *
 * Ogni altro strumento posa dove si clicca: la gomma no — il clic fissa
 * un'ancora, lo striscio allarga il riquadro e solo il rilascio sa quale area
 * demolire. Quei cinque numeri (le due colonne del riquadro, il pixel del
 * premuto, la chiave gia' misurata) non servono a nessun altro, e tenerli qui e'
 * cio' che permette al resto degli strumenti di restare senza memoria.
 *
 * Possiede anche le due superfici che il gesto disegna, il riquadro a terra e i
 * tappeti sui tetti: si accendono e si spengono insieme allo stato, e un
 * proprietario diverso le lascerebbe accese su un'area che non si sta piu'
 * demolendo.
 */
export interface DemolishGestureDeps {
  readonly map: () => TerrainMap | null;
  readonly scene: () => GrowthScene | null;
  readonly hud: () => GameHud | null;
  readonly pointedCellAt: (clientX: number, clientY: number) => SurfaceCell | null;
}

export interface DemolishGesture {
  /** Riquadro e tappeti: li aggiunge alla scena chi costruisce il mondo. */
  readonly groups: readonly Group[];
  readonly dragging: boolean;
  update(dt: number): void;
  /** Il cursore sopra la gomma: fermo chiede il gesto, in corso allarga il riquadro. */
  hover(clientX: number, clientY: number, pointed: SurfaceCell): void;
  /** Il clic che fissa l'ancora. Non demolisce niente: si vede e si misura. */
  begin(clientX: number, clientY: number, pointed: SurfaceCell): void;
  /**
   * Il rilascio che chiude il gesto, e che demolisce se `apply` lo consente.
   *
   * Sotto la soglia anti-pan e' un gesto puntuale, e la gomma porta via il solo
   * edificio sotto il cursore — la sua impronta esatta, non una colonna.
   */
  release(clientX: number, clientY: number, apply: boolean): void;
  /**
   * Spegne le due superfici lasciando il gesto in corso: e' cio' che serve al
   * cursore che esce dal canvas, perche' rientrando lo striscio riprende da dove
   * era invece di dover ricominciare.
   */
  hide(): void;
  /** Molla anche il gesto, senza demolire: lo strumento e' cambiato in mano. */
  cancel(): void;
}

export function createDemolishGesture(deps: DemolishGestureDeps): DemolishGesture {
  /** Il trascinamento: dall'ancora al cursore, in colonne. */
  let dragging = false;
  let x0 = 0;
  let y0 = 0;
  let x1 = 0;
  let y1 = 0;
  /** Punto in pixel dove il pulsante e' stato premuto: distingue clic da striscio. */
  let downClientX = 0;
  let downClientY = 0;
  /** Il riquadro gia' misurato, per non rifare il conto a ogni pixel del gesto. */
  let rectKey = '';

  const outline = new SelectionOutline(
    (x, y) => Math.max(TERRAIN.seaLevel, deps.map()?.heightAt(x, y) ?? TERRAIN.seaLevel),
  );
  const carpets = new DemolitionOverlay();

  /** Il riquadro normalizzato: l'ancora puo' stare a destra o sopra il cursore. */
  function rect(): { minX: number; minY: number; sizeX: number; sizeY: number } {
    const minX = Math.min(x0, x1);
    const minY = Math.min(y0, y1);
    return {
      minX,
      minY,
      sizeX: Math.max(x0, x1) - minX + 1,
      sizeY: Math.max(y0, y1) - minY + 1,
    };
  }

  function plural(count: number): string {
    return count === 1 ? 'building' : 'buildings';
  }

  /**
   * Ricalcola il riquadro: contorno a schermo e conteggio sul cursore.
   *
   * Il conto si rifa solo quando il riquadro cambia cella: una colonna e' larga
   * un voxel, e uno striscio lento fermo sulla stessa colonna non deve ripagare
   * la lettura del registro a ogni pixel.
   */
  function refresh(clientX: number, clientY: number): void {
    const scene = deps.scene();
    const map = deps.map();
    if (scene === null || map === null) return;
    const { minX, minY, sizeX, sizeY } = rect();
    const key = `${minX},${minY},${sizeX},${sizeY}`;
    if (key === rectKey) return;
    rectKey = key;

    const verdict = scene.demolishSurvey(minX, minY, sizeX, sizeY);
    const ground = Math.max(TERRAIN.seaLevel, map.heightAt(minX, minY));
    outline.show({
      x0: minX,
      y0: minY,
      x1: minX + sizeX - 1,
      y1: minY + sizeY - 1,
      z0: ground,
      z: ground,
    });

    // I tappeti sui tetti: rosso per chi cade, ambra per chi resta in mezzo.
    const preview = scene.demolishPreview(minX, minY, sizeX, sizeY);
    const roofOf = (record: { x: number; y: number; footprint: number; baseZ: number; height: number }) => ({
      x: record.x,
      y: record.y,
      sizeX: record.footprint,
      sizeY: footprintDepth(record),
      z: record.baseZ + record.height,
    });
    carpets.show(preview.doomed.map(roofOf), preview.protected.map(roofOf));

    const reason = verdict.refusal === 'structure-in-the-way'
      ? 'Something built to last stands here: it cannot be demolished.'
      : verdict.clears === 0
        ? 'No buildings in this area.'
        : `${verdict.clears} ${plural(verdict.clears)} will fall.`;
    deps.hud()?.updateCursor(clientX, clientY, {
      title: 'Demolish',
      details: `${sizeX}×${sizeY} area selected`,
      valid: verdict.clears > 0,
      reason,
    });
  }

  return {
    groups: [outline.group, carpets.group],

    get dragging(): boolean {
      return dragging;
    },

    update(dt: number): void {
      outline.update(dt);
    },

    hover(clientX: number, clientY: number, pointed: SurfaceCell): void {
      if (dragging) {
        x1 = pointed.x;
        y1 = pointed.y;
        refresh(clientX, clientY);
        return;
      }
      outline.hide();
      deps.hud()?.updateCursor(clientX, clientY, {
        title: 'Demolish',
        details: 'Press and drag across buildings to tear them down.',
        valid: true,
        reason: 'The area is cleared over the next few moments.',
      });
    },

    begin(clientX: number, clientY: number, pointed: SurfaceCell): void {
      dragging = true;
      x0 = pointed.x;
      y0 = pointed.y;
      x1 = pointed.x;
      y1 = pointed.y;
      downClientX = clientX;
      downClientY = clientY;
      rectKey = '';
      refresh(clientX, clientY);
    },

    release(clientX: number, clientY: number, apply: boolean): void {
      dragging = false;
      outline.hide();
      carpets.hide();
      const scene = deps.scene();
      const hud = deps.hud();
      if (!apply || scene === null || deps.map() === null) return;

      const moved = Math.abs(clientX - downClientX) + Math.abs(clientY - downClientY);
      if (moved <= SELECT_CLICK_SLOP) {
        const pointed = deps.pointedCellAt(clientX, clientY);
        if (pointed === null) return;
        const result = scene.demolishAt(pointed.x, pointed.y);
        if (!result.done) {
          hud?.showFeedback(
            result.verdict.refusal === 'structure-in-the-way'
              ? 'Something built to last stands here: it cannot be demolished.'
              : 'Nothing to demolish here.',
            'neutral',
          );
          return;
        }
        hud?.showTransientFeedback(
          `Demolishing ${result.verdict.clears} ${plural(result.verdict.clears)}.`,
        );
        return;
      }

      const { minX, minY, sizeX, sizeY } = rect();
      const verdict = scene.demolishSurvey(minX, minY, sizeX, sizeY);
      if (verdict.clears === 0) {
        hud?.showFeedback('Nothing to demolish there.', 'neutral');
        return;
      }
      scene.demolish(minX, minY, sizeX, sizeY);
      // La gomma resta in mano: una passata non e' una decisione, e chi sbaglia
      // area fa un secondo colpo, come per la mensola.
      hud?.showTransientFeedback(`Demolishing ${verdict.clears} ${plural(verdict.clears)}.`);
    },

    hide(): void {
      outline.hide();
      carpets.hide();
    },

    cancel(): void {
      dragging = false;
      outline.hide();
      carpets.hide();
    },
  };
}
