import { GreaterDepth, type BufferAttribute, type MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { InspectBox } from './inspect';
import { LandmarkSilhouette } from './LandmarkSilhouette';
import { XRAY } from './xray';

/**
 * Un mondo ridotto a cio' che la sagoma legge, piu' il conto delle letture: e'
 * l'unico modo di verificare che una buccia identica non si riestragga.
 */
function worldOf(solid: (x: number, y: number, z: number) => boolean): {
  world: VoxelWorld;
  reads: () => number;
} {
  let reads = 0;
  const world = {
    getBlock(x: number, y: number, z: number): number {
      reads++;
      return solid(x, y, z) ? 1 : 0;
    },
  } as unknown as VoxelWorld;
  return { world, reads: () => reads };
}

const BOX: InspectBox = { x0: 0, y0: 0, z0: 0, x1: 2, y1: 2, z1: 2 };

describe('LandmarkSilhouette', () => {
  it('passa solo dove qualcosa gli sta davanti', () => {
    // E' l'intero meccanismo, ed e' un flag: con il test di profondita' normale
    // la sagoma comparirebbe solo dove il landmark si vede gia', cioe' non
    // servirebbe a niente. `depthWrite` spento perche' la sagoma non deve
    // nascondere ne' se stessa ne' cio' che le sta dietro.
    const { world } = worldOf(() => true);
    const silhouette = new LandmarkSilhouette(world);
    const material = silhouette.mesh.material as MeshBasicMaterial;
    expect(material.depthFunc).toBe(GreaterDepth);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeCloseTo(XRAY.silhouette.opacity, 10);
    // La tinta e' interfaccia appoggiata al mondo: non deve cambiare con il tema.
    expect(material.toneMapped).toBe(false);
    expect(silhouette.mesh.renderOrder).toBe(XRAY.silhouette.renderOrder);
    silhouette.dispose();
  });

  it('senza landmark non disegna niente', () => {
    const { world } = worldOf(() => true);
    const silhouette = new LandmarkSilhouette(world);
    silhouette.update(null);
    expect(silhouette.mesh.visible).toBe(false);
    silhouette.dispose();
  });

  it('con un landmark accende la sua buccia', () => {
    const { world } = worldOf((x, y, z) => x < 2 && y < 2 && z < 2 && x >= 0 && y >= 0 && z >= 0);
    const silhouette = new LandmarkSilhouette(world);
    silhouette.update(BOX);
    expect(silhouette.mesh.visible).toBe(true);
    // Un cubo 2x2x2 isolato: sei facce per lato, nessuna interna.
    expect(silhouette.mesh.geometry.drawRange.count).toBe(24 * 6);
    // `needsUpdate` in Three e' di sola scrittura: quello che si rilegge e' la
    // versione, che avanza a ogni caricamento.
    const position = silhouette.mesh.geometry.getAttribute('position') as BufferAttribute;
    expect(position.version).toBeGreaterThan(0);
    silhouette.dispose();
  });

  it('una scatola vuota resta spenta invece di disegnare il nulla', () => {
    const { world } = worldOf(() => false);
    const silhouette = new LandmarkSilhouette(world);
    silhouette.update(BOX);
    expect(silhouette.mesh.visible).toBe(false);
    silhouette.dispose();
  });

  it('non riestrae la buccia quando il riquadro non cambia', () => {
    // La vista chiama `update` una volta per frame: senza il confronto, tenere
    // il cursore fermo su un monumento vorrebbe dire rileggere il volume voxel
    // sessanta volte al secondo.
    const { world, reads } = worldOf(() => true);
    const silhouette = new LandmarkSilhouette(world);
    silhouette.update(BOX);
    const afterFirst = reads();
    expect(afterFirst).toBeGreaterThan(0);
    silhouette.update({ ...BOX });
    expect(reads()).toBe(afterFirst);
    // Ma un landmark che avanza di stadio cresce, e li' la buccia si rifa'.
    silhouette.update({ ...BOX, z1: 4 });
    expect(reads()).toBeGreaterThan(afterFirst);
    silhouette.dispose();
  });

  it('spegnendola e riaccendendola la buccia torna', () => {
    // `lastBox` si azzera allo spegnimento apposta: senza, rientrare sullo
    // stesso landmark lascerebbe la mesh invisibile con i buffer gia' giusti.
    const { world } = worldOf((x, y, z) => x >= 0 && x < 2 && y >= 0 && y < 2 && z >= 0 && z < 2);
    const silhouette = new LandmarkSilhouette(world);
    silhouette.update(BOX);
    silhouette.update(null);
    silhouette.update(BOX);
    expect(silhouette.mesh.visible).toBe(true);
    silhouette.dispose();
  });
});
