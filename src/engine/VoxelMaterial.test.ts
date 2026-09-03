import { DoubleSide, FrontSide, Vector3, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import { INSPECT, INSPECT_MODE, inspectUniforms, type InspectState } from './inspect';
import { sunDirection } from './lighting';
import { NIGHT_WINDOWS } from './nightWindows';
import { resolveTheme } from './themes';
import { createVoxelMaterial } from './VoxelMaterial';
import { XRAY } from './xray';

/** Nomi dichiarati come uniform nel sorgente GLSL, in ordine di apparizione. */
function declaredUniforms(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)) names.push(match[1]);
  return names;
}

function inspectState(patch: Partial<InspectState>): InspectState {
  return {
    mode: INSPECT_MODE.off,
    sliceZ: INSPECT.defaultSliceZ,
    focus: null,
    view: [0, 0, -1],
    block: null,
    subject: null,
    landmark: null,
    section: null,
    locked: false,
    ...patch,
  };
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

  it('lo strato di nuvole si accende solo per i temi che lo dichiarano', () => {
    const handle = createVoxelMaterial(resolveTheme('natural').colors, 1);
    const material = handle.material;

    const withDeck = resolveTheme('neon').atmosphere;
    handle.setAtmosphere(withDeck);
    expect(withDeck.cloudDeck).toBeDefined();
    expect(material.uniforms['uCloudAmount'].value).toBe(withDeck.cloudDeck?.amount);
    expect(material.uniforms['uCloudHeight'].value).toBe(withDeck.cloudDeck?.height);
    // Il tema da' una tinta propria allo strato: il fragment la usa al posto di
    // quella della nebbia solo perche' questo interruttore vale uno.
    expect(material.uniforms['uCloudTintBlend'].value).toBe(1);

    // **Il tema senza strato lo spegne davvero, non lo lascia com'era.** E' la
    // sola cosa che garantisca che una scena di ieri sia ancora quella di ieri:
    // un uniform che sopravvive al cambio di tema sarebbe un residuo di quello
    // di prima, e si vedrebbe solo passando da un tema all'altro.
    const plain = resolveTheme('industrial').atmosphere;
    handle.setAtmosphere(plain);
    expect(plain.cloudDeck).toBeUndefined();
    expect(material.uniforms['uCloudAmount'].value).toBe(0);
    expect(material.uniforms['uCloudTintBlend'].value).toBe(0);
    // La scala resta un divisore, anche spenta: uno zero qui sarebbe una
    // divisione per zero nel punto di attraversamento.
    expect(material.uniforms['uCloudScale'].value).toBeGreaterThan(0);
  });

  it('ogni uniform dichiarato nel GLSL esiste davvero fra gli uniform', () => {
    // I test girano senza GPU, quindi nessuno compila lo shader: un nome
    // sbagliato non darebbe errore, l'uniform resterebbe a zero e il difetto si
    // vedrebbe solo a schermo. Questo confronto e' l'unica rete che abbiamo.
    const handle = createVoxelMaterial(resolveTheme('scifi').colors, 1);
    const { material } = handle;

    const check = (): void => {
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
    };

    // Il contratto vale su **entrambe** le varianti: quella di partenza, senza
    // il `discard` delle viste, e quella che la prima attivazione compone.
    check();
    handle.setInspect(inspectUniforms(inspectState({ mode: INSPECT_MODE.slice, sliceZ: 24 })));
    check();
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

  it('il retino entra nel sorgente solo alla prima vista attivata', () => {
    const handle = createVoxelMaterial(resolveTheme('natural').colors, 1);
    const { material } = handle;

    // Chi non accende una vista non porta un `discard` nel programma: e' li'
    // che si perde l'early-Z, e sarebbe un costo per tutti a beneficio di nessuno.
    expect(material.fragmentShader).not.toContain('discard');
    expect(material.side).toBe(FrontSide);

    handle.setInspect(inspectUniforms(inspectState({ mode: INSPECT_MODE.off })));
    expect(material.fragmentShader).not.toContain('discard');

    handle.setInspect(inspectUniforms(inspectState({
      mode: INSPECT_MODE.xray,
      focus: { x: 8, y: 8, z: 4 },
      view: [0, 0, -1],
    })));
    expect(material.fragmentShader).toContain('discard');
    expect(material.fragmentShader).toContain('gl_FrontFacing');
    // Un velo non ha bisogno delle back-face: il taglio si', ma questo non taglia.
    expect(material.side).toBe(FrontSide);
    expect(material.uniforms['uInspectVeil'].value).toBeCloseTo(XRAY.veil, 10);
    // La lente si accende con il modo, ed e' l'unico modo che la usa: senza, il
    // predicato in piu' resterebbe nel sorgente a costo zero ma anche a effetto
    // zero, e il difetto si vedrebbe solo a schermo.
    const lensMax = material.uniforms['uInspectLensMax'].value as Vector3;
    const lensMin = material.uniforms['uInspectLensMin'].value as Vector4;
    expect(lensMax.x).toBeGreaterThan(lensMin.x);
    // Il pavimento e' la quota del terreno sotto il cursore, non quella allargata.
    expect(lensMin.w).toBe(4);

    // Spegnere non ricompila: si torna al payload neutro, la variante resta.
    const source = material.fragmentShader;
    handle.setInspect(inspectUniforms(inspectState({ mode: INSPECT_MODE.off })));
    expect(material.fragmentShader).toBe(source);
    expect(material.uniforms['uInspectVeil'].value).toBe(0);
  });

  it('solo il taglio accende le back-face, e le rispegne uscendo', () => {
    const handle = createVoxelMaterial(resolveTheme('natural').colors, 1);
    const { material } = handle;

    handle.setInspect(inspectUniforms(inspectState({ mode: INSPECT_MODE.slice, sliceZ: 30 })));
    expect(material.side).toBe(DoubleSide);
    const plane = material.uniforms['uInspectPlane'].value as Vector4;
    expect([plane.x, plane.y, plane.z, plane.w]).toEqual([0, 0, 1, 30]);
    expect(material.uniforms['uInspectVeil'].value).toBe(1);

    handle.setInspect(inspectUniforms(inspectState({
      mode: INSPECT_MODE.block,
      block: { x0: 10, y0: 20, x1: 30, y1: 40 },
    })));
    expect(material.side).toBe(FrontSide);
    const rect = material.uniforms['uInspectRect'].value as Vector4;
    expect([rect.x, rect.y, rect.z, rect.w]).toEqual([10, 20, 31, 41]);
  });

  it('le finestre di notte prendono i numeri da nightWindows, non da letterali', () => {
    // Il fragment shader e' la seconda copia del modello. Se una soglia venisse
    // riscritta a mano qui dentro, cambiarla in `nightWindows.ts` non farebbe
    // piu' niente e il difetto si vedrebbe solo a schermo, come per ogni altra
    // cosa che vive in GLSL.
    const source = createVoxelMaterial(resolveTheme('natural').colors, 1).material.fragmentShader;

    expect(source).toContain(`cell.xy / ${NIGHT_WINDOWS.towerCell.toFixed(1)}`);
    expect(source).toContain(NIGHT_WINDOWS.peakShare.toFixed(2));
    expect(source).toContain(NIGHT_WINDOWS.occupancyGamma.toFixed(2));
    expect(source).toContain(NIGHT_WINDOWS.floorFill.toFixed(2));
    expect(source).toContain(NIGHT_WINDOWS.towerBias.high.toFixed(2));
    expect(source).toContain(NIGHT_WINDOWS.gain.night.toFixed(2));
    expect(source).toContain(`cell.z / ${NIGHT_WINDOWS.storey.block.toFixed(1)}`);
    expect(source).toContain(NIGHT_WINDOWS.storey.darkShare.toFixed(2));
    expect(source).toContain(NIGHT_WINDOWS.storey.dimmest.toFixed(2));
    expect(source).toContain(NIGHT_WINDOWS.coreShare.toFixed(3));
    // Quante finestre si accendono resta una lettura dell'economia, non dell'ora.
    expect(source).toContain('pow(uLitHomes');
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
