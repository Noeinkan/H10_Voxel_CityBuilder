import { describe, expect, it } from 'vitest';
import { perfToggleUrl, resolveLaunchMode, resolveSeed, swatchUrl } from './launchMode';

describe('resolveLaunchMode', () => {
  it('carica alla radice l’esperienza giocabile senza strumenti tecnici', () => {
    expect(resolveLaunchMode(new URLSearchParams())).toEqual({
      debugEnabled: false,
      perfEnabled: false,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('permette di nascondere gli strumenti senza disattivare il gioco', () => {
    expect(resolveLaunchMode(new URLSearchParams('debug=0'))).toEqual({
      debugEnabled: false,
      perfEnabled: false,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('apre gli strumenti tecnici solo quando richiesti esplicitamente', () => {
    expect(resolveLaunchMode(new URLSearchParams('debug=1'))).toEqual({
      debugEnabled: true,
      perfEnabled: false,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('preserva la modalita giocabile esplicita senza overlay', () => {
    expect(resolveLaunchMode(new URLSearchParams('grow=1'))).toEqual({
      debugEnabled: false,
      perfEnabled: false,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('accende la misura delle prestazioni senza toccare il resto', () => {
    // `perf` non e' una scena: alla radice la crescita resta accesa, e con lei
    // l'esperienza completa che si sta misurando.
    expect(resolveLaunchMode(new URLSearchParams('perf=1'))).toEqual({
      debugEnabled: false,
      perfEnabled: true,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('non sovrappone la crescita agli harness espliciti', () => {
    expect(resolveLaunchMode(new URLSearchParams('debug=1&sim=1'))).toEqual({
      debugEnabled: true,
      perfEnabled: false,
      growEnabled: false,
      simEnabled: true,
    });
    expect(resolveLaunchMode(new URLSearchParams('terrain=1337'))).toEqual({
      debugEnabled: false,
      perfEnabled: false,
      growEnabled: false,
      simEnabled: false,
    });
    expect(resolveLaunchMode(new URLSearchParams('scene=city'))).toEqual({
      debugEnabled: false,
      perfEnabled: false,
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

describe('perfToggleUrl', () => {
  it('accende la misura senza cambiare la partita che si sta misurando', () => {
    // Il seed e' la meta' che conta: ricaricare deve riportare la stessa isola,
    // altrimenti si misura un mondo diverso da quello che ha fatto nascere la
    // domanda.
    const params = new URLSearchParams(perfToggleUrl('?seed=1337&theme=neon', true));
    expect(params.get('perf')).toBe('1');
    expect(params.get('seed')).toBe('1337');
    expect(params.get('theme')).toBe('neon');
  });

  it('spegne la misura e lascia in piedi tutto il resto', () => {
    const params = new URLSearchParams(perfToggleUrl('?seed=1337&perf=1', false));
    expect(params.has('perf')).toBe(false);
    expect(params.get('seed')).toBe('1337');
  });

  it('senza piu niente da dichiarare torna alla radice', () => {
    expect(perfToggleUrl('?perf=1', false)).toBe('./');
  });

  it('riaccende la stessa esperienza, non un harness', () => {
    // L'andata e il ritorno passano da `resolveLaunchMode`: la crescita e l'HUD
    // devono restare accesi da entrambe le parti del giro.
    const on = new URLSearchParams(perfToggleUrl('?seed=1337', true));
    expect(resolveLaunchMode(on)).toEqual({
      debugEnabled: false,
      perfEnabled: true,
      growEnabled: true,
      simEnabled: false,
    });
    const off = new URLSearchParams(perfToggleUrl(`?${on.toString()}`, false));
    expect(resolveLaunchMode(off)).toEqual({
      debugEnabled: false,
      perfEnabled: false,
      growEnabled: true,
      simEnabled: false,
    });
  });

  it('non apre il gate del debug per conto suo', () => {
    expect(new URLSearchParams(perfToggleUrl('?seed=1337', true)).has('debug')).toBe(false);
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
      perfEnabled: false,
      growEnabled: false,
      simEnabled: false,
    });
  });
});
