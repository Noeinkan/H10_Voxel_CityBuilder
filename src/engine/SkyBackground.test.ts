import { describe, expect, it } from 'vitest';
import type { ShaderMaterial } from 'three';
import { resolveTheme } from './themes';
import { createSkyBackground } from './SkyBackground';

const materialOf = (mesh: { material: unknown }): ShaderMaterial => mesh.material as ShaderMaterial;

describe('createSkyBackground', () => {
  it('e’ un quad che non scrive profondita’ e si disegna per primo', () => {
    const handle = createSkyBackground(resolveTheme('diorama').atmosphere);
    const material = materialOf(handle.mesh);

    // Se scrivesse profondita' o venisse dopo, coprirebbe la scena invece di
    // starle dietro.
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(handle.mesh.renderOrder).toBeLessThan(0);
    expect(handle.mesh.frustumCulled).toBe(false);
    // Il vertex ignora le matrici: e' quello che lo tiene incollato allo schermo.
    expect(material.vertexShader).toContain('gl_Position = vec4(position.xy, 0.0, 1.0)');
    handle.dispose();
  });

  it('cambiare atmosfera riscrive uniform senza sostituire mesh o materiale', () => {
    const handle = createSkyBackground(resolveTheme('diorama').atmosphere);
    const { mesh } = handle;
    const material = materialOf(mesh);
    const before = material.uniforms['uBandAmount'].value;

    handle.setAtmosphere(resolveTheme('industrial').atmosphere);

    expect(handle.mesh).toBe(mesh);
    expect(materialOf(handle.mesh)).toBe(material);
    // industrial e' il tema piu' nuvoloso: il valore deve essersi mosso.
    expect(material.uniforms['uBandAmount'].value).not.toBe(before);
    expect(material.uniforms['uBandAmount'].value).toBeCloseTo(
      resolveTheme('industrial').atmosphere.sky.cloudAmount,
      10,
    );
    handle.dispose();
  });

  it('le bande dipinte e lo strato in quota sono due cose distinte', () => {
    // `uBand*` e' il fondo dipinto in coordinate di schermo, `uCloud*` il piano
    // a una quota del mondo. Portavano lo stesso nome, e con due nuvole in scena
    // sarebbe stato lo stesso uniform per due mestieri.
    const handle = createSkyBackground(resolveTheme('natural').atmosphere);
    const material = materialOf(handle.mesh);
    const deck = resolveTheme('natural').atmosphere.cloudDeck;

    expect(deck).toBeDefined();
    expect(material.uniforms['uBandAmount'].value).toBeCloseTo(
      resolveTheme('natural').atmosphere.sky.cloudAmount,
      10,
    );
    expect(material.uniforms['uCloudAmount'].value).toBeCloseTo(deck?.amount ?? -1, 10);
    expect(material.uniforms['uCloudHeight'].value).toBe(deck?.height);

    // L'interruttore spegne lo strato e lascia stare le bande: sono due cieli
    // diversi, e il bottone ne governa uno solo.
    handle.setClouds(false);
    expect(material.uniforms['uCloudAmount'].value).toBe(0);
    expect(material.uniforms['uBandAmount'].value).toBeGreaterThan(0);
    handle.setClouds(true);
    expect(material.uniforms['uCloudAmount'].value).toBeCloseTo(deck?.amount ?? -1, 10);
    handle.dispose();
  });

  it('accetta posizione del sole, aspetto e tempo', () => {
    const handle = createSkyBackground(resolveTheme('natural').atmosphere);
    const material = materialOf(handle.mesh);

    handle.setSunScreen(0.4, 0.7, false);
    handle.setAspect(1.75);
    handle.setTime(9);

    const screen = material.uniforms['uSunScreen'].value as { x: number; y: number };
    expect(screen.x).toBeCloseTo(0.4, 10);
    expect(screen.y).toBeCloseTo(0.7, 10);
    // Sole dietro la camera: resta l'alone, sparisce il disco.
    expect(material.uniforms['uSunFacing'].value).toBe(0);
    expect(material.uniforms['uAspect'].value).toBe(1.75);
    expect(material.uniforms['uTime'].value).toBe(9);
    handle.dispose();
  });

  it('anche di notte il sole conserva un minimo di intensita’', () => {
    // Senza il minimo, nel tema neon il disco sparirebbe del tutto invece di
    // leggersi come una luna.
    const handle = createSkyBackground(resolveTheme('neon').atmosphere);
    const color = materialOf(handle.mesh).uniforms['uSunColor'].value as {
      r: number;
      g: number;
      b: number;
    };
    expect(Math.max(color.r, color.g, color.b)).toBeGreaterThan(0);
    handle.dispose();
  });
});
