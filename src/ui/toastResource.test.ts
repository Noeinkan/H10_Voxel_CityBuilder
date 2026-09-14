import { describe, expect, it } from 'vitest';
import { failureResource, tipResource } from './toastResource';

describe('toastResource', () => {
  it('i rifiuti per mancanza di una risorsa portano quella risorsa', () => {
    expect(failureResource('insufficient-funds')).toBe('funds');
    expect(failureResource('insufficient-materials')).toBe('materials');
    expect(failureResource('population-required')).toBe('population');
  });

  it('un rifiuto che non parla di risorse resta senza icona', () => {
    expect(failureResource('too-close')).toBeNull();
    expect(failureResource('needs-coast')).toBeNull();
  });

  it('le crisi di risorsa si riconoscono dall id, non dal titolo', () => {
    expect(tipResource('food-shortage')).toBe('food');
    expect(tipResource('budget-deficit')).toBe('funds');
    expect(tipResource('unhappy-city')).toBe('satisfaction');
  });

  it('un consiglio senza risorsa, o nessun consiglio, resta senza icona', () => {
    expect(tipResource('growth-halted')).toBeNull();
    expect(tipResource(undefined)).toBeNull();
    // Un id che coincide con una proprieta' di `Object.prototype` non e' una
    // risorsa: la tabella e' un record, non un dizionario con prototipo.
    expect(tipResource('toString')).toBeNull();
  });
});
