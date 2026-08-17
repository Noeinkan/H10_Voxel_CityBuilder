import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { hashCoords, mulberry32 } from '../rng';
import { TERRAIN } from './config';
import type { IslandShape } from './region';

/**
 * Campo di altezza continuo dell'isola.
 *
 * E' una funzione pura di `(seed, shape, x, y)`: nessuno stato accumulato,
 * nessuna dipendenza dalle colonne gia' generate. Due chiamate con lo stesso
 * seed e la stessa maschera restituiscono lo stesso float, in qualunque ordine
 * e da qualunque thread.
 *
 * Il valore e' `oceanFloor + relief * fbm01 * mask`: il rumore fa il rilievo, la
 * maschera radiale lo spegne verso il bordo della region portando la costa e poi
 * il fondale sotto il livello del mare.
 */
export class HeightField {
  readonly seed: number;
  readonly shape: IslandShape;

  private readonly noises: NoiseFunction2D[] = [];
  private readonly frequencies: Float64Array;
  /** Ampiezze gia' normalizzate: sommano a 1, cosi' fbm resta in [-1, 1]. */
  private readonly weights: Float64Array;

  /** Rumore che deforma il raggio della maschera. Indipendente dalle ottave. */
  private readonly warp: NoiseFunction2D;

  /**
   * Rilievo effettivo in voxel: il tetto assoluto, oppure quello che il raggio
   * dell'isola consente senza superare la pendenza di calibrazione.
   */
  private readonly relief: number;

  constructor(seed: number, shape: IslandShape) {
    this.seed = seed;
    this.shape = shape;
    this.relief = Math.min(
      TERRAIN.maxHeight - TERRAIN.oceanFloor,
      Math.min(shape.radiusX, shape.radiusY) * TERRAIN.maxReliefSlope,
    );

    const count = TERRAIN.octaves;
    this.frequencies = new Float64Array(count);
    this.weights = new Float64Array(count);

    let frequency = TERRAIN.baseFrequency;
    let amplitude = 1;
    let total = 0;
    for (let i = 0; i < count; i++) {
      // Ogni ottava ha il proprio generatore: il sale per indice le tiene
      // scorrelate, cosi' le creste non si sovrappongono tutte nello stesso punto.
      this.noises.push(createNoise2D(mulberry32(hashCoords(seed, i, TERRAIN.noiseSalt))));
      this.frequencies[i] = frequency;
      this.weights[i] = amplitude;
      total += amplitude;
      frequency *= TERRAIN.lacunarity;
      amplitude *= TERRAIN.persistence;
    }
    for (let i = 0; i < count; i++) this.weights[i] /= total;

    this.warp = createNoise2D(mulberry32(hashCoords(seed, TERRAIN.octaves, TERRAIN.warpSalt)));
  }

  /** Somma delle ottave riportata in [0, 1]. */
  noiseAt(x: number, y: number): number {
    let sum = 0;
    for (let i = 0; i < this.noises.length; i++) {
      const f = this.frequencies[i];
      sum += this.weights[i] * this.noises[i](x * f, y * f);
    }
    // fbm sta in [-1, 1] perche' i pesi sono normalizzati; il clamp copre solo
    // gli estremi teorici che il simplex non raggiunge mai davvero.
    return clamp01(0.5 + 0.5 * sum);
  }

  /**
   * Maschera radiale in [0, 1]: 1 al centro dell'ellisse, 0 sul bordo.
   *
   * Coseno rialzato invece di uno smoothstep: e' C1 sia al centro sia al bordo,
   * quindi non lascia ne' una punta al centro ne' uno spigolo sulla costa, e ha
   * il gradiente massimo piu' basso a parita' di raggio.
   *
   * Il raggio viene prima deformato da un rumore lentissimo, altrimenti l'isola
   * resterebbe un'ellisse esatta e le fasce di bioma uscirebbero come cerchi
   * concentrici. La deformazione non puo' spingere il raggio sotto zero, quindi
   * il centro resta il centro.
   */
  maskAt(x: number, y: number): number {
    const dx = (x - this.shape.centreX) / this.shape.radiusX;
    const dy = (y - this.shape.centreY) / this.shape.radiusY;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r <= 0) return 1;

    const warped =
      r *
      (1 + TERRAIN.warpAmount * this.warp(x * TERRAIN.warpFrequency, y * TERRAIN.warpFrequency));
    if (warped >= 1) return 0;
    return 0.5 * (1 + Math.cos(Math.PI * warped));
  }

  /**
   * Rilievo normalizzato in [0, 1], maschera inclusa.
   *
   * Il rumore non moltiplica la maschera da solo: sotto c'e' una quota fissa
   * (`domeBias`) che la maschera porta comunque su. Senza quel termine l'isola
   * dipende troppo da dove capitano le creste del seed — un seed sfortunato da'
   * un banco piatto senza collina ne' roccia.
   */
  elevationAt(x: number, y: number): number {
    const relief = TERRAIN.domeBias + (1 - TERRAIN.domeBias) * this.noiseAt(x, y);
    return relief * this.maskAt(x, y);
  }

  /** Altezza continua in voxel, gia' limitata a `[oceanFloor, maxHeight]`. */
  heightAt(x: number, y: number): number {
    return TERRAIN.oceanFloor + this.relief * this.elevationAt(x, y);
  }
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
