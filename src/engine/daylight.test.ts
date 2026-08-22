import { describe, expect, it } from 'vitest';
import {
  DAYLIGHT,
  dayPhase,
  mixHex,
  nightFactor,
  normaliseHour,
  sunAzimuth,
  sunElevation,
  withHour,
} from './daylight';
import { faceLuminance } from './lighting';
import { natural } from './themes/natural';
import { neon } from './themes/neon';

const NOON = (DAYLIGHT.sunrise + DAYLIGHT.sunset) / 2;

describe('daylight', () => {
  it('a mezzogiorno il tema resta se stesso', () => {
    const peak = natural.atmosphere.sun.elevation;
    expect(sunElevation(NOON, peak)).toBeCloseTo(peak, 6);
    expect(sunAzimuth(NOON, natural.atmosphere.sun.azimuth)).toBeCloseTo(
      natural.atmosphere.sun.azimuth,
      6,
    );
    expect(dayPhase(NOON, peak)).toBe(1);

    const noon = withHour(natural.atmosphere, NOON);
    expect(noon.sun.intensity).toBeCloseTo(natural.atmosphere.sun.intensity, 6);
    expect(noon.skyLight.intensity).toBeCloseTo(natural.atmosphere.skyLight.intensity, 6);
    expect(noon.sky.top).toBe(natural.atmosphere.sky.top);
    expect(noon.background).toBe(natural.atmosphere.background);
  });

  it('il sole sorge a est, tramonta a ovest e di notte sta sotto l orizzonte', () => {
    const peak = natural.atmosphere.sun.elevation;
    const noonAzimuth = natural.atmosphere.sun.azimuth;

    expect(sunElevation(DAYLIGHT.sunrise, peak)).toBeCloseTo(0, 6);
    expect(sunElevation(DAYLIGHT.sunset, peak)).toBeCloseTo(0, 6);
    expect(sunElevation(2, peak)).toBeLessThan(0);
    expect(sunElevation(23, peak)).toBeLessThan(0);

    // L'azimut cresce con l'ora: sorge dalla parte da cui il tema lo aveva
    // messo meno novanta gradi e finisce novanta piu' in la'.
    expect(sunAzimuth(DAYLIGHT.sunrise, noonAzimuth)).toBeCloseTo(noonAzimuth - 90, 6);
    expect(sunAzimuth(DAYLIGHT.sunset, noonAzimuth)).toBeCloseTo(noonAzimuth + 90, 6);
    for (let hour = DAYLIGHT.sunrise; hour < DAYLIGHT.sunset; hour += 0.5) {
      expect(sunAzimuth(hour + 0.5, noonAzimuth)).toBeGreaterThan(sunAzimuth(hour, noonAzimuth));
    }
  });

  it('la notte e una conseguenza dell altezza del sole, e il crepuscolo non ha salti', () => {
    const peak = natural.atmosphere.sun.elevation;
    expect(nightFactor(0, peak)).toBe(1);
    expect(nightFactor(NOON, peak)).toBe(0);

    // Continuita': tre minuti di gioco non possono spostare la fase piu' di un
    // decimo. Il crepuscolo dura poco piu' di un'ora — e' il tempo che il sole
    // ci mette ad attraversare quei gradi — ma non e' un interruttore.
    let previous = dayPhase(0, peak);
    for (let hour = 0.05; hour <= 24; hour += 0.05) {
      const current = dayPhase(hour, peak);
      expect(Math.abs(current - previous)).toBeLessThan(0.1);
      previous = current;
    }
  });

  it('a notte piena la diretta e spenta e gli emissivi salgono', () => {
    const night = withHour(natural.atmosphere, 1);
    expect(night.sun.intensity).toBe(0);
    expect(night.shadow?.strength).toBe(0);
    expect(night.emissiveStrength).toBeCloseTo(DAYLIGHT.nightEmissive, 6);
    expect(night.fog.density).toBeGreaterThan(natural.atmosphere.fog.density);

    // L'ambiente resta: senza, una citta' di notte sarebbe una silhouette nera
    // e non si leggerebbe per luci accese, che e' proprio il gate della fase.
    expect(night.skyLight.intensity).toBeGreaterThan(0);
    expect(night.bounceLight.intensity).toBeGreaterThan(0);

    // E il cielo si spegne con lei: nuvole bianche a mezzanotte sarebbero la
    // cosa piu' luminosa dell'inquadratura.
    expect(night.sky.cloudTint).not.toBe(natural.atmosphere.sky.cloudTint);
    expect(night.sky.sunGlow).toBeLessThan(natural.atmosphere.sky.sunGlow);
  });

  it('a sole alto il tetto resta la faccia piu illuminata; radente cede alle pareti', () => {
    const peak = natural.atmosphere.sun.elevation;

    // Sopra questa elevazione vale l'invariante che `themes.test.ts` verifica
    // sui temi: un diorama visto dall'alto si legge perche' il tetto e' la
    // faccia piu' chiara. Il punto di scambio si calcola: serve che
    // `cos(E) - sin(E)` scenda sotto il margine che l'ambiente di cielo ha sul
    // rimbalzo, e con i valori di `natural` cade attorno ai trentasette gradi.
    const ROOF_KEEPS_LEAD = 40;
    for (let hour = DAYLIGHT.sunrise; hour <= DAYLIGHT.sunset; hour += 0.5) {
      if (sunElevation(hour, peak) < ROOF_KEEPS_LEAD) continue;
      const luminance = faceLuminance(withHour(natural.atmosphere, hour));
      for (let face = 0; face < luminance.length; face++) {
        if (face !== 4) expect(luminance[4]).toBeGreaterThanOrEqual(luminance[face]);
      }
    }

    // Sotto, no, e non e' una svista: e' la luce radente, ed e' proprio quello
    // che un'alba deve fare. Quello che non deve succedere e' che il tetto
    // diventi la faccia **piu' scura**, perche' li' il volume si perde.
    for (let hour = 0; hour < 24; hour += 0.5) {
      const luminance = faceLuminance(withHour(natural.atmosphere, hour));
      const darkest = Math.min(...luminance);
      expect(luminance[4]).toBeGreaterThan(darkest);
    }
  });

  it('la notte non appiattisce i temi uno sull altro', () => {
    const naturalNight = withHour(natural.atmosphere, 0);
    const neonNight = withHour(neon.atmosphere, 0);
    expect(naturalNight.sky.top).not.toBe(neonNight.sky.top);
    expect(naturalNight.fog.color).not.toBe(neonNight.fog.color);
  });

  it('normalizza le ore fuori scala e mescola i colori agli estremi', () => {
    expect(normaliseHour(26)).toBe(2);
    expect(normaliseHour(-1)).toBe(23);
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
