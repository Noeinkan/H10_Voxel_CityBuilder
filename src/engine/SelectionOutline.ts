import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type ShaderMaterial,
} from 'three';
import { createSelectionMaterial } from './SelectionMaterial';

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
 * terra che segue il terreno, un coperchio alla quota della cosa, quattro
 * montanti agli angoli e quattro squadre che inquadrano l'impronta da fuori. Un
 * edificio ne esce come un volume, un isolato — che una quota propria non ce
 * l'ha — come la sola fascia con le sue squadre.
 *
 * **Ogni parte e' la stessa fascia con un percorso diverso.** Anello sul
 * terreno, anello in quota, braccio di una squadra, montante che sale: cambia il
 * percorso e cambia il ruolo nel materiale, non il modo di dipingerlo. E' cio'
 * che rende gratuita la coerenza fra le parti, ed e' il motivo per cui non
 * esiste piu' nessuna `Line` qui dentro — una linea in WebGL e' larga un pixel e
 * non ha profilo, quindi non puo' essere ne' luce ne' ombra.
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
 *
 * La tinta pero' vive nell'**alone**: il nucleo della fascia e' quasi bianco,
 * perche' e' cosi' che si comporta una luce vera. Un magenta pieno da bordo a
 * bordo era meta' del motivo per cui il riquadro sembrava un rettangolo di
 * debug, e non si risolveva cambiando colore.
 */
const SELECTION_COLOR = 0xff3ec8;

/** Punti per lato della fascia: bastano a farla seguire alla collina. */
const RECT_SAMPLES = 48;

/** Punti dell'anello a terra, in giro. */
const RING = RECT_SAMPLES * 4;

/**
 * Larghezza della fascia a terra, in voxel.
 *
 * **La fascia non e' decorazione: e' la meta' che si vede.** Una linea da un
 * pixel si perde sul terreno chiaro e in WebGL la larghezza non e' regolabile —
 * e' la stessa ragione per cui il raggio d'influenza affianca al proprio cerchio
 * una fascia piena. E' larga piu' del doppio di quando era a tinta unita perche'
 * ora quasi tutta la sua larghezza e' alone in dissolvenza: la parte che si
 * legge come linea resta il filo al centro.
 */
const BAND = 3.2;

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
 * Il coperchio: meno campioni della fascia perche' e' piatto, e molto piu'
 * sottile.
 *
 * La gerarchia e' tutta qui: a terra c'e' la cosa scelta, in cima c'e' solo la
 * sua quota. Coperchio e fascia della stessa forza chiudono l'edificio in una
 * gabbia, e una gabbia pesa piu' di quanto dica.
 */
const LID_SAMPLES = 12;
const LID_RING = LID_SAMPLES * 4;
const LID_BAND = 1.15;

/**
 * Le squadre agli angoli: lunghezza del braccio, larghezza e scostamento verso
 * l'esterno, in voxel.
 *
 * **Sfiorano il bordo esterno della fascia, non le stanno sopra ne' staccate.**
 * Sopra ne raddoppierebbero solo l'opacita'; staccate diventano quattro trattini
 * bianchi che sembrano un altro oggetto — provato, e su un'impronta da sei
 * colonne era esattamente cosi'. Appoggiate al bordo rinforzano l'angolo, che e'
 * il gesto con cui ogni mirino dice «questo» senza coprirlo. Sono l'unica parte
 * ferma della figura: quando l'occhio torna sulla selezione deve trovare un
 * ancoraggio, non un'altra animazione.
 */
const BRACKET_ARM = 3.4;
const BRACKET_BAND = 0.95;
const BRACKET_OUTSET = 0.55;
const BRACKET_SAMPLES = 6;

/** I montanti: sottili, e con abbastanza campioni perche' la cometa ci salga. */
const POST_BAND = 0.7;
const POST_SAMPLES = 10;

/**
 * Periodo del giro della cometa, in secondi.
 *
 * Piu' lento del cursore di piazzamento apposta: quello annuncia qualcosa che
 * sta per accadere, questo e' uno stato che dura e deve restare calmo. Sui
 * montanti il giro e' piu' corto, cosi' la salita non sembra la stessa cosa del
 * giro a terra.
 */
const SWEEP_PERIOD = 3.4;
const POST_SWEEP_PERIOD = SWEEP_PERIOD * 0.75;

/**
 * Ogni quanto il tempo torna a zero.
 *
 * Multiplo esatto di entrambi i periodi: la cometa non salta, e la `fract` nello
 * shader non lavora mai su un numero grande — un `uTime` cresciuto per ore
 * perderebbe i decimali in un float, e la scia comincerebbe a scattare.
 */
const CLOCK_WRAP = SWEEP_PERIOD * 3;

/** Respiro della figura: lentissimo, e non cambia mai la forma. */
const BREATH_PERIOD = 4.4;

/** Opacita' di base del riempimento: sotto la fascia, sopra il terreno. */
const FILL_OPACITY = 0.1;

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

  // Tre ruoli, tre materiali. La fascia e il coperchio hanno la cometa e un filo
  // sottile; le squadre sono ferme e con il filo piu' largo, perche' devono
  // leggersi da lontano; i montanti sono i piu' tenui — dicono l'altezza, non
  // dove sta la cosa.
  private readonly bandMaterial = createSelectionMaterial(SELECTION_COLOR, {
    core: 0.1,
    boost: 0.75,
    sweep: 0.5,
    sweepPeriod: SWEEP_PERIOD,
  });
  private readonly frameMaterial = createSelectionMaterial(SELECTION_COLOR, {
    // Il filo largo fino a mangiarsi l'alone lasciava quattro trattini bianchi
    // senza tinta: l'angolo dev'essere piu' forte della fascia, non un'altra cosa.
    core: 0.2,
    boost: 1.05,
    sweep: 0,
    sweepPeriod: SWEEP_PERIOD,
  });
  private readonly postMaterial = createSelectionMaterial(SELECTION_COLOR, {
    core: 0.12,
    boost: 0.45,
    sweep: 0.45,
    sweepPeriod: POST_SWEEP_PERIOD,
  });

  private readonly band = ribbon(this.bandMaterial, 1, RING, true);
  private readonly lid = ribbon(this.bandMaterial, 1, LID_RING, true);
  private readonly brackets = ribbon(this.frameMaterial, 8, BRACKET_SAMPLES, false);
  private readonly posts = ribbon(this.postMaterial, 8, POST_SAMPLES, false);

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

  private clock = 0;
  private phase = 0;

  /** Ultimo riquadro disegnato: rifare un lavoro identico e' lavoro sprecato. */
  private last: readonly [number, number, number, number, number, number] | null = null;

  constructor(private readonly heightAt: HeightAt) {
    this.fill.renderOrder = 21;
    this.fill.visible = false;
    this.fill.frustumCulled = false;
    this.group.add(this.fill);

    // Le squadre stanno sopra a tutto: sono l'ancoraggio, e devono vincere
    // anche dove la fascia e i montanti si accavallano.
    for (const [order, part] of [
      [22, this.band],
      [23, this.lid],
      [23, this.posts],
      [24, this.brackets],
    ] as const) {
      part.mesh.renderOrder = order;
      this.group.add(part.mesh);
    }
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

    this.writeBand(x0, y0, x1, y1, box.z0);

    const floor = this.floorOf(x0, y0, x1, y1, box.z0);
    const lid = box.z + LIFT;
    const standing = lid - floor >= LID_MIN_RISE;
    if (standing) {
      this.writeLid(x0, y0, x1, y1, lid);
      this.writePosts(x0, y0, x1, y1, floor, lid);
    }

    // Il riempimento c'e' solo sulla sagoma piatta — l'isolato soprattutto:
    // su un volume il coperchio dice gia' quanto e' grande, e una lastra a
    // terra si confonderebbe con la base. Le squadre invece ci sono sempre,
    // perche' sono il solo ancoraggio che resta quando la sagoma e' una fascia.
    const filled = !standing;
    if (filled) this.writeFill(x0, y0, x1, y1, box.z0);
    this.writeBrackets(x0, y0, x1, y1, box.z0);

    this.band.flush();
    this.brackets.flush();
    if (standing) {
      this.lid.flush();
      this.posts.flush();
    }
    if (filled) {
      this.fill.geometry.dispose();
      this.fill.geometry = indexed(this.fillPositions, this.fillIndices);
    }

    this.fill.visible = filled;
    this.band.mesh.visible = true;
    this.brackets.mesh.visible = true;
    this.lid.mesh.visible = standing;
    this.posts.mesh.visible = standing;
  }

  hide(): void {
    this.fill.visible = false;
    for (const part of [this.band, this.lid, this.posts, this.brackets]) {
      part.mesh.visible = false;
    }
    this.last = null;
  }

  /**
   * Il tempo della selezione: la cometa che gira e il respiro che la tiene viva.
   *
   * Avanza solo a selezione accesa e costa quattro scritture di uniform: la
   * forma non si ricostruisce mai qui dentro, e un cambio di riquadro passa
   * sempre da `show`. Il respiro moltiplica l'opacita' di tutto insieme, quindi
   * non cambia la figura — a raccontare qualcosa e' la cometa, che percorrendo
   * il perimetro lo descrive invece di limitarsi a lampeggiare.
   */
  update(dt: number): void {
    if (!this.band.mesh.visible) return;
    this.clock = (this.clock + dt) % CLOCK_WRAP;
    this.phase = (this.phase + dt / BREATH_PERIOD) % 1;
    const breathe = 0.94 + 0.06 * Math.sin(this.phase * Math.PI * 2);
    for (const material of [this.bandMaterial, this.frameMaterial, this.postMaterial]) {
      material.uniforms['uTime'].value = this.clock;
      material.uniforms['uOpacity'].value = breathe;
    }
    this.fillMaterial.opacity = FILL_OPACITY * breathe;
  }

  /**
   * Scrive l'anello a terra: una fascia sola che gira sui quattro lati.
   *
   * I lati si percorrono in giro, ognuno senza il proprio estremo finale —
   * quello lo porta il lato dopo, e la topologia chiude l'ultimo con il primo.
   * Lo scostamento e' **per lato** e non verso il centro: su un riquadro lungo e
   * stretto un'unica direzione radiale storcerebbe la fascia agli angoli.
   */
  private writeBand(x0: number, y0: number, x1: number, y1: number, z0: number): void {
    // Meta' larghezza, ma mai piu' di meta' del lato corto: su una colonna sola
    // la fascia diventa un quadratino pieno, che e' la lettura giusta.
    const half = Math.min(BAND / 2, Math.min(x1 - x0, y1 - y0) / 2);
    let column = 0;

    const side = (
      from: readonly [number, number],
      to: readonly [number, number],
      inward: readonly [number, number],
    ): void => {
      for (let s = 0; s < RECT_SAMPLES; s++) {
        const t = s / RECT_SAMPLES;
        const x = mix(from[0], to[0], t);
        const y = mix(from[1], to[1], t);
        const ox = inward[0] * half;
        const oy = inward[1] * half;
        this.band.write(0, column++, x, y, this.clearance(x, y, ox, oy, z0), ox, oy, 0);
      }
    };

    side([x0, y0], [x1, y0], [0, 1]);
    side([x1, y0], [x1, y1], [-1, 0]);
    side([x1, y1], [x0, y1], [0, -1]);
    side([x0, y1], [x0, y0], [1, 0]);
  }

  /** Il coperchio: lo stesso anello, piatto alla quota della cosa. */
  private writeLid(x0: number, y0: number, x1: number, y1: number, lid: number): void {
    const half = Math.min(LID_BAND / 2, Math.min(x1 - x0, y1 - y0) / 2);
    let column = 0;

    const side = (
      from: readonly [number, number],
      to: readonly [number, number],
      inward: readonly [number, number],
    ): void => {
      for (let s = 0; s < LID_SAMPLES; s++) {
        const t = s / LID_SAMPLES;
        const x = mix(from[0], to[0], t);
        const y = mix(from[1], to[1], t);
        this.lid.write(0, column++, x, y, lid, inward[0] * half, inward[1] * half, 0);
      }
    };

    side([x0, y0], [x1, y0], [0, 1]);
    side([x1, y0], [x1, y1], [-1, 0]);
    side([x1, y1], [x0, y1], [0, -1]);
    side([x0, y1], [x0, y0], [1, 0]);
  }

  /**
   * Scrive i montanti: due lamine incrociate per angolo, dal pavimento al
   * coperchio.
   *
   * Incrociate perche' la camera gira: una lamina sola sparirebbe di taglio
   * esattamente da un quarto delle inquadrature. Il percorso qui **sale**, quindi
   * la cometa sale con lui — e' l'altezza a essere raccontata, ed e' l'unica
   * parte della figura che dice qualcosa che la pianta non dice gia'.
   */
  private writePosts(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    floor: number,
    lid: number,
  ): void {
    const half = POST_BAND / 2;
    let path = 0;
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const) {
      for (const [ox, oy] of [[half, 0], [0, half]] as const) {
        for (let s = 0; s < POST_SAMPLES; s++) {
          const t = s / (POST_SAMPLES - 1);
          this.posts.write(path, s, cx, cy, mix(floor, lid, t), ox, oy, 0);
        }
        path++;
      }
    }
  }

  /**
   * Scrive le quattro squadre, due bracci ciascuna.
   *
   * Il braccio sta sulla quota del terreno che percorre, non su una quota unica:
   * su un pendio quattro squadre alla stessa altezza sembrerebbero staccate da
   * tre angoli su quattro. La lunghezza si accorcia sui riquadri piccoli: due
   * bracci che coprono i due quinti del lato sono ancora una cornice, piu' di
   * cosi' si toccano al centro e tornano a essere il bordo.
   */
  private writeBrackets(x0: number, y0: number, x1: number, y1: number, z0: number): void {
    const arm = Math.min(BRACKET_ARM, Math.min(x1 - x0, y1 - y0) / 2.5);
    const half = BRACKET_BAND / 2;
    let path = 0;

    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x1, y1, -1, -1],
      [x0, y1, 1, -1],
    ] as const) {
      // L'angolo esterno della squadra: da li' partono i due bracci, uno per
      // lato, entrambi scostati in fuori della stessa misura.
      const ax = cx - dx * BRACKET_OUTSET;
      const ay = cy - dy * BRACKET_OUTSET;

      for (const [tx, ty, ox, oy] of [
        [cx + dx * arm, ay, 0, half],
        [ax, cy + dy * arm, half, 0],
      ] as const) {
        for (let s = 0; s < BRACKET_SAMPLES; s++) {
          const t = s / (BRACKET_SAMPLES - 1);
          const x = mix(ax, tx, t);
          const y = mix(ay, ty, t);
          this.brackets.write(path, s, x, y, this.clearance(x, y, ox, oy, z0), ox, oy, 0);
        }
        path++;
      }
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
   * La quota a cui posare una sezione di fascia larga `2 * offset`.
   *
   * E' il piu' alto dei tre punti che la sezione attraversa, non quello del suo
   * centro: la fascia ora e' larga tre voxel, e un terrazzamento sotto uno dei
   * due bordi la farebbe entrare nel terreno proprio dove il pendio la rende
   * piu' visibile.
   */
  private clearance(x: number, y: number, ox: number, oy: number, z0: number): number {
    return Math.max(
      this.floorAt(x - ox, y - oy, z0),
      this.floorAt(x, y, z0),
      this.floorAt(x + ox, y + oy, z0),
    ) + LIFT;
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
    for (const part of [this.band, this.lid, this.posts, this.brackets]) {
      part.mesh.geometry.dispose();
    }
    for (const material of [this.bandMaterial, this.frameMaterial, this.postMaterial]) {
      material.dispose();
    }
    this.group.clear();
  }
}

/**
 * Una fascia: tre file di vertici che seguono un percorso.
 *
 * Le file portano `aRibbon.x` a -1, 0 e 1, e il fragment ci ricava il profilo —
 * filo, alone e ombra esterna. `paths` tiene piu' percorsi sciolti nella stessa
 * mesh (le otto lamine dei montanti, gli otto bracci delle squadre): un solo
 * draw call e un solo materiale, che e' anche il modo in cui le parti restano
 * coerenti fra loro senza doverle sincronizzare.
 */
interface Ribbon {
  readonly mesh: Mesh;
  /** Posa una sezione: il centro, e lo scostamento che porta ai due bordi. */
  write(
    path: number,
    column: number,
    x: number,
    y: number,
    z: number,
    ox: number,
    oy: number,
    oz: number,
  ): void;
  /** Dichiara al driver che le posizioni sono cambiate. */
  flush(): void;
}

function ribbon(
  material: ShaderMaterial,
  paths: number,
  columns: number,
  closed: boolean,
): Ribbon {
  const vertices = paths * columns * 3;
  const positions = new Float32Array(vertices * 3);
  const coords = new Float32Array(vertices * 2);
  const spans = closed ? columns : columns - 1;
  const indices = new Uint16Array(paths * spans * 12);

  // Topologia e coordinate non dipendono dal riquadro: si scrivono una volta, e
  // un cambio di selezione tocca soltanto le posizioni.
  let cursor = 0;
  for (let path = 0; path < paths; path++) {
    for (let column = 0; column < columns; column++) {
      const flow = closed ? column / columns : column / Math.max(1, columns - 1);
      for (let row = 0; row < 3; row++) {
        const at = ((path * columns + column) * 3 + row) * 2;
        coords[at] = row - 1;
        coords[at + 1] = flow;
      }
    }
    for (let column = 0; column < spans; column++) {
      const next = (column + 1) % columns;
      for (let row = 0; row < 2; row++) {
        const a = (path * columns + column) * 3 + row;
        const c = (path * columns + next) * 3 + row;
        // Winding indifferente: il materiale e' DoubleSide.
        indices.set([a, a + 1, c + 1, a, c + 1, c], cursor);
        cursor += 6;
      }
    }
  }

  const geometry = new BufferGeometry();
  // **`BufferAttribute`, non `Float32BufferAttribute`.** Il secondo dell'array
  // fa una copia: preso a buffer ancora vuoto, lascerebbe ogni scrittura di
  // `write` in un array che nessuno carica — era il difetto per cui le guide di
  // ispezione restavano invisibili. Questo tiene l'array per riferimento, e
  // basta dichiararlo sporco.
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aRibbon', new BufferAttribute(coords, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));

  const mesh = new Mesh(geometry, material);
  // La sfera di contenimento non si aggiorna mai, quindi il culling la
  // taglierebbe fuori appena la selezione esce da dove era la prima volta.
  mesh.frustumCulled = false;
  mesh.visible = false;

  return {
    mesh,
    write(path, column, x, y, z, ox, oy, oz): void {
      const base = (path * columns + column) * 3;
      for (let row = 0; row < 3; row++) {
        const side = row - 1;
        const at = (base + row) * 3;
        positions[at] = x + ox * side;
        positions[at + 1] = y + oy * side;
        positions[at + 2] = z + oz * side;
      }
    },
    flush(): void {
      geometry.getAttribute('position').needsUpdate = true;
    },
  };
}

function indexed(positions: Float32Array, indices: Uint16Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions.slice(), 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
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
