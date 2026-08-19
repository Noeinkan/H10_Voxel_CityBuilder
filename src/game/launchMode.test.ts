import { describe, expect, it } from 'vitest';
import { resolveLaunchMode } from './launchMode';

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
