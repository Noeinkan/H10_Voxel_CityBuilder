import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { classifyBiome } from '../terrain/biomes';
import { TERRAIN } from '../terrain/config';
import { FACING } from '../streets/streetGrid';
import { landmarkOf } from '../landmarks/config';
import { GRADING } from '../grading/config';
import { HARBOR, HARBOR_ROLES } from './config';
import { HARBOR_FIGURE, surveyCoast } from './site';
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
 * La stessa costa, girata come il fronte della struttura.
 *
 * **Serve da quando le opere si tagliano sulla battigia vera.** Prima il piano
 * non guardava il terreno, quindi una marina rivolta a ovest davanti a un mare
 * che sta a est produceva comunque i suoi canali: la prova della rotazione
 * girava le coordinate e lasciava fermo il mare, cioe' verificava l'aritmetica
 * su un caso che il piazzamento non puo' generare. Qui il mare gira con lei, e
 * in tutti e quattro i versi la riva cade sulla stessa colonna **canonica**.
 */
function shoreFacing(facing: (typeof FACING)[keyof typeof FACING]): HarborProbe {
  const coast = shoreHeights(58);
  // `95 - v` ribalta l'asse: nel verso diretto la colonna canonica zero sta a
  // 40 e la riva a 58, cioe' diciotto colonne piu' in la'. Girata di mezzo giro
  // la canonica zero sta sullo spigolo lontano — 55 — e la riva a 37, che e'
  // esattamente `95 - 58`. Una sola costante per i due versi ribaltati.
  switch (facing) {
    case FACING.west: return probeAt((x) => coast(95 - x));
    case FACING.north: return probeAt((_x, y) => coast(y));
    case FACING.south: return probeAt((_x, y) => coast(95 - y));
    default: return probeAt((x) => coast(x));
  }
}

/**
 * Marina con il fronte sull'angolo (40, 40): il mare comincia poco oltre il
 * bordo della struttura, come su una spiaggia vera.
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
    probe: shoreFacing(facing),
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

  it('su una riva profonda e dritta la marina scava le darsene a pettine', () => {
    // **La costa sceglie la figura.** Qui c'e' terra fino a x 58 e il mondo
    // comincia a x 0, quindi dietro la riva ci sono cinquantotto colonne
    // asciutte e la riva e' dritta: sono le condizioni delle West India Docks,
    // e il vocabolario risponde con il pettine invece che con il canale.
    const { query, probe } = marinaQuery(2);
    expect(surveyCoast(
      { fromRow: -HARBOR.figureReach, toRow: 12 + HARBOR.figureReach, reach: HARBOR.figureReach, waterZ: TERRAIN.seaLevel },
      probe,
      (cx, cy) => ({ x: query.x + cx, y: query.y + cy }),
    ).figure).toBe(HARBOR_FIGURE.docks);

    const plan = planAt(2);
    const keys = digKeys(plan);

    // Il primo bacino a nord della struttura: entra nella terra per
    // `dockLength` colonne dalla riva e sborda di due oltre, cosi' si apre sul
    // mare invece di restare una vasca chiusa da una lingua di sabbia.
    for (let x = 32; x < 60; x++) {
      for (let y = 60; y < 70; y++) expect(keys.has(`${x},${y}`)).toBe(true);
    }
    // E il primo a sud, che l'alternanza tiene in equilibrio attorno al
    // catalizzatore invece di far pendere il pettine da un lato.
    for (let x = 32; x < 60; x++) {
      for (let y = 22; y < 32; y++) expect(keys.has(`${x},${y}`)).toBe(true);
    }
    // La dita di banchina fra il bacino di nord e la struttura resta asciutta:
    // e' quella il suolo su cui il distretto costruisce.
    for (let y = 52; y < 60; y++) expect(keys.has(`46,${y}`)).toBe(false);

    for (const piece of plan.digs) {
      expect(piece.floor).toBe(TERRAIN.seaLevel - HARBOR.canalDepth);
    }

    // Le due sponde lunghe e la testata murata: un bacino che finisce contro
    // l'erba e' una trincea.
    const walls = wallKeys(plan);
    for (let x = 32; x < 58; x++) {
      expect(walls.has(`${x},59`)).toBe(true);
      expect(walls.has(`${x},70`)).toBe(true);
    }
    for (let y = 60; y < 70; y++) expect(walls.has(`31,${y}`)).toBe(true);
    // Al largo non ci sono sponde: il bacino si apre sull'acqua.
    expect(walls.has('59,59')).toBe(false);
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
    // protegge. **Due bracci e un varco in mezzo**: un frangiflutti pieno
    // chiudeva lo specchio e insieme la strada per entrarci.
    const mouth = HARBOR_ROLES.marina!.breakwater!.mouth;
    for (let x = 65; x < 67; x++) {
      for (let y = 40; y < 44; y++) expect(keys.has(`${x},${y}`)).toBe(true);
      for (let y = 48; y < 52; y++) expect(keys.has(`${x},${y}`)).toBe(true);
      for (let y = 44; y < 44 + mouth; y++) expect(keys.has(`${x},${y}`)).toBe(false);
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
    // Fronte a est: i bacini corrono lungo x, dalla testata murata (32) alla
    // bocca sul mare (59), e li' finiscono.
    const eastKeys = digKeys(planAt(2));
    expect(eastKeys.has('32,65')).toBe(true);
    expect(eastKeys.has('59,65')).toBe(true);
    expect(eastKeys.has('60,65')).toBe(false);

    // Fronte a ovest: lo stesso pettine ribaltato — la bocca sta a ovest, la
    // testata a est, e il bacino di nord finisce dall'altra parte.
    const west = planAt(2, FACING.west);
    const westKeys = digKeys(west);
    expect(westKeys.has('36,25')).toBe(true);
    expect(westKeys.has('63,25')).toBe(true);
    expect(westKeys.has('64,25')).toBe(false);

    // Fronte a nord: i bacini corrono lungo y e la bocca sta a nord.
    const north = planAt(2, FACING.north);
    const northKeys = digKeys(north);
    expect(northKeys.has('25,32')).toBe(true);
    expect(northKeys.has('25,59')).toBe(true);
    expect(northKeys.has('25,60')).toBe(false);

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

    const all = [...first.sites, ...second.sites, ...third.sites];
    expect(all).toHaveLength(5);

    // **Lo slot dello stadio uno sta nell'anello; da quello due in poi i lotti
    // sono le dita di banchina fra le darsene.** E' la differenza fra Canary
    // Wharf e un paio di vasche: senza le torri sulle dita, un bacino e'
    // un'opera idraulica e non un pezzo di citta'.
    const ring = HARBOR_ROLES.marina!.ringByStage[3];
    expect(ringDist(first.sites[0].x, first.sites[0].y, 40, 40, 16, 12))
      .toBeLessThanOrEqual(ring);

    // Le tre dita che il pettine lascia: due a nord della struttura, una a sud.
    const fingers = [
      { x0: 32, x1: 57, y0: 52, y1: 59 },
      { x0: 32, x1: 57, y0: 32, y1: 39 },
      { x0: 32, x1: 57, y0: 70, y1: 77 },
    ];
    for (const site of [...second.sites, ...third.sites]) {
      const on = fingers.some(
        (f) => site.x >= f.x0 && site.x <= f.x1 && site.y >= f.y0 && site.y <= f.y1,
      );
      expect(on, `${site.x},${site.y}`).toBe(true);
    }
    // E almeno uno sta oltre l'anello: la figura ha portato la citta' dove
    // prima non arrivava.
    expect([...second.sites, ...third.sites].some(
      (site) => ringDist(site.x, site.y, 40, 40, 16, 12) > ring,
    )).toBe(true);

    // Nessuno dentro la struttura, nessuno in acqua, e due lotti non si
    // accalcano sulla stessa colonna.
    for (const site of all) {
      expect(ringDist(site.x, site.y, 40, 40, 16, 12)).toBeGreaterThan(0);
      expect(site.x).toBeLessThan(58);
    }
    expect(new Set(all.map((site) => `${site.x},${site.y}`)).size).toBe(all.length);
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
      for (const work of [role.inlet, role.figure, role.reclamation, role.access, role.breakwater]) {
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
