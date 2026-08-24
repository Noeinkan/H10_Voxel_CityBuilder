import { mixHex } from '../engine/daylight';
import { hexToLinear, relativeLuminance } from '../engine/lighting';
import type { Theme } from '../engine/themes';

/**
 * I token `--hud-*` derivati dal tema in vigore.
 *
 * E' la risposta alla singola incoerenza piu' grande fra UI e mondo: i sette
 * temi cambiano cielo, luce, nebbia e bloom, e l'HUD restava crema sotto tutti e
 * sette — compreso un cielo al neon. Qui il pannello prende il colore dell'aria
 * in cui sta.
 *
 * **Non e' una ricolorazione libera.** Il contrasto non e' un effetto
 * collaterale del gusto: ogni colore che finisce sotto del testo passa da
 * `towardContrast`, che lo allontana dalla superficie finche' il rapporto WCAG
 * AA non e' raggiunto. Un tema puo' quindi spostare la tinta quanto vuole senza
 * poter rendere illeggibile una riga — ed e' per questo che la derivazione puo'
 * essere piena invece che decorativa.
 *
 * Puro e senza DOM: gira in `node`, e il test verifica il gate della fase 7.1 su
 * tutti e sette i temi invece che a occhio su quello aperto.
 */

/** Sotto questa luminanza l'aria e' notte, e il pannello va scuro. */
const DARK_AIR = 0.18;

/**
 * Rapporto minimo fra testo e superficie.
 *
 * 4.5 anche per il testo secondario: l'HUD scrive a 9-11px, quindi non e' mai
 * "large text" ai fini AA e la soglia piu' larga da 3.0 non si applica mai.
 */
const AA_TEXT = 4.5;

/** Per cio' che si vede ma non si legge: bordi, riempimenti, anelli. */
const AA_SHAPE = 3;

interface Ground {
  readonly base: string;
  readonly ink: string;
  readonly muted: string;
  /** Filo di luce sul bordo alto del pannello: forte sul chiaro, appena sul buio. */
  readonly edge: string;
}

const LIGHT: Ground = { base: '#fffaf0', ink: '#263833', muted: '#5d726a', edge: 'rgba(255,255,255,.62)' };
const DARK: Ground = { base: '#131a20', ink: '#e8f1ee', muted: '#a3b5ae', edge: 'rgba(255,255,255,.10)' };

/** Rapporto di contrasto WCAG fra due colori `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToLinear(a));
  const lb = relativeLuminance(hexToLinear(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Lo stesso colore, allontanato dalla superficie finche' si legge.
 *
 * Si muove verso il nero o verso il bianco a seconda di dove sta la superficie,
 * a passi piccoli: e' la tinta del tema che deve sopravvivere, quindi si prende
 * il primo valore che passa e non il piu' contrastato possibile.
 */
export function towardContrast(color: string, against: string, target: number): string {
  if (contrastRatio(color, against) >= target) return color;
  const pole = relativeLuminance(hexToLinear(against)) > 0.4 ? '#000000' : '#ffffff';
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixHex(color, pole, step / 20);
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  return pole;
}

/**
 * Un fondo pieno e cio' che ci si scrive sopra, garantiti leggibili insieme.
 *
 * Scegliere il testo e basta non basta: su un ciano acceso ne' il bianco ne'
 * l'inchiostro arrivano a 4.5, e l'etichetta di una tessera e' testo da 9px,
 * quindi 4.5 e' la soglia giusta e non 3. Quando nessuno dei due poli ce la fa,
 * a cedere e' **il fondo** — scurendolo o schiarendolo quel tanto che basta —
 * perche' un accento leggermente spostato resta l'accento del tema, mentre
 * un'etichetta illeggibile non e' piu' un'etichetta.
 */
function solidPair(base: string, panel: string): { readonly fill: string; readonly on: string } {
  const start = towardContrast(base, panel, AA_SHAPE);

  /** Sposta il fondo verso `pole` finche' `text` non ci si legge sopra. */
  const push = (pole: string, text: string): { fill: string; on: string } => {
    let fill = start;
    for (let step = 0; step <= 14 && contrastRatio(text, fill) < AA_TEXT; step += 1) {
      fill = mixHex(fill, pole, 0.07);
    }
    return { fill, on: text };
  };

  // Le due uscite possibili: scurire il fondo e scriverci bianco, o schiarirlo e
  // scriverci inchiostro.
  const dark = push('#000000', '#ffffff');
  const light = push('#ffffff', LIGHT.ink);

  const ok = (c: { fill: string; on: string }): boolean => contrastRatio(c.on, c.fill) >= AA_TEXT;
  // **Fra le due che funzionano, vince quella che il pannello vede ancora.** Una
  // pastiglia puo' spostarsi quanto serve per reggere la propria etichetta, ma se
  // scolora fino a confondersi con il pannello smette di essere un bottone: sono
  // due requisiti diversi, e vanno soddisfatti tutti e due quando si puo'.
  const candidates = [dark, light].filter(ok);
  const visible = candidates.filter((c) => contrastRatio(c.fill, panel) >= AA_SHAPE);
  return visible[0] ?? candidates[0] ?? { fill: start, on: '#ffffff' };
}

/** Un colore esadecimale in `rgba()`, per ombre e bordi che vogliono l'alpha. */
function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

export function hudTokens(theme: Theme): Readonly<Record<string, string>> {
  const { atmosphere } = theme;
  const air = atmosphere.background;
  const dark = relativeLuminance(hexToLinear(air)) < DARK_AIR;
  const ground = dark ? DARK : LIGHT;

  // Il pannello prende l'aria, non la sostituisce: un terzo sul buio, un ottavo
  // sul chiaro. Piu' di cosi' e i sette temi diventerebbero sette interfacce.
  const surface = mixHex(ground.base, air, dark ? 0.3 : 0.12);
  const surfaceDeep = mixHex(surface, air, 0.18);

  const ink = towardContrast(ground.ink, surface, AA_TEXT);
  const muted = towardContrast(ground.muted, surface, AA_TEXT);

  // L'accento e' il vetro del tema, che e' la superficie in cui ogni tema mette
  // la propria firma; senza vetro e' il sole, che ce l'ha sempre.
  const rawAccent = atmosphere.glassTint ?? atmosphere.sun.color;
  const accent = towardContrast(rawAccent, surface, AA_TEXT);
  const accentShape = towardContrast(rawAccent, surface, AA_SHAPE);
  // Il pieno di un bottone premuto e l'etichetta che ci sta sopra, decisi
  // insieme: l'inchiostro segue il **pannello**, quindi su un tema notturno e'
  // chiaro, e sopra un pieno ciano acceso due chiari non contrastano ne' l'uno
  // ne' l'altro. Cio' che sta su un fondo colorato si sceglie guardando quel
  // fondo, e se serve e' il fondo a spostarsi.
  const { fill: solid, on: onSolid } = solidPair(rawAccent, ground.base);
  const { fill: gold, on: onGold } = solidPair('#d9b45f', surface);

  // L'ombra e' l'aria portata al buio: su un tema notturno un'ombra grigia
  // galleggerebbe, perche' e' piu' chiara di cio' su cui cade.
  const shade = mixHex(air, '#000000', 0.55);

  return {
    '--hud-cream': surface,
    '--hud-cream-deep': surfaceDeep,
    '--hud-ink': ink,
    '--hud-muted': muted,
    '--hud-edge': ground.edge,
    '--hud-border': `1px solid ${rgba(ink, 0.18)}`,
    // Il colore del filo da solo: `--hud-border` e' una scorciatoia completa, e
    // non si puo' usare dove serve solo tingere un lato.
    '--hud-line': rgba(ink, 0.18),
    '--hud-line-soft': rgba(ink, 0.12),
    /*
     * I due fondi che un pannello ha dentro di se': la conca e il rilievo.
     *
     * Erano `rgba(95,143,127,.08)` e `rgba(255,255,255,.7)` cablati, cioe' un
     * verde e un bianco: su un pannello notturno il primo spariva e il secondo
     * diventava la cosa piu' luminosa dello schermo. Presi dall'inchiostro e
     * dalla superficie, invece, funzionano in tutti e due i versi.
     */
    '--hud-well': rgba(ink, dark ? 0.16 : 0.07),
    '--hud-raised': dark ? rgba('#ffffff', 0.07) : rgba('#ffffff', 0.7),
    '--hud-key': dark ? mixHex(surface, '#ffffff', 0.14) : '#ffffff',
    // Il gesto e le guide nel mondo condividono l'accento caldo: e' la coppia
    // che dice «punta qui», e deve restare leggibile anche di notte.
    '--hud-gesture': towardContrast(dark ? '#e0a172' : '#a5643f', surface, AA_TEXT),
    '--hud-accent': accent,
    '--hud-accent-shape': accentShape,
    '--hud-accent-soft': rgba(accentShape, 0.22),
    '--hud-sage': accentShape,
    '--hud-sage-dark': solid,
    '--hud-on-accent': onSolid,
    '--hud-positive': towardContrast('#3f8064', surface, AA_TEXT),
    '--hud-danger': towardContrast('#bd5f5b', surface, AA_TEXT),
    '--hud-gold': gold,
    // L'oro e' l'altro **fondo** dell'HUD — espansione, mensola, funivia — e
    // segue la stessa regola del pieno d'accento: si guarda lui, non il pannello.
    '--hud-on-gold': onGold,
    '--hud-coral': towardContrast('#e99a72', surface, AA_TEXT),

    // Tre livelli, e ognuno e' due ombre: una corta di contatto, che dice
    // *appoggiato*, e una lunga d'ambiente, che dice *quanto in alto*. Con una
    // sfocatura sola i tre livelli si distinguono solo misurandoli.
    '--hud-elev-1': `0 1px 2px ${rgba(shade, 0.2)}, 0 8px 20px ${rgba(shade, 0.14)}`,
    '--hud-elev-2': `0 2px 5px ${rgba(shade, 0.22)}, 0 16px 34px ${rgba(shade, 0.2)}`,
    '--hud-elev-3': `0 3px 8px ${rgba(shade, 0.26)}, 0 28px 60px ${rgba(shade, 0.28)}`,
  };
}

/** Scrive i token sulla radice del documento. Il solo punto che tocca il DOM. */
export function applyHudTokens(tokens: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(name, value);
  }
}
