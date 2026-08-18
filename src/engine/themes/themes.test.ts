import { describe, expect, it } from 'vitest';
import { isValidHexColor, PALETTE_SIZE, toPaletteArray } from '../palette';
import { DEFAULT_THEME_ID, resolveTheme, themeById, THEMES } from './index';

describe('temi', () => {
  it('ce n’e’ almeno uno e gli id sono univoci', () => {
    expect(THEMES.length).toBeGreaterThan(0);
    const ids = THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('il tema di default esiste ed e’ quello che risolve i valori assenti', () => {
    expect(themeById(DEFAULT_THEME_ID)).toBeDefined();
    expect(resolveTheme(null).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme('non-esiste').id).toBe(DEFAULT_THEME_ID);
    for (const theme of THEMES) {
      expect(resolveTheme(theme.id)).toBe(theme);
    }
  });

  it('ogni tema riempie esattamente i 32 slot con colori validi', () => {
    for (const theme of THEMES) {
      expect(theme.colors.length, theme.id).toBe(PALETTE_SIZE);
      for (let i = 0; i < theme.colors.length; i++) {
        expect(isValidHexColor(theme.colors[i]), `${theme.id}[${i}]`).toBe(true);
      }
      // Lo slot 0 e' il vuoto: non viene mai disegnato, ma deve restare nero
      // perche' nessuno si affidi al suo colore per sbaglio.
      expect(theme.colors[0], theme.id).toBe('#000000');
    }
  });

  it('ogni tema si converte nell’uniform senza sorprese', () => {
    for (const theme of THEMES) {
      const array = toPaletteArray(theme.colors);
      expect(array.length).toBe(PALETTE_SIZE * 3);
      for (const value of array) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('l’atmosfera ha sei luci di faccia e parametri in range', () => {
    for (const theme of THEMES) {
      const a = theme.atmosphere;
      expect(a.faceLight.length, theme.id).toBe(6);
      for (const value of a.faceLight) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      // La faccia superiore e' sempre la piu' illuminata: e' cio' che rende
      // leggibile un diorama visto dall'alto.
      expect(Math.max(...a.faceLight), theme.id).toBe(a.faceLight[4]);

      expect(isValidHexColor(a.background), theme.id).toBe(true);
      expect(isValidHexColor(a.fogColor), theme.id).toBe(true);
      expect(a.fogDensity).toBeGreaterThanOrEqual(0);
      // La camera ortografica resta a centinaia di unita' dal target: densita'
      // maggiori saturano l'esponenziale e tingono di nebbia anche il primo piano.
      expect(a.fogDensity).toBeLessThanOrEqual(0.0005);
      expect(a.aoStrength).toBeGreaterThanOrEqual(0);
      expect(a.aoStrength).toBeLessThanOrEqual(1);
      expect(a.exposure).toBeGreaterThan(0);
      expect(a.exposure).toBeLessThanOrEqual(2);
    }
  });
});
