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
 * Compatta palette e semantica visuale nello stesso byte di `Chunk.blocks`.
 * Il vuoto resta sempre zero: un tipo di superficie da solo non rende solida
 * una cella e non deve creare chunk fantasma.
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
