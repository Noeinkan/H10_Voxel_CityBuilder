import type { TerrainMap } from '../world/terrain/TerrainMap';
import { TERRAIN } from '../world/terrain/config';

export interface Ray3 {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

export interface SurfaceCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly buildable: boolean;
}

/**
 * Cima di cio' che e' stato costruito su una colonna, `0` se non c'e' niente.
 *
 * E' l'unica cosa che `pickSolidCell` ha bisogno di sapere sugli edifici, e la
 * sa gia' il registro: passare qui una funzione invece del registro tiene questo
 * file dov'e', cioe' senza dipendenze oltre alla heightmap.
 */
export type BuiltTop = (x: number, y: number) => number;

/** Interseca un raggio con la heightmap, senza dipendere da Three.js o dal DOM. */
export function pickSurfaceCell(ray: Ray3, map: TerrainMap): SurfaceCell | null {
  return pickSolidCell(ray, map, null, TERRAIN.maxHeight + 1);
}

/**
 * Come sopra, ma il raggio si ferma anche su cio' che sta **sopra** il terreno.
 *
 * Sono due domande diverse e vanno tenute separate. Chi piazza qualcosa chiede
 * «su quale terra sto puntando», e li' un edificio non conta: si costruisce sul
 * suolo. Chi guarda chiede «cosa sto indicando», e li' la heightmap da sola
 * risponde male in modo spettacolare — attraversa la torre come se fosse vetro e
 * si ferma sulla terra **dietro**, che con una camera a quarantacinque gradi sta
 * a tante colonne quanto e' alta la torre. Le viste ci si agganciavano, e
 * bastava puntare un grattacielo perche' la lente si aprisse mezzo isolato piu'
 * in la'.
 *
 * `ceiling` e' dove comincia la discesa: la heightmap ha un tetto noto, la
 * citta' no, e partire dall'origine del raggio costerebbe migliaia di passi in
 * un punto che gira a ogni frame.
 */
export function pickSolidCell(
  ray: Ray3,
  map: TerrainMap,
  builtTop: BuiltTop | null,
  ceiling: number,
): SurfaceCell | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (dz >= -1e-8) return null;

  // Si entra nella heightmap dall'alto. Proiettare prima su z=0 e correggere
  // dopo fallisce vicino ai bordi: quel punto puo' essere fuori dalla mappa
  // anche quando il raggio attraversa chiaramente una collina piu' in alto.
  const top = Math.min(oz, ceiling);
  for (let z = top; z >= TERRAIN.oceanFloor; z -= 0.25) {
    const t = (z - oz) / dz;
    if (t < 0) continue;
    const x = Math.floor(ox + dx * t);
    const y = Math.floor(oy + dy * t);
    const column = map.columnAt(x, y);
    if (column === null) continue;
    // La colonna resta quella del **terreno**: chi la riceve ragiona sul suolo,
    // e la quota di cio' che ci sta sopra la chiede al registro.
    const surface = builtTop === null ? column.height : Math.max(column.height, builtTop(x, y));
    if (z <= surface) {
      return { x, y, z: column.height, buildable: column.buildable };
    }
  }
  return null;
}
