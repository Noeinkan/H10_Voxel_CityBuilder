import { describe, expect, it } from 'vitest';
import { CHUNK, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND, type SurfaceKind } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { greedyMesh } from './greedyMesher';
import { MAX_DETAIL_QUADS_PER_CHUNK } from './microGeometry';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

function detailPositions(mesh: ReturnType<typeof greedyMesh>): Int16Array {
  const baseVertices = (mesh.quadCount - mesh.detailQuadCount) * 4;
  return mesh.positions.slice(baseVertices * 3);
}

function detailPalettes(mesh: ReturnType<typeof greedyMesh>): number[] {
  const baseVertices = (mesh.quadCount - mesh.detailQuadCount) * 4;
  return [...mesh.palettes.slice(baseVertices)];
}

function detailSurfaces(mesh: ReturnType<typeof greedyMesh>): number[] {
  const baseVertices = (mesh.quadCount - mesh.detailQuadCount) * 4;
  return [...mesh.surfaces.slice(baseVertices)];
}

/**
 * Uguaglianza elemento per elemento fuori dal deep-equal di vitest.
 *
 * Il chunk saturo produce centinaia di migliaia di vertici, e `toEqual` li
 * percorre con la macchina del confronto profondo: costava piu' dei due
 * meshing che sta confrontando. Il ciclo secco decide, e `toEqual` interviene
 * solo quando c'e' una differenza da mostrare.
 */
function expectSameArray(actual: ArrayLike<number>, expected: ArrayLike<number>, what: string): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] === expected[i]) continue;
    expect({ what, index: i, value: actual[i] }).toEqual({ what, index: i, value: expected[i] });
  }
}

/**
 * Un chunk fitto di edifici **veri**, non di patologie.
 *
 * E' il caso su cui si misura il margine sotto `MAX_DETAIL_QUADS_PER_CHUNK`:
 * quattro corpi con la grammatica che il generatore produce davvero — portale a
 * terra, fasce luminose ogni sei, tetto tecnico in cima, facciata d'uso in
 * mezzo. La scacchiera di voxel isolati misura il tetto; questo misura quanto ne
 * resta libero per il dettaglio che si aggiunge.
 */
function densityChunk(): Uint8Array {
  const padded = volume();
  for (const [ox, oy] of [[1, 1], [17, 1], [1, 17], [17, 17]]) {
    for (let z = 0; z < CHUNK; z++) {
      const body = z === CHUNK - 1
        ? SURFACE_KIND.roofTech
        : z % 6 === 0
          ? SURFACE_KIND.luminous
          : ox === 1 ? SURFACE_KIND.habitat : SURFACE_KIND.civic;
      const palette = z % 6 === 0 ? PALETTE_SLOTS.glassPale : PALETTE_SLOTS.concrete;
      for (let y = oy; y < oy + 14; y++) {
        for (let x = ox; x < ox + 14; x++) {
          // Il portale e' **un modulo solo** per lato, come lo scrive `onPortal`
          // in `buildings/generate.ts`: farne una fascia intera moltiplicherebbe
          // per dieci i dettagli agganciati al fronte, e la misura direbbe una
          // bugia proprio sulla voce che si sta aggiungendo.
          const doorway = z < 4 && (
            (x === ox + 7 && (y === oy || y === oy + 13)) ||
            (y === oy + 7 && (x === ox || x === ox + 13))
          );
          setLocal(padded, x, y, z, packVisualBlock(
            doorway ? PALETTE_SLOTS.stone : palette,
            doorway ? SURFACE_KIND.portal : body,
          ));
        }
      }
    }
  }
  return padded;
}

/**
 * Un **isolato** fitto: molti edifici piccoli, non pochi grandi.
 *
 * **E' il caso che il tetto dei quad sorveglia davvero, e `densityChunk` non lo
 * e'.** Quattro corpi da 14 x 14 hanno sedici facce in tutto e quattro tetti; un
 * isolato vero di trentasei edifici da 4 x 4 ne ha centoquarantaquattro e
 * trentasei, cioe' quasi dieci volte gli **agganci** — che e' cio' su cui il
 * dettaglio si paga, visto che nessun emettitore costa per voxel. La misura del
 * README (13 890 quad su un chunk a 42 edifici) e' quella, e senza una fixture
 * che la riproduca aggiungere un emettitore significa aggiungerlo alla cieca.
 *
 * Il suolo `plain` a quota zero non e' arredamento: senza, ogni edificio ha aria
 * sotto e si fascia il piede con un intradosso che nel mondo non esiste.
 */
function blockChunk(): Uint8Array {
  const padded = volume();
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      setLocal(padded, x, y, 0, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.plain));
    }
  }

  // Sei per sei impronte da quattro, con un voxel di stacco: e' il passo che
  // tiene le facciate esposte. Senza lo stacco gli edifici si toccano, le facce
  // interne spariscono e la misura direbbe meta' del vero.
  const uses = [SURFACE_KIND.habitat, SURFACE_KIND.habitat, SURFACE_KIND.civic, SURFACE_KIND.industrial];
  let index = 0;
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 5; gx++, index++) {
      const ox = 1 + gx * 6;
      const oy = 1 + gy * 6;
      // Dalla casa alla torre: e' la varieta' di quote che fa comparire insieme
      // i dettagli agganciati al suolo e quelli agganciati al coronamento. Il
      // grosso resta basso e una su sei sale, che e' la distribuzione che
      // `levelCapsOf` produce — un'impronta da quattro non regge una torre da
      // ventisei, e un isolato di soli aghi misurerebbe un caso che non esiste.
      const top = index % 6 === 0 ? 22 : 6 + ((index * 5) % 11);
      const use = uses[index % uses.length];
      // **Un ingresso per edificio, non uno per lato.** `paint.ts` chiama
      // `onPortal` con `request.accentFace`, cioe' con una faccia sola: un
      // edificio vero ha una porta sul fronte principale e tre pareti cieche.
      // Darne quattro moltiplica per quattro l'aggancio su cui si appende tutto
      // cio' che riguarda l'attacco a terra, e la misura direbbe una bugia
      // proprio sulla voce che si sta pesando.
      const accentFace = index % 4;
      for (let z = 1; z <= top; z++) {
        const body = z === top
          ? SURFACE_KIND.roofTech
          : z % 6 === 0 ? SURFACE_KIND.luminous : use;
        const palette = z % 6 === 0 ? PALETTE_SLOTS.glassPale : PALETTE_SLOTS.concrete;
        for (let y = oy; y < oy + 4; y++) {
          for (let x = ox; x < ox + 4; x++) {
            const doorway = z <= 3 && (
              accentFace === 0 ? x === ox + 3 && y === oy + 2 :
              accentFace === 1 ? x === ox && y === oy + 2 :
              accentFace === 2 ? y === oy + 3 && x === ox + 2 :
              y === oy && x === ox + 2
            );
            setLocal(padded, x, y, z, packVisualBlock(
              doorway ? PALETTE_SLOTS.stone : palette,
              doorway ? SURFACE_KIND.portal : body,
            ));
          }
        }
      }
    }
  }
  return padded;
}

describe('microgeometria 1/16', () => {
  it('conserva il greedy pass in un Int16 esatto e ammette coordinate negative', () => {
    const padded = volume();
    setLocal(padded, 0, 4, 4, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));

    const mesh = greedyMesh(padded);
    const basePositionCount = (mesh.quadCount - mesh.detailQuadCount) * 4 * 3;

    expect(mesh.positions).toBeInstanceOf(Int16Array);
    expect([...mesh.positions.slice(0, basePositionCount)].every((value) => value % MESH_UNITS_PER_VOXEL === 0)).toBe(true);
    expect([...detailPositions(mesh)]).toContain(-3);
    expect(mesh.min[0]).toBe(-3 / MESH_UNITS_PER_VOXEL);
  });

  it('non aggiunge dettagli a plain o a una superficie interamente occlusa', () => {
    const plain = volume();
    setLocal(plain, 8, 8, 8, PALETTE_SLOTS.concrete);
    expect(greedyMesh(plain).detailQuadCount).toBe(0);

    const hidden = volume();
    setLocal(hidden, 8, 8, 8, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));
    setLocal(hidden, 7, 8, 8, PALETTE_SLOTS.concrete);
    setLocal(hidden, 9, 8, 8, PALETTE_SLOTS.concrete);
    setLocal(hidden, 8, 7, 8, PALETTE_SLOTS.concrete);
    setLocal(hidden, 8, 9, 8, PALETTE_SLOTS.concrete);
    setLocal(hidden, 8, 8, 7, PALETTE_SLOTS.concrete);
    setLocal(hidden, 8, 8, 9, PALETTE_SLOTS.concrete);
    expect(greedyMesh(hidden).detailQuadCount).toBe(0);
  });

  it('rende sottile una gamba ordinaria senza cambiare il volume sorgente', () => {
    const padded = volume();
    const pier = packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.utility);
    for (let z = 4; z < 12; z++) {
      for (let y = 8; y < 10; y++) {
        for (let x = 8; x < 10; x++) setLocal(padded, x, y, z, pier);
      }
    }
    const original = padded.slice();

    const mesh = greedyMesh(padded, undefined, undefined, [32, 64, 0]);
    const xs = [...mesh.positions].filter((_, index) => index % 3 === 0);

    // Il 2 x 2 logico occuperebbe [128, 160]; il fusto visibile resta nel mezzo
    // e tutta la mesh appartiene al dettaglio, perche' i cubi sono stati levati.
    expect(Math.min(...xs)).toBeGreaterThan(8 * MESH_UNITS_PER_VOXEL);
    expect(Math.max(...xs)).toBeLessThan(10 * MESH_UNITS_PER_VOXEL);
    expect(mesh.quadCount).toBe(mesh.detailQuadCount);
    expect(mesh.detailQuadCount).toBeGreaterThan(0);
    expect(padded).toEqual(original);
  });

  it('alterna teste dritte e arcuate, ma lascia pieno il pilone pesante', () => {
    const makePier = (surface: SurfaceKind): Uint8Array => {
      const padded = volume();
      const pier = packVisualBlock(PALETTE_SLOTS.concrete, surface);
      for (let z = 4; z < 12; z++) {
        for (let y = 8; y < 10; y++) {
          for (let x = 8; x < 10; x++) setLocal(padded, x, y, z, pier);
        }
      }
      return padded;
    };

    const variants = new Set<number>();
    for (let cx = 0; cx < 8; cx++) {
      variants.add(greedyMesh(
        makePier(SURFACE_KIND.utility),
        undefined,
        undefined,
        [cx * CHUNK, 0, 0],
      ).detailQuadCount);
    }
    expect(variants.size).toBe(2);

    const massive = greedyMesh(makePier(SURFACE_KIND.plain));
    expect(massive.detailQuadCount).toBe(0);
    expect(massive.quadCount).toBeGreaterThan(0);
  });

  it('usa il padding per non creare un parapetto sul confine condiviso', () => {
    const roof = packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech);
    const isolated = volume();
    setLocal(isolated, CHUNK - 1, 10, 10, roof);

    const connected = isolated.slice();
    setLocal(connected, CHUNK, 10, 10, roof);

    // Il vicino oltre confine toglie l'intero parapetto +X (5 quad) e sopprime
    // una testata per ciascuno dei due parapetti ortogonali (1 quad l'una): le
    // chiude il chunk accanto, che dal suo lato vede lo stesso confine.
    expect(greedyMesh(isolated).detailQuadCount).toBe(20);
    expect(greedyMesh(connected).detailQuadCount).toBe(13);
  });

  it('fonde una corsa di parapetto in un solo prisma, qualunque sia la lunghezza', () => {
    const roof = packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech);

    // Un tetto lungo `length` celle: i due parapetti che gli corrono a fianco
    // sono una corsa sola, e i due di testa restano lunghi una cella. Quattro
    // prismi da cinque facce, indipendenti dalla lunghezza: e' esattamente la
    // proprieta' che tiene il costo dei dettagli fuori dal numero di voxel.
    for (const length of [2, 3, 5, 8, 16]) {
      const padded = volume();
      for (let i = 0; i < length; i++) setLocal(padded, 10, 10 + i, 10, roof);
      expect(greedyMesh(padded).detailQuadCount).toBe(20);
    }
  });

  it('tiene continua la cornice luminosa invece di spezzarla per cella', () => {
    const glow = packVisualBlock(PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous);
    const padded = volume();
    for (let i = 0; i < 4; i++) setLocal(padded, 10, 10 + i, 10, glow);

    const y = [...detailPositions(greedyMesh(padded))].filter((_, i) => i % 3 === 1);

    // Il traverso rientra di 1/16 ai due estremi veri della fascia...
    expect(y).toContain(10 * MESH_UNITS_PER_VOXEL + 1);
    expect(y).toContain(14 * MESH_UNITS_PER_VOXEL - 1);
    // ...e non ai confini fra una cella e l'altra, dove un prisma per cella
    // lascerebbe due sedicesimi di buco sotto una testata gia' soppressa.
    expect(y).not.toContain(11 * MESH_UNITS_PER_VOXEL + 1);
    expect(y).not.toContain(12 * MESH_UNITS_PER_VOXEL - 1);
  });

  it('estende l AABB sopra il chunk per un parapetto in quota 32', () => {
    const padded = volume();
    setLocal(padded, 10, 10, CHUNK - 1, packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech));

    const mesh = greedyMesh(padded);

    expect(mesh.max[2]).toBe(CHUNK + 3 / MESH_UNITS_PER_VOXEL);
  });

  it('e deterministica, privilegia i portali e non sfonda il tetto', () => {
    const padded = volume();
    setLocal(padded, CHUNK - 1, CHUNK - 1, CHUNK - 1, packVisualBlock(PALETTE_SLOTS.glassDark, SURFACE_KIND.portal));
    // Voxel civici isolati: ognuno chiede otto prismi che nessuna corsa puo'
    // fondere, ed e' il modo piu' rapido per sfondare il tetto.
    for (let z = 0; z < CHUNK; z += 2) {
      for (let y = 0; y < CHUNK; y += 2) {
        for (let x = 0; x < CHUNK; x += 2) {
          setLocal(padded, x, y, z, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));
        }
      }
    }

    const first = greedyMesh(padded);
    const second = greedyMesh(padded);
    const detailVertex = (first.quadCount - first.detailQuadCount) * 4;

    expect(first.detailQuadCount).toBeLessThanOrEqual(MAX_DETAIL_QUADS_PER_CHUNK);
    expect(first.detailQuadCount).toBeGreaterThan(MAX_DETAIL_QUADS_PER_CHUNK - 64);
    expect(first.palettes[detailVertex]).toBe(PALETTE_SLOTS.metalBrass);
    expectSameArray(first.positions, second.positions, 'positions');
    expectSameArray(first.indices, second.indices, 'indices');
    expect(first.detailQuadCount).toBe(second.detailQuadCount);
  });

  it('la tenda si aggancia all ingresso, non alla parete', () => {
    // Due pareti identiche: sotto una c'e' un portale, sotto l'altra no. E'
    // l'aggancio a fare il prop, quindi solo la prima deve arredarsi.
    const withDoor = volume();
    const withoutDoor = volume();
    for (let z = 0; z < 8; z++) {
      const door = z < 4;
      setLocal(withDoor, 8, 8, z, packVisualBlock(
        PALETTE_SLOTS.concrete,
        door ? SURFACE_KIND.portal : SURFACE_KIND.habitat,
      ));
      setLocal(withoutDoor, 8, 8, z, packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.habitat));
    }

    const armed = greedyMesh(withDoor);
    const bare = greedyMesh(withoutDoor);
    expect(detailPalettes(armed)).toContain(PALETTE_SLOTS.roofPale);
    expect(detailPalettes(bare)).not.toContain(PALETTE_SLOTS.roofPale);
  });

  it('un insegna esce luminosa e un condizionatore no: e la stessa emitBox', () => {
    const padded = volume();
    // Una fila lunga di fronti con ingresso: fra tanti tiri, qualche insegna esce.
    for (let y = 2; y < CHUNK - 2; y++) {
      for (let z = 0; z < 8; z++) {
        setLocal(padded, 8, y, z, packVisualBlock(
          PALETTE_SLOTS.concrete,
          z < 4 ? SURFACE_KIND.portal : SURFACE_KIND.habitat,
        ));
      }
    }

    const mesh = greedyMesh(padded);
    const surfaces = detailSurfaces(mesh);
    expect(surfaces).toContain(SURFACE_KIND.luminous);
    // Il resto del dettaglio resta metallo strutturale: la superficie e' una
    // scelta per prisma, non un interruttore globale.
    expect(surfaces).toContain(SURFACE_KIND.utility);
  });

  it('un rampicante e una corsa sola, non una macchia per voxel', () => {
    // Il tiro dei rampicanti non guarda la quota: e' quello che tiene continua
    // la colonna. Con un tiro per cella la corsa si spezzerebbe a ogni voxel e
    // una parete costerebbe un prisma per cubo invece di uno per colonna.
    const padded = volume();
    for (let y = 2; y < CHUNK - 2; y++) {
      for (let z = 0; z < 12; z++) {
        setLocal(padded, 8, y, z, packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.habitat));
      }
    }

    const mesh = greedyMesh(padded);
    const green = detailPalettes(mesh).filter((id) => id === PALETTE_SLOTS.grassDark).length / 4;
    expect(green).toBeGreaterThan(0);
    // Cinque facce per colonna: se la corsa si spezzasse, sarebbero cinque per
    // ogni cubo della colonna, cioe' dodici volte tanto.
    expect(green % 5).toBe(0);
    expect(green).toBeLessThan(5 * 12);
  });

  it('la scelta del prop segue le coordinate di mondo, non quelle di chunk', () => {
    // Stesso volume, due origini: se il seme fosse locale i due chunk
    // arrederebbero le stesse celle, e su una facciata lunga la ripetizione ogni
    // trentadue voxel si vedrebbe.
    const padded = volume();
    for (let y = 1; y < CHUNK - 1; y++) {
      for (let z = 1; z < CHUNK - 1; z++) {
        setLocal(padded, 8, y, z, packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.habitat));
      }
    }

    const here = greedyMesh(padded, undefined, undefined, [0, 0, 0]);
    const faraway = greedyMesh(padded, undefined, undefined, [0, CHUNK, 0]);
    expect(here.detailQuadCount).toBeGreaterThan(0);
    expect(detailPositions(faraway)).not.toEqual(detailPositions(here));

    // E l'origine omessa e' l'origine, non un valore qualunque.
    expect(detailPositions(greedyMesh(padded))).toEqual(detailPositions(here));
  });

  it('mette il finiale sulla colonna isolata e non sulla parete', () => {
    // Il difetto da cui nasce: ogni ciminiera, guglia e gamba di gru finiva su
    // un quadrato piatto largo quanto il fusto, che a distanza isometrica e'
    // cio' che fa leggere un prisma come un prisma.
    const spire = volume();
    for (let z = 0; z < 10; z++) {
      setLocal(spire, 8, 8, z, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));
    }

    const mesh = greedyMesh(spire);
    const zs = [...detailPositions(mesh)].filter((_, i) => i % 3 === 2);
    // L'ago arriva a 9/16 sopra il voxel di sommita': se il finiale non fosse
    // scattato, nessun dettaglio supererebbe il filo della colonna.
    expect(Math.max(...zs)).toBe(10 * MESH_UNITS_PER_VOXEL + 9);
    expect(detailPalettes(mesh)).toContain(PALETTE_SLOTS.metalBrass);

    // Una parete e' fatta delle stesse celle e non ne ha nessuno: cio' che
    // distingue una guglia e' non avere vicini in piano, non essere alta.
    const wall = volume();
    for (let y = 4; y < 12; y++) {
      for (let z = 0; z < 10; z++) {
        setLocal(wall, 8, y, z, packVisualBlock(PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic));
      }
    }
    const flat = [...detailPositions(greedyMesh(wall))].filter((_, i) => i % 3 === 2);
    expect(Math.max(...flat)).toBeLessThanOrEqual(10 * MESH_UNITS_PER_VOXEL);
  });

  it('fascia lo sbalzo lungo il suo filo, non cella per cella', () => {
    // Un braccio a sbalzo con una sola gamba: le celle oltre la gamba hanno aria
    // sotto, ed e' li' che il voxel mostrava la faccia nuda.
    //
    // Il suolo a quota zero non e' arredamento del test. Senza, la gamba stessa
    // ha aria sotto e si fascia il piede: nel mondo li' c'e' sempre terreno, e
    // una fixture che lo omette misura un caso che non esiste.
    const padded = volume();
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        setLocal(padded, x, y, 0, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.plain));
      }
    }
    for (let z = 1; z < 11; z++) {
      setLocal(padded, 4, 6, z, packVisualBlock(PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial));
    }
    for (let x = 4; x < 16; x++) {
      setLocal(padded, x, 6, 11, packVisualBlock(PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial));
    }

    const mesh = greedyMesh(padded);
    const zs = [...detailPositions(mesh)].filter((_, i) => i % 3 === 2);
    // La fascia scende 3/16 sotto l'intradosso. Non e' il minimo assoluto del
    // chunk — le nervature di facciata della gamba partono piu' in basso — ed e'
    // per questo che si cerca il piano, non il minimo.
    const plane = 11 * MESH_UNITS_PER_VOXEL - 3;
    expect(zs).toContain(plane);

    // Tre corse: i due fianchi e la testata, che e' il filo in punta al braccio
    // e va fasciato quanto i lati. Dodici vertici a testa cadono su quel piano;
    // una fascia per cella ne porterebbe dieci volte tanto, ed e' esattamente il
    // costo che `emitRuns` evita.
    const onPlane = zs.filter((z) => z === plane).length;
    expect(onPlane).toBeGreaterThan(0);
    expect(onPlane).toBeLessThanOrEqual(3 * 12);
  });

  it('su un chunk fitto di edifici veri il tetto non tronca, e si vede quanto margine resta', () => {
    const mesh = greedyMesh(densityChunk());
    console.info(`[misura] dettaglio su chunk fitto: ${mesh.detailQuadCount} quad`);
    expect(mesh.detailQuadCount).toBeLessThan(MAX_DETAIL_QUADS_PER_CHUNK);
  });

  it('su un isolato fitto di edifici piccoli il tetto non tronca', () => {
    // **La misura che decide se un emettitore nuovo ci sta.** Il caso denso non
    // e' il volume piu' pieno ma quello con piu' **agganci**: molte facciate
    // corte, molti tetti, molti ingressi. Se questo numero arriva al tetto, a
    // sparire non e' un dettaglio ma la coda della sequenza — industrial e civic
    // a meta' chunk — e si vede.
    const mesh = greedyMesh(blockChunk());
    console.info(`[misura] isolato fitto: ${mesh.detailQuadCount} quad`);
    expect(mesh.detailQuadCount).toBeLessThan(MAX_DETAIL_QUADS_PER_CHUNK);
  });
});
