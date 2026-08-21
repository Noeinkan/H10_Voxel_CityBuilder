import { FACING, type Facing } from '../streets/streetGrid';
import type { SurfaceKind } from '../visualBlock';

/**
 * Il vocabolario con cui si descrive un landmark.
 *
 * **Sette primitive, non otto generatori.** Un porto e un monumento non hanno
 * niente in comune come immagine, ma sono la stessa scatola, lo stesso prisma
 * verticale e la stessa fila di pilastri composti in modo diverso. Tenere
 * piccolo il vocabolario e' cio' che rende una ricetta una riga di tabella
 * invece di una funzione: `config.ts` elenca parti, questo file sa disegnarle,
 * e nessuno dei due sa cosa sia un porto.
 *
 * **Una parte e' un dato, non una chiamata.** E' la differenza che permette a un
 * test di misurare l'ingombro di una ricetta senza disegnarla, e a
 * `generateLandmark` di ruotare una ricetta intera trasformando dei numeri
 * invece di ridisegnare. Il modello e' `BAND_OP` in `buildings/config.ts`: la
 * grammatica sta in tabella, il codice la interpreta.
 */

export const PART = {
  /** Scatola piena: banchine, basamenti, container, casseri. */
  slab: 0,
  /** Scatola cava in pianta — solo il perimetro: capannoni, quadrilateri. */
  shell: 1,
  /** Prisma verticale: ciminiere, guglie, gambe di gru, torri di controllo. */
  mast: 2,
  /** Prisma orizzontale: bracci di gru, impalcati, architravi. */
  boom: 3,
  /** Pilastri a passo regolare, con architrave in cima: portici e peristili. */
  colonnade: 4,
  /** Piramide a gradoni: zoccoli monumentali, scalinate, terrazzamenti. */
  steps: 5,
  /** Piano spesso un voxel: tetti, grembiuli, piste. */
  deck: 6,
} as const;

export type PartKind = (typeof PART)[keyof typeof PART];

/**
 * Una parte di landmark, nell'orientamento canonico.
 *
 * Il canonico e' **fronte a est**: l'asse lungo corre lungo `x` e cio' che la
 * struttura guarda — l'acqua per il porto, la strada per gli altri — sta a `x`
 * crescente. `orientPart` porta la ricetta sul verso vero; l'autore della
 * ricetta non deve pensarci.
 */
export interface Part {
  readonly kind: PartKind;
  /** Angolo minimo del riquadro in pianta, in voxel dallo spigolo dello stamp. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Quota di base, in voxel dal piano finito dello stamp. */
  readonly z: number;
  readonly height: number;
  readonly palette: number;
  readonly surface: SurfaceKind;
  /**
   * `colonnade`: passo dei pilastri. `steps`: rientranza di ogni gradone.
   * Ignorato dalle altre primitive.
   */
  readonly step?: number;
  /**
   * Colore dell'ultimo voxel in quota: cornice, coronamento, cappello di un
   * silo, architrave di un portico.
   *
   * E' la stessa idea di `bodyAlt` negli edifici, e serve alla stessa cosa: una
   * riga chiara in cima da' la scala al volume, e a distanza di gioco e' spesso
   * l'unica cosa che distingua un prisma progettato da un blocco.
   */
  readonly cap?: number;
}

/** Riquadro occupato in pianta e in quota, per misurare senza disegnare. */
export interface PartBounds {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
}

/** Estremi **inclusi** di una parte. Non disegna niente. */
export function partBounds(part: Part): PartBounds {
  return {
    x0: part.x,
    y0: part.y,
    z0: part.z,
    x1: part.x + part.w - 1,
    y1: part.y + part.h - 1,
    z1: part.z + part.height - 1,
  };
}

/**
 * La stessa parte vista da un altro verso, dentro un riquadro `span`.
 *
 * `span` e' la coppia `[lungo, corto]` della ricetta, cioe' l'ingombro
 * canonico: la rotazione di 90 gradi scambia i due assi, e lo stamp che ne esce
 * e' largo `short` e profondo `long`. E' per questo che `VoxelStamp` tiene
 * `sizeX` e `sizeY` separati, e che `generateBuilding` — che invece impone il
 * quadrato — non poteva servire qui.
 */
export function orientPart(part: Part, facing: Facing, long: number, short: number): Part {
  switch (facing) {
    case FACING.east:
      return part;
    case FACING.west:
      // Mezzo giro: il fronte passa da `x` massimo a `x` minimo.
      return { ...part, x: long - part.x - part.w, y: short - part.y - part.h };
    case FACING.north:
      // Un quarto di giro antiorario: `x` canonico diventa `y` del mondo.
      return { ...part, x: part.y, y: part.x, w: part.h, h: part.w };
    default:
      return {
        ...part,
        x: short - part.y - part.h,
        y: long - part.x - part.w,
        w: part.h,
        h: part.w,
      };
  }
}

/** Ingombro dello stamp per un verso: la rotazione di 90 gradi scambia gli assi. */
export function orientedSpan(facing: Facing, long: number, short: number): {
  sizeX: number;
  sizeY: number;
} {
  return facing === FACING.east || facing === FACING.west
    ? { sizeX: long, sizeY: short }
    : { sizeX: short, sizeY: long };
}

/** La tela su cui le parti scrivono. Non conosce il mondo ne' le coordinate vere. */
export interface LandmarkCanvas {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly voxels: Uint8Array;
  readonly surfaces: Uint8Array;
}

export function createCanvas(sizeX: number, sizeY: number, sizeZ: number): LandmarkCanvas {
  const length = sizeX * sizeY * sizeZ;
  return {
    sizeX,
    sizeY,
    sizeZ,
    voxels: new Uint8Array(length),
    surfaces: new Uint8Array(length),
  };
}

/**
 * Disegna una parte gia' orientata.
 *
 * Cio' che cade fuori dalla tela viene **scartato in silenzio**, e non e' una
 * comodita': una ricetta che sfora e' un errore d'autore, e il posto dove si
 * scopre e' il test che confronta `partBounds` con lo `span` dichiarato. Qui
 * scartare e' solo cio' che tiene la scrittura dentro il buffer.
 */
export function drawPart(canvas: LandmarkCanvas, part: Part): void {
  switch (part.kind) {
    case PART.shell:
      return drawPrism(canvas, part, (lx, ly) =>
        lx === 0 || ly === 0 || lx === part.w - 1 || ly === part.h - 1);
    case PART.colonnade:
      return drawColonnade(canvas, part);
    case PART.steps:
      return drawSteps(canvas, part);
    default:
      // `slab`, `mast`, `boom` e `deck` sono lo stesso prisma pieno: a
      // distinguerli sono le proporzioni che la ricetta gli da', non il codice
      // che li disegna. Tenerli come voci separate serve a chi legge la
      // ricetta, che vede «ciminiera» e non «scatola 2x2x16».
      return drawPrism(canvas, part, () => true);
  }
}

/** Prisma con una maschera in pianta: e' la forma di quasi tutte le primitive. */
function drawPrism(
  canvas: LandmarkCanvas,
  part: Part,
  mask: (lx: number, ly: number) => boolean,
): void {
  const top = part.z + part.height - 1;
  for (let z = part.z; z <= top; z++) {
    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    for (let ly = 0; ly < part.h; ly++) {
      for (let lx = 0; lx < part.w; lx++) {
        if (!mask(lx, ly)) continue;
        put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * Pilastri a passo `step` sul perimetro, con l'architrave in cima.
 *
 * E' l'unica primitiva che produce vuoto *sotto* un pieno, ed e' il motivo per
 * cui esiste: il mercato, il portico universitario e il peristilio del
 * monumento si leggono da lontano proprio per quel vuoto, che nessuna scatola
 * cava sa dare.
 */
function drawColonnade(canvas: LandmarkCanvas, part: Part): void {
  const step = Math.max(2, part.step ?? 2);
  const top = part.z + part.height - 1;

  for (let ly = 0; ly < part.h; ly++) {
    for (let lx = 0; lx < part.w; lx++) {
      const edge = lx === 0 || ly === 0 || lx === part.w - 1 || ly === part.h - 1;
      if (!edge) continue;
      // L'architrave corre su tutto il perimetro; i pilastri solo sul passo.
      const pillar = onPitch(lx, part.w, step) && onPitch(ly, part.h, step);
      const from = pillar ? part.z : top;
      for (let z = from; z <= top; z++) {
        const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
        put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * true se il pilastro cade su questa colonna, contando dall'estremo piu' vicino.
 *
 * Contare da un capo solo — `v % step` — sembra la stessa cosa e non lo e': un
 * lato che non e' un multiplo del passo si ritrova i pilastri su un bordo e
 * l'architrave nudo sull'altro, e la ricetta smette di essere invariante per
 * rotazione. Dove due parti si sovrappongono quell'asimmetria si vede come un
 * conto di voxel diverso a seconda del verso, ed e' cosi' che e' saltata fuori.
 */
function onPitch(v: number, size: number, step: number): boolean {
  return Math.min(v, size - 1 - v) % step === 0;
}

/**
 * Piramide a gradoni: ogni quota rientra di `step` per lato rispetto a quella
 * sotto, e non scende mai sotto un voxel di lato.
 */
function drawSteps(canvas: LandmarkCanvas, part: Part): void {
  const step = Math.max(1, part.step ?? 1);
  const top = part.z + part.height - 1;

  for (let z = part.z; z <= top; z++) {
    const inset = (z - part.z) * step;
    const w = part.w - inset * 2;
    const h = part.h - inset * 2;
    if (w < 1 || h < 1) return;

    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        put(canvas, part.x + inset + lx, part.y + inset + ly, z, palette, part.surface);
      }
    }
  }
}

function put(
  canvas: LandmarkCanvas,
  x: number,
  y: number,
  z: number,
  palette: number,
  surface: SurfaceKind,
): void {
  if (x < 0 || y < 0 || z < 0) return;
  if (x >= canvas.sizeX || y >= canvas.sizeY || z >= canvas.sizeZ) return;
  const index = x + canvas.sizeX * (y + canvas.sizeY * z);
  canvas.voxels[index] = palette;
  canvas.surfaces[index] = surface;
}
