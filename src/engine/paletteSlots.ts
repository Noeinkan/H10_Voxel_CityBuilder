/**
 * Nomi degli slot di palette, tenuti separati da `palette.ts` perche' non
 * dipendono da Three.js: cosi' src/world resta libero da import di rendering.
 *
 * L'indice 0 e' il vuoto e non viene mai scritto in `Chunk.blocks`.
 */
export const PALETTE_SLOTS = {
  empty: 0,
  asphalt: 1,
  asphaltDark: 2,
  asphaltShadow: 3,
  concrete: 4,
  concreteLight: 5,
  concretePale: 6,
  concreteWhite: 7,
  stone: 8,
  stoneWarm: 9,
  stoneDark: 10,
  stoneDeep: 11,
  glass: 12,
  glassDeep: 13,
  glassPale: 14,
  glassDark: 15,
  brick: 16,
  brickDark: 17,
  brickLight: 18,
  wood: 19,
  grass: 20,
  grassDark: 21,
  grassLight: 22,
  grassPale: 23,
  water: 24,
  waterDeep: 25,
  metalGold: 26,
  metalBrass: 27,
  metalRust: 28,
  metalDark: 29,
  roofPale: 30,
  roofWhite: 31,
} as const;

export const PALETTE_SIZE = 32;

/**
 * Nome di ogni slot, indicizzato come la palette.
 *
 * E' **derivato** e non una seconda tabella: un elenco scritto a mano
 * divergerebbe da `PALETTE_SLOTS` alla prima aggiunta, e il campionario della
 * 4.10 mostrerebbe una colonna con il nome di quella accanto. Chi lo legge
 * chiede un nome per un indice, che e' il verso opposto a quello dell'oggetto.
 */
const slotNames = new Array<string>(PALETTE_SIZE).fill('');
for (const [name, index] of Object.entries(PALETTE_SLOTS)) slotNames[index] = name;

export const PALETTE_SLOT_NAMES: readonly string[] = slotNames;
