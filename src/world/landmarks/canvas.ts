import type { SurfaceKind } from '../visualBlock';

/**
 * La tela su cui le parti di un landmark scrivono.
 *
 * **Sta in un file suo per rompere un ciclo, non per ordine.** Le primitive
 * ornate di `ornaments.ts` scrivono sulla stessa tela di quelle di `parts.ts`,
 * ma e' `parts.ts` a smistare fra le due: se la tela stesse li', il file degli
 * ornamenti dovrebbe importare da chi lo importa. Tenerla qui la rende cio' che
 * gia' era — un buffer e la regola per scriverci dentro — senza che nessuno dei
 * due debba conoscere l'altro.
 *
 * Non conosce il mondo ne' le coordinate vere: e' lo stesso confine che permette
 * a `generateLandmark` di girare in un test in ambiente `node`.
 */
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
 * Scrive un voxel, scartando in silenzio cio' che cade fuori dalla tela.
 *
 * Lo scarto non e' una comodita': una ricetta che sfora e' un errore d'autore, e
 * il posto dove si scopre e' il test che confronta `partBounds` con lo `span`
 * dichiarato. Qui scartare e' solo cio' che tiene la scrittura dentro il buffer.
 */
export function put(
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
