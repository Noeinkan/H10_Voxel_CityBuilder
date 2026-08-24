/** Cinque bit restano dedicati ai 32 slot di palette esistenti. */
export const BLOCK_PALETTE_MASK = 0b0001_1111;

/** I tre bit alti descrivono il linguaggio visuale della superficie. */
export const BLOCK_SURFACE_SHIFT = 5;
export const BLOCK_SURFACE_MASK = 0b0000_0111;

export const SURFACE_KIND = {
  plain: 0,
  habitat: 1,
  industrial: 2,
  civic: 3,
  luminous: 4,
  portal: 5,
  roofTech: 6,
  utility: 7,
} as const;

export type SurfaceKind = typeof SURFACE_KIND[keyof typeof SURFACE_KIND];

/**
 * Nome di ogni linguaggio, indicizzato come i tre bit alti.
 *
 * Derivato dalla tabella e non riscritto accanto a lei: e' l'unico modo perche'
 * un tipo nuovo non possa comparire senza nome. Lo legge il campionario, dove
 * l'ordine delle righe e' l'unica convenzione disponibile e in-world non ci sono
 * etichette. La lunghezza e' quella dell'oggetto, non un otto scritto a mano.
 */
const surfaceNames = new Array<string>(Object.keys(SURFACE_KIND).length).fill('');
for (const [name, index] of Object.entries(SURFACE_KIND)) surfaceNames[index] = name;

export const SURFACE_KIND_NAMES: readonly string[] = surfaceNames;

/** I tipi di superficie in ordine di indice, per chi deve percorrerli tutti. */
export const ALL_SURFACE_KINDS: readonly SurfaceKind[] =
  surfaceNames.map((_, index) => index as SurfaceKind);

/**
 * Per un voxel d'**acqua** i tre bit non portano un linguaggio di facciata ma la
 * classe dello specchio. E' un sovraccarico deliberato di questo campo.
 *
 * Serve perche' il mesher emette del mare la sola faccia superiore, a quota
 * costante e con un solo indice di palette: senza un secondo canale, al
 * frammento non arriva nessun segnale di profondita' e una pozza ha lo stesso
 * colore di sedici voxel di mare aperto. I bit sono tutti impegnati — un nono
 * tipo di superficie o un trentatreesimo slot di palette violerebbero gli
 * invarianti 4 e 5 — e nessuno dei sette linguaggi si applica a una lastra
 * d'acqua, quindi il campo qui e' libero di significare altro.
 *
 * Il fragment shader riconosce l'acqua dalla palette **prima** di leggere il
 * linguaggio, e per lei cortocircuita del tutto lo switch delle facciate. Chi
 * classifica sta in `terrain/waterClass.ts`, dove la profondita' e' ancora nota.
 */
export const WATER_CLASS = {
  /** Mare aperto: fondale lontano, onda lunga, riflesso del sole. */
  open: SURFACE_KIND.plain,
  /** Bassofondo: si legge la sabbia sotto, increspatura fitta. */
  shallow: SURFACE_KIND.habitat,
  /** Braccio stretto fra due sponde: acqua ferma, quasi uno specchio. */
  canal: SURFACE_KIND.industrial,
} as const;

export type WaterClass = typeof WATER_CLASS[keyof typeof WATER_CLASS];

/**
 * Copertura del terreno: una cella piena **senza palette propria**.
 *
 * E' il secondo sovraccarico dichiarato di questo byte, e come quello dell'acqua
 * non toglie niente a nessuno: `packVisualBlock` rifiuta la palette 0, quindi i
 * byte con palette 0 e superficie non nulla non li produce mai nessuno. Sono
 * sette valori liberi per davvero — non un ottavo linguaggio di superficie e non
 * un trentatreesimo slot di palette.
 *
 * **Serve perche' un ciuffo d'erba non e' un cubo.** Il mesher lo toglie dal
 * volume prima del greedy pass e al suo posto scrive prismi da 1/16, e per farlo
 * deve poterlo riconoscere con certezza: la geometria da sola non basta, perche'
 * la cima di una macchia d'alta quota e' `grassPale` appoggiato su `grass`
 * esattamente come un ciuffo di pianura. Il marcatore e' il mondo che lo dichiara
 * invece di lasciarlo indovinare.
 *
 * **La tinta non c'e' perche' non e' del ciuffo.** Una copertura prende il tono
 * dal terreno su cui poggia, che il mesher ha gia' sotto gli occhi: portarselo
 * dietro sarebbe una seconda copia della tabella di `groundcover.ts`. Ne segue
 * che `blockPalette` di un marcatore vale 0 — cioe' che per `getBlock`, e quindi
 * per chi cerca un ostacolo, un'erbetta non c'e'. E' il verso giusto: la
 * copertura e' decorazione, non volume.
 */
export function packCoverMark(kind: number): number {
  return (kind & BLOCK_SURFACE_MASK) << BLOCK_SURFACE_SHIFT;
}

/** Il tipo di copertura di un marcatore; vale 0 su qualunque altro byte. */
export function coverMarkKind(block: number): number {
  return (block & BLOCK_PALETTE_MASK) === 0 ? block >>> BLOCK_SURFACE_SHIFT : 0;
}

/** true per le celle piene che non portano un indice di palette. */
export function isCoverMark(block: number): boolean {
  return block !== 0 && (block & BLOCK_PALETTE_MASK) === 0;
}

/**
 * Compatta palette e semantica visuale nello stesso byte di `Chunk.blocks`.
 * Il vuoto resta sempre zero: un tipo di superficie da solo non rende solida
 * una cella e non deve creare chunk fantasma.
 *
 * Lo spazio con palette 0 e superficie non nulla lo scrive soltanto
 * `packCoverMark`, che sta qui sopra apposta.
 */
export function packVisualBlock(palette: number, surface: SurfaceKind = SURFACE_KIND.plain): number {
  if (palette === 0) return 0;
  return (palette & BLOCK_PALETTE_MASK) |
    ((surface & BLOCK_SURFACE_MASK) << BLOCK_SURFACE_SHIFT);
}

/** Indice 0..31 consumato dalla palette e dalle API pubbliche del mondo. */
export function blockPalette(block: number): number {
  return block & BLOCK_PALETTE_MASK;
}

/** Grammatica di superficie consumata soltanto dal percorso di rendering. */
export function blockSurface(block: number): SurfaceKind {
  return ((block >>> BLOCK_SURFACE_SHIFT) & BLOCK_SURFACE_MASK) as SurfaceKind;
}
