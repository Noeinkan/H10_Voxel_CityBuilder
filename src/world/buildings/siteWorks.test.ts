import { describe, expect, it } from 'vitest';
import { testTerrain } from '../../sim/testTerrain';
import { GRADING } from '../grading/config';
import { WORKS } from '../grading/grade';
import { VoxelWorld } from '../VoxelWorld';
import { buildWorks, surveyGrade } from './siteWorks';

/**
 * La maschera dell'opera di terra.
 *
 * **E' la regola che ha ridato il mare ai porti.** Senza, l'opera portava tutta
 * l'impronta alla quota del piano: il riquadro di un porto e' per meta' specchio
 * d'acqua, e quello che si vedeva era una piattaforma rettangolare in mezzo al
 * golfo con dentro una pozza piu' alta del mare che la circondava.
 */

/** Costa netta: terra fino a `x = 7`, bassofondo fino a 11, acqua fonda oltre. */
const SHORE = testTerrain({
  chunksX: 1,
  chunksY: 1,
  heightAt: (x) => (x < 8 ? 26 : x < 12 ? 10 : 0),
});

/** Il molo: due colonne di terra e due di bassofondo, su quattro file. */
function mole(): Uint8Array {
  const mask = new Uint8Array(8 * 4);
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 4; dx++) mask[dy * 8 + dx] = 1;
  }
  return mask;
}

describe('surveyGrade — maschera', () => {
  it('senza maschera un ingombro che tocca l acqua fonda e rifiutato', () => {
    // E' il comportamento di sempre, e resta giusto per un edificio: un volume
    // rettangolare pieno deve reggere su tutte le proprie colonne.
    expect(surveyGrade(SHORE, 6, 0, 8, 4)).toBeNull();
  });

  it('con la maschera il molo esce sull acqua che l ingombro intero rifiuterebbe', () => {
    // Il molo non poggia sull'acqua fonda: ci passa accanto. Guardare le colonne
    // che nessuno occupa e' cio' che gli impediva di esistere.
    const plan = surveyGrade(SHORE, 6, 0, 8, 4, mole());
    expect(plan).not.toBeNull();
    expect(plan!.works).toBe(WORKS.quay);
    // Il piano sale al massimo delle colonne occupate: la terra a 26, non la
    // quota di banchina del bassofondo.
    expect(plan!.padZ).toBe(26);
    expect(plan!.footZ).toBe(10);
  });
});

describe('buildWorks — maschera', () => {
  it('riempie il molo e lascia il mare dove non c e struttura', () => {
    const world = new VoxelWorld();
    const plan = surveyGrade(SHORE, 6, 0, 8, 4, mole())!;
    buildWorks(world, SHORE, 6, 0, 8, plan, 4, mole());

    // Dentro la maschera: la banchina sale dal fondale al piano finito.
    expect(world.getBlock(9, 1, 20)).toBe(GRADING.quayWall);
    expect(world.getBlock(9, 1, plan.padZ - 1)).toBe(GRADING.quayCoping);

    // Fuori: niente. E' il mare, e resta il mare.
    for (let z = 0; z < 30; z++) {
      expect({ z, block: world.getBlock(11, 1, z) }).toEqual({ z, block: 0 });
      expect({ z, block: world.getBlock(13, 2, z) }).toEqual({ z, block: 0 });
    }
  });

  it('senza maschera lo stesso piano porta all asciutto tutto il riquadro', () => {
    // Il contrasto che rende leggibile la regola: e' lo stesso piano, ed e'
    // esattamente quello che il porto faceva al proprio specchio d'acqua.
    const world = new VoxelWorld();
    const plan = surveyGrade(SHORE, 8, 0, 4, 4)!;
    buildWorks(world, SHORE, 8, 0, 4, plan, 4);

    expect(plan.works).toBe(WORKS.quay);
    expect(plan.padZ).toBe(GRADING.quayLevel);
    for (let x = 8; x < 12; x++) {
      expect({ x, block: world.getBlock(x, 1, plan.padZ - 1) })
        .not.toEqual({ x, block: 0 });
    }
  });

  it('il muro segue il bordo della maschera, non quello del riquadro', () => {
    // La colonna interna al riquadro ma sul filo del molo **e'** un bordo: senza
    // questa distinzione la darsena resterebbe senza muro proprio dove si vede
    // di taglio.
    const world = new VoxelWorld();
    const plan = surveyGrade(SHORE, 6, 0, 8, 4, mole())!;
    buildWorks(world, SHORE, 6, 0, 8, plan, 4, mole());

    // `x = 9` e' l'ultima colonna occupata: ha l'acqua a fianco, quindi muro.
    expect(world.getBlock(9, 1, plan.padZ - 1)).toBe(GRADING.quayCoping);
    expect(world.getBlock(9, 1, plan.padZ - 2)).toBe(GRADING.quayWall);
  });
});
