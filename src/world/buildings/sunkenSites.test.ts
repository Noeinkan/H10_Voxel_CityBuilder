import { describe, expect, it } from 'vitest';
import { SUNKEN, SUNKEN_ARCOLOGY_RECIPES } from '../arcology/config';
import { surveySunkenSite } from '../arcology/depth';
import { TERRAIN } from '../terrain/config';
import { generateIsland } from '../terrain/IslandGenerator';
import { VoxelWorld } from '../VoxelWorld';

/**
 * L'isola offre davvero la roccia che le ricette interrate chiedono?
 *
 * **E' il test che ha riscritto il catalogo, e serve che resti.** Il piano di
 * questa famiglia era tarato su `TERRAIN.maxHeight`, che vale 80: le tre
 * profondita' previste erano 44, 36 e 24. Misurata, l'isola standard e' molto
 * piu' piatta — la maschera radiale schiaccia il rilievo, e su 256x256 la
 * colonna piu' alta sta fra 32 e 36 — quindi due ricette su tre non sarebbero
 * **mai** nate. Non sarebbero state scartate con un errore: semplicemente non
 * sarebbero comparse, con tutta la suite pura verde.
 *
 * E' lo stesso difetto di `isPeakBlock` sulle arcologie, ed e' il secondo modo
 * in cui questo dominio l'ha incontrato. Un numero misurato una volta e poi
 * dimenticato torna falso appena qualcuno tocca la taratura del terreno: qui
 * `maxHeight`, `oceanFloor` o la maschera radiale. Questo file e' l'allarme.
 *
 * Gira su tre seed perche' uno solo non basta: a profondita' 30 il seed 1337
 * offre quarantadue siti e il 4242 **nessuno**, e tarare sul primo avrebbe
 * prodotto una famiglia che compare su due isole su tre.
 */

const SEEDS = [1337, 4242, 9001] as const;
const REGION = { minX: 0, minY: 0, sizeX: 256, sizeY: 256 };
const SPAN = 20;
/** Passo del campionamento: le finestre si sovrappongono, non serve ogni colonna. */
const STRIDE = 4;

/** Quante finestre `SPAN x SPAN` offrono almeno `depth` quote di scavo. */
function sitesAtLeast(map: { heightAt: (x: number, y: number) => number }, depth: number): number {
  let count = 0;
  for (let y = 0; y + SPAN <= REGION.sizeY; y += STRIDE) {
    for (let x = 0; x + SPAN <= REGION.sizeX; x += STRIDE) {
      let padZ = 0;
      let dry = true;
      for (let dy = 0; dy < SPAN && dry; dy++) {
        for (let dx = 0; dx < SPAN; dx++) {
          const h = map.heightAt(x + dx, y + dy);
          if (h <= TERRAIN.seaLevel) { dry = false; break; }
          if (h > padZ) padZ = h;
        }
      }
      if (dry && padZ - SUNKEN.floorZ >= depth) count++;
    }
  }
  return count;
}

describe('la roccia che le ricette interrate chiedono', () => {
  const deepest = Math.max(...SUNKEN_ARCOLOGY_RECIPES.map((r) => r.sunken!.depth));
  const shallowest = Math.min(...SUNKEN_ARCOLOGY_RECIPES.map((r) => r.sunken!.depth));

  for (const seed of SEEDS) {
    it(`seed ${seed}: la forma piu profonda ha dove nascere`, () => {
      const world = new VoxelWorld();
      const { map } = generateIsland(world, seed, REGION);

      const deep = sitesAtLeast(map, deepest);
      const shallow = sitesAtLeast(map, shallowest);

      // Non «almeno uno»: un solo sito su tutta l'isola verrebbe scartato dalla
      // prima collisione o dal primo isolato stretto, e la ricetta resterebbe
      // teorica. Trenta e' un margine, non una soglia fine.
      expect(deep, `siti per ${deepest} quote sul seed ${seed}`).toBeGreaterThan(30);
      // La ricetta bassa deve entrare quasi ovunque: e' quella che salva
      // l'isolato buono dove la piramide non ci sta.
      expect(shallow, `siti per ${shallowest} quote sul seed ${seed}`).toBeGreaterThan(300);
    }, 120000);
  }

  it('il tetto del catalogo resta sotto quello misurato', () => {
    expect(deepest).toBeLessThanOrEqual(SUNKEN.maxDepth);
  });
});

describe('surveySunkenSite', () => {
  it('legge il massimo dell impronta, e il minimo per il rimo a valle', () => {
    // Il piano finito e' il **massimo**: una piazza alla media lascerebbe il
    // terreno a monte a coprire il proprio parapetto.
    const probe = {
      heightAt: (x: number, y: number) => (x === 0 && y === 0 ? 40 : 30),
      biomeAt: () => 1,
    };
    const site = surveySunkenSite(probe, 0, 0, 4, 4);
    expect(site.padZ).toBe(40);
    expect(site.footZ).toBe(30);
    expect(site.depth).toBe(40 - SUNKEN.floorZ);
    expect(site.dryRim).toBe(true);
  });

  it('vede l acqua che arriva vicino al bordo, non solo dentro l impronta', () => {
    // Il pozzo scende sotto il livello del mare: la roccia attorno e' tutto cio'
    // che lo tiene asciutto, e una colonna bagnata appena fuori dall'ingombro
    // conta quanto una dentro.
    const wetAt = (wx: number, wy: number) => ({
      heightAt: () => 30,
      biomeAt: (x: number, y: number) => (x === wx && y === wy ? 0 : 1),
    });
    expect(surveySunkenSite(wetAt(2, 2), 0, 0, 4, 4).dryRim).toBe(false);
    expect(surveySunkenSite(wetAt(-1, 2), 0, 0, 4, 4).dryRim).toBe(false);
    expect(surveySunkenSite(wetAt(4 + SUNKEN.dryRim, 2), 0, 0, 4, 4).dryRim).toBe(true);
  });
});
