import { describe, expect, it } from 'vitest';
import { sunDirection } from './lighting';
import { resolveTheme } from './themes';
import { createVoxelMaterial } from './VoxelMaterial';

/** Nomi dichiarati come uniform nel sorgente GLSL, in ordine di apparizione. */
function declaredUniforms(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)) names.push(match[1]);
  return names;
}

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
    expect(material.vertexShader).toContain('attribute float aSurface');
    expect(material.vertexShader).toContain('uVoxelSize / 16.0');
    expect(material.fragmentShader).not.toContain('float warning');
    expect(material.fragmentShader).toContain('uniform vec3 uPalette[32]');
    expect(material.fragmentShader).toContain('uEmissiveStrength');
    expect(material.uniforms['uWaterStrength'].value).toBeGreaterThan(0);
    expect(material.uniforms['uTime'].value).toBe(12.5);

    handle.setAtmosphere(resolveTheme('scifi').atmosphere);
    expect(material.uniforms['uEmissiveStrength'].value).toBeCloseTo(0.95);
  });

  it('ogni uniform dichiarato nel GLSL esiste davvero fra gli uniform', () => {
    // I test girano senza GPU, quindi nessuno compila lo shader: un nome
    // sbagliato non darebbe errore, l'uniform resterebbe a zero e il difetto si
    // vedrebbe solo a schermo. Questo confronto e' l'unica rete che abbiamo.
    const handle = createVoxelMaterial(resolveTheme('scifi').colors, 1);
    const { material } = handle;
    const declared = new Set([
      ...declaredUniforms(material.vertexShader),
      ...declaredUniforms(material.fragmentShader),
    ]);

    for (const name of declared) {
      expect(material.uniforms[name], `${name} dichiarato nel GLSL ma assente`).toBeDefined();
    }
    // E il contrario: un uniform impostato da `setAtmosphere` ma non piu' letto
    // dal sorgente e' codice morto che continuerebbe a sembrare vivo.
    for (const name of Object.keys(material.uniforms)) {
      expect(declared.has(name), `${name} impostato ma non dichiarato nel GLSL`).toBe(true);
    }
  });

  it('il sole diventa un versore e l’intensita’ entra nel colore', () => {
    const theme = resolveTheme('diorama');
    const handle = createVoxelMaterial(theme.colors, 1);
    handle.setAtmosphere(theme.atmosphere);

    const direction = handle.material.uniforms['uSunDirection'].value as {
      x: number;
      y: number;
      z: number;
    };
    const [x, y, z] = sunDirection(theme.atmosphere.sun.azimuth, theme.atmosphere.sun.elevation);
    expect(direction.x).toBeCloseTo(x, 10);
    expect(direction.y).toBeCloseTo(y, 10);
    expect(direction.z).toBeCloseTo(z, 10);
    expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 10);

    // L'intensita' e' premoltiplicata: lo shader ha un vettore per termine.
    const sun = handle.material.uniforms['uSunColor'].value as { r: number; g: number; b: number };
    expect(Math.max(sun.r, sun.g, sun.b)).toBeCloseTo(theme.atmosphere.sun.intensity, 5);
  });

  it('cambiare tema muove il sole senza toccare il sorgente del programma', () => {
    // Se il sorgente cambiasse, Three ricompilerebbe: e' esattamente cio' che
    // l'invariante "un tema e' solo uniform" esclude.
    const handle = createVoxelMaterial(resolveTheme('diorama').colors, 1);
    handle.setAtmosphere(resolveTheme('diorama').atmosphere);
    const vertex = handle.material.vertexShader;
    const fragment = handle.material.fragmentShader;
    const before = { ...(handle.material.uniforms['uSunDirection'].value as { x: number }) };

    handle.setAtmosphere(resolveTheme('neon').atmosphere);

    expect(handle.material.vertexShader).toBe(vertex);
    expect(handle.material.fragmentShader).toBe(fragment);
    expect((handle.material.uniforms['uSunDirection'].value as { x: number }).x).not.toBe(before.x);
    expect(handle.material.uniforms['uColorJitter'].value).toBeCloseTo(
      resolveTheme('neon').atmosphere.colorJitter,
      10,
    );
  });

  it('espone le sei normali di faccia e accetta vista e risoluzione', () => {
    const handle = createVoxelMaterial(resolveTheme('natural').colors, 1);
    expect(handle.material.uniforms['uFaceNormal'].value).toHaveLength(6);

    handle.setViewDirection(0, 0, -1);
    handle.setResolution(1280, 720);
    const resolution = handle.material.uniforms['uResolution'].value as { x: number; y: number };
    expect(resolution.x).toBe(1280);
    expect(resolution.y).toBe(720);
  });
});
