import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import { PALETTE_SLOTS } from '../paletteSlots';
import { FACE_NZ } from '../../world/chunkCoords';
import { SURFACE_KIND } from '../../world/visualBlock';
import {
  LATERAL_FACES,
  emitPoints,
  emitRuns,
  facadeAt,
  facadeBox,
  frontage,
  interiorRoof,
  openRoof,
  propRoll,
  type ChunkOrigin,
  type MicroGeometryWriter,
} from './microGeometry';

/**
 * Il dettaglio del **retro** e del tetto praticabile: tubazioni, scale esterne,
 * pergole.
 *
 * **E' un modulo suo e non tre funzioni in piu' in `microGeometry.ts`**, che e'
 * gia' oltre il budget di righe di questa cartella. Vale la regola a monte del
 * progetto: per una responsabilita' nuova un file nuovo, non una funzione in piu'
 * in un file grande. La responsabilita' qui e' distinta e si nomina in una riga —
 * cio' che un edificio mostra dove **non** si affaccia sulla strada — mentre gli
 * emettitori esistenti vestono il fronte e la struttura.
 *
 * **Il retro e' l'aggancio, e non e' un ripiego.** `frontage` dice se sotto una
 * faccia c'e' un ingresso, cioe' se quella faccia guarda la via: tende, insegne e
 * portali stanno **li'**, e le tubazioni no. Su un fronte pulito una calata di
 * scarico legge come sciatteria; sul retro e' esattamente cio' che rende un
 * isolato fitto credibile invece che levigato.
 *
 * **Nessun linguaggio di superficie nuovo e nessuno slot nuovo** (invarianti 4 e
 * 5): ogni aggancio nasce da una combinazione di superfici gia' esistenti piu' il
 * vicinato, e i prismi escono `utility`, che e' il metallo strutturale che questi
 * oggetti sono davvero.
 *
 * **Vengono per ultimi nella sequenza, e per la ragione gia' scritta**: sotto
 * pressione di budget cadono loro. Una citta' senza tubi resta leggibile, una
 * senza parapetti no.
 *
 * **Costo, misurato** e non stimato, su questa macchina.
 *
 * In **geometria**, sulla fixture `densityChunk` di `microGeometry.test.ts` — il
 * caso fitto del progetto: da **4 355 a 6 055 quad di dettaglio**, cioe' +1 700 e
 * +39%. Restano il 37% del tetto di 16 384, quindi il margine c'e' — ma e' il
 * gruppo piu' caro aggiunto in una volta, e chi ne aggiunge un quarto rimisuri
 * invece di fidarsi di questa riga.
 *
 * In **tempo**, sul bench `edifici sci-fi (con microgeometria)`: 8,9 ms senza e
 * 8,5 ms con, cioe' **dentro il rumore** (rme ±1,3% e ±4,0%, e la corsa con il
 * gruppo acceso e' uscita la piu' veloce delle due). Non e' sorprendente: i tre
 * predicati cadono subito su tutto cio' che non e' una facciata d'uso esposta, e
 * il tiro si legge una volta per colonna.
 */

const U = MESH_UNITS_PER_VOXEL;

/** Sali per separare le tre domande. Vedi `propRoll`. */
const RISER_SALT = 0x51a9_3d17;
const STAIR_SALT = 0x2f6b_c805;
const PERGOLA_SALT = 0x9c14_7e6b;

/**
 * Quanto in alto salgono i tubi.
 *
 * Non c'e' un limite fisico: c'e' che sopra una certa quota una calata non si
 * legge piu' come impianto ma come riga verticale, e a quel punto e' rumore che
 * compete con la campata. Sedici voxel sono quattro piani.
 */
const RISER_TOP = 16;

/** Colonne di retro che portano una calata. */
const RISER_CHANCE = 0.14;

/** Fin dove una scala esterna ha senso: sopra, si prende l'ascensore. */
const STAIR_TOP = 14;

/** Facciate di retro che portano una scala. Bassa: e' l'emettitore piu' caro. */
const STAIR_CHANCE = 0.05;

/** Tetti scoperti che portano una pergola. */
const PERGOLA_CHANCE = 0.18;

/** true se questa faccia guarda il retro: e' esposta, ha un uso, e non ha ingressi sotto. */
function backFacade(padded: Uint8Array, x: number, y: number, z: number, face: number): number {
  const surface = facadeAt(padded, x, y, z, face);
  if (surface === SURFACE_KIND.plain) return SURFACE_KIND.plain;
  return frontage(padded, x, y, z, face) ? SURFACE_KIND.plain : surface;
}

/**
 * Calate di scarico sul retro.
 *
 * **Costa un prisma per calata, non per voxel.** Il tiro si semina sulla
 * **colonna** — `z` fisso a zero — quindi il predicato risponde uguale a tutte le
 * quote e `emitRuns` fonde l'intera calata in un box solo. Seminandolo sulla
 * cella verrebbero fuori tratti staccati, che e' sia piu' brutto sia molto piu'
 * caro: la stessa mossa che i rampicanti fanno gia'.
 */
function emitRisers(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const ok = emitRuns(writer, facade[i], {
      runAxis: 2,
      palette: PALETTE_SLOTS.metalDark,
      hiddenFace: (face ^ 1) as number,
      has: (x, y, z) => z <= RISER_TOP &&
        backFacade(padded, x, y, z, face) !== SURFACE_KIND.plain &&
        propRoll(origin, x, y, 0, RISER_SALT) < RISER_CHANCE,
      // Stretta e poco profonda: un tubo, non una lesena. Fuori asse rispetto al
      // centro della cella, cosi' non si allinea con i montanti della campata.
      box: (x, y, z, length) => facadeBox(x, y, z, face, 3, 6, 0, length * U, 2),
    });
    if (!ok) return false;
  }
  return true;
}

/**
 * Scale esterne sul retro.
 *
 * **E' l'emettitore piu' caro del progetto, e la sua forma lo impone.** Una scala
 * non e' una corsa a quota costante: la pedata sale con la cella, quindi
 * `emitRuns` non puo' fonderla e serve un prisma per gradino. Da qui la
 * probabilita' bassa e il tetto di quota — non prudenza, aritmetica: a
 * probabilita' piena una facciata di venti voxel ne costerebbe venti da sola.
 *
 * Il pianerottolo sporge di 5/16 e la pedata di 3/16: la differenza e' cio' che
 * fa leggere la rampa come una zeta invece che come una lastra appoggiata al
 * muro. Si alterna sulla parita' della quota, che e' il modo piu' corto di dire
 * «una rampa e un riposo».
 */
function emitStairs(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  origin: ChunkOrigin,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const ok = emitPoints(writer, facade[i], {
      runAxis: 2,
      palette: PALETTE_SLOTS.metalRust,
      hiddenFace: (face ^ 1) as number,
      has: (x, y, z) => z >= 2 && z <= STAIR_TOP &&
        backFacade(padded, x, y, z, face) !== SURFACE_KIND.plain &&
        propRoll(origin, x, y, 0, STAIR_SALT) < STAIR_CHANCE,
      box: (x, y, z) => {
        const landing = (z & 1) === 0;
        const depth = landing ? 5 : 3;
        // Il pianerottolo occupa tutta la cella, la rampa mezza: la zeta esce
        // dall'alternanza invece che da due emettitori.
        const start = landing ? 0 : U / 2;
        const end = landing ? U : U;
        return facadeBox(x, y, z, face, start, end, 2, 5, depth);
      },
    });
    if (!ok) return false;
  }
  return true;
}

/**
 * Pergole sui tetti praticabili.
 *
 * Due prismi: i montanti agli estremi e il traverso in cima. Sta su
 * `interiorRoof` e non sul filo, per la stessa ragione di antenne e chiome — sul
 * filo c'e' gia' il parapetto, e una cornice larga un voxel non e' una copertura
 * su cui posare qualcosa.
 *
 * **E' la pergola che il coronamento non poteva essere.** Una cima aperta —
 * montanti e architrave con il vuoto in mezzo — era stata pensata come voce di
 * `CROWN_KIND`, e li' non funzionava: `crownBands` restituisce rettangoli pieni,
 * e il vuoto avrebbe voluto un interruttore in `paint` per una cosa che il mesher
 * sa gia' fare a 1/16 di voxel invece che a uno.
 *
 * **La quota base e' `(z + 1) * U`, e non e' un dettaglio di stile.** `openRoof`
 * risponde sul voxel **solido** del tetto, non sull'aria sopra: un prisma steso
 * fra `z * U` e `(z + 1) * U` finisce dentro quel pieno e non lo vede nessuno.
 * E' la stessa base di `emitRoofTech`, `emitRoofMasts`, `emitTerraceBoxes` e
 * `emitRoofCrowns` — chi ne aggiunge un altro copi loro, non l'aggancio di
 * facciata qui sopra, dove invece `facadeBox` sporge dal piano da se'.
 */
function emitPergolas(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  roofs: readonly number[],
  origin: ChunkOrigin,
): boolean {
  const wanted = (x: number, y: number, z: number): boolean =>
    openRoof(padded, x, y, z) && interiorRoof(padded, x, y, z) &&
    propRoll(origin, x, y, z, PERGOLA_SALT) < PERGOLA_CHANCE;

  // Il traverso: una lastra sottile a quota d'uomo, **sopra** il voxel di tetto.
  const ok = emitRuns(writer, roofs, {
    runAxis: 0,
    palette: PALETTE_SLOTS.wood,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z, length) => ({
      min: [x * U, y * U + 5, (z + 1) * U + 10],
      max: [(x + length) * U, y * U + 11, (z + 1) * U + 12],
    }),
  });
  if (!ok) return false;

  // Un montante per cella, sotto il traverso: lungo una corsa diventa il ritmo
  // di pilastrini che fa leggere la lastra come una pergola invece che come una
  // mensola. Sale fino a 11/16 e il traverso comincia a 10/16, cosi' i due si
  // compenetrano di 1/16 e la giunzione non si apre da nessuna angolazione.
  return emitPoints(writer, roofs, {
    runAxis: 0,
    palette: PALETTE_SLOTS.wood,
    hiddenFace: FACE_NZ,
    has: wanted,
    box: (x, y, z) => ({
      min: [x * U + 1, y * U + 5, (z + 1) * U],
      max: [x * U + 3, y * U + 11, (z + 1) * U + 11],
    }),
  });
}

/**
 * Il dettaglio del retro, in una chiamata sola.
 *
 * L'ordine dentro il gruppo e' quello del costo crescente: i tubi sono una corsa
 * per calata, le pergole due prismi per cella, le scale una per gradino. Se il
 * tetto arriva a meta' gruppo, a mancare e' la cosa piu' cara.
 */
export function appendStreetDetail(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  roofs: readonly number[],
  origin: ChunkOrigin,
): boolean {
  if (!emitRisers(padded, writer, facade, origin)) return false;
  if (!emitPergolas(padded, writer, roofs, origin)) return false;
  return emitStairs(padded, writer, facade, origin);
}
