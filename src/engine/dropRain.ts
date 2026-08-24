import { CHUNK } from '../world/chunkCoords';
import { hashCoords, mulberry32 } from '../world/rng';

/**
 * I cubetti che piovono davanti al pezzo di isola che sta atterrando.
 *
 * Sono la meta' letterale dell'effetto, e devono esistere a parte per la ragione
 * spiegata in `introDrop.ts`: il greedy mesher ha gia' fuso i cubi del mondo in
 * quad larghi, quindi una grandinata non si puo' ritagliare da li'. Questi sono
 * cubetti **veri**, disegnati sopra la scena e non dentro il volume voxel — la
 * stessa divisione di `TrafficView` e per lo stesso motivo: scriverli nel mondo
 * marcherebbe sporchi i chunk della costa a ogni frame.
 *
 * Il modulo non conosce Three ne' il `VoxelWorld`: dove atterra un cubetto e di
 * che colore e' lo dice una **sonda** passata dal chiamante, come fa `planPlot`
 * con la disponibilita' del terreno. Cosi' si verifica in `node`.
 */

/** **Ogni** numero della pioggia. */
export const RAIN = {
  /** Cubetti seminati sull'impronta di un chunk. */
  perChunk: 10,
  /**
   * Lato del cubetto, in voxel.
   *
   * Piu' grande di un voxel apposta: cade da fuori schermo insieme ai blocchi,
   * cioe' da centinaia di voxel di quota, e un cubo singolo a quella velocita'
   * sarebbe due pixel che passano.
   */
  size: 3,
  /** Durata della discesa, in secondi. */
  duration: 0.95,
  /** Finestra entro cui i cubetti di uno stesso chunk partono, in secondi. */
  spread: 0.3,
  /**
   * Cubetti vivi contemporaneamente.
   *
   * Dimensiona il buffer una volta sola. Sotto pressione la semina si **assottiglia**
   * invece di fermarsi: un chunk che trova poco spazio ne mette meno, e la
   * pioggia non sparisce a intermittenza mentre lo streaming accelera.
   */
  maxLive: 360,
  /** Seme della semina. */
  seed: 0x5d1c,
} as const;

/** Cosa la sonda sa dire di una colonna: dove finisce, e di che colore. */
export interface RainColumn {
  /**
   * Quota del voxel di **superficie**, non della cella vuota sopra.
   *
   * E' il voxel a decidere di quale chunk sia la colonna, e una superficie che
   * finisce sull'ultimo piano di un chunk manderebbe la propria pioggia a quello
   * sopra, che e' aria e non ha nessuna mesh da accompagnare.
   */
  readonly z: number;
  /** Slot di palette di quel voxel. */
  readonly palette: number;
}

/** La colonna sotto `(x, y)`, o null se non c'e' ancora niente da colpire. */
export type RainProbe = (x: number, y: number) => RainColumn | null;

export interface RainCube {
  /** Centro del cubetto in pianta: non cambia mai, un cubetto scende dritto. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly palette: number;
  /** Quota del centro all'arrivo. */
  readonly landing: number;
  /** Da quanto in alto e' partito: la stessa quota dei blocchi, fuori schermo. */
  readonly rise: number;
  /** Istante di partenza, in secondi. */
  readonly born: number;
  /** Quota corrente del centro. */
  z: number;
  /** Falso finche' il cubetto aspetta il proprio istante: non va disegnato. */
  falling: boolean;
}

export interface RainState {
  readonly cubes: RainCube[];
}

export function createRain(): RainState {
  return { cubes: [] };
}

export function clearRain(state: RainState): void {
  state.cubes.length = 0;
}

/**
 * Semina i cubetti sull'impronta di un chunk appena nato, e ne dice quanti.
 *
 * `cz` filtra: un cubetto appartiene al chunk che contiene la **superficie**, o
 * una colonna di due piani di chunk riceverebbe la pioggia due volte. Le tre
 * estrazioni per cubetto avvengono sempre, anche quando la sonda non risponde,
 * cosi' la sequenza dipende solo da `(cx, cy)` e non da quanta isola c'era.
 */
export function spawnOverChunk(
  state: RainState,
  cx: number,
  cy: number,
  cz: number,
  now: number,
  rise: number,
  probe: RainProbe,
): number {
  const room = RAIN.maxLive - state.cubes.length;
  if (room <= 0) return 0;

  const random = mulberry32(hashCoords(RAIN.seed, cx, cy));
  const originX = cx * CHUNK;
  const originY = cy * CHUNK;
  const floorZ = cz * CHUNK;
  const ceilingZ = floorZ + CHUNK;
  const half = RAIN.size / 2;
  let seeded = 0;

  for (let i = 0; i < RAIN.perChunk && seeded < room; i++) {
    const x = originX + Math.floor(random() * CHUNK);
    const y = originY + Math.floor(random() * CHUNK);
    const born = now + random() * RAIN.spread;

    const column = probe(x, y);
    if (column === null) continue;
    if (column.z < floorZ || column.z >= ceilingZ) continue;

    // Il cubetto si posa **sopra** la superficie, non dentro.
    const landing = column.z + 1 + half;
    state.cubes.push({
      // Al centro della colonna: un cubetto piu' stretto del voxel appoggiato
      // sull'angolo si vedrebbe di traverso rispetto a tutto il resto.
      x: x + 0.5,
      y: y + 0.5,
      size: RAIN.size,
      palette: column.palette,
      landing,
      rise,
      born,
      z: landing + rise,
      falling: false,
    });
    seeded++;
  }
  return seeded;
}

/**
 * Porta la pioggia a questo istante e butta via chi e' arrivato.
 *
 * Il profilo e' quello dei blocchi di `introDrop.ts` — fermo in cima, veloce
 * all'impatto — perche' le due meta' dell'effetto devono leggersi come una cosa
 * sola. Restituisce quanti cubetti sono in aria.
 */
export function advanceRain(state: RainState, now: number): number {
  const cubes = state.cubes;
  let falling = 0;

  for (let i = cubes.length - 1; i >= 0; i--) {
    const cube = cubes[i];
    const age = now - cube.born;

    if (age >= RAIN.duration) {
      // Scambio con l'ultimo invece di uno `splice`: l'ordine non conta, e la
      // pioggia si svuota nel frame in cui lo streaming e' piu' occupato.
      cubes[i] = cubes[cubes.length - 1];
      cubes.pop();
      continue;
    }

    if (age <= 0) {
      cube.falling = false;
      continue;
    }

    const u = age / RAIN.duration;
    cube.z = cube.landing + cube.rise * (1 - u * u);
    cube.falling = true;
    falling++;
  }
  return falling;
}
