import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
/** Quota del suolo in una colonna: e' l'unica cosa che il contorno sa del terreno. */
export type HeightAt = (x: number, y: number) => number;

/**
 * Il contorno di cio' che il giocatore ha scelto.
 *
 * Risponde a una domanda diversa da quella delle guide di ispezione — «cosa ho
 * scelto», che e' uno stato del gioco, contro «dov'e' puntata la lente», che e'
 * uno stato del rendering — e per questo non e' lo stesso oggetto: le due
 * possono benissimo essere accese insieme su due cose diverse.
 *
 * **Nessuna mesh voxel viene toccata** (contratto 4): selezionare non provoca un
 * rebuild e non costa niente al mesher.
 *
 * La forma e' una sola per tutte e quattro le unita' selezionabili: una fascia a
 * terra che segue il terreno, un coperchio piatto alla quota della cosa e quattro
 * montanti agli angoli. Un edificio ne esce come un volume, un isolato — che una
 * quota propria non ce l'ha — come la sola fascia.
 */

/**
 * Magenta, che e' l'unica tinta che nessuno usa — **citta' compresa**.
 *
 * Il verde e il rosso sono del segnaposto di piazzamento e l'arancio delle guide
 * di ispezione, quindi lo spazio libero sembrava l'azzurro. Non lo era: le torri
 * hanno facciate di vetro azzurro sui temi chiari, e su di loro un contorno
 * azzurro spariva — cioe' proprio sugli edifici che uno clicca per primi. La
 * regola non e' «diverso dagli altri strumenti» ma «diverso da tutto cio' che
 * puo' esserci dietro».
 */
const SELECTION_COLOR = 0xff3ec8;

/** Punti per lato della fascia: bastano a farla seguire alla collina. */
const RECT_SAMPLES = 48;

/** Punti dell'anello, in giro. */
const RING = RECT_SAMPLES * 4;

/**
 * Larghezza della fascia a terra, in voxel.
 *
 * **La fascia non e' decorazione: e' la meta' che si vede.** Una linea da un
 * pixel si perde sul terreno chiaro e in WebGL la larghezza non e' regolabile —
 * e' la stessa ragione per cui il raggio d'influenza affianca al proprio cerchio
 * una fascia piena.
 */
const BAND = 1.3;

/** Scostamento dalla superficie: senza, la fascia entra nel terreno e sfarfalla. */
const LIFT = 0.4;

/**
 * Sotto questo dislivello il coperchio non si disegna.
 *
 * Un isolato non ha una quota propria — gli si passa quella della colonna
 * indicata — e un piano orizzontale a quell'altezza taglierebbe le colline
 * dentro il riquadro, dicendo una cosa che non e' vera di nessuno degli edifici
 * che contiene.
 */
const LID_MIN_RISE = 1;

/**
 * Lunghezza del braccio degli angoli, in voxel.
 *
 * Su una fascia a terra — un isolato, una colonna — gli angoli sono l'unico
 * ancoraggio che resta quando non c'e' ne' coperchio ne' montanti, e devono
 * leggersi da lontano: un braccio corto si confonde con la fascia.
 */
const CORNER_ARM = 1.4;

/**
 * Periodo del respiro della selezione, in secondi.
 *
 * Piu' lento del cursore di piazzamento apposta: quello annuncia qualcosa che
 * sta per accadere, questo e' uno stato che dura e deve restare calmo.
 */
const PULSE_PERIOD = 2.2;

/** Opacita' di base del riempimento: sotto la fascia, sopra il terreno. */
const FILL_OPACITY = 0.12;

/**
 * Tetto sui nodi della lastra di riempimento.
 *
 * Il riempimento segue il terreno e costa un nodo per colonna; un isolato
 * enorme non deve trasformare un clic in una mesh da migliaia di triangoli. Il
 * passo raddoppia finche' non si rientra nel tetto.
 */
const FILL_MAX_NODES = 4096;

export interface SelectionBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /**
   * Quota del pavimento, che non e' sempre il terreno: una mensola comincia in
   * aria, e la fascia va dove comincia lei.
   */
  readonly z0: number;
  /** Quota del coperchio. Uguale a `z0`, resta solo la fascia. */
  readonly z: number;
}

export class SelectionOutline {
  readonly group = new Group();

  private readonly bandPositions = new Float32Array(RING * 2 * 3);
  private readonly bandIndices = ringIndices(RING);
  private readonly bandMaterial = new MeshBasicMaterial({
    color: SELECTION_COLOR,
    transparent: true,
    opacity: 0.45,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly band = new Mesh(new BufferGeometry(), this.bandMaterial);

  private readonly fillMaterial = new MeshBasicMaterial({
    color: SELECTION_COLOR,
    transparent: true,
    opacity: FILL_OPACITY,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly fill = new Mesh(new BufferGeometry(), this.fillMaterial);
  private fillPositions = new Float32Array(0);
  private fillIndices = new Uint16Array(0);

  private readonly rim = loop(RING, 0.95);
  private readonly lid = loop(4, 0.85);
  private readonly posts = segments(4, 0.7);
  private readonly corners = segments(8, 0.9);

  private phase = 0;

  /** Ultimo riquadro disegnato: rifare un lavoro identico e' lavoro sprecato. */
  private last: readonly [number, number, number, number, number, number] | null = null;

  constructor(private readonly heightAt: HeightAt) {
    this.fill.renderOrder = 21;
    this.fill.visible = false;
    this.fill.frustumCulled = false;
    this.group.add(this.fill);

    this.band.renderOrder = 22;
    this.band.visible = false;
    this.band.frustumCulled = false;
    this.group.add(this.band);

    for (const [index, part] of [this.rim, this.lid, this.posts].entries()) {
      part.object.renderOrder = 23 + index;
      part.object.visible = false;
      this.group.add(part.object);
    }

    this.corners.object.renderOrder = 24;
    this.corners.object.visible = false;
    this.group.add(this.corners.object);
  }

  show(box: SelectionBox): void {
    if (same(this.last, box)) return;
    this.last = [box.x0, box.y0, box.x1, box.y1, box.z0, box.z];

    // Gli estremi sono colonne **incluse**: il contorno corre sul bordo esterno,
    // cioe' un voxel piu' in la' dell'ultima colonna, o taglierebbe a meta' la
    // fila di celle che dice di contenere.
    const x0 = box.x0;
    const y0 = box.y0;
    const x1 = box.x1 + 1;
    const y1 = box.y1 + 1;

    this.writeRing(x0, y0, x1, y1, box.z0);

    const floor = this.floorOf(x0, y0, x1, y1, box.z0);
    const lid = box.z + LIFT;
    const standing = lid - floor >= LID_MIN_RISE;
    if (standing) this.writeLid(x0, y0, x1, y1, floor, lid);

    // Il riempimento c'e' solo sulla sagoma piatta — l'isolato soprattutto:
    // su un volume il coperchio dice gia' quanto e' grande, e una lastra a
    // terra si confonderebbe con la base. Gli angoli invece ci sono sempre,
    // perche' sono il solo ancoraggio che resta quando la sagoma e' una fascia.
    const filled = !standing;
    if (filled) this.writeFill(x0, y0, x1, y1, box.z0);
    this.writeCorners(x0, y0, x1, y1, box.z0);

    this.rebuild(standing, filled);
    this.fill.visible = filled;
    this.band.visible = true;
    this.rim.object.visible = true;
    this.lid.object.visible = standing;
    this.posts.object.visible = standing;
    this.corners.object.visible = true;
  }

  hide(): void {
    this.fill.visible = false;
    this.band.visible = false;
    this.corners.object.visible = false;
    for (const part of [this.rim, this.lid, this.posts]) part.object.visible = false;
    this.last = null;
  }

  /**
   * Il respiro che tiene viva la selezione.
   *
   * Avanza solo a selezione accesa e costa qualche scrittura di opacita': la
   * forma non si ricostruisce mai qui dentro, e un cambio di riquadro passa
   * sempre da `show`. Il battito resta lento per non distrarre da una scena che
   * sotto continua a crescere.
   */
  update(dt: number): void {
    if (!this.band.visible) return;
    this.phase = (this.phase + dt / PULSE_PERIOD) % 1;
    const breathe = Math.sin(this.phase * Math.PI * 2);
    this.bandMaterial.opacity = 0.42 + 0.1 * breathe;
    this.fillMaterial.opacity = FILL_OPACITY + 0.05 * breathe;
    this.corners.material.opacity = 0.9 + 0.1 * breathe;
  }

  /**
   * Scrive l'anello: la mezzeria della fascia e i suoi due bordi.
   *
   * I quattro lati si percorrono in giro, ognuno senza il proprio estremo finale
   * — quello lo porta il lato dopo, e la topologia chiude l'ultimo con il primo.
   * Lo scostamento e' **per lato** e non verso il centro: su un riquadro lungo e
   * stretto un'unica direzione radiale storcerebbe la fascia agli angoli.
   */
  private writeRing(x0: number, y0: number, x1: number, y1: number, z0: number): void {
    // Meta' larghezza, ma mai piu' di meta' del lato corto: su una colonna sola
    // la fascia diventa un quadratino pieno, che e' la lettura giusta.
    const half = Math.min(BAND / 2, Math.min(x1 - x0, y1 - y0) / 2);
    const line = this.rim.positions;
    const strip = this.bandPositions;
    let index = 0;

    const side = (
      from: readonly [number, number],
      to: readonly [number, number],
      inward: readonly [number, number],
    ): void => {
      for (let s = 0; s < RECT_SAMPLES; s++) {
        const t = s / RECT_SAMPLES;
        const x = mix(from[0], to[0], t);
        const y = mix(from[1], to[1], t);
        const z = this.floorAt(x, y, z0) + LIFT;
        writePoint(line, index, x, y, z);
        writePoint(strip, index * 2, x - inward[0] * half, y - inward[1] * half, z);
        writePoint(strip, index * 2 + 1, x + inward[0] * half, y + inward[1] * half, z);
        index++;
      }
    };

    side([x0, y0], [x1, y0], [0, 1]);
    side([x1, y0], [x1, y1], [-1, 0]);
    side([x1, y1], [x0, y1], [0, -1]);
    side([x0, y1], [x0, y0], [1, 0]);
  }

  private writeLid(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    floor: number,
    lid: number,
  ): void {
    const corners: readonly (readonly [number, number])[] = [
      [x0, y0], [x1, y0], [x1, y1], [x0, y1],
    ];

    for (const [index, [x, y]] of corners.entries()) {
      writePoint(this.lid.positions, index, x, y, lid);
      writePoint(this.posts.positions, index * 2, x, y, floor);
      writePoint(this.posts.positions, index * 2 + 1, x, y, lid);
    }
  }

  /**
   * Scrive la lastra che riempie la sagoma piatta.
   *
   * Segue il terreno come la fascia, con un nodo per colonna, cosi' un isolato
   * si legge come un'**area** scelta e non come un bordo solo. E' la stessa
   * regola della fascia — mai sotto la quota dichiarata — quindi su un pendio la
   * lastra aderisce alla collina invece di tagliarla, che era il difetto per cui
   * il coperchio non si disegna mai su un isolato.
   */
  private writeFill(x0: number, y0: number, x1: number, y1: number, z0: number): void {
    let step = 1;
    while ((Math.ceil((x1 - x0) / step) + 1) * (Math.ceil((y1 - y0) / step) + 1) > FILL_MAX_NODES) {
      step *= 2;
    }
    const nx = Math.ceil((x1 - x0) / step) + 1;
    const ny = Math.ceil((y1 - y0) / step) + 1;

    const positions = new Float32Array(nx * ny * 3);
    let written = 0;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * step;
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step;
        writePoint(positions, written++, x, y, this.floorAt(x, y, z0) + LIFT);
      }
    }

    const indices: number[] = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        // Winding indifferente: il materiale e' DoubleSide.
        indices.push(a, b, d, a, d, c);
      }
    }

    this.fillPositions = positions;
    this.fillIndices = new Uint16Array(indices);
  }

  /**
   * Scrive gli angoli a L: quattro bracci che inquadrano il riquadro.
   *
   * Il braccio sta sulla quota dell'angolo che segna, non su una quota unica:
   * su un pendio quattro L alla stessa altezza sembrerebbero staccati da tre
   * angoli su quattro.
   */
  private writeCorners(x0: number, y0: number, x1: number, y1: number, z0: number): void {
    const positions = this.corners.positions;
    let written = 0;
    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x1, y1, -1, -1],
      [x0, y1, 1, -1],
    ] as const) {
      const z = this.floorAt(cx, cy, z0) + LIFT;
      writePoint(positions, written++, cx, cy, z);
      writePoint(positions, written++, cx + dx * CORNER_ARM, cy, z);
      writePoint(positions, written++, cx, cy, z);
      writePoint(positions, written++, cx, cy + dy * CORNER_ARM, z);
    }
  }

  /**
   * Sostituisce le geometrie invece di riscriverle in posto.
   *
   * Qui va bene cosi', ma **non perche' `needsUpdate` non funzioni**: funziona, e
   * `TrafficView` lo usa senza ricostruire niente. Cio' che rompeva le guide era
   * `Float32BufferAttribute`, che dell'array passato fa una copia: presa a buffer
   * ancora vuoto, lasciava le scritture successive in un array che nessuno
   * carica. `plain` prende invece la sua copia **tardi**, a `positions` gia'
   * scritto, quindi la aggira senza saperlo; chi vuole il buffer preallocato usa
   * `BufferAttribute`, che tiene l'array per riferimento.
   *
   * Il costo non c'e': la selezione cambia a un clic, non a ogni frame, e `show`
   * esce subito quando il riquadro e' lo stesso — al contrario di una guida che
   * insegue il cursore, dove la ricostruzione si pagherebbe a ogni frame.
   */
  private rebuild(standing: boolean, filled: boolean): void {
    this.band.geometry.dispose();
    this.band.geometry = indexed(this.bandPositions, this.bandIndices);
    this.rim.replace();
    this.corners.replace();
    if (standing) {
      this.lid.replace();
      this.posts.replace();
    }
    if (filled) {
      this.fill.geometry.dispose();
      this.fill.geometry = indexed(this.fillPositions, this.fillIndices);
    }
  }

  /** Il pavimento piu' basso sotto i quattro angoli: da li' partono i montanti. */
  private floorOf(x0: number, y0: number, x1: number, y1: number, z0: number): number {
    let lowest = Infinity;
    for (const [x, y] of [[x0, y0], [x1 - 1, y0], [x1 - 1, y1 - 1], [x0, y1 - 1]] as const) {
      const height = this.floorAt(x, y, z0);
      if (height < lowest) lowest = height;
    }
    return lowest;
  }

  /**
   * Dove poggia la fascia in questa colonna.
   *
   * Segue il terreno — cosi' su un pendio non entra nella collina — ma mai sotto
   * la quota dichiarata: una mensola comincia in aria, e li' il terreno non
   * c'entra piu' niente.
   */
  private floorAt(x: number, y: number, z0: number): number {
    return Math.max(this.heightAt(Math.floor(x), Math.floor(y)), z0);
  }

  dispose(): void {
    this.fill.geometry.dispose();
    this.fillMaterial.dispose();
    this.band.geometry.dispose();
    this.bandMaterial.dispose();
    for (const part of [this.rim, this.lid, this.posts, this.corners]) {
      part.object.geometry.dispose();
      part.material.dispose();
    }
    this.group.clear();
  }
}

interface OutlinePart {
  readonly object: Line;
  readonly material: LineBasicMaterial;
  readonly positions: Float32Array;
  /** Sostituisce la geometria con una costruita sulle posizioni di adesso. */
  replace(): void;
}

function loop(points: number, opacity: number): OutlinePart {
  return part(points, opacity, (geometry, material) => new LineLoop(geometry, material));
}

function segments(count: number, opacity: number): OutlinePart {
  return part(count * 2, opacity, (geometry, material) => new LineSegments(geometry, material));
}

function part(
  points: number,
  opacity: number,
  build: (geometry: BufferGeometry, material: LineBasicMaterial) => Line,
): OutlinePart {
  const positions = new Float32Array(points * 3);
  const material = new LineBasicMaterial({
    color: SELECTION_COLOR,
    transparent: true,
    opacity,
    // Fuori dalla profondita' come le guide: un contorno che sparisce dietro la
    // torre accanto smette di dire quale cosa sia stata scelta.
    depthTest: false,
    depthWrite: false,
  });
  const object = build(new BufferGeometry(), material);
  object.frustumCulled = false;
  return {
    object,
    material,
    positions,
    replace(): void {
      object.geometry.dispose();
      object.geometry = plain(positions);
    },
  };
}

function plain(positions: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions.slice(), 3));
  return geometry;
}

function indexed(positions: Float32Array, indices: Uint16Array): BufferGeometry {
  const geometry = plain(positions);
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/** Due triangoli per campione, in giro: la topologia non cambia mai. */
function ringIndices(ring: number): Uint16Array {
  const indices = new Uint16Array(ring * 6);
  for (let i = 0; i < ring; i++) {
    const next = ((i + 1) % ring) * 2;
    indices.set([i * 2, i * 2 + 1, next + 1, i * 2, next + 1, next], i * 6);
  }
  return indices;
}

function writePoint(out: Float32Array, index: number, x: number, y: number, z: number): void {
  out[index * 3] = x;
  out[index * 3 + 1] = y;
  out[index * 3 + 2] = z;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function same(
  a: readonly [number, number, number, number, number, number] | null,
  b: SelectionBox,
): boolean {
  return a !== null
    && a[0] === b.x0 && a[1] === b.y0 && a[2] === b.x1 && a[3] === b.y1
    && a[4] === b.z0 && a[5] === b.z;
}
