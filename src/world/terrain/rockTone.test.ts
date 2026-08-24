import { describe, expect, it } from 'vitest';
import { PALETTE_SIZE } from '../../engine/paletteSlots';
import { ROCK, TERRAIN } from './config';
import { rockBandAt, rockSubsoil, rockSurface } from './rockTone';

/** La rampa letta come indici e non come letterali: qui si cerca una posizione. */
const TONES: readonly number[] = ROCK.tones;

describe('rockTone — gli strati', () => {
  it('salgono con la quota, un gradone per volta', () => {
    const base = rockBandAt(48);
    expect(rockBandAt(48 + ROCK.bandHeight)).toBe(base + 1);
    expect(rockBandAt(48 + 2 * ROCK.bandHeight)).toBe(base + 2);
    // Dentro il gradone lo strato non cambia: e' quello che tiene il taglio sul
    // ciglio invece che a meta' parete.
    expect(rockBandAt(48 + ROCK.bandHeight - 1)).toBe(base);
  });

  /**
   * E' la proprieta' per cui il colore si legge: due grigi affiancati sulla
   * stessa quota significherebbero due strati alla stessa quota, che una roccia
   * non ha. La varieta' in pianta la porta il ciglio, non la tinta.
   */
  it('sono funzione della sola quota', () => {
    for (let z = 0; z <= TERRAIN.maxHeight; z += 3) {
      expect(rockBandAt(z)).toBe(rockBandAt(z));
      expect(rockSurface(rockBandAt(z))).toBe(rockSurface(rockBandAt(z)));
    }
  });
});

describe('rockTone — le tinte', () => {
  it('sono slot veri della palette, e il sottosuolo e’ sempre piu’ scuro', () => {
    for (let band = -8; band <= 16; band++) {
      const surface = rockSurface(band);
      const subsoil = rockSubsoil(band);
      expect(surface).toBeGreaterThan(0);
      expect(surface).toBeLessThan(PALETTE_SIZE);
      expect(subsoil).toBeLessThan(PALETTE_SIZE);
      // "Piu' scuro" e' la posizione sulla rampa, che e' ordinata dal chiaro
      // allo scuro: il sottosuolo e' sempre il gradino successivo.
      expect(TONES.indexOf(subsoil)).toBe(TONES.indexOf(surface) + 1);
    }
  });

  it('la parete della roccia non e’ piu’ di un grigio solo', () => {
    const surfaces = new Set<number>();
    for (let z = TERRAIN.rockMinHeight; z <= TERRAIN.maxHeight; z += ROCK.bandHeight) {
      surfaces.add(rockSurface(rockBandAt(z)));
    }
    expect(surfaces.size).toBeGreaterThan(1);
  });

  it('due strati contigui restano due tinte contigue, anche al giro della rampa', () => {
    for (let band = -8; band < 16; band++) {
      const here = TONES.indexOf(rockSurface(band));
      const next = TONES.indexOf(rockSurface(band + 1));
      expect(Math.abs(next - here)).toBe(1);
    }
  });
});
