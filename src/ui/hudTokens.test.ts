import { describe, expect, it } from 'vitest';
import { THEMES } from '../engine/themes';
import {
  contrastRatio,
  FIXED_DARK,
  FIXED_LIGHT,
  hudTokens,
  RESOURCE_HUES,
  towardContrast,
} from './hudTokens';

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/** La tinta HSL in gradi: e' la sola cosa che distingue l'oro dall'argilla. */
function hueOf(hex: string): number {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function luminanceOf(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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

  it('ogni tema porta il velo della modale, e nessuno lo cabla di nero', () => {
    // Il menu principale copre la citta' con `--hud-scrim`: un `rgba(0,0,0,.5)`
    // scritto nel CSS sarebbe l'unico colore fisso dell'HUD, e sui temi
    // notturni diventerebbe un rettangolo morto invece di un velo.
    for (const theme of THEMES) {
      const scrim = hudTokens(theme)['--hud-scrim'] ?? '';
      expect(scrim, theme.id).toMatch(/^rgba\(/);
    }
    const scrims = new Set(THEMES.map((theme) => hudTokens(theme)['--hud-scrim']));
    expect(scrims.size).toBe(THEMES.length);
  });

  it('ogni risorsa si vede come forma, sul pannello e sui due fondi fissi', () => {
    // Il gate cromatico di 7.2: la tinta della risorsa e' un'icona, quindi 3:1
    // e non 4.5 — ma contro **ogni** fondo su cui cade, compresi i due che non
    // seguono il tema.
    for (const theme of THEMES) {
      const tokens = hudTokens(theme);
      const surface = tokens['--hud-cream'] ?? '';
      for (const id of Object.keys(RESOURCE_HUES)) {
        expect(contrastRatio(tokens[`--res-${id}`] ?? '', surface), `${theme.id} ${id}`).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(tokens[`--res-${id}-on-dark`] ?? '', FIXED_DARK), id).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(tokens[`--res-${id}-on-light`] ?? '', FIXED_LIGHT), id).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('le cinque tinte restano cinque tinte su ogni tema', () => {
    // Il contrasto sposta le tinte verso il nero o il bianco, e l'argilla e il
    // corallo partono vicini: se due scivolassero sulla stessa tinta la barra
    // tornerebbe a leggersi come cinque copie della stessa pastiglia.
    for (const theme of THEMES) {
      const tokens = hudTokens(theme);
      for (const suffix of ['', '-on-dark', '-on-light']) {
        const hues = Object.keys(RESOURCE_HUES).map((id) => hueOf(tokens[`--res-${id}${suffix}`] ?? ''));
        for (let a = 0; a < hues.length; a++) {
          for (let b = a + 1; b < hues.length; b++) {
            const gap = Math.abs(hues[a] - hues[b]);
            expect(Math.min(gap, 360 - gap), `${theme.id}${suffix} ${a}/${b}`).toBeGreaterThanOrEqual(20);
          }
        }
      }
    }
  });

  it('le miniature prendono i colori dalla palette del tema', () => {
    // E' cio' che tiene la tessera del dock nello stesso mondo della citta':
    // sotto il neon il mattone del mercato e' il mattone del neon.
    const natural = hudTokens(THEMES.find((theme) => theme.id === 'natural') ?? THEMES[0]);
    const neon = hudTokens(THEMES.find((theme) => theme.id === 'neon') ?? THEMES[0]);
    const slots = Object.keys(natural).filter((name) => name.startsWith('--vox-'));
    expect(slots).toHaveLength(31 * 3);
    expect(slots.some((name) => natural[name] !== neon[name])).toBe(true);
    // La faccia in ombra e' piu' scura del tetto, su ogni slot.
    for (let slot = 1; slot < 32; slot++) {
      expect(luminanceOf(natural[`--vox-${slot}-2`] ?? ''), `slot ${slot}`)
        .toBeLessThanOrEqual(luminanceOf(natural[`--vox-${slot}-0`] ?? ''));
    }
  });

  it('towardContrast lascia stare un colore che gia si legge', () => {
    expect(towardContrast('#000000', '#ffffff', 4.5)).toBe('#000000');
  });
});
