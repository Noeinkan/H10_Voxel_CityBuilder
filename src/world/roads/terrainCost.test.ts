import { describe, expect, it } from 'vitest';
import { ROADS } from './config';
import { terrainPenalty, wanderAt } from './terrainCost';

const SEED = 1337;

describe('wanderAt', () => {
  it('sta in [0, 1) ovunque', () => {
    for (let y = -40; y < 120; y += 3) {
      for (let x = -40; x < 120; x += 3) {
        const value = wanderAt(SEED, x, y);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('e una funzione del seme: due semi danno campi diversi, lo stesso seme lo stesso campo', () => {
    expect(wanderAt(SEED, 31, 47)).toBe(wanderAt(SEED, 31, 47));
    let differences = 0;
    for (let i = 0; i < 200; i++) {
      if (wanderAt(SEED, i, i * 3) !== wanderAt(SEED + 1, i, i * 3)) differences++;
    }
    expect(differences).toBeGreaterThan(180);
  });

  it('e continuo: fra due colonne adiacenti il salto e una frazione della cella', () => {
    // E' la proprieta' che distingue una curva da una scala. Il campo varia al
    // massimo di un'unita' su `wanderCell` colonne, quindi fra due vicine il
    // salto sta ampiamente sotto quel rapporto — smoothstep compresa, che sul
    // punto di massima pendenza vale 1,5 volte la retta.
    const bound = (1.5 / ROADS.wanderCell) * 2;
    for (let x = 0; x < 200; x++) {
      const jump = Math.abs(wanderAt(SEED, x + 1, 60) - wanderAt(SEED, x, 60));
      expect(jump).toBeLessThan(bound);
    }
  });

  it('non e costante dentro una cella del reticolo', () => {
    // Se lo fosse, il tracciato girerebbe solo sui confini della cella: la
    // divagazione tornerebbe a essere un reticolo quadrato, che e' la cosa da
    // cui questo modulo esiste per scappare.
    const inside = new Set<number>();
    for (let d = 0; d < ROADS.wanderCell; d++) inside.add(wanderAt(SEED, d, 0));
    expect(inside.size).toBeGreaterThan(ROADS.wanderCell / 2);
  });
});

describe('terrainPenalty', () => {
  it('non e mai negativo, cosi il costo di un passo non scende sotto flatCost', () => {
    // E' l'invariante su cui poggia l'ammissibilita' dell'euristica di
    // `traceRoad`: un termine negativo la romperebbe in silenzio, e il cammino
    // trovato smetterebbe di essere il minimo senza che nessun test lo dica.
    for (let y = 0; y < 60; y += 7) {
      for (let x = 0; x < 60; x += 7) {
        expect(terrainPenalty(SEED, x, y, 0)).toBeGreaterThanOrEqual(0);
        expect(terrainPenalty(SEED, x, y, 0.5)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('la pendenza costa: a parita di colonna, il fianco piu ripido costa di piu', () => {
    const flat = terrainPenalty(SEED, 12, 34, 0);
    const steep = terrainPenalty(SEED, 12, 34, 0.5);
    expect(steep - flat).toBeCloseTo(0.5 * ROADS.slopeCost, 10);
  });

  it('rompe i pareggi anche su terreno perfettamente piano', () => {
    // La ragione d'essere del modulo: senza, un pianoro ha migliaia di cammini
    // dello stesso prezzo e la ricerca restituisce la diagonale canonica.
    const seen = new Set<number>();
    for (let x = 0; x < 64; x++) seen.add(terrainPenalty(SEED, x, 0, 0));
    expect(seen.size).toBe(64);
  });

  it('la sola divagazione non riordina i gradini del terreno', () => {
    // La divagazione deve piegare il tracciato, non riscrivere la graduatoria
    // del terreno: se superasse il salto fra terra e ciglio, una piana
    // sfortunata costerebbe piu' di una parete e la strada sceglierebbe la
    // parete — per rumore, non per forma. Al massimo pareggia.
    //
    // La pendenza e' fuori dalla misura apposta: quella il riordino lo puo'
    // fare, perche' `isBuildable` e' una soglia sulla pendenza e correggerla e'
    // il mestiere del termine continuo.
    let worst = 0;
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) worst = Math.max(worst, terrainPenalty(SEED, x, y, 0));
    }
    expect(worst).toBeLessThanOrEqual(ROADS.steepCost - ROADS.landCost);
  });
});
