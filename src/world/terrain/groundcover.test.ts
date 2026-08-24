import { describe, expect, it } from 'vitest';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { BIOME, BIOME_NAMES, BIOME_STRATA, GROUND_COVER } from './config';
import {
  COVER,
  COVER_FORM,
  coverAt,
  coverFormOn,
  coverGroundPalettes,
  coverToneOn,
} from './groundcover';

/** La palette di superficie del bioma: la chiave con cui il mesher lo riconosce. */
function ground(biome: number): number {
  return BIOME_STRATA[biome].surface;
}

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
        // Una tinta a zero vorrebbe dire una colonna marcata e poi non disegnata:
        // il conteggio delle celle direbbe una cosa e lo schermo un'altra.
        expect(coverToneOn(ground(biome), kind), `${BIOME_NAMES[biome]} / ${kind}`)
          .toBeGreaterThan(0);
        expect(coverFormOn(ground(biome), kind), `${BIOME_NAMES[biome]} / ${kind}`)
          .not.toBe(COVER_FORM.none);
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
    expect(coverToneOn(ground(BIOME.rock), COVER.accent))
      .not.toBe(coverToneOn(ground(BIOME.plain), COVER.accent));
  });

  it('la palette del terreno basta a ritrovare il bioma', () => {
    // E' l'unica cosa che tiene in piedi la tabella per il mesher: la', del
    // terreno, arriva solo il volume. Due biomi che scrivessero la stessa
    // superficie vorrebbero dire due coperture che si scambiano il posto.
    const surfaces = BIOME_NAMES.flatMap((_, biome) => [...coverGroundPalettes(biome)]);
    expect(new Set(surfaces).size).toBe(surfaces.length);
  });

  it('anche un accento non puo’ farsi passare per il proprio terreno', () => {
    // La roccia ci e' gia' passata una volta: un `concretePale` sulla banda del
    // proprio colore spariva. Il verso opposto e' peggio — un sasso che vale
    // anche come suolo — quindi vale la pena tenerlo sotto un test.
    for (let biome = 0; biome < BIOME_NAMES.length; biome++) {
      if (GROUND_COVER.density[biome] <= 0) continue;
      const own = new Set(coverGroundPalettes(biome));
      for (const tone of [GROUND_COVER.grassTone[biome], GROUND_COVER.accentTone[biome]]) {
        if (tone === 0) continue;
        expect(own.has(tone), `${BIOME_NAMES[biome]} / ${tone}`).toBe(false);
      }
    }
  });

  it('il fiore cresce dove cresce l’erba, il sasso dove non cresce', () => {
    for (let biome = 0; biome < BIOME_NAMES.length; biome++) {
      if (GROUND_COVER.density[biome] <= 0) continue;
      const grows = GROUND_COVER.grassTone[biome] !== 0;
      // Su **ogni** palette che il bioma sa scrivere: la roccia ne ha tre, e un
      // sasso che compare su un gradone su tre si legge come un difetto.
      for (const palette of coverGroundPalettes(biome)) {
        expect(coverFormOn(palette, COVER.accent), `${BIOME_NAMES[biome]} / ${palette}`)
          .toBe(grows ? COVER_FORM.bloom : COVER_FORM.pebble);
        expect(coverFormOn(palette, COVER.grass), `${BIOME_NAMES[biome]} / ${palette}`)
          .toBe(grows ? COVER_FORM.tuft : COVER_FORM.none);
      }
    }
  });

  it('su un terreno che non e’ suo, una copertura non ha ne’ tinta ne’ forma', () => {
    // E' cio' che succede a un marcatore sopravvissuto a una strada: la colonna
    // sotto di lui e' stata ripavimentata, e lui sparisce invece di mettersi un
    // ciuffo d'erba sull'asfalto.
    for (const kind of [COVER.grass, COVER.accent]) {
      expect(coverToneOn(PALETTE_SLOTS.asphalt, kind)).toBe(0);
      expect(coverFormOn(PALETTE_SLOTS.asphalt, kind)).toBe(COVER_FORM.none);
    }
    expect(coverToneOn(ground(BIOME.plain), COVER.none)).toBe(0);
  });
});
