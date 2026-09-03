import { describe, expect, it } from 'vitest';
import { ARCH } from './config/arch';
import type { BuildingArch } from './archPlan';
import { archArm, withArch, type ArchHost } from './archStamp';
import { STAMP_EMPTY, stampSolidAt, type VoxelAnchor, type VoxelStamp } from './stamp';

const BODY_ID = 7;
const BODY_SURFACE = 3;

/** Un corpo pieno, con l'impronta seduta dentro l'inviluppo come la fa `generateBuilding`. */
function solidBody(side: number, height: number, anchorX = 0, anchorY = 0): VoxelStamp {
  const sizeX = side + anchorX;
  const sizeY = side + anchorY;
  const voxels = new Uint8Array(sizeX * sizeY * height);
  const surfaces = new Uint8Array(voxels.length);
  for (let z = 0; z < height; z++) {
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const index = (x + anchorX) + sizeX * ((y + anchorY) + sizeY * z);
        voxels[index] = BODY_ID;
        surfaces[index] = BODY_SURFACE;
      }
    }
  }
  return {
    sizeX, sizeY, sizeZ: height,
    anchorX, anchorY, anchorZ: 0,
    voxels, surfaces,
    bandStarts: [0, height],
  };
}

/** Le colonne di mondo che uno stamp riempie, come chiavi confrontabili. */
function filled(stamp: VoxelStamp, anchor: VoxelAnchor): Set<string> {
  const out = new Set<string>();
  for (let sz = 0; sz < stamp.sizeZ; sz++) {
    for (let sy = 0; sy < stamp.sizeY; sy++) {
      for (let sx = 0; sx < stamp.sizeX; sx++) {
        const index = sx + stamp.sizeX * (sy + stamp.sizeY * sz);
        if (stamp.voxels[index] === STAMP_EMPTY) continue;
        out.add(`${anchor.x + sx - stamp.anchorX},${anchor.y + sy - stamp.anchorY},${anchor.z + sz - stamp.anchorZ}`);
      }
    }
  }
  return out;
}

const HOST: ArchHost = { x: 0, y: 0, baseZ: 0, footprint: 8 };
const ARM: BuildingArch = {
  face: 0, reach: 2, inset: 0, z: 26, rise: ARCH.rise, across: 0, width: 8, mate: 2,
};

describe('archArm', () => {
  it('scrive con la materia del muro d’imposta', () => {
    const arm = archArm(solidBody(8, 40), HOST, ARM);

    expect(arm).not.toBeNull();
    if (arm === null) return;
    expect([...arm.stamp.voxels].some((id) => id === BODY_ID)).toBe(true);
    expect([...arm.stamp.voxels].every((id) => id === STAMP_EMPTY || id === BODY_ID)).toBe(true);
    expect([...arm.stamp.surfaces].every((s) => s === 0 || s === BODY_SURFACE)).toBe(true);
  });

  it('scende di un voxel per colonna sul rinfianco, e poi resta piano', () => {
    const arm = archArm(solidBody(8, 40), HOST, ARM);
    expect(arm).not.toBeNull();
    if (arm === null) return;

    const solid = (x: number, z: number) => stampSolidAt(arm.stamp, arm.anchor, x, 0, z);
    // L'estradosso e' piano su tutte e tre le colonne.
    expect(solid(7, ARM.z + ARM.rise - 1)).toBe(true);
    expect(solid(9, ARM.z + ARM.rise - 1)).toBe(true);
    expect(solid(9, ARM.z + ARM.rise)).toBe(false);
    // L'intradosso sale allontanandosi dal muro: due voxel all'imposta, uno alla
    // colonna dopo, nessuno alla punta.
    expect(solid(7, ARM.z - ARCH.haunch)).toBe(true);
    expect(solid(8, ARM.z - ARCH.haunch)).toBe(false);
    expect(solid(8, ARM.z - 1)).toBe(true);
    expect(solid(9, ARM.z - 1)).toBe(false);
  });

  it('rinuncia quando all’imposta non c’e’ materia da campionare', () => {
    const hollow = solidBody(8, 40);
    hollow.voxels.fill(STAMP_EMPTY);

    expect(archArm(hollow, HOST, ARM)).toBeNull();
  });
});

describe('withArch', () => {
  it('cresce sul solo verso della faccia e conserva il corpo', () => {
    const body = solidBody(8, 40);
    const grown = withArch(body, HOST, ARM);

    expect(grown.sizeX).toBe(body.sizeX + ARM.reach);
    expect(grown.sizeY).toBe(body.sizeY);
    expect(grown.sizeZ).toBe(body.sizeZ);
    const anchor = { x: HOST.x, y: HOST.y, z: HOST.baseZ };
    const after = filled(grown, anchor);
    for (const key of filled(body, anchor)) {
      expect(after.has(key)).toBe(true);
    }
  });

  it('sposta l’ancora quando il braccio esce dal lato dell’origine', () => {
    // Faccia 1: l'inviluppo cresce verso x negativi, quindi il corpo scivola in
    // avanti dentro lo stamp e l'ancora lo segue — e' la stessa posizione che
    // `generateBuilding` da' all'impronta quando lo sbalzo va da quella parte.
    const host: ArchHost = { x: 12, y: 0, baseZ: 0, footprint: 8 };
    const arch: BuildingArch = { ...ARM, face: 1 };
    const body = solidBody(8, 40);
    const grown = withArch(body, host, arch);

    expect(grown.anchorX).toBe(ARM.reach);
    const anchor = { x: host.x, y: host.y, z: host.baseZ };
    expect(stampSolidAt(grown, anchor, host.x, 0, 0)).toBe(true);
    expect(stampSolidAt(grown, anchor, host.x + 7, 0, 0)).toBe(true);
    expect(stampSolidAt(grown, anchor, host.x - arch.reach, 0, arch.z)).toBe(true);
  });

  it('scrive esattamente le colonne che la comparsa scrive', () => {
    // **E' l'invariante che tiene insieme comparsa e cancellazione.** Il braccio
    // compare da solo e si cancella insieme al corpo: se le due sagome non
    // coprissero le stesse colonne, demolire lascerebbe voxel orfani sopra la
    // strada.
    for (const face of [0, 1, 2, 3]) {
      const host: ArchHost = { x: 12, y: 12, baseZ: 0, footprint: 8 };
      const arch: BuildingArch = { ...ARM, face, across: face <= 1 ? 12 : 12 };
      const body = solidBody(8, 40);
      const anchor = { x: host.x, y: host.y, z: host.baseZ };

      const arm = archArm(body, host, arch);
      expect(arm).not.toBeNull();
      if (arm === null) return;

      const added = new Set(filled(withArch(body, host, arch), anchor));
      for (const key of filled(body, anchor)) added.delete(key);
      const written = new Set(filled(arm.stamp, arm.anchor));
      for (const key of filled(body, anchor)) written.delete(key);

      expect([...added].sort()).toEqual([...written].sort());
    }
  });
});
