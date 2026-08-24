import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
} from 'three';
import { TERRAIN } from '../world/terrain/config';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { InspectGuide } from './inspect';

/**
 * Le linee che dicono **dove e' puntata** una vista di ispezione.
 *
 * Il motore della 4.11 apriva la citta' senza spiegarsi: tre viste su quattro si
 * agganciano alla colonna sotto il cursore, e a schermo non c'era niente che lo
 * dicesse — il retino compariva con un bordo netto allineato agli assi, e da
 * fuori leggeva come un difetto di rendering invece che come una lente. Qui non
 * si aggiunge nessun effetto: si disegna il **contorno di cio' che il fragment
 * sta gia' facendo**.
 *
 * Vive accanto a `InfluenceOverlay` e ne segue le regole: linee sopra la scena,
 * fuori dalla profondita' — una guida che sparisce dietro una collina non guida
 * niente — e nessuna geometria voxel, quindi il mesher resta intatto
 * (invariante 6).
 *
 * I buffer hanno **dimensione fissa** e si riscrivono in posto: la vista si
 * aggiorna una volta per frame, e riallocare quattro geometrie per frame sarebbe
 * l'unico costo vero di uno strumento che altrimenti non ne ha.
 */

/**
 * Un colore solo per tutte le guide.
 *
 * Caldo perche' la citta' e' verde e grigia sui sette temi, e imparentato con
 * l'accento dell'HUD (`#e99a72`): le guide sono interfaccia appoggiata al mondo,
 * non un elemento del mondo, e devono dichiararlo.
 */
const GUIDE_COLOR = 0xff9a5e;

/** Punti per lato del riquadro: bastano a far seguire al contorno la collina. */
const RECT_SAMPLES = 48;

/** Punti della linea di sezione, distribuiti su tutta la region. */
const LINE_SAMPLES = 192;

/** Altezza dell'asta sulla colonna a fuoco, in voxel. */
const FOCUS_HEIGHT = 7;

/** Mezzo lato del mirino attorno alla colonna a fuoco, in voxel. */
const FOCUS_HALF = 1.5;

/** Scostamento dalla superficie: senza, la linea entra nel terreno e sfarfalla. */
const LIFT = 0.4;

export class InspectGuides {
  readonly group = new Group();

  private readonly rect = line(RECT_SAMPLES * 4, true, 0.8);
  private readonly section = line(LINE_SAMPLES, false, 0.9);
  private readonly focusRing = line(4, true, 0.95);
  private readonly focusStem = line(2, false, 0.95);

  /** Ultimi valori disegnati: riscrivere un buffer identico e' lavoro sprecato. */
  private lastRect: readonly [number, number, number, number] | null = null;
  private lastSection: readonly [number, number] | null = null;
  private lastFocus: readonly [number, number, number] | null = null;

  constructor(
    private readonly map: TerrainMap,
    private readonly region: Region,
  ) {
    for (const [index, part] of [this.rect, this.section, this.focusRing, this.focusStem].entries()) {
      part.object.renderOrder = 30 + index;
      part.object.visible = false;
      this.group.add(part.object);
    }
  }

  /**
   * Allinea le linee alla vista attiva.
   *
   * Gira una volta per frame subito dopo le uniform, e con la vista spenta si
   * riduce a quattro `visible = false`.
   */
  update(guide: InspectGuide): void {
    this.updateRect(guide.rect);
    this.updateSection(guide.line);
    this.updateFocus(guide.focus);
  }

  private updateRect(rect: InspectGuide['rect']): void {
    if (rect === null) {
      this.rect.object.visible = false;
      this.lastRect = null;
      return;
    }
    this.rect.object.visible = true;
    if (same4(this.lastRect, rect)) return;
    this.lastRect = [rect[0], rect[1], rect[2], rect[3]];

    const [x0, y0, x1, y1] = rect;
    let index = 0;
    // I quattro lati in giro, ognuno senza il proprio estremo finale: quello lo
    // porta il lato dopo, e il `LineLoop` chiude da solo l'ultimo con il primo.
    for (let s = 0; s < RECT_SAMPLES; s++) {
      const t = s / RECT_SAMPLES;
      this.writeSurface(this.rect.positions, index++, mix(x0, x1, t), y0);
    }
    for (let s = 0; s < RECT_SAMPLES; s++) {
      const t = s / RECT_SAMPLES;
      this.writeSurface(this.rect.positions, index++, x1, mix(y0, y1, t));
    }
    for (let s = 0; s < RECT_SAMPLES; s++) {
      const t = s / RECT_SAMPLES;
      this.writeSurface(this.rect.positions, index++, mix(x1, x0, t), y1);
    }
    for (let s = 0; s < RECT_SAMPLES; s++) {
      const t = s / RECT_SAMPLES;
      this.writeSurface(this.rect.positions, index++, x0, mix(y1, y0, t));
    }
    this.rect.commit();
  }

  private updateSection(section: InspectGuide['line']): void {
    if (section === null) {
      this.section.object.visible = false;
      this.lastSection = null;
      return;
    }
    this.section.object.visible = true;
    if (this.lastSection?.[0] === section.axis && this.lastSection[1] === section.at) return;
    this.lastSection = [section.axis, section.at];

    // Il taglio attraversa tutto il mondo generato, e la linea lo dice: fermarla
    // attorno al cursore farebbe credere che la sezione sia locale.
    const from = section.axis === 0 ? this.region.minY : this.region.minX;
    const span = section.axis === 0 ? this.region.sizeY : this.region.sizeX;
    for (let s = 0; s < LINE_SAMPLES; s++) {
      const along = from + (span * s) / (LINE_SAMPLES - 1);
      const x = section.axis === 0 ? section.at : along;
      const y = section.axis === 0 ? along : section.at;
      this.writeSurface(this.section.positions, s, x, y);
    }
    this.section.commit();
  }

  private updateFocus(focus: InspectGuide['focus']): void {
    if (focus === null) {
      this.focusRing.object.visible = false;
      this.focusStem.object.visible = false;
      this.lastFocus = null;
      return;
    }
    this.focusRing.object.visible = true;
    this.focusStem.object.visible = true;
    if (
      this.lastFocus?.[0] === focus.x
      && this.lastFocus[1] === focus.y
      && this.lastFocus[2] === focus.z
    ) return;
    this.lastFocus = [focus.x, focus.y, focus.z];

    const base = focus.z + LIFT;
    const ring = this.focusRing.positions;
    writePoint(ring, 0, focus.x - FOCUS_HALF, focus.y - FOCUS_HALF, base);
    writePoint(ring, 1, focus.x + FOCUS_HALF, focus.y - FOCUS_HALF, base);
    writePoint(ring, 2, focus.x + FOCUS_HALF, focus.y + FOCUS_HALF, base);
    writePoint(ring, 3, focus.x - FOCUS_HALF, focus.y + FOCUS_HALF, base);
    this.focusRing.commit();

    // L'asta serve in ortografica: un mirino appoggiato al suolo, visto da
    // quarantacinque gradi, si confonde con il tetto dell'edificio davanti.
    writePoint(this.focusStem.positions, 0, focus.x, focus.y, base);
    writePoint(this.focusStem.positions, 1, focus.x, focus.y, focus.z + FOCUS_HEIGHT);
    this.focusStem.commit();
  }

  private writeSurface(out: Float32Array, index: number, x: number, y: number): void {
    const height = Math.max(TERRAIN.seaLevel, this.map.heightAt(Math.floor(x), Math.floor(y)));
    writePoint(out, index, x, y, height + LIFT);
  }

  dispose(): void {
    for (const part of [this.rect, this.section, this.focusRing, this.focusStem]) {
      part.object.geometry.dispose();
      part.material.dispose();
    }
    this.group.clear();
  }
}

interface GuideLine {
  readonly object: Line;
  readonly material: LineBasicMaterial;
  readonly positions: Float32Array;
  commit(): void;
}

function line(points: number, closed: boolean, opacity: number): GuideLine {
  const positions = new Float32Array(points * 3);
  // `BufferAttribute` e non `Float32BufferAttribute`: il secondo fa
  // `new Float32Array(array)`, che di un array tipizzato costruisce una *copia*.
  // Presa qui, la copia e' di soli zeri, e da quel momento `positions` e il
  // buffer che il renderer carica sono due cose diverse: le guide restavano
  // `visible`, con le coordinate giuste, e ogni vertice sull'origine — una linea
  // degenere, zero pixel. `BufferAttribute` tiene l'array per riferimento, ed e'
  // cio' che rende vero il disegno a buffer preallocato descritto in testa.
  const attribute = new BufferAttribute(positions, 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', attribute);
  const material = new LineBasicMaterial({
    color: GUIDE_COLOR,
    transparent: true,
    opacity,
    // Fuori dalla profondita' come il cursore di `InfluenceOverlay`: una guida
    // che sparisce dietro un edificio non dice piu' dove sia puntata la vista.
    depthTest: false,
    depthWrite: false,
  });
  const object = closed ? new LineLoop(geometry, material) : new Line(geometry, material);
  // Il bounding sphere si aggiornerebbe a ogni riscrittura, e `depthTest` e' gia'
  // spento: un frustum culling su una guida che deve restare visibile sarebbe
  // solo un modo di perderla.
  object.frustumCulled = false;
  return {
    object,
    material,
    positions,
    commit(): void {
      attribute.needsUpdate = true;
    },
  };
}

function writePoint(out: Float32Array, index: number, x: number, y: number, z: number): void {
  out[index * 3] = x;
  out[index * 3 + 1] = y;
  out[index * 3 + 2] = z;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function same4(
  a: readonly [number, number, number, number] | null,
  b: readonly [number, number, number, number],
): boolean {
  return a !== null && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
