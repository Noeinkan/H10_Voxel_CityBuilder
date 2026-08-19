import { describe, expect, it } from 'vitest';
import { resolveTheme } from './themes';
import { createVoxelMaterial } from './VoxelMaterial';

describe('createVoxelMaterial', () => {
  it('aggiorna atmosfera e tempo senza sostituire materiale o uniform', () => {
    const theme = resolveTheme('diorama');
    const handle = createVoxelMaterial(theme.colors, 1);
    const material = handle.material;
    const palette = material.uniforms['uPalette'].value as Float32Array;

    handle.setAtmosphere(theme.atmosphere);
    handle.setTime(12.5);
    handle.setPalette(resolveTheme('natural').colors);

    expect(handle.material).toBe(material);
    expect(material.uniforms['uPalette'].value).toBe(palette);
    expect(material.uniforms['uWaterStrength'].value).toBeGreaterThan(0);
    expect(material.uniforms['uTime'].value).toBe(12.5);
  });
});
