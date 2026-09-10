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

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * La tonalita' in gradi: rosso 0, giallo 60, verde 120.
 *
 * E' l'unica misura che distingue un autunno da un prato malato. La distanza fra
 * colori non basta: il cachi che l'autunno aveva prima era **lontanissimo** dal
 * verde d'estate e comunque sbagliato, perche' si era fermato a meta' strada
 * verso il rosso, dove nessuna foglia si ferma.
 */
function hue(hex: string): number {
  const [r, g, b] = channels(hex);
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  if (high === low) return 0;
  const span = high - low;
  const turn = high === r ? (g - b) / span : high === g ? 2 + (b - r) / span : 4 + (r - g) / span;
  return ((turn * 60) % 360 + 360) % 360;
}

/** Luminanza percepita: serve a controllare che i quattro slot restino in ordine. */
function luma(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** I quattro slot del prato, dal piu' scuro al piu' chiaro come li impila una chioma. */
const GRASS_SLOTS = [
  PALETTE_SLOTS.grassDark,
  PALETTE_SLOTS.grass,
  PALETTE_SLOTS.grassLight,
  PALETTE_SLOTS.grassPale,
] as const;

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
    // L'autunno vira verso il fuoco e l'inverno verso il pallido: due
    // destinazioni diverse, o le due stagioni sarebbero la stessa a intensita'
    // diverse.
    const fire = SEASON_LOOK.goldPath.find(({ slot: id }) => id === slot)?.fire as string;
    expect(distance(autumn, fire)).toBeLessThan(distance(winter, fire));
    expect(distance(winter, SEASON_LOOK.frostTint))
      .toBeLessThan(distance(autumn, SEASON_LOOK.frostTint));
  });

  /**
   * Il difetto che ha fatto riscrivere il percorso: una destinazione ocra sola
   * lasciava il prato **fermo nel cachi**, fra i 45 e i 90 gradi di tonalita',
   * per tutto l'autunno. Un ottobre vero e' arancio e oro — sotto i 45 gradi —
   * e ci arriva perche' passa **prima** dal giallo e poi vira al rosso, come una
   * foglia che perde la clorofilla prima di prendere fuoco.
   */
  it('nel pieno dell autunno ogni slot di prato e arancio o oro, mai cachi', () => {
    const autumn = seasonColors(natural.colors, MID_AUTUMN);
    for (const slot of GRASS_SLOTS) {
      const tone = hue(autumn[slot] as string);
      expect(tone, `slot ${slot} a ${autumn[slot]}`).toBeLessThan(45);
      expect(tone, `slot ${slot} a ${autumn[slot]}`).toBeGreaterThan(0);
    }
  });

  /**
   * La tonalita' scende e basta, dal verde all'arancio, senza tornare indietro:
   * e' cio' che rende ogni settimana d'autunno diversa dalla precedente invece
   * di far oscillare l'isola avanti e indietro sulla stessa tinta.
   */
  it('lungo tutto l autunno il prato scalda senza mai raffreddarsi', () => {
    const slot = PALETTE_SLOTS.grass;
    let previous = hue(natural.colors[slot] as string);
    expect(previous).toBeGreaterThan(90); // verde d'estate
    // Da meta' estate a meta' autunno: e' il tratto in cui l'oro sale da 0 a 1.
    for (let step = 1; step <= 32; step++) {
      const tone = hue(seasonColors(natural.colors, MID_SUMMER + 0.25 * (step / 32))[slot] as string);
      expect(tone, `passo ${step}`).toBeLessThanOrEqual(previous + 0.5);
      previous = tone;
    }
    expect(previous).toBeLessThan(30); // arancio pieno
  });

  /**
   * I quattro slot sono anche i toni impilati di una chioma, dal ventre alla
   * cima: se in autunno si accavallassero l'albero perderebbe il volume proprio
   * quando dovrebbe leggersi di piu'.
   */
  it('i quattro slot restano in ordine di luminanza in ogni stagione', () => {
    for (const phase of [MID_SPRING, MID_SUMMER, MID_AUTUMN, MID_WINTER, 0.5, 0.7]) {
      const colors = seasonColors(natural.colors, phase);
      for (let i = 1; i < GRASS_SLOTS.length; i++) {
        const darker = colors[GRASS_SLOTS[i - 1] as number] as string;
        const lighter = colors[GRASS_SLOTS[i] as number] as string;
        expect(luma(lighter), `fase ${phase}, slot ${GRASS_SLOTS[i]}`).toBeGreaterThan(luma(darker));
      }
    }
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
