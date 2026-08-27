import { describe, expect, it } from 'vitest';
import { testTerrain } from '../../sim/testTerrain';
import { TERRAIN } from '../terrain/config';
import { SITE } from './config';
import { openGround, seesWater, sightAnyWater, siteRefusal } from './siteRules';

/**
 * Le regole si verificano scrivendo il rilievo a mano, non generando un'isola:
 * `heightAt` fa passare la fixture da `classifyBiome`, quindi una colonna sotto
 * il livello del mare e' oceano davvero e non oceano per dichiarazione.
 */

const DRY = TERRAIN.beachMaxHeight + 6;
const WET = TERRAIN.seaLevel - 6;

/** Isola asciutta con il mare a ovest di `shoreX`. */
function coastAt(shoreX: number) {
  return testTerrain({
    chunksX: 2,
    chunksY: 2,
    heightAt: (x) => (x < shoreX ? WET : DRY),
  });
}

/** Lago in quota: pelo a `level`, fondo due sotto, riva due sopra. */
const LAKE_LEVEL = TERRAIN.seaLevel + 16;

function lakeAt(shoreX: number) {
  return testTerrain({
    chunksX: 2,
    chunksY: 2,
    heightAt: (x) => (x >= shoreX ? LAKE_LEVEL - 2 : LAKE_LEVEL + 4),
    waterTopAt: (x) => (x >= shoreX ? LAKE_LEVEL : TERRAIN.seaLevel),
  });
}

describe('fronte d’acqua a qualsiasi quota', () => {
  it('vede il lago che il vincolo costiero non vede', () => {
    const map = lakeAt(20);
    // La riva asciutta del lago: per il mare non c'e' nessuna costa — il pelo e'
    // sedici voxel sopra il livello del mare — ma l'acqua c'e', e la marina la
    // vede a una colonna di distanza.
    expect(seesWater(map, 19, 32, SITE.coastalRadius)).toBe(false);
    expect(sightAnyWater(map, 19, 32, SITE.coastalRadius)).toEqual({
      facing: 0,
      distance: 1,
      waterZ: LAKE_LEVEL,
    });
  });

  it('una colonna asciutta non e’ acqua nemmeno al pelo del lago', () => {
    // `waterTop` sull'entroterra vale il livello del mare: chiedere «c'e' acqua
    // sopra?» non deve confondere la quota dello specchio con un lago lontano.
    const map = lakeAt(20);
    expect(sightAnyWater(map, 8, 32, SITE.coastalRadius)).toBeNull();
  });

  it('il vincolo waterfront ammette il lago e rifiuta l’entroterra', () => {
    const map = lakeAt(20);
    expect(siteRefusal(map, 19, 32, 'waterfront')).toBeNull();
    expect(siteRefusal(map, 8, 32, 'waterfront')).toBe('needs-waterfront');
    // Il lago non e' il mare: il ruolo costiero classico non lo accetta.
    expect(siteRefusal(map, 19, 32, 'coastal')).toBe('needs-coast');
  });
});

describe('vincolo costiero', () => {
  it('vede il mare entro il raggio e non oltre', () => {
    const map = coastAt(20);
    const lastWater = 19;
    expect(seesWater(map, lastWater + 1, 32, SITE.coastalRadius)).toBe(true);
    expect(seesWater(map, lastWater + SITE.coastalRadius, 32, SITE.coastalRadius)).toBe(true);
    expect(seesWater(map, lastWater + SITE.coastalRadius + 1, 32, SITE.coastalRadius)).toBe(false);
  });

  it('guarda i quattro assi e non le diagonali', () => {
    const map = testTerrain({
      chunksX: 2,
      chunksY: 2,
      heightAt: (x, y) => (x === 35 && y === 35 ? WET : DRY),
    });
    // Tre celle in diagonale: dentro il raggio come distanza, invisibile come direzione.
    expect(seesWater(map, 32, 32, SITE.coastalRadius)).toBe(false);
    expect(seesWater(map, 35, 32, SITE.coastalRadius)).toBe(true);
  });

  it('una colonna non generata non e’ acqua', () => {
    // Il bordo della mappa non e' una costa: allo streaming manca ancora il
    // chunk, e prometterla farebbe accettare un porto sull'asciutto.
    const map = testTerrain({ chunksX: 1, chunksY: 1, heightAt: () => DRY });
    expect(seesWater(map, 2, 2, SITE.coastalRadius)).toBe(false);
  });
});

describe('vincolo di superficie', () => {
  const half = Math.floor(SITE.openSpan / 2);

  it('accetta un pianoro', () => {
    const map = testTerrain({ chunksX: 2, chunksY: 2, heightAt: () => DRY });
    expect(openGround(map, 32, 32, SITE.openSpan, SITE.openMaxStep)).toBe(true);
  });

  it('rifiuta un dislivello dentro l’intorno e lo ignora appena fuori', () => {
    const step = SITE.openMaxStep + 2;
    const inside = testTerrain({
      chunksX: 2,
      chunksY: 2,
      heightAt: (x) => (x >= 32 + half ? DRY + step : DRY),
    });
    expect(openGround(inside, 32, 32, SITE.openSpan, SITE.openMaxStep)).toBe(false);

    const outside = testTerrain({
      chunksX: 2,
      chunksY: 2,
      heightAt: (x) => (x >= 32 + half + 1 ? DRY + step : DRY),
    });
    expect(openGround(outside, 32, 32, SITE.openSpan, SITE.openMaxStep)).toBe(true);
  });

  it('rifiuta la parete, che nessuna opera raddrizza', () => {
    const map = testTerrain({
      chunksX: 2,
      chunksY: 2,
      heightAt: () => DRY,
      slopeAt: (x) => (x === 34 ? 1 : 0.1),
    });
    expect(openGround(map, 32, 32, SITE.openSpan, SITE.openMaxStep)).toBe(false);
  });

  it('rifiuta un intorno che esce dalla mappa generata', () => {
    const map = testTerrain({ chunksX: 1, chunksY: 1, heightAt: () => DRY });
    expect(openGround(map, 2, 2, SITE.openSpan, SITE.openMaxStep)).toBe(false);
  });
});

describe('motivo del rifiuto', () => {
  it('traduce l’etichetta del ruolo nel motivo giusto', () => {
    const map = coastAt(20);
    const inland = 40;

    expect(siteRefusal(map, inland, 32, 'any')).toBeNull();
    expect(siteRefusal(map, inland, 32, 'coastal')).toBe('needs-coast');
    expect(siteRefusal(map, 20, 32, 'coastal')).toBeNull();
    expect(siteRefusal(map, inland, 32, 'open')).toBeNull();
  });

  it('i due vincoli non sono l’uno il contrario dell’altro', () => {
    // La battigia passa il vincolo costiero e fallisce quello di superficie:
    // sono due domande diverse, e una colonna puo' rispondere no a entrambe.
    const map = coastAt(32);
    expect(siteRefusal(map, 32, 32, 'coastal')).toBeNull();
    expect(siteRefusal(map, 32, 32, 'open')).toBe('needs-open-ground');
  });
});
