import { describe, expect, it } from 'vitest';
import { BUILDER } from '../buildings/config';
import { SKYLINE } from './config';
import {
  TIER,
  allowedLevelAt,
  isPeakBlock,
  poleReach,
  tierAt,
  type SkylineQuery,
} from './tiers';

/**
 * La gerarchia verticale, senza mondo e senza terreno.
 *
 * E' il vantaggio di aver tenuto il dominio puro: le condizioni che sull'isola
 * vera richiederebbero una citta' cresciuta — «lontano dal mare, dentro un polo,
 * con del costruito attorno» — qui sono tre numeri.
 */

const SEED = 1337;

/** Una colonna nel cuore di una citta' matura, lontano dall'acqua. */
function core(overrides: Partial<SkylineQuery> = {}): SkylineQuery {
  return {
    x: 128,
    y: 128,
    poles: [{ x: 128, y: 128, radius: 96 }],
    waterDistance: null,
    builtNeighbours: SKYLINE.edgeCore + 8,
    seed: SEED,
    blockKx: 0,
    blockKy: 0,
    ...overrides,
  };
}

/** Il primo isolato eletto e il primo non eletto, cercati sulla griglia. */
function blocks(): { elected: [number, number]; plain: [number, number] } {
  let elected: [number, number] | null = null;
  let plain: [number, number] | null = null;
  for (let ky = 0; ky < 16 && (elected === null || plain === null); ky++) {
    for (let kx = 0; kx < 16; kx++) {
      if (isPeakBlock(SEED, kx, ky)) elected ??= [kx, ky];
      else plain ??= [kx, ky];
    }
  }
  if (elected === null || plain === null) throw new Error('griglia senza entrambi i casi');
  return { elected, plain };
}

describe('skyline — le tre fasce', () => {
  it('i tetti salgono con la fascia', () => {
    expect(SKYLINE.levelCap).toHaveLength(3);
    expect(SKYLINE.levelCap[TIER.fringe]).toBeLessThan(SKYLINE.levelCap[TIER.middle]);
    expect(SKYLINE.levelCap[TIER.middle]).toBeLessThan(SKYLINE.levelCap[TIER.core]);
  });

  it('il massimo teorico coincide con il tetto del Builder', () => {
    // E' il numero che tiene onesta l'intera taratura: se `SKYLINE` concedesse
    // piu' di `maxLevel`, il clamp del Builder mangerebbe in silenzio la
    // differenza e il picco smetterebbe di essere un'eccezione — sarebbe il
    // livello massimo dato anche a chi non se l'e' guadagnato. Se ne concedesse
    // meno, il livello massimo non lo raggiungerebbe nessuno.
    const { elected } = blocks();
    const top = allowedLevelAt(core({ blockKx: elected[0], blockKy: elected[1] }));
    expect(top).toBe(BUILDER.maxLevel);
  });

  it('la costa resta bassa anche in mezzo al centro', () => {
    // La costa vince su tutto, ed e' l'ordine delle domande a dirlo: una torre
    // sul filo della battigia cancella la linea di costa, che e' la sola figura
    // che l'isola ha da offrire a inquadratura d'insieme.
    for (let d = 1; d <= SKYLINE.coastNear; d++) {
      const query = core({ waterDistance: d });
      expect(tierAt(query), `a ${d} colonne dall'acqua`).toBe(TIER.fringe);
      expect(allowedLevelAt(query)).toBeLessThanOrEqual(SKYLINE.levelCap[TIER.fringe]);
    }
    // Un passo piu' in la' la regola smette di valere: e' un fronte edificato,
    // non una fascia di rispetto larga a piacere.
    expect(tierAt(core({ waterDistance: SKYLINE.coastNear + 1 }))).toBe(TIER.core);
  });

  it('il bordo dell edificato e la corona bassa', () => {
    expect(tierAt(core({ builtNeighbours: 0 }))).toBe(TIER.fringe);
    expect(tierAt(core({ builtNeighbours: SKYLINE.edgeMiddle - 1 }))).toBe(TIER.fringe);
    expect(tierAt(core({ builtNeighbours: SKYLINE.edgeMiddle }))).toBe(TIER.middle);
    expect(tierAt(core({ builtNeighbours: SKYLINE.edgeCore }))).toBe(TIER.core);
  });

  it('fuori da ogni polo non c e un centro, solo tessuto fitto', () => {
    // Densamente costruito ma lontano da qualunque catalizzatore: la citta' e'
    // fitta, non e' un centro, e il tetto si ferma alla fascia intermedia.
    const far = core({ poles: [{ x: 0, y: 0, radius: 32 }] });
    expect(poleReach(far)).toBe(0);
    expect(tierAt(far)).toBe(TIER.middle);
  });

  it('il cono non scende mai avvicinandosi al polo', () => {
    const { plain } = blocks();
    let previous = 0;
    for (let distance = 96; distance >= 0; distance -= 4) {
      const level = allowedLevelAt(core({
        x: 128 + distance,
        blockKx: plain[0],
        blockKy: plain[1],
      }));
      expect(level, `a distanza ${distance}`).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
    // E arrivato al polo il cono ha dato tutto quello che ha.
    expect(previous).toBe(SKYLINE.levelCap[TIER.core] + SKYLINE.coneBonus);
  });

  it('vince il polo che si sente di piu, non la somma', () => {
    // Due catalizzatori accostati fanno un centro, non un centro alto il doppio:
    // sommare le influenze qui darebbe una torre in piu' per ogni catalizzatore
    // aggiunto, che e' il contrario di «poche decisioni con conseguenze visibili».
    const one = core({ poles: [{ x: 128, y: 128, radius: 96 }] });
    const two = core({
      poles: [{ x: 128, y: 128, radius: 96 }, { x: 130, y: 130, radius: 96 }],
    });
    expect(allowedLevelAt(two)).toBe(allowedLevelAt(one));
  });

  it('i picchi sono deterministici e rari', () => {
    const { elected } = blocks();
    expect(isPeakBlock(SEED, elected[0], elected[1])).toBe(true);
    expect(isPeakBlock(SEED, elected[0], elected[1])).toBe(true);

    let peaks = 0;
    const side = 40;
    for (let ky = 0; ky < side; ky++) {
      for (let kx = 0; kx < side; kx++) if (isPeakBlock(SEED, kx, ky)) peaks++;
    }
    const share = peaks / (side * side);
    // Vicino a `1 / peakEvery`: e' un hash, non una quota esatta, e il margine
    // dice solo che non e' degenerato in «tutti» o «nessuno».
    expect(share).toBeGreaterThan(0.5 / SKYLINE.peakEvery);
    expect(share).toBeLessThan(2 / SKYLINE.peakEvery);
  });

  it('il bordo non elegge picchi', () => {
    const { elected } = blocks();
    const fringe = core({
      builtNeighbours: 0,
      blockKx: elected[0],
      blockKy: elected[1],
    });
    expect(allowedLevelAt(fringe)).toBe(SKYLINE.levelCap[TIER.fringe]);
  });

  it('un seed diverso elegge isolati diversi', () => {
    let same = 0;
    for (let k = 0; k < 64; k++) {
      if (isPeakBlock(SEED, k, 0) === isPeakBlock(SEED + 1, k, 0)) same++;
    }
    // Non tutti: se il sale non entrasse davvero nel tiro, due seed darebbero la
    // stessa griglia di picchi e due isole avrebbero lo stesso skyline.
    expect(same).toBeLessThan(64);
  });
});
