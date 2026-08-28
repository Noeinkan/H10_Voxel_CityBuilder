import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { classifyBiome } from '../terrain/biomes';
import { TERRAIN } from '../terrain/config';
import { FACING } from '../streets/streetGrid';
import { landmarkOf } from '../landmarks/config';
import { GRADING } from '../grading/config';
import { HARBOR, HARBOR_ROLES } from './config';
import {
  planHarborDistrict,
  type HarborPlan,
  type HarborProbe,
  type HarborQuery,
} from './plan';

/**
 * Il piano del distretto costiero: contenuto, crescente e determinista.
 *
 * **Cio' che questi test bloccano e' il contenimento.** Il distretto e' la
 * risposta a «il landmark deve lasciare un'impronta» senza diventare una
 * colata: ogni colonna sta dentro l'anello dello stadio, ogni opera dentro
 * la sua misura dichiarata, e il piano dello stadio successivo aggiunge
 * soltanto la fascia nuova. Se un giorno un canale si allunga da solo, e'
 * qui che lo si scopre.
 *
 * Le quote sono scritte a mano dove la geometria lo merita, e lette dalla
 * config dove il numero e' gia' dichiarato: la stessa disciplina di
 * `marinaBasin.test.ts`, che queste fixture ricalcano.
 */

const LAND = TERRAIN.beachMaxHeight + 6;
const SHELF = TERRAIN.seaLevel - 1;
const DEEP = TERRAIN.seaLevel - 6;

/** Costa con una piattaforma di bassofondo fra la terra e il mare aperto. */
function shoreHeights(shoreX: number): (x: number) => number {
  return (x) => {
    if (x < shoreX) return LAND;
    if (x < shoreX + 8) return SHELF;
    return DEEP;
  };
}

function probeAt(heights: (x: number, y: number) => number): HarborProbe {
  return {
    has: (x, y) => x >= 0 && y >= 0 && x < 160 && y < 160,
    heightAt: heights,
    biomeAt: (x, y) => classifyBiome(heights(x, y), 0.1, TERRAIN.seaLevel),
  };
}

/**
 * Marina con il fronte a est sull'angolo (40, 40): il mare comincia poco
 * oltre il bordo della struttura, come su una spiaggia vera.
 */
function marinaQuery(
  stage: number,
  facing: (typeof FACING)[keyof typeof FACING] = FACING.east,
): { query: HarborQuery; probe: HarborProbe } {
  return {
    query: {
      kind: 'marina',
      facing,
      x: 40,
      y: 40,
      stage,
      waterZ: TERRAIN.seaLevel,
      seed: 4242,
    },
    probe: probeAt(shoreHeights(58)),
  };
}

function planAt(stage: number, facing: (typeof FACING)[keyof typeof FACING] = FACING.east): HarborPlan {
  const { query, probe } = marinaQuery(stage, facing);
  return planHarborDistrict(query, probe);
}

/** Le colonne di tutti i pezzi, come insieme di chiavi. */
function digKeys(plan: HarborPlan): Set<string> {
  const keys = new Set<string>();
  for (const piece of plan.digs) {
    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) keys.add(`${piece.x + dx},${piece.y + dy}`);
    }
  }
  return keys;
}

function fillKeys(plan: HarborPlan, kind: 'mole' | 'breakwater'): Set<string> {
  const keys = new Set<string>();
  for (const piece of plan.fills) {
    if (piece.kind !== kind) continue;
    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) keys.add(`${piece.x + dx},${piece.y + dy}`);
    }
  }
  return keys;
}

function wallKeys(plan: HarborPlan): Set<string> {
  const keys = new Set<string>();
  for (const piece of plan.walls) {
    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) keys.add(`${piece.x + dx},${piece.y + dy}`);
    }
  }
  return keys;
}

describe('il piano del distretto', () => {
  it('lo stadio zero non lascia niente: il distretto appartiene al quartiere cresciuto', () => {
    const plan = planAt(0);
    expect(plan.digs).toHaveLength(0);
    expect(plan.walls).toHaveLength(0);
    expect(plan.fills).toHaveLength(0);
    expect(plan.promenade).toHaveLength(0);
    expect(plan.sites).toHaveLength(0);
  });

  it('la passeggiata copre la fascia dell anello e mai oltre', () => {
    // Stadio uno: fascia da 1 a 3 colonne attorno alla struttura, e niente
    // dentro il riquadro — la promenade e' suolo pubblico, non il monumento.
    const first = planAt(1);
    for (const column of first.promenade) {
      const dist = ringDist(column.x, column.y, 40, 40, 16, 12);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThanOrEqual(3);
    }
    expect(first.promenade.length).toBeGreaterThan(0);

    // Stadio tre: la fascia arriva al tetto dichiarato e non lo supera.
    const last = planAt(3);
    for (const column of last.promenade) {
      expect(ringDist(column.x, column.y, 40, 40, 16, 12)).toBeLessThanOrEqual(
        HARBOR_ROLES.marina!.ringByStage[3],
      );
    }
    // La fascia si ferma sulla battigia: le colonne d'acqua profonda sono
    // oceano e non si dipingono. Qui il fronte est a x >= 58 e' tutto
    // sommerso o bassofondo di bioma spiaggia: la passeggiata a est della
    // struttura non deve mai uscire dalla riva asciutta.
    for (const column of last.promenade) {
      expect(column.x).toBeLessThan(58);
    }
  });

  it('i canali della marina aprono la riva e la collegano al largo', () => {
    const plan = planAt(2);
    const keys = digKeys(plan);
    const depth = HARBOR.canalDepth;

    // Due canali di tre colonne, uno per lato della struttura, dal largo
    // fino a dodici colonne dentro la riva — il gesto di una darsena che si
    // ritaglia nel terreno, non del mare che capitava di esserci.
    for (let x = 34; x < 64; x++) {
      for (let y = 54; y < 57; y++) expect(keys.has(`${x},${y}`)).toBe(true);
      for (let y = 35; y < 38; y++) expect(keys.has(`${x},${y}`)).toBe(true);
    }
    for (const piece of plan.digs) {
      expect(piece.floor).toBe(TERRAIN.seaLevel - depth);
    }

    // Le sponde in muratura sui due lati di ogni canale e la testata a terra.
    const walls = wallKeys(plan);
    for (let x = 34; x < 56; x++) {
      expect(walls.has(`${x},53`)).toBe(true);
      expect(walls.has(`${x},57`)).toBe(true);
      expect(walls.has(`${x},34`)).toBe(true);
      expect(walls.has(`${x},38`)).toBe(true);
    }
    for (let y = 54; y < 57; y++) {
      expect(walls.has(`33,${y}`)).toBe(true);
      expect(walls.has(`33,${y - 19}`)).toBe(true);
    }
    // Al largo non ci sono sponde: il canale si apre sull'acqua.
    expect(walls.has('58,53')).toBe(false);
  });

  it('determinista: lo stesso stadio, lo stesso piano, colonna per colonna', () => {
    const a = planAt(2);
    const b = planAt(2);
    expect(a).toEqual(b);
  });

  it('il porto guadagna il suo molo e rinuncia dove il fondale sprofonda', () => {
    const port = HARBOR_ROLES.port!;
    const query: HarborQuery = {
      kind: 'port',
      facing: FACING.east,
      x: 40,
      y: 40,
      stage: 2,
      waterZ: TERRAIN.seaLevel,
      seed: 4242,
    };
    // Bassofondo regge: il molo esce sei colonne oltre il fronte, al piano
    // della banchina del porto.
    const holds = planHarborDistrict(query, probeAt(shoreHeights(62)));
    const mole = fillKeys(holds, 'mole');
    for (let x = 60; x < 66; x++) {
      for (let y = 42; y < 50; y++) expect(mole.has(`${x},${y}`)).toBe(true);
    }
    for (const piece of holds.fills) {
      if (piece.kind !== 'mole') continue;
      expect(piece.padZ).toBe(TERRAIN.seaLevel + GRADING.quayFreeboard);
    }

    // Fossa oltre il muro di banchina: niente molo — il piano e' il delta,
    // non una promessa da riparare dopo.
    const deep = probeAt((x) => (x < 60 ? LAND : TERRAIN.seaLevel - GRADING.maxQuayDepth - 4));
    const refused = planHarborDistrict(query, deep);
    expect(fillKeys(refused, 'mole').size).toBe(0);
    void port;
  });

  it('il frangiflutti sta staccato, sul fronte e a quota dichiarata', () => {
    const plan = planAt(3);
    const keys = fillKeys(plan, 'breakwater');

    // Davanti alla bocca dell'insenatura (il fronte piu' avanzato e' l'anello
    // massimo di otto colonne), staccato di una colonna dallo specchio che
    // protegge.
    for (let x = 65; x < 67; x++) {
      for (let y = 41; y < 51; y++) expect(keys.has(`${x},${y}`)).toBe(true);
    }
    for (const piece of plan.fills) {
      if (piece.kind !== 'breakwater') continue;
      expect(piece.padZ).toBe(TERRAIN.seaLevel + HARBOR.breakwaterFreeboard);
      // Il braccio non tocca la riva: distanza dal riquadro sempre positiva.
      for (let dy = 0; dy < piece.h; dy++) {
        for (let dx = 0; dx < piece.w; dx++) {
          expect(ringDist(piece.x + dx, piece.y + dy, 40, 40, 16, 12)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('la rotazione porta il fronte dalla parte del mare', () => {
    // Fronte a ovest: la bocca dei canali sta a ovest della struttura.
    const west = planAt(2, FACING.west);
    const westKeys = digKeys(west);
    expect(westKeys.has('39,54')).toBe(true);
    expect(westKeys.has('59,54')).toBe(true);

    // Fronte a nord: i canali corrono lungo l'asse x e la bocca sta a nord.
    const north = planAt(2, FACING.north);
    const northKeys = digKeys(north);
    expect(northKeys.has('54,39')).toBe(true);
    expect(northKeys.has('54,59')).toBe(true);

    // La stessa forma, girata: il conto delle colonne scavate non cambia.
    expect(westKeys.size).toBe(digKeys(planAt(2)).size);
    expect(northKeys.size).toBe(digKeys(planAt(2)).size);
  });

  it('gli slot di settore arrivano con gli stadi, dal piu vicino al piu lontano', () => {
    const first = planAt(1);
    expect(first.sites).toHaveLength(1);
    expect(first.sites[0].class).toBe(BUILDING_CLASS.residential);

    const second = planAt(2);
    expect(second.sites).toHaveLength(2);
    expect(second.sites.every((site) => site.class === BUILDING_CLASS.commercial)).toBe(true);

    const third = planAt(3);
    expect(third.sites).toHaveLength(2);

    // Tutti sul lato di terra, dentro l'anello massimo, e in ordine di
    // vicinanza: lo slot dello stadio uno sta piu' vicino di quelli dopo.
    const all = [...first.sites, ...second.sites, ...third.sites];
    expect(all).toHaveLength(5);
    for (const site of all) {
      expect(site.x).toBeLessThan(40);
      const dist = ringDist(site.x, site.y, 40, 40, 16, 12);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThanOrEqual(HARBOR_ROLES.marina!.ringByStage[3]);
    }
    const firstDist = ringDist(all[0].x, all[0].y, 40, 40, 16, 12);
    const lastDist = ringDist(all[4].x, all[4].y, 40, 40, 16, 12);
    expect(firstDist).toBeLessThanOrEqual(lastDist);
  });

  it('le tabelle dei ruoli sono coerenti: anelli, stadi e usi in pari', () => {
    const ROLES = ['marina', 'port', 'ferry'] as const;
    for (const kind of ROLES) {
      const role = HARBOR_ROLES[kind]!;
      const recipe = landmarkOf(kind)!;
      // Un anello per stadio della ricetta.
      expect(role.ringByStage.length).toBe(recipe.stages.length);
      // L'anello cresce in modo monotono e parte da zero.
      expect(role.ringByStage[0]).toBe(0);
      for (let s = 1; s < role.ringByStage.length; s++) {
        expect(role.ringByStage[s]).toBeGreaterThan(role.ringByStage[s - 1]);
      }
      // I siti cumulativi chiudono sul numero di usi dichiarati.
      const last = role.sitesByStage[role.sitesByStage.length - 1];
      expect(last).toBe(role.siteClasses.length);
      expect(role.sitesByStage).toHaveLength(role.ringByStage.length);
      for (let s = 1; s < role.sitesByStage.length; s++) {
        expect(role.sitesByStage[s]).toBeGreaterThanOrEqual(role.sitesByStage[s - 1]);
      }
      // Le opere si sbloccano dentro gli stadi della ricetta.
      for (const work of [role.inlet, role.canals, role.reclamation, role.access, role.breakwater]) {
        if (work === undefined) continue;
        expect(work.fromStage).toBeGreaterThanOrEqual(1);
        expect(work.fromStage).toBeLessThan(role.ringByStage.length);
      }
    }
  });
});

/** Distanza di Chebyshev dal riquadro: zero dentro, positiva fuori. */
function ringDist(px: number, py: number, x0: number, y0: number, sx: number, sy: number): number {
  const dx = px < x0 ? x0 - px : px >= x0 + sx ? px - (x0 + sx - 1) : 0;
  const dy = py < y0 ? y0 - py : py >= y0 + sy ? py - (y0 + sy - 1) : 0;
  return Math.max(dx, dy);
}
