import { describe, expect, it } from 'vitest';
import { CHUNK, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { ROCK } from '../../world/terrain/config';
import { COVER, coverToneOn } from '../../world/terrain/groundcover';
import { packCoverMark, packVisualBlock } from '../../world/visualBlock';
import { FARMS } from '../../world/farms/config';
import { PALETTE_SLOTS } from '../paletteSlots';
import { greedyMesh } from './greedyMesher';
import { MAX_DETAIL_QUADS_PER_CHUNK } from './microGeometry';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';

const U = MESH_UNITS_PER_VOXEL;

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

/** Scrive in coordinate locali di chunk: `-1` e `32` cadono nell'anello di padding. */
function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

function basePalettes(mesh: ReturnType<typeof greedyMesh>): number[] {
  return [...mesh.palettes.slice(0, (mesh.quadCount - mesh.detailQuadCount) * 4)];
}

function detailPalettes(mesh: ReturnType<typeof greedyMesh>): number[] {
  return [...mesh.palettes.slice((mesh.quadCount - mesh.detailQuadCount) * 4)];
}

function detailPositions(mesh: ReturnType<typeof greedyMesh>): Int16Array {
  return mesh.positions.slice((mesh.quadCount - mesh.detailQuadCount) * 4 * 3);
}

/**
 * Un pezzo di prato con una copertura sopra, alle coordinate locali indicate.
 *
 * Il terreno e' una cella 2x2 come quella che l'isola produce davvero: sotto un
 * ciuffo non c'e' mai un voxel isolato, e un caso di prova che lo dimenticasse
 * misurerebbe una geometria che non esiste.
 */
function lawn(surface: number, kind: number, x = 8, y = 8, z = 4): Uint8Array {
  const padded = volume();
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      setLocal(padded, x + dx, y + dy, z, packVisualBlock(surface));
    }
  }
  setLocal(padded, x, y, z + 1, packCoverMark(kind));
  return padded;
}

describe('copertura del terreno in microgeometria', () => {
  it('toglie il cubo dal volume e ci mette dei prismi', () => {
    const padded = lawn(PALETTE_SLOTS.grass, COVER.grass);
    const mesh = greedyMesh(padded);

    // Se il marcatore fosse rimasto nel volume, il greedy pass gli avrebbe
    // emesso le facce con l'indice di palette che porta, cioe' zero.
    expect(basePalettes(mesh)).not.toContain(0);
    expect(basePalettes(mesh).every((palette) => palette === PALETTE_SLOTS.grass)).toBe(true);

    const tone = coverToneOn(PALETTE_SLOTS.grass, COVER.grass);
    expect(tone).toBeGreaterThan(0);
    // Tre lame, cinque facce a testa: quella di sotto aderisce al terreno.
    expect(mesh.detailQuadCount).toBe(15);
    expect(detailPalettes(mesh).every((palette) => palette === tone)).toBe(true);
  });

  it('non consuma il volume che riceve', () => {
    // `greedyMesh` viene chiamata su buffer riciclati dal pool del renderer: un
    // mesher che si mangia il proprio input lascerebbe il chunk successivo senza
    // erba, e solo qualche volta.
    const padded = lawn(PALETTE_SLOTS.grass, COVER.grass);
    const before = Uint8Array.from(padded);

    const first = greedyMesh(padded);
    expect([...padded]).toEqual([...before]);

    const second = greedyMesh(padded);
    expect(second.detailQuadCount).toBe(first.detailQuadCount);
    expect(second.quadCount).toBe(first.quadCount);
  });

  it('scopre la faccia del terreno che il cubo copriva', () => {
    const bare = volume();
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        setLocal(bare, 8 + dx, 8 + dy, 4, packVisualBlock(PALETTE_SLOTS.grass));
      }
    }
    const covered = lawn(PALETTE_SLOTS.grass, COVER.grass);

    // Stesso terreno, stesse facce: la copertura non buca piu' il piano
    // superiore, quindi non spezza nemmeno le corse del merge greedy.
    const bareBase = greedyMesh(bare);
    const coveredMesh = greedyMesh(covered);
    expect(coveredMesh.quadCount - coveredMesh.detailQuadCount)
      .toBe(bareBase.quadCount - bareBase.detailQuadCount);
  });

  it('resta dentro la cella che la porta', () => {
    // Una lama che sconfinasse in alto finirebbe nel chunk sopra, che non la
    // disegna: al confine resterebbe orfana.
    const mesh = greedyMesh(lawn(PALETTE_SLOTS.grass, COVER.grass, 8, 8, CHUNK - 2));
    const positions = detailPositions(mesh);
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i]).toBeGreaterThanOrEqual(8 * U);
      expect(positions[i]).toBeLessThanOrEqual(9 * U);
      expect(positions[i + 1]).toBeGreaterThanOrEqual(8 * U);
      expect(positions[i + 1]).toBeLessThanOrEqual(9 * U);
      expect(positions[i + 2]).toBeGreaterThanOrEqual((CHUNK - 1) * U);
      expect(positions[i + 2]).toBeLessThanOrEqual(CHUNK * U);
    }
    expect(mesh.max[2]).toBeLessThanOrEqual(CHUNK);
  });

  it('il fiore ha uno stelo verde e una corolla del bioma', () => {
    const mesh = greedyMesh(lawn(PALETTE_SLOTS.grass, COVER.accent));
    const palettes = new Set(detailPalettes(mesh));

    expect(palettes.has(PALETTE_SLOTS.grassDark)).toBe(true);
    expect(palettes.has(coverToneOn(PALETTE_SLOTS.grass, COVER.accent))).toBe(true);
    // Stelo senza fondo, corolla intera: e' larga il triplo, e il suo intradosso
    // e' scoperto per davvero.
    expect(mesh.detailQuadCount).toBe(11);
  });

  it('dove l’erba non cresce la copertura e’ un sasso, e basta uno', () => {
    const mesh = greedyMesh(lawn(PALETTE_SLOTS.stone, COVER.accent));
    const tone = coverToneOn(PALETTE_SLOTS.stone, COVER.accent);

    expect(tone).toBeGreaterThan(0);
    expect(mesh.detailQuadCount).toBe(5);
    expect(detailPalettes(mesh).every((palette) => palette === tone)).toBe(true);
  });

  it('il sasso compare su ogni banda di roccia, non su una su tre', () => {
    // La parete percorre `ROCK.tones`: se la tabella conoscesse solo la banda di
    // mezzo, due gradoni su tre resterebbero spogli senza che niente lo dica.
    for (const band of ROCK.tones.slice(0, ROCK.surfaceTones)) {
      const mesh = greedyMesh(lawn(band, COVER.accent));
      expect(mesh.detailQuadCount, `banda ${band}`).toBe(5);
      expect(detailPalettes(mesh).every((palette) => palette === coverToneOn(band, COVER.accent)))
        .toBe(true);
    }
  });

  it('un marcatore che ha perso il suo terreno sparisce invece di sbagliare tinta', () => {
    // E' il caso di una strada che ripavimenta la colonna sotto un ciuffo: il
    // marcatore resta, ma sull'asfalto non cresce niente.
    const paved = lawn(PALETTE_SLOTS.asphalt, COVER.grass);
    expect(greedyMesh(paved).detailQuadCount).toBe(0);

    // E se sotto non c'e' proprio niente, non deve nemmeno leggere fuori posto.
    const floating = volume();
    setLocal(floating, 8, 8, 5, packCoverMark(COVER.grass));
    expect(greedyMesh(floating).quadCount).toBe(0);
  });

  it('il solco attraversa la cella da un bordo all’altro, sull’asse del suo tipo', () => {
    // E' la proprieta' che distingue un campo da una picchiettatura: due colonne
    // contigue devono saldarsi in una fila sola, quindi l'impronta deve toccare
    // entrambi i bordi sull'asse di corsa e restare stretta sull'altro.
    const along = { [COVER.cropX]: 0, [COVER.cropY]: 1 } as const;
    for (const kind of [COVER.cropX, COVER.cropY] as const) {
      const mesh = greedyMesh(lawn(PALETTE_SLOTS.grass, kind));
      const positions = detailPositions(mesh);
      const axis = along[kind];
      const other = axis === 0 ? 1 : 0;

      let low = Infinity;
      let high = -Infinity;
      let narrow = 0;
      for (let i = 0; i < positions.length; i += 3) {
        low = Math.min(low, positions[i + axis]);
        high = Math.max(high, positions[i + axis]);
        narrow = Math.max(narrow, Math.abs(positions[i + other] - 8 * U));
      }

      // Da bordo a bordo sull'asse di corsa: la cella e' la ottava, quindi da
      // `8 * U` a `9 * U` esatti.
      expect({ kind, low }).toEqual({ kind, low: 8 * U });
      expect({ kind, high }).toEqual({ kind, high: 9 * U });
      // E stretto sull'altro: nessun prisma arriva al bordo opposto.
      expect(narrow).toBeLessThan(U);
    }
  });

  it('il verso del solco viene dal marcatore, non dall’hash della colonna', () => {
    // Un ciuffo prende una delle quattro giravolte dalla posizione: e' giusto
    // per l'erba e sarebbe rovinoso per un campo, dove solchi orientati a caso
    // non leggono come un campo. Qui lo stesso tipo deve dare la stessa forma
    // su colonne diverse, e i due tipi devono dare forme diverse sulla stessa.
    const wide = (mesh: ReturnType<typeof greedyMesh>, axis: number): number => {
      const positions = detailPositions(mesh);
      let low = Infinity;
      let high = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        low = Math.min(low, positions[i + axis]);
        high = Math.max(high, positions[i + axis]);
      }
      return high - low;
    };

    // Quattro colonne diverse, cioe' quattro hash diversi: stesso ingombro.
    const spans = [[8, 8], [9, 8], [8, 9], [13, 21]].map(([x, y]) =>
      wide(greedyMesh(lawn(PALETTE_SLOTS.grass, COVER.cropX, x, y)), 0),
    );
    expect(new Set(spans).size).toBe(1);
    expect(spans[0]).toBe(U);

    // E i due tipi corrono davvero su assi diversi.
    expect(wide(greedyMesh(lawn(PALETTE_SLOTS.grass, COVER.cropY)), 1)).toBe(U);
    expect(wide(greedyMesh(lawn(PALETTE_SLOTS.grass, COVER.cropY)), 0)).toBeLessThan(U);
  });

  it('il solco prende la tinta del terreno che lo porta, e sull’asfalto sparisce', () => {
    const plain = greedyMesh(lawn(PALETTE_SLOTS.grass, COVER.cropX));
    const tone = coverToneOn(PALETTE_SLOTS.grass, COVER.cropX);

    expect(tone).toBe(PALETTE_SLOTS.metalBrass);
    expect(detailPalettes(plain).every((palette) => palette === tone)).toBe(true);
    // Due creste, cinque facce a testa: il fondo aderisce al terreno.
    expect(plain.detailQuadCount).toBe(10);

    // Stessa regola dell'erbetta: un lotto ripavimentato non lascia grano
    // sull'asfalto.
    expect(greedyMesh(lawn(PALETTE_SLOTS.asphalt, COVER.cropX)).detailQuadCount).toBe(0);
  });

  it('un chunk arato per intero resta largamente dentro il tetto dei quad', () => {
    // Il caso peggiore vero di questa fase: un lotto piu' grande del chunk,
    // quindi ogni colonna di terreno del chunk porta un solco al passo dichiarato.
    // E' il numero che il budget di `FARMS.rowPitch` esiste per tenere basso, e
    // va misurato invece che stimato.
    const padded = volume();
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        setLocal(padded, x, y, 4, packVisualBlock(PALETTE_SLOTS.grass));
        if (y % FARMS.rowPitch === 0) setLocal(padded, x, y, 5, packCoverMark(COVER.cropX));
      }
    }

    const mesh = greedyMesh(padded);
    const marks = CHUNK * Math.ceil(CHUNK / FARMS.rowPitch);

    console.info(`[misura] chunk arato: ${mesh.detailQuadCount} quad di dettaglio`);
    // Due creste per marcatore, cinque facce a testa.
    expect(mesh.detailQuadCount).toBe(marks * 10);
    expect(mesh.detailQuadCount).toBeLessThan(MAX_DETAIL_QUADS_PER_CHUNK);
  });

  it('il passo dimezza il costo, ed e’ il solo modo di ripagarlo', () => {
    // Se un giorno il campo leggesse male e si volesse infittirlo, questo dice
    // quanto costa: il rapporto e' lineare nel passo, e il tetto e' quello.
    const plough = (pitch: number): number => {
      const padded = volume();
      for (let y = 0; y < CHUNK; y++) {
        for (let x = 0; x < CHUNK; x++) {
          setLocal(padded, x, y, 4, packVisualBlock(PALETTE_SLOTS.grass));
          if (y % pitch === 0) setLocal(padded, x, y, 5, packCoverMark(COVER.cropX));
        }
      }
      return greedyMesh(padded).detailQuadCount;
    };

    expect(plough(1)).toBe(plough(2) * 2);
    expect(plough(1)).toBeLessThan(MAX_DETAIL_QUADS_PER_CHUNK);
  });

  it('l’anello di padding si svuota ma non si disegna', () => {
    // La cella e' del chunk accanto, che disegnera' la sua: qui serve solo che
    // sparisca, o proietterebbe la sua AO sulle facce di bordo di questo.
    const padded = lawn(PALETTE_SLOTS.grass, COVER.grass, 0, 8, 4);
    setLocal(padded, -1, 8, 4, packVisualBlock(PALETTE_SLOTS.grass));
    setLocal(padded, -1, 8, 5, packCoverMark(COVER.grass));

    const mesh = greedyMesh(padded);
    // Una sola copertura disegnata, quella di casa.
    expect(mesh.detailQuadCount).toBe(15);
    expect(basePalettes(mesh)).not.toContain(0);
  });
});
