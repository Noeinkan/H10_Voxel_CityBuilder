import { describe, expect, it } from 'vitest';
import { CEILING_VOL, ceilingIdx, CHUNK, PADDED_VOL, paddedIdx, SKY_PROBE } from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND } from '../../world/visualBlock';
import {
  greedyMesh,
  SHADE_AO_MASK,
  SHADE_GLOW_MASK,
  SHADE_GLOW_SHIFT,
  SHADE_SKY_MASK,
  SHADE_SKY_SHIFT,
} from './greedyMesher';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';

/** Volume paddato vuoto. Le coordinate locali 0..31 stanno a px = lx + 1. */
function emptyPadded(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

/** Fetta di soffitto vuota: cielo libero sopra tutto il chunk. */
function emptyCeiling(): Uint8Array {
  return new Uint8Array(CEILING_VOL);
}

/** I due campi impacchettati nel byte per vertice. */
function aoOf(shade: number): number {
  return shade & SHADE_AO_MASK;
}

function skyOf(shade: number): number {
  return (shade >>> SHADE_SKY_SHIFT) & SHADE_SKY_MASK;
}

function glowOf(shade: number): number {
  return (shade >>> SHADE_GLOW_SHIFT) & SHADE_GLOW_MASK;
}

/** Bagliore dei vertici della faccia `face` che sta sul piano `plane` dell'asse. */
function glowOnFace(
  mesh: { faces: Uint8Array; positions: Int16Array; shade: Uint8Array },
  face: number,
  axis: number,
  plane: number,
): number[] {
  const found: number[] = [];
  for (let i = 0; i < mesh.faces.length; i++) {
    if (mesh.faces[i] !== face) continue;
    if (mesh.positions[i * 3 + axis] !== plane * MESH_UNITS_PER_VOXEL) continue;
    found.push(glowOf(mesh.shade[i]));
  }
  return found;
}

/** Visibilita' del cielo dei vertici della faccia +Z posta alla quota `lz + 1`. */
function skyOnTopFaceAt(mesh: { faces: Uint8Array; positions: Int16Array; shade: Uint8Array }, lz: number): number[] {
  const found: number[] = [];
  for (let i = 0; i < mesh.faces.length; i++) {
    if (mesh.faces[i] !== 4) continue;
    if (mesh.positions[i * 3 + 2] !== (lz + 1) * MESH_UNITS_PER_VOXEL) continue;
    found.push(skyOf(mesh.shade[i]));
  }
  return found;
}

/** Scrive una cella in coordinate locali di chunk (0..31 valide, -1 e 32 = padding). */
function setLocal(padded: Uint8Array, lx: number, ly: number, lz: number, id: number): void {
  padded[paddedIdx(lx + 1, ly + 1, lz + 1)] = id;
}

function fillBox(
  padded: Uint8Array,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  id: number,
): void {
  for (let z = z0; z < z1; z++) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) setLocal(padded, x, y, z, id);
    }
  }
}

/** Conta i triangoli: 2 per quad, 3 indici per triangolo. */
function triangleCount(indices: Uint32Array): number {
  return indices.length / 3;
}

describe('greedyMesh', () => {
  it('un chunk vuoto non produce ne vertici ne indici', () => {
    const mesh = greedyMesh(emptyPadded());

    expect(mesh.quadCount).toBe(0);
    expect(mesh.detailQuadCount).toBe(0);
    expect(mesh.positions).toBeInstanceOf(Int16Array);
    expect(mesh.positions.length).toBe(0);
    expect(mesh.faces.length).toBe(0);
    expect(mesh.palettes.length).toBe(0);
    expect(mesh.surfaces.length).toBe(0);
    expect(mesh.indices.length).toBe(0);
  });

  it('un cubo 2x2x2 pieno produce 12 triangoli', () => {
    const padded = emptyPadded();
    fillBox(padded, 4, 4, 4, 6, 6, 6, 7);

    const mesh = greedyMesh(padded);

    expect(mesh.quadCount).toBe(6);
    expect(triangleCount(mesh.indices)).toBe(12);
    expect(mesh.positions.length / 3).toBe(24);
    // Ogni faccia e' un unico quad 2x2: le sei direzioni compaiono una volta a testa.
    const faces = new Set(mesh.faces);
    expect([...faces].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(mesh.min).toEqual([4, 4, 4]);
    expect(mesh.max).toEqual([6, 6, 6]);
  });

  it('due voxel adiacenti dello stesso colore fondono la faccia comune', () => {
    const padded = emptyPadded();
    setLocal(padded, 10, 10, 10, 3);
    setLocal(padded, 11, 10, 10, 3);

    const mesh = greedyMesh(padded);

    // La faccia condivisa non esiste piu' e le quattro facce longitudinali sono
    // fuse in un solo quad 2x1: restano 6 quad, come per un singolo voxel.
    expect(mesh.quadCount).toBe(6);
    expect(triangleCount(mesh.indices)).toBe(12);
    expect(new Set(mesh.palettes)).toEqual(new Set([3]));
  });

  it('due voxel adiacenti di colore diverso non fondono le facce longitudinali', () => {
    const padded = emptyPadded();
    setLocal(padded, 10, 10, 10, 3);
    setLocal(padded, 11, 10, 10, 4);

    const mesh = greedyMesh(padded);

    // La faccia comune resta assente (entrambi solidi) ma le 4 facce lungo X si
    // spezzano in due quad ciascuna: 2 tappi + 8 = 10 quad.
    expect(mesh.quadCount).toBe(10);
    expect(new Set(mesh.palettes)).toEqual(new Set([3, 4]));
  });

  it('propaga la grammatica visuale e non fonde superfici differenti', () => {
    const padded = emptyPadded();
    setLocal(padded, 10, 10, 10, packVisualBlock(12, SURFACE_KIND.habitat));
    setLocal(padded, 11, 10, 10, packVisualBlock(12, SURFACE_KIND.luminous));

    const mesh = greedyMesh(padded);

    expect(mesh.quadCount - mesh.detailQuadCount).toBe(10);
    expect([...new Set(mesh.palettes)]).toContain(12);
    expect(new Set(mesh.surfaces)).toEqual(new Set([
      SURFACE_KIND.habitat,
      SURFACE_KIND.luminous,
      SURFACE_KIND.utility,
    ]));
  });

  it('un singolo voxel produce 6 quad con una direzione di faccia per lato', () => {
    const padded = emptyPadded();
    setLocal(padded, 0, 0, 0, 1);

    const mesh = greedyMesh(padded);

    expect(mesh.quadCount).toBe(6);
    expect([...mesh.faces].filter((f) => f === 4).length).toBe(4); // +Z: un quad, 4 vertici
    expect(mesh.min).toEqual([0, 0, 0]);
    expect(mesh.max).toEqual([1, 1, 1]);
  });

  it('il padding di un vicino solido sopprime le facce di bordo', () => {
    const solidChunk = (): Uint8Array => {
      const padded = emptyPadded();
      fillBox(padded, 0, 0, 0, CHUNK, CHUNK, CHUNK, 5);
      return padded;
    };

    // Chunk pieno isolato: 6 facce da 32x32, un quad per lato.
    const isolated = greedyMesh(solidChunk());
    expect(isolated.quadCount).toBe(6);

    // Con il vicino +X pieno nel padding, la faccia +X non viene emessa.
    const withNeighbour = solidChunk();
    for (let z = 0; z < CHUNK; z++) {
      for (let y = 0; y < CHUNK; y++) setLocal(withNeighbour, CHUNK, y, z, 5);
    }
    const meshed = greedyMesh(withNeighbour);
    expect(meshed.quadCount).toBe(5);
    expect([...meshed.faces].includes(0)).toBe(false); // nessuna faccia +X
  });

  it('una faccia al bordo viene emessa da un solo lato', () => {
    // Voxel locale a lx = 0 con vicino -X vuoto: la faccia -X appartiene a questo
    // chunk. Il vicino, con il nostro voxel nel proprio padding a px = 33, non
    // deve emettere la stessa faccia.
    const owner = emptyPadded();
    setLocal(owner, 0, 5, 5, 2);
    const ownerMesh = greedyMesh(owner);
    expect([...ownerMesh.faces].filter((f) => f === 1).length).toBe(4); // -X presente

    const neighbour = emptyPadded();
    setLocal(neighbour, CHUNK, 5, 5, 2); // solo padding, nessun voxel proprio
    const neighbourMesh = greedyMesh(neighbour);
    expect(neighbourMesh.quadCount).toBe(0);
  });

  it('fonde un piano 32x32 in un unico quad per direzione', () => {
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);

    const mesh = greedyMesh(padded);

    // Un lastrone alto 1: +Z e -Z sono un quad da 32x32, i 4 lati un quad da 32x1.
    expect(mesh.quadCount).toBe(6);
    expect(mesh.min).toEqual([0, 0, 0]);
    expect(mesh.max).toEqual([CHUNK, CHUNK, 1]);
  });

  it('assegna AO massima a un piano isolato', () => {
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);

    const mesh = greedyMesh(padded);

    expect([...mesh.shade]).toHaveLength(mesh.quadCount * 4);
    expect([...mesh.shade].every((value) => aoOf(value) === 3)).toBe(true);
  });

  it('scurisce i corner interni di uno spigolo concavo', () => {
    const padded = emptyPadded();
    // La faccia +Z del voxel centrale resta esposta, ma ha due muri ortogonali
    // nella cella vuota subito sopra: il suo corner -X/-Y e' completamente chiuso.
    setLocal(padded, 1, 1, 1, 4);
    setLocal(padded, 0, 1, 2, 4);
    setLocal(padded, 1, 0, 2, 4);

    const mesh = greedyMesh(padded);
    const topAo: number[] = [];
    for (let i = 0; i < mesh.faces.length; i++) {
      const z = mesh.positions[i * 3 + 2];
      if (mesh.faces[i] === 4 && z === 2 * MESH_UNITS_PER_VOXEL) topAo.push(aoOf(mesh.shade[i]));
    }

    expect(topAo).toHaveLength(4);
    expect(topAo).toContain(0);
    expect(topAo).toContain(3);
  });

  it('un suolo scoperto vede il cielo per intero', () => {
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);

    const mesh = greedyMesh(padded, undefined, emptyCeiling());

    expect(skyOnTopFaceAt(mesh, 0).every((sky) => sky === 3)).toBe(true);
  });

  it('un impalcato spegne il cielo del suolo che copre, e solo di quello', () => {
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);
    // Un ponte largo otto colonne, sospeso quattro cubi sopra: e' il franco che
    // le campate usano davvero (`SPANS.clearance`).
    fillBox(padded, 4, 0, 5, 12, CHUNK, 6, 9);

    const mesh = greedyMesh(padded, undefined, emptyCeiling());
    const ground = skyOnTopFaceAt(mesh, 0);

    // La strada e' un solo piano, ma il cielo lo taglia in fasce: coperto e
    // scoperto non si fondono, ed e' cio' che rende visibile il confine.
    expect(ground).toContain(3);
    expect(Math.min(...ground)).toBeLessThan(3);
    // Il tetto del ponte, invece, e' scoperto come il suolo attorno.
    expect(skyOnTopFaceAt(mesh, 5).every((sky) => sky === 3)).toBe(true);
  });

  it('la copertura vale anche quando sta nel chunk sopra', () => {
    // E' il caso che il solo volume paddato non saprebbe vedere: senza la fetta
    // di soffitto la carreggiata sotto una campata a cavallo del confine di
    // chunk resterebbe illuminata come suolo aperto, con una cucitura visibile.
    const padded = emptyPadded();
    fillBox(padded, 0, 0, CHUNK - 1, CHUNK, CHUNK, CHUNK, 9);

    const open = greedyMesh(padded, undefined, emptyCeiling());
    expect(skyOnTopFaceAt(open, CHUNK - 1).every((sky) => sky === 3)).toBe(true);

    const ceiling = emptyCeiling();
    // Piano k = 2 della fetta, cioe' tre cubi sopra il tetto del chunk.
    for (let py = 0; py < 34; py++) {
      for (let px = 0; px < 34; px++) ceiling[ceilingIdx(px, py, 2)] = 9;
    }

    const covered = greedyMesh(padded, undefined, ceiling);
    expect(skyOnTopFaceAt(covered, CHUNK - 1).every((sky) => sky < 3)).toBe(true);
  });

  it('senza fetta di soffitto il cielo resta libero: un chunk isolato non si scurisce', () => {
    // Un volume meshato da solo — nei test, nei bench — non deve comparire come
    // coperto solo perche' non gli e' stato detto cosa ha sopra.
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);

    const mesh = greedyMesh(padded);

    expect(skyOnTopFaceAt(mesh, 0).every((sky) => sky === 3)).toBe(true);
  });

  it('il sondaggio del cielo si ferma a SKY_PROBE e non oltre', () => {
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);
    // Una copertura appena oltre la portata del sondaggio non deve contare.
    fillBox(padded, 0, 0, 1 + SKY_PROBE, CHUNK, CHUNK, 2 + SKY_PROBE, 9);

    const mesh = greedyMesh(padded, undefined, emptyCeiling());

    expect(skyOnTopFaceAt(mesh, 0).every((sky) => sky === 3)).toBe(true);
  });

  it('non fonde facce adiacenti quando la loro AO e’ diversa', () => {
    const padded = emptyPadded();
    setLocal(padded, 1, 1, 0, 4);
    setLocal(padded, 2, 1, 0, 4);
    // Muro accanto alla prima cella: cambia il suo AO, non quello della seconda.
    setLocal(padded, 0, 1, 1, 4);

    const mesh = greedyMesh(padded);
    let topQuads = 0;
    for (let i = 0; i < mesh.faces.length; i += 4) {
      if (mesh.faces[i] === 4 && mesh.positions[i * 3 + 2] === MESH_UNITS_PER_VOXEL) topQuads++;
    }
    expect(topQuads).toBe(2);
  });

  it('una faccia emissiva schiarisce il muro di fronte, e l alone si spegne con la distanza', () => {
    // Due muri paralleli: uno acceso, l'altro no. La faccia dell'altro rivolta
    // verso l'insegna deve ricevere bagliore; quella che le volta le spalle no.
    const padded = emptyPadded();
    fillBox(padded, 10, 10, 10, 11, 12, 12, packVisualBlock(14, SURFACE_KIND.luminous));
    fillBox(padded, 13, 10, 10, 14, 12, 12, packVisualBlock(4, SURFACE_KIND.habitat));

    const mesh = greedyMesh(padded);
    // Faccia -X del muro spento: guarda l'insegna, che sta tre voxel piu' in la'.
    const facing = glowOnFace(mesh, 1, 0, 13);
    // Faccia +X dello stesso muro: dall'altra parte, piu' lontana.
    const away = glowOnFace(mesh, 0, 0, 14);

    expect(facing.length).toBeGreaterThan(0);
    expect(Math.max(...facing)).toBeGreaterThan(0);
    expect(Math.max(...facing)).toBeGreaterThan(Math.max(...away));
  });

  it('un muro lontano da qualunque insegna non riceve bagliore', () => {
    const padded = emptyPadded();
    fillBox(padded, 2, 2, 2, 3, 4, 4, packVisualBlock(14, SURFACE_KIND.luminous));
    fillBox(padded, 28, 28, 2, 29, 30, 4, packVisualBlock(4, SURFACE_KIND.habitat));

    const mesh = greedyMesh(padded);
    expect(glowOnFace(mesh, 1, 0, 28).every((glow) => glow === 0)).toBe(true);
  });

  it('il bagliore non ruba i bit del cielo', () => {
    // La regressione che il `mod` nel vertex shader evita, verificata dal lato
    // del mesher: un suolo scoperto accanto a un'insegna vede ancora il cielo
    // per intero, e porta anche il bagliore.
    const padded = emptyPadded();
    fillBox(padded, 0, 0, 0, CHUNK, CHUNK, 1, 9);
    fillBox(padded, 10, 10, 1, 11, 11, 3, packVisualBlock(14, SURFACE_KIND.luminous));

    const mesh = greedyMesh(padded, undefined, emptyCeiling());
    const top = skyOnTopFaceAt(mesh, 0);
    expect(top.length).toBeGreaterThan(0);
    expect(top.every((sky) => sky === 3)).toBe(true);
    expect(glowOnFace(mesh, 4, 2, 1).some((glow) => glow > 0)).toBe(true);
  });

  it('rifiuta un volume di dimensione sbagliata', () => {
    expect(() => greedyMesh(new Uint8Array(1000))).toThrow(/39304/);
  });
});
