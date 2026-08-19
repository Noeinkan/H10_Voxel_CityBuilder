import { describe, expect, it } from 'vitest';
import { resolveTheme } from './themes';
import { createSkyBackground } from './SkyBackground';

describe('createSkyBackground', () => {
  it('aggiorna la texture in place quando cambia atmosfera', () => {
    const handle = createSkyBackground(resolveTheme('diorama').atmosphere);
    const texture = handle.texture;
    const before = Array.from(texture.image.data as Uint8Array);

    handle.setAtmosphere(resolveTheme('neon').atmosphere);

    expect(handle.texture).toBe(texture);
    expect(Array.from(texture.image.data as Uint8Array)).not.toEqual(before);
    expect(texture.image.width).toBe(2);
    expect(texture.image.height).toBe(96);
    handle.dispose();
  });
});
