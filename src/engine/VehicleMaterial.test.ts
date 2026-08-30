import { describe, expect, it } from 'vitest';
import { TRAFFIC } from '../world/traffic/config';
import { resolveTheme } from './themes';
import { createVehicleMaterial, createWakeMaterial } from './VehicleMaterial';
import { createVoxelMaterial } from './VoxelMaterial';

/**
 * I materiali dei mezzi si verificano su una cosa sola: che gli uniform siano
 * **gli stessi oggetti** del materiale del voxel, non delle copie.
 *
 * E' l'intero motivo per cui esistono in questa forma. Un secondo elenco da
 * tenere allineato divergerebbe alla prima modifica, e il difetto si vedrebbe
 * come una nave illuminata da mezzogiorno dentro una notte — che e' esattamente
 * il difetto da cui questo lavoro e' partito. I test girano senza GPU, quindi
 * nessuno compila lo shader: un nome sbagliato non darebbe errore, l'uniform
 * resterebbe a zero e ce ne accorgeremmo da uno screenshot.
 */

/** Nomi dichiarati come uniform nel sorgente GLSL, in ordine di apparizione. */
function declaredUniforms(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)) names.push(match[1]);
  return names;
}

function voxel(): ReturnType<typeof createVoxelMaterial> {
  return createVoxelMaterial(resolveTheme('natural').colors, 1);
}

describe('createVehicleMaterial', () => {
  it('non ha uniform propri: sono gli stessi oggetti del materiale del voxel', () => {
    const handle = voxel();
    const vehicle = createVehicleMaterial(handle.material.uniforms);

    for (const [name, uniform] of Object.entries(vehicle.uniforms)) {
      expect(uniform, `${name} e' una copia invece dell'originale`).toBe(
        handle.material.uniforms[name],
      );
    }

    // E la conseguenza che conta: muovere il sole con la sola API del voxel
    // muove anche quello dei mezzi, senza una seconda chiamata da ricordarsi.
    handle.setAtmosphere(resolveTheme('neon').atmosphere);
    const sun = vehicle.uniforms['uSunDirection'].value as { x: number };
    expect(sun.x).toBe((handle.material.uniforms['uSunDirection'].value as { x: number }).x);
    handle.setTime(12.5);
    expect(vehicle.uniforms['uTime'].value).toBe(12.5);
  });

  it('ogni uniform dichiarato nel GLSL esiste davvero, e nessuno di piu', () => {
    const vehicle = createVehicleMaterial(voxel().material.uniforms);
    const declared = new Set([
      ...declaredUniforms(vehicle.vertexShader),
      ...declaredUniforms(vehicle.fragmentShader),
    ]);

    for (const name of declared) {
      expect(vehicle.uniforms[name], `${name} dichiarato nel GLSL ma assente`).toBeDefined();
    }
    // E il contrario: un uniform preso in prestito e non piu' letto e' codice
    // morto che continua a sembrare vivo.
    for (const name of Object.keys(vehicle.uniforms)) {
      expect(declared.has(name), `${name} preso in prestito ma non dichiarato`).toBe(true);
    }
  });

  it('un uniform che il voxel non dichiara e un errore alla costruzione', () => {
    // Senza questo, il nome sbagliato resterebbe semplicemente a zero: il
    // programma compila lo stesso, e il difetto si vede solo a schermo.
    expect(() => createVehicleMaterial({})).toThrow(/non lo dichiara/);
    expect(() => createWakeMaterial({})).toThrow(/non lo dichiara/);
  });

  it('la sagoma porta indice, faccia e fanale nei vertici, mai un RGB', () => {
    const vehicle = createVehicleMaterial(voxel().material.uniforms);

    expect(vehicle.vertexShader).toContain('attribute float aPalette');
    expect(vehicle.vertexShader).toContain('attribute float aFace');
    expect(vehicle.vertexShader).toContain('attribute float aLamp');
    expect(vehicle.vertexShader).not.toContain('attribute vec3 color');

    // La normale ruota con la sagoma: senza, una nave diretta a ovest avrebbe il
    // sole sul fianco sbagliato, ed e' il difetto che una geometria condivisa per
    // tipo rende invisibile finche' tutta la flotta non punta a est.
    expect(vehicle.vertexShader).toContain('mat3(modelMatrix)');

    // Cosa e' acceso lo dice la scatola, non la tinta: `lightPalette` veste anche
    // le pinne di un dirigibile.
    expect(vehicle.fragmentShader).toContain('vLamp');
    expect(vehicle.fragmentShader).not.toContain(`paletteIndex == ${TRAFFIC.lightPalette}`);
  });

  it('un mezzo si sfuma e si illumina come il resto della scena', () => {
    const vehicle = createVehicleMaterial(voxel().material.uniforms);

    // Le stesse due funzioni che chiama il fragment del voxel, non una seconda
    // copia della stessa matematica.
    expect(vehicle.fragmentShader).toContain('aerialVeil(');
    expect(vehicle.fragmentShader).toContain('aerialTint(');
    expect(vehicle.fragmentShader).toContain('faceAmbient(');
    expect(vehicle.fragmentShader).toContain('sampleShadow(');
    // E lo stesso raggio per pixel: e' quello che tiene una nave **dentro** il
    // paesaggio invece che appiccicata sopra. Con la direzione per fotogramma,
    // da terra lo scafo prenderebbe un velo diverso dalla costa dietro di lui.
    expect(vehicle.fragmentShader).toContain('viewRay(vWorldPosition)');
    // Nessun tone mapping: si scrive HDR lineare e ci pensa OutputPass.
    expect(vehicle.fragmentShader).not.toContain('toneMapping');
  });
});

describe('createWakeMaterial', () => {
  it('non scrive profondita e prende solo il blocco di scena', () => {
    const wake = createWakeMaterial(voxel().material.uniforms);

    expect(wake.transparent).toBe(true);
    expect(wake.depthWrite).toBe(false);
    // La schiuma non ha una normale da cui campionare un'ombra e non e' fatta di
    // voxel: prenderebbe in prestito uniform che non legge, ed e' la ragione per
    // cui il GLSL condiviso e' in tre blocchi invece che in uno.
    expect(wake.uniforms['uShadowMap']).toBeUndefined();
    expect(wake.uniforms['uFaceNormal']).toBeUndefined();
    expect(wake.uniforms['uPalette']).toBeDefined();
  });

  it('prende la tinta della schiuma dalla palette e non da un letterale', () => {
    const wake = createWakeMaterial(voxel().material.uniforms);
    expect(wake.fragmentShader).toContain(`uPalette[${TRAFFIC.wake.palette}]`);
    expect(wake.fragmentShader).toContain(TRAFFIC.wake.grain.toFixed(2));
  });

  it('ogni uniform dichiarato esiste davvero, e nessuno di piu', () => {
    const wake = createWakeMaterial(voxel().material.uniforms);
    const declared = new Set([
      ...declaredUniforms(wake.vertexShader),
      ...declaredUniforms(wake.fragmentShader),
    ]);

    for (const name of declared) expect(wake.uniforms[name]).toBeDefined();
    for (const name of Object.keys(wake.uniforms)) expect(declared.has(name)).toBe(true);
  });
});
