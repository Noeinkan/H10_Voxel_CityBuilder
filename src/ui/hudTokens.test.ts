import { describe, expect, it } from 'vitest';
import { THEMES } from '../engine/themes';
import { contrastRatio, hudTokens, towardContrast } from './hudTokens';

/** I token che portano testo, e che quindi devono reggere il contrasto AA. */
const TEXT_TOKENS = [
  '--hud-ink',
  '--hud-muted',
  '--hud-positive',
  '--hud-danger',
  '--hud-coral',
  '--hud-accent',
  '--hud-gesture',
] as const;

/**
 * I token che sono **fondi**, non testo.
 *
 * L'oro non e' mai scritto: riempie i tre bottoni d'accento. Chiedergli 4.5
 * contro il pannello sarebbe la domanda sbagliata — quella giusta la fa
 * `--hud-on-gold`, che e' cio' che ci va sopra — e lo spingerebbe a scurirsi
 * fino a smettere di essere oro.
 */
const SHAPE_TOKENS = ['--hud-gold', '--hud-accent-shape'] as const;

describe('hudTokens', () => {
  it('nessun testo perde contrasto AA su nessuno dei sette temi', () => {
    // E' il gate della fase 7.1, e sta in un test invece che nell'occhio di chi
    // apre un tema alla volta: sono sette temi per sette token, e a mano si
    // guarda quello aperto.
    for (const theme of THEMES) {
      const tokens = hudTokens(theme);
      const surface = tokens['--hud-cream'] ?? '';
      for (const name of TEXT_TOKENS) {
        const color = tokens[name] ?? '';
        expect(contrastRatio(color, surface), `${theme.id} ${name}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const name of SHAPE_TOKENS) {
        const color = tokens[name] ?? '';
        expect(contrastRatio(color, surface), `${theme.id} ${name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('il testo sopra il pieno d oro si legge', () => {
    for (const theme of THEMES) {
      const tokens = hudTokens(theme);
      expect(
        contrastRatio(tokens['--hud-on-gold'] ?? '', tokens['--hud-gold'] ?? ''),
        theme.id,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('il testo sopra il pieno d accento regge AA, e non e sempre bianco', () => {
    // Il pieno del bottone premuto e' un fondo: contrastarlo con il pannello non
    // direbbe niente su cio' che ci sta **sopra**. Un tema chiaro puo' quindi
    // volere inchiostro invece di crema, ed e' esattamente il caso che un
    // `#fffaf0` cablato sbagliava.
    for (const theme of THEMES) {
      const tokens = hudTokens(theme);
      expect(
        contrastRatio(tokens['--hud-on-accent'] ?? '', tokens['--hud-sage-dark'] ?? ''),
        theme.id,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('l aria notturna porta un pannello scuro, quella diurna uno chiaro', () => {
    // La derivazione non e' una tinta: e' una **scelta di fondo**. Se neon e
    // natural finissero sullo stesso pannello, l'HUD tornerebbe a essere
    // appoggiato sopra il gioco invece che dentro.
    const surfaceOf = (id: string): string =>
      hudTokens(THEMES.find((theme) => theme.id === id) ?? THEMES[0])['--hud-cream'] ?? '';

    expect(contrastRatio(surfaceOf('neon'), '#000000')).toBeLessThan(4.5);
    expect(contrastRatio(surfaceOf('natural'), '#ffffff')).toBeLessThan(1.6);
  });

  it('e deterministica: lo stesso tema da gli stessi token', () => {
    for (const theme of THEMES) {
      expect(hudTokens(theme)).toEqual(hudTokens(theme));
    }
  });

  it('ogni tema porta la propria tinta nel pannello', () => {
    // Il contrasto e' un pavimento, non un livellatore: se tutti e sette
    // finissero sullo stesso crema il gate sarebbe verde e la fase inutile.
    const surfaces = new Set(THEMES.map((theme) => hudTokens(theme)['--hud-cream']));
    expect(surfaces.size).toBe(THEMES.length);
  });

  it('towardContrast lascia stare un colore che gia si legge', () => {
    expect(towardContrast('#000000', '#ffffff', 4.5)).toBe('#000000');
  });
});
