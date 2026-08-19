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
