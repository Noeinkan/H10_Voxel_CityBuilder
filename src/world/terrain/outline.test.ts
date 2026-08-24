import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { LANDFORM } from './config';
import {
  outlineOf,
  outlinePoint,
  outlineRatio,
  planWarp,
  SHAPE_WARP_LIPSCHITZ,
} from './outline';

const TAU = Math.PI * 2;

/** Ampiezza totale delle armoniche: quanto la deformazione puo' spostare il raggio. */
const AMPLITUDE = LANDFORM.shapeWarp.reduce((sum, term) => sum + Math.abs(term.amplitude), 0);

describe('outline — l’ellisse di prima', () => {
  it('senza armoniche e senza rotazione e’ il raggio normalizzato di sempre', () => {
    const plain = outlineOf(100, 100, 60, 30, 0, []);
    expect(outlineRatio(plain, 100, 100)).toBe(0);
    expect(outlineRatio(plain, 160, 100)).toBeCloseTo(1, 12);
    expect(outlineRatio(plain, 100, 130)).toBeCloseTo(1, 12);
    expect(outlineRatio(plain, 130, 100)).toBeCloseTo(0.5, 12);
  });

  it('la rotazione porta il semiasse dove punta, non altrove', () => {
    const turned = outlineOf(0, 0, 60, 30, Math.PI / 2, []);
    // Ruotata di un quarto di giro, il semiasse lungo guarda a nord.
    expect(outlineRatio(turned, 0, 60)).toBeCloseTo(1, 12);
    expect(outlineRatio(turned, 30, 0)).toBeCloseTo(1, 12);
  });
});

describe('outline — la deformazione', () => {
  const warp = planWarp(mulberry32(1337));
  const shape = outlineOf(0, 0, 50, 50, 0.7, warp);

  it('resta dentro l’ampiezza dichiarata, comunque cada la fase', () => {
    for (let seed = 0; seed < 32; seed++) {
      const other = outlineOf(0, 0, 40, 40, 0, planWarp(mulberry32(seed)));
      for (let i = 0; i < 64; i++) {
        const angle = (i * TAU) / 64;
        const ratio = outlineRatio(other, 20 * Math.cos(angle), 20 * Math.sin(angle));
        expect(ratio).toBeGreaterThanOrEqual(0.5 * (1 - AMPLITUDE) - 1e-9);
        expect(ratio).toBeLessThanOrEqual(0.5 * (1 + AMPLITUDE) + 1e-9);
      }
    }
  });

  /**
   * E' la proprieta' che rende la deformazione gratuita per chi cerca un sito:
   * il bordo esterno e' il cerchio esatto del raggio dichiarato, quindi una
   * sagoma deformata non sonda il terreno piu' in la' di una tonda.
   */
  it('sul bordo torna il cerchio del raggio che dichiara', () => {
    for (let i = 0; i < 90; i++) {
      const [x, y] = outlinePoint(shape, 1, (i * TAU) / 90);
      expect(Math.sqrt(x * x + y * y)).toBeCloseTo(50, 9);
      expect(outlineRatio(shape, x, y)).toBeCloseTo(1, 9);
    }
  });

  it('non e’ piu’ una circonferenza: dentro, il bordo cambia raggio con l’angolo', () => {
    // Alla corona dove sta la riva di un lago, che e' l'unica curva della
    // sagoma che si guardi per intero.
    let nearest = Infinity;
    let farthest = 0;
    for (let i = 0; i < 180; i++) {
      const angle = (i * TAU) / 180;
      const [x, y] = outlinePoint(shape, 0.35, angle);
      const radius = Math.sqrt(x * x + y * y);
      nearest = Math.min(nearest, radius);
      farthest = Math.max(farthest, radius);
    }
    expect(farthest / nearest).toBeGreaterThan(1.15);
  });

  it('`outlinePoint` e’ l’inverso esatto di `outlineRatio`', () => {
    for (const ratio of [0.25, 0.5, 0.8, 1]) {
      for (let i = 0; i < 24; i++) {
        const [x, y] = outlinePoint(shape, ratio, (i * TAU) / 24);
        expect(outlineRatio(shape, x, y)).toBeCloseTo(ratio, 10);
      }
    }
  });

  /**
   * E' l'invariante su cui si regge tutto il resto: chi usa una sagoma deformata
   * divide per questo fattore la pendenza che dichiara, e se il fattore fosse
   * ottimista il budget di Lipschitz del campo verrebbe speso di nascosto.
   */
  it('il gradiente non supera il fattore dichiarato, su ogni fase', () => {
    const radius = 40;
    for (let seed = 0; seed < 16; seed++) {
      const other = outlineOf(0, 0, radius, radius, 0, planWarp(mulberry32(seed)));
      let worst = 0;
      const step = 0.05;
      for (let y = -radius; y <= radius; y += 0.5) {
        for (let x = -radius; x <= radius; x += 0.5) {
          if (x * x + y * y < 4) continue; // il centro e' un punto, non una pendenza
          const here = outlineRatio(other, x, y);
          const dx = (outlineRatio(other, x + step, y) - here) / step;
          const dy = (outlineRatio(other, x, y + step) - here) / step;
          worst = Math.max(worst, Math.sqrt(dx * dx + dy * dy));
        }
      }
      expect(worst * radius).toBeLessThanOrEqual(SHAPE_WARP_LIPSCHITZ + 1e-6);
    }
  });
});
