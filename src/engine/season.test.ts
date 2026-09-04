import { describe, expect, it } from 'vitest';
import { PALETTE_SLOTS } from './paletteSlots';
import { SEASON_LOOK, seasonColors, seasonMood, withSeason } from './season';
import { natural } from './themes/natural';
import { neon } from './themes/neon';
import { THEMES } from './themes';

/** Le stesse quattro fasi che la simulazione chiama centro di stagione. */
const MID_SPRING = 0.125;
const MID_SUMMER = 0.375;
const MID_AUTUMN = 0.625;
const MID_WINTER = 0.875;

/** Distanza fra due colori `#rrggbb`, in canali sommati. Serve solo a ordinare. */
function distance(from: string, to: string): number {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  let sum = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    sum += Math.abs(((a >> shift) & 0xff) - ((b >> shift) & 0xff));
  }
  return sum;
}

describe('seasonMood', () => {
  it('mette ogni umore al centro della sua stagione', () => {
    expect(seasonMood(MID_SUMMER).growth).toBeCloseTo(1, 6);
    expect(seasonMood(MID_WINTER).growth).toBeCloseTo(0, 6);
    expect(seasonMood(MID_AUTUMN).gold).toBeCloseTo(1, 6);
    expect(seasonMood(MID_WINTER).frost).toBeCloseTo(1, 6);
  });

  /**
   * L'oro e la brina sono la stessa fase letta a un quarto d'anno di distanza,
   * non due tabelle: e' cio' che rende ottobre diverso sia da settembre sia da
   * novembre senza che nessuno lo debba scrivere.
   */
  it('non fa mai coesistere il pieno rigoglio e il pieno della brina', () => {
    for (let step = 0; step < 64; step++) {
      const mood = seasonMood(step / 64);
      expect(mood.growth + mood.frost).toBeLessThanOrEqual(1.000001);
      expect(mood.gold).toBeGreaterThanOrEqual(0);
      expect(mood.frost).toBeGreaterThanOrEqual(0);
    }
  });

  it('estate e primavera non hanno ne oro ne brina: sono il tema com e', () => {
    for (const phase of [MID_SPRING, 0.2, 0.3, MID_SUMMER]) {
      const mood = seasonMood(phase);
      expect(mood.gold).toBeCloseTo(0, 6);
      expect(mood.frost).toBeCloseTo(0, 6);
    }
  });
});

describe('seasonColors', () => {
  /**
   * Il patto che tiene i sette temi sette: il verde scritto nel tema **e'** il
   * suo verde d'estate, e le altre stagioni lo piegano invece di sostituirlo.
   */
  it('a meta estate torna la palette del tema per identita', () => {
    for (const theme of THEMES) {
      expect(seasonColors(theme.colors, MID_SUMMER)).toBe(theme.colors);
    }
  });

  it('in autunno il prato si allontana dal verde del tema, in inverno di piu', () => {
    const slot = PALETTE_SLOTS.grass;
    const summer = natural.colors[slot] as string;
    const autumn = seasonColors(natural.colors, MID_AUTUMN)[slot] as string;
    const winter = seasonColors(natural.colors, MID_WINTER)[slot] as string;

    expect(autumn).not.toBe(summer);
    expect(distance(summer, autumn)).toBeGreaterThan(0);
    expect(distance(summer, winter)).toBeGreaterThan(0);
    // L'autunno vira verso l'ocra e l'inverno verso il pallido: due destinazioni
    // diverse, o le due stagioni sarebbero la stessa a intensita' diverse.
    expect(distance(autumn, SEASON_LOOK.goldTint))
      .toBeLessThan(distance(winter, SEASON_LOOK.goldTint));
    expect(distance(winter, SEASON_LOOK.frostTint))
      .toBeLessThan(distance(autumn, SEASON_LOOK.frostTint));
  });

  it('non tocca niente che non sia prato', () => {
    const winter = seasonColors(natural.colors, MID_WINTER);
    for (let slot = 0; slot < natural.colors.length; slot++) {
      const vegetation = slot === PALETTE_SLOTS.grass || slot === PALETTE_SLOTS.grassDark
        || slot === PALETTE_SLOTS.grassLight || slot === PALETTE_SLOTS.grassPale;
      if (vegetation) continue;
      expect(winter[slot], `slot ${slot}`).toBe(natural.colors[slot]);
    }
  });

  it('vale per ogni tema, e nessuno perde uno slot per strada', () => {
    for (const theme of THEMES) {
      const winter = seasonColors(theme.colors, MID_WINTER);
      expect(winter).toHaveLength(theme.colors.length);
      for (const color of winter) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('withSeason', () => {
  it('a meta estate torna l atmosfera del tema per identita', () => {
    for (const theme of THEMES) {
      expect(withSeason(theme.atmosphere, MID_SUMMER)).toBe(theme.atmosphere);
    }
  });

  /**
   * `bounceLight` **e'** il colore del prato visto di rimbalzo — il tema
   * `natural` lo dichiara — quindi lasciarlo verde sopra un'isola ingiallita
   * sarebbe una luce che viene da un terreno che non c'e' piu'.
   */
  it('il rimbalzo dal terreno segue il prato', () => {
    const autumn = withSeason(natural.atmosphere, MID_AUTUMN);
    const winter = withSeason(natural.atmosphere, MID_WINTER);
    expect(autumn.bounceLight.color).not.toBe(natural.atmosphere.bounceLight.color);
    expect(winter.bounceLight.color).not.toBe(natural.atmosphere.bounceLight.color);
    expect(autumn.bounceLight.color).not.toBe(winter.bounceLight.color);
    // L'intensita' no: quanto rimbalza e' materia del tema, cambia solo di che
    // colore. E' la stessa divisione che `withHour` fa con il sole.
    expect(autumn.bounceLight.intensity).toBe(natural.atmosphere.bounceLight.intensity);
  });

  it('l aria d inverno e piu fitta, e non lo e mai meno di quella del tema', () => {
    for (const theme of THEMES) {
      const winter = withSeason(theme.atmosphere, MID_WINTER);
      expect(winter.fog.density).toBeGreaterThan(theme.atmosphere.fog.density);
      const spring = withSeason(theme.atmosphere, MID_SPRING);
      expect(spring.fog.density).toBeCloseTo(theme.atmosphere.fog.density, 12);
    }
  });

  /**
   * Sole, esposizione, tone mapping, vetro e AO sono la materia del tema, non il
   * suo mese: sono gli stessi campi che `withHour` lascia stare, e per la stessa
   * ragione. Un tema senza tone mapping come `neon` deve restare senza.
   */
  it('non tocca cio che appartiene al tema e non alla stagione', () => {
    for (const phase of [MID_SPRING, MID_AUTUMN, MID_WINTER]) {
      const winter = withSeason(neon.atmosphere, phase);
      expect(winter.sun).toEqual(neon.atmosphere.sun);
      expect(winter.exposure).toBe(neon.atmosphere.exposure);
      expect(winter.toneMapping).toBe(neon.atmosphere.toneMapping);
      expect(winter.aoStrength).toBe(neon.atmosphere.aoStrength);
      expect(winter.colorJitter).toBe(neon.atmosphere.colorJitter);
      expect(winter.water).toBe(neon.atmosphere.water);
    }
  });
});
