import { SURFACE_KIND } from '../visualBlock';
import type { VoxelStamp } from '../buildings/stamp';
import { ROPEWAY } from './config';
import type { RopewayStation } from './ropewayPlan';

/**
 * Il generatore della funivia: la sola cosa che prende suolo.
 *
 * **Non conosce il mondo.** Entrano una stazione o un pilone, esce uno stamp:
 * nessun `VoxelWorld`, nessuna `TerrainMap`, nessun Three.js. E' la stessa regola
 * di `crossings/generate.ts` e serve alla stessa cosa — girare in un test in
 * ambiente `node`, e permettere al Builder di rigenerare una sagoma scritta
 * mille tick fa senza averla conservata.
 *
 * **La fune non e' qui, e non e' una dimenticanza.** E' spessa meno di un voxel:
 * disegnarla a cubi lungo centonovanta colonne darebbe una scala di quad al posto
 * di un cavo, e la pancia — l'unica cosa che la faccia leggere come una fune —
 * diventerebbe una gradinata. La calcola `ropewayPlan.ts` e la disegna
 * `engine/RopewayView.ts`, fuori dal volume voxel.
 *
 * ```
 *      ▄▄▄        la testata: e' qui che la fune si ancora
 *      █ █        il castello, due montanti e l'architrave
 *   ▄▄▄▄▄▄▄▄▄     la banchina d'imbarco, `deckDrop` sotto la fune
 *      ███        il fusto
 *    ███████      lo zoccolo, che la posa a terra
 * ```
 */

/** Voxel del fusto: quanto lo zoccolo e' alto prima che la torre si stringa. */
const PLINTH = 2;

export function generateStation(station: RopewayStation, axis: 0 | 1): VoxelStamp {
  const side = ROPEWAY.stationSide;
  const height = station.height;
  const length = side * side * height;
  const voxels = new Uint8Array(length);
  const surfaces = new Uint8Array(length);

  const half = (side - 1) / 2;
  // La banchina sta `deckDrop` sotto la fune, che occupa l'ultima quota dello
  // stamp: sotto di lei c'e' il fusto, sopra il castello.
  const deck = height - 1 - ROPEWAY.deckDrop;

  const put = (lx: number, ly: number, lz: number, palette: number, surface: number): void => {
    const index = lx + side * (ly + side * lz);
    voxels[index] = palette;
    surfaces[index] = surface;
  };

  for (let lz = 0; lz < height; lz++) {
    for (let ly = 0; ly < side; ly++) {
      for (let lx = 0; lx < side; lx++) {
        const along = axis === 0 ? lx : ly;
        const across = axis === 0 ? ly : lx;

        if (lz < PLINTH) {
          // Lo zoccolo e' pieno: e' cio' che posa la torre sul terreno invece di
          // farla germogliare da un punto.
          put(lx, ly, lz, ROPEWAY.stationPalette, SURFACE_KIND.utility);
          continue;
        }

        if (lz < deck) {
          // Il fusto: il quadrato centrale. Piu' stretto dello zoccolo, cosi'
          // che di taglio la torre abbia una rastremazione invece di un fianco
          // unico alto quaranta voxel.
          if (Math.abs(along - half) <= 1 && Math.abs(across - half) <= 1) {
            put(lx, ly, lz, ROPEWAY.stationPalette, SURFACE_KIND.utility);
          }
          continue;
        }

        if (lz === deck) {
          // La banchina, a tutta pianta: e' il piano su cui si sale, ed e' anche
          // la sola quota della torre che si veda dall'alto.
          const edge = along === 0 || along === side - 1 || across === 0 || across === side - 1;
          put(lx, ly, lz, edge ? ROPEWAY.copingPalette : ROPEWAY.deckPalette, SURFACE_KIND.roofTech);
          continue;
        }

        // Il castello: due montanti sulle testate dell'asse, in mezzeria.
        if (across !== half) continue;
        if (lz === height - 1) {
          // L'architrave, alla quota della fune: e' la riga che porta la puleggia
          // e l'unica cosa che dica dove la fune finisce.
          put(lx, ly, lz, ROPEWAY.copingPalette, SURFACE_KIND.utility);
        } else if (along === 0 || along === side - 1) {
          put(lx, ly, lz, ROPEWAY.stationPalette, SURFACE_KIND.utility);
        }
      }
    }
  }

  return {
    sizeX: side,
    sizeY: side,
    sizeZ: height,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    // Una stazione non nasce da una grammatica che sale: la comparsa a budget
    // scorre l'array lineare senza consultare questo indice.
    bandStarts: [0, height],
  };
}

