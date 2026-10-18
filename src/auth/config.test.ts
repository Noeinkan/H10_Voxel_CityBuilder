import { describe, expect, it } from 'vitest';
import { authGateDisabled, readAuthConfig } from './config';

describe('authGateDisabled', () => {
  it('apre solo con un "off" esplicito', () => {
    expect(authGateDisabled({ VITE_AUTH_GATE: 'off' })).toBe(true);
    expect(authGateDisabled({ VITE_AUTH_GATE: ' OFF ' })).toBe(true);
  });

  it('senza interruttore la porta resta, anche se mancano le chiavi', () => {
    expect(authGateDisabled({})).toBe(false);
    expect(authGateDisabled({ VITE_AUTH_GATE: '' })).toBe(false);
    expect(authGateDisabled({ VITE_AUTH_GATE: 'on' })).toBe(false);
    expect(readAuthConfig({})).toBeNull();
  });
});
