import { describe, expect, it } from 'vitest';
import { resolveLaunchMode, resolveSeed, swatchUrl } from './launchMode';

describe('resolveLaunchMode', () => {
  it('carica alla radice l’esperienza giocabile senza strumenti tecnici', () => {
    expect(resolveLaunchMode(new URLSearchParams())).toEqual({
      debugEnabled: false,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('permette di nascondere gli strumenti senza disattivare il gioco', () => {
    expect(resolveLaunchMode(new URLSearchParams('debug=0'))).toEqual({
      debugEnabled: false,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('apre gli strumenti tecnici solo quando richiesti esplicitamente', () => {
    expect(resolveLaunchMode(new URLSearchParams('debug=1'))).toEqual({
      debugEnabled: true,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('preserva la modalita giocabile esplicita senza overlay', () => {
    expect(resolveLaunchMode(new URLSearchParams('grow=1'))).toEqual({
      debugEnabled: false,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('non sovrappone la crescita agli harness espliciti', () => {
    expect(resolveLaunchMode(new URLSearchParams('debug=1&sim=1'))).toEqual({
      debugEnabled: true,
      growEnabled: false,
      simEnabled: true,
    });
    expect(resolveLaunchMode(new URLSearchParams('terrain=1337'))).toEqual({
      debugEnabled: false,
      growEnabled: false,
      simEnabled: false,
    });
    expect(resolveLaunchMode(new URLSearchParams('scene=city'))).toEqual({
      debugEnabled: false,
      growEnabled: false,
      simEnabled: false,
    });
  });
});

describe('resolveSeed', () => {
  it('usa il seed dichiarato nell’URL quando c’e', () => {
    expect(resolveSeed(new URLSearchParams('seed=1337'), () => 7)).toBe(1337);
    expect(resolveSeed(new URLSearchParams('seed=-5'), () => 7)).toBe(-5);
  });

  it('senza seed dichiarato ne sorteggia uno nuovo a ogni partita', () => {
    expect(resolveSeed(new URLSearchParams(), () => 0xdeadbeef)).toBe(0xdeadbeef);
  });

  it('un seed illeggibile o zero vale quanto un seed assente', () => {
    expect(resolveSeed(new URLSearchParams('seed=abc'), () => 42)).toBe(42);
    expect(resolveSeed(new URLSearchParams('seed=0'), () => 42)).toBe(42);
  });
});

describe('swatchUrl', () => {
  it('porta con se il look che si sta guardando', () => {
    const params = new URLSearchParams(swatchUrl('neon', 21.5));
    expect(params.get('scene')).toBe('swatch');
    expect(params.get('theme')).toBe('neon');
    expect(params.get('hour')).toBe('21.50');
  });

  it('ferma l’orologio: un campione che cambia luce da solo non e un campione', () => {
    // `hour` e' il parametro che *fissa* l'ora: il campionario aperto di notte
    // deve restare di notte finche' lo si guarda.
    expect(new URLSearchParams(swatchUrl('natural', 0)).has('hour')).toBe(true);
  });

  it('apre un harness e non una seconda partita', () => {
    // La meta' che conta: il link non deve far ripartire crescita e HUD in una
    // scheda dove non c'e' nessuna citta' su cui girino.
    expect(resolveLaunchMode(new URLSearchParams(swatchUrl('pastel', 12)))).toEqual({
      debugEnabled: false,
      growEnabled: false,
      simEnabled: false,
    });
  });
});
