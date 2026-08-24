import { describe, expect, it } from 'vitest';
import { BIOME, BIOME_NAMES, GROUND_COVER } from './config';
import { COVER, coverAt, coverTone } from './groundcover';

const SEED = 1337;

/** Quante colonne su `count` ricevono qualcosa, per un bioma. */
function frequency(biome: number, side: number): number {
  let hits = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if (coverAt(SEED, x, y, biome) !== COVER.none) hits++;
    }
  }
  return hits / (side * side);
}

describe('copertura del terreno', () => {
  it('e’ funzione della sola posizione: stessa colonna, stesso ciuffo', () => {
    for (let x = 0; x < 50; x++) {
      expect(coverAt(SEED, x, 7, BIOME.plain)).toBe(coverAt(SEED, x, 7, BIOME.plain));
    }
    // E seed diversi danno prati diversi, o non sarebbe generazione.
    let differences = 0;
    for (let x = 0; x < 400; x++) {
      if (coverAt(SEED, x, 1, BIOME.plain) !== coverAt(SEED + 1, x, 1, BIOME.plain)) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('non cresce niente sott’acqua', () => {
    for (let x = 0; x < 500; x++) {
      expect(coverAt(SEED, x, x * 3, BIOME.ocean)).toBe(COVER.none);
    }
  });

  it('resta rada: e’ un accento, non un tappeto', () => {
    for (let biome = 0; biome < BIOME_NAMES.length; biome++) {
      const declared = GROUND_COVER.density[biome];
      const measured = frequency(biome, 128);
      // Su sedicimila colonne lo scarto tipico e' sotto il quarto di punto: un
      // punto e mezzo lascia margine all'hash senza lasciar passare una densita'
      // sbagliata, che qui vorrebbe dire un prato a pois.
      expect(Math.abs(measured - declared), BIOME_NAMES[biome]).toBeLessThan(0.015);
    }
  });

  it('ogni bioma che copre qualcosa ha una tinta per farlo', () => {
    for (let biome = 0; biome < BIOME_NAMES.length; biome++) {
      if (GROUND_COVER.density[biome] <= 0) continue;

      const kinds = new Set<number>();
      for (let x = 0; x < 6000; x++) {
        const kind = coverAt(SEED, x, 11, biome);
        if (kind !== COVER.none) kinds.add(kind);
      }
      expect(kinds.size, BIOME_NAMES[biome]).toBeGreaterThan(0);
      for (const kind of kinds) {
        // Una tinta a zero vorrebbe dire una colonna marcata e poi non scritta:
        // il conteggio dei voxel direbbe una cosa e lo schermo un'altra.
        expect(coverTone(kind, biome), `${BIOME_NAMES[biome]} / ${kind}`).toBeGreaterThan(0);
      }
    }
  });

  it('in quota compaiono sassi e non erba, sulla riva nemmeno quelli', () => {
    // E' la lettura per cui la tabella esiste: la copertura racconta la fascia
    // esattamente come fa la flora, un gradino piu' in basso.
    let rockGrass = 0;
    for (let x = 0; x < 4000; x++) {
      if (coverAt(SEED, x, 5, BIOME.rock) === COVER.grass) rockGrass++;
    }
    expect(rockGrass).toBe(0);
    expect(coverTone(COVER.accent, BIOME.rock)).not.toBe(coverTone(COVER.accent, BIOME.plain));
  });
});
