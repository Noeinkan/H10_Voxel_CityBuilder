import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, type BuildingClass } from '../../sim';
import { inPlan } from '../planMask';
import {
  BAND_OP,
  BUILDER,
  CLASS_PROFILE,
  CROWN_KIND,
  DEFAULT_TYPOLOGY_SHAPE,
  GRAMMAR,
  MAX_FOOTPRINT,
  TYPOLOGIES,
  type BandOp,
  type TypologyShape,
} from './config';
import { generateBuilding } from './generate';
import { typologyProfile } from './typology';
import { nextRect } from './bandOps';
import type { BandRect } from './bandRect';
import { mulberry32 } from '../rng';
import { SURFACE_KIND } from '../visualBlock';
import { STAMP_EMPTY, type VoxelStamp } from './stamp';

/**
 * Le forme che la fase 2 aggiunge: smusso, portico e falda.
 *
 * Tutte e tre sono **opt-in da catalogo**, e il primo gruppo di test verifica
 * proprio quello: senza una riga che le chieda, la citta' e' identica a prima.
 * E' la stessa garanzia che `generateDigest.test.ts` da' sulla grammatica, letta
 * dal capo dei tre interruttori nuovi.
 */

function shapeWith(overrides: Partial<TypologyShape>): TypologyShape {
  return { ...DEFAULT_TYPOLOGY_SHAPE, ...overrides };
}

/** Le colonne piene di una fascia, per quota. */
function solidAt(stamp: VoxelStamp, sz: number): number {
  let count = 0;
  const plane = stamp.sizeX * stamp.sizeY;
  for (let i = 0; i < plane; i++) {
    if (stamp.voxels[plane * sz + i] !== STAMP_EMPTY) count++;
  }
  return count;
}

/** Firma verticale: quante colonne piene a ogni quota. */
function profileOf(stamp: VoxelStamp): readonly number[] {
  const out: number[] = [];
  for (let sz = 0; sz < stamp.sizeZ; sz++) out.push(solidAt(stamp, sz));
  return out;
}

describe('lo smusso', () => {
  it('e simmetrico allo scambio degli assi', () => {
    // E' la condizione che rende `orientPart` corretto sui landmark, e vale qui
    // per la stessa ragione: i quattro versi d'accento devono dare la stessa
    // pianta, o un edificio cambierebbe forma a seconda della strada su cui si
    // affaccia.
    for (let w = 3; w <= 12; w++) {
      for (let h = 3; h <= 12; h++) {
        for (let chamfer = 0; chamfer <= GRAMMAR.maxChamfer; chamfer++) {
          for (let lx = 0; lx < w; lx++) {
            for (let ly = 0; ly < h; ly++) {
              expect(
                inPlan(lx, ly, w, h, chamfer),
                `${w}x${h} c${chamfer} (${lx},${ly})`,
              ).toBe(inPlan(ly, lx, h, w, chamfer));
            }
          }
        }
      }
    }
  });

  it('non si mangia piu di meta fascia, nemmeno su un lato da quattro', () => {
    // Il difetto per cui il tetto **per fascia** esiste: il taglio di Manhattan
    // toglie `chamfer` a *ciascuno* dei due assi, quindi su un lato da quattro
    // uno smusso da due lascia in piedi il solo quadrato centrale da due — un
    // palo, non un ottagono. E una torre alta scende a `minBandSide` entro il
    // primo quinto, quindi il caso non e' raro: e' ogni torre.
    //
    // Si misura contro la stessa sagoma senza smusso, e non contro un numero
    // assoluto: un minimo scritto a mano lo passerebbe anche il palo da 2x2,
    // che e' esattamente il difetto da cui questo test guarda.
    for (const cls of ALL_CLASSES) {
      for (let level = 0; level <= BUILDER.maxLevel; level++) {
        for (let seed = 0; seed < 8; seed++) {
          const request = { class: cls as BuildingClass, level, seed: seed * 7919 + 13 };
          const sharp = generateBuilding({ ...request, shape: DEFAULT_TYPOLOGY_SHAPE });
          const round = generateBuilding({
            ...request,
            shape: shapeWith({ chamfer: GRAMMAR.maxChamfer }),
          });

          for (let sz = 0; sz < sharp.sizeZ; sz++) {
            const before = solidAt(sharp, sz);
            if (before === 0) continue;
            expect(solidAt(round, sz), `${cls} l${level} s${seed} z${sz} (${before} piene)`)
              .toBeGreaterThanOrEqual(before / 2);
          }
        }
      }
    }
  });

  it('toglie voxel e non ne aggiunge', () => {
    for (const cls of ALL_CLASSES) {
      for (let seed = 0; seed < 8; seed++) {
        const request = { class: cls as BuildingClass, level: 6, seed: seed * 31 + 5 };
        const sharp = generateBuilding({ ...request, shape: DEFAULT_TYPOLOGY_SHAPE });
        const round = generateBuilding({ ...request, shape: shapeWith({ chamfer: 1 }) });

        // Stesso riquadro e stessa altezza: lo smusso e' una maschera di pianta,
        // non una fascia in piu'. E' cio' che tiene collisione, budget di chunk e
        // cancellazione all'oscuro della sua esistenza.
        expect(round.sizeX).toBe(sharp.sizeX);
        expect(round.sizeY).toBe(sharp.sizeY);
        expect(round.sizeZ).toBe(sharp.sizeZ);
        expect(round.bandStarts).toEqual(sharp.bandStarts);

        for (let i = 0; i < sharp.voxels.length; i++) {
          if (round.voxels[i] === STAMP_EMPTY) continue;
          expect(round.voxels[i], `${cls} s${seed} i${i}`).toBe(sharp.voxels[i]);
        }
      }
    }
  });

  it('a zero lascia l edificio esattamente com era', () => {
    for (const cls of ALL_CLASSES) {
      for (let level = 0; level <= BUILDER.maxLevel; level += 3) {
        const request = { class: cls as BuildingClass, level, seed: 4242 };
        const plain = generateBuilding({ ...request, shape: DEFAULT_TYPOLOGY_SHAPE });
        const explicit = generateBuilding({ ...request, shape: shapeWith({ chamfer: 0 }) });
        expect(Array.from(explicit.voxels)).toEqual(Array.from(plain.voxels));
      }
    }
  });
});

describe('il portico', () => {
  /** Un'impronta larga: sotto `arcadeMinSide` il portico non si apre affatto. */
  const wide = { class: ALL_CLASSES[1] as BuildingClass, level: 6, seed: 991 };

  it('apre un vuoto sotto il pieno sul fronte d accento', () => {
    // E' l'unica cosa in tutta la grammatica che tolga volume invece di
    // spostarlo, ed e' quello che va verificato: che sotto ci sia aria e sopra
    // no. Un portico che non buca e' un piano terra dipinto.
    const walled = generateBuilding({ ...wide, facing: 0, shape: DEFAULT_TYPOLOGY_SHAPE });
    const open = generateBuilding({ ...wide, facing: 0, shape: shapeWith({ arcade: true }) });

    expect(open.sizeX).toBe(walled.sizeX);
    if (open.sizeX < GRAMMAR.arcadeMinSide) return;

    const ground = solidAt(open, 1);
    expect(ground).toBeLessThan(solidAt(walled, 1));

    // Sopra l'architrave il volume torna quello di prima: il portico e' alto
    // `arcadeHeight` e non un piano intero.
    expect(solidAt(open, GRAMMAR.arcadeHeight)).toBe(solidAt(walled, GRAMMAR.arcadeHeight));
  });

  it('lascia i cantonali pieni', () => {
    // Sono l'angolo su cui poggia il fronte: bucarli farebbe galleggiare lo
    // spigolo, ed e' la stessa ragione per cui la campata non li apre mai.
    const open = generateBuilding({ ...wide, facing: 0, shape: shapeWith({ arcade: true }) });
    if (open.sizeX < GRAMMAR.arcadeMinSide) return;

    const sx = open.sizeX - 1;
    const plane = open.sizeX * open.sizeY;
    for (const sy of [0, open.sizeY - 1]) {
      expect(open.voxels[plane * 1 + sx + open.sizeX * sy], `cantonale sy=${sy}`)
        .not.toBe(STAMP_EMPTY);
    }
  });

  it('e simmetrico sui quattro versi', () => {
    // I pilastri si contano dall'estremo piu' vicino, non da un capo: contati da
    // un capo, un fronte che non e' multiplo del passo si ritrova il pilastro su
    // un angolo e l'architrave nudo sull'altro, e i quattro versi darebbero
    // quattro portici diversi.
    const counts = [0, 1, 2, 3].map((facing) => {
      const stamp = generateBuilding({ ...wide, facing, shape: shapeWith({ arcade: true }) });
      return solidAt(stamp, 1);
    });
    expect(new Set(counts).size, `conteggi ${counts.join(',')}`).toBe(1);
  });

  it('spento lascia l edificio esattamente com era', () => {
    for (const cls of ALL_CLASSES) {
      const request = { class: cls as BuildingClass, level: 5, seed: 777, facing: 2 };
      const plain = generateBuilding({ ...request, shape: DEFAULT_TYPOLOGY_SHAPE });
      const explicit = generateBuilding({ ...request, shape: shapeWith({ arcade: false }) });
      expect(Array.from(explicit.voxels)).toEqual(Array.from(plain.voxels));
    }
  });
});

describe('la falda', () => {
  it('finisce su una linea invece che su un piano', () => {
    // E' l'unica cima del repertorio che lo faccia, ed e' cio' che la distingue
    // da `ridge`, che rientra una volta sola e resta un cappello lungo.
    const request = { class: ALL_CLASSES[0] as BuildingClass, level: 4, seed: 1234 };
    const gable = generateBuilding({
      ...request,
      shape: shapeWith({ crownKind: CROWN_KIND.gable, minFootprint: 8 }),
    });
    const ridge = generateBuilding({
      ...request,
      shape: shapeWith({ crownKind: CROWN_KIND.ridge, minFootprint: 8 }),
    });

    // La sommita' della falda e' piu' stretta di quella del cappello lungo.
    const gableTop = solidAt(gable, gable.sizeZ - 1);
    const ridgeTop = solidAt(ridge, ridge.sizeZ - 1);
    expect(gableTop).toBeLessThan(ridgeTop);
  });

  it('da una firma verticale distinta da ogni altra cima', () => {
    // Il test «cime distinguibili» che il progetto ha gia', esteso alla voce
    // nuova: due cime che producono la stessa silhouette sono una cima sola con
    // due nomi.
    const request = { class: ALL_CLASSES[0] as BuildingClass, level: 5, seed: 20260824 };
    const signatures = new Map<string, string>();
    for (const [name, kind] of Object.entries(CROWN_KIND)) {
      const stamp = generateBuilding({
        ...request,
        shape: shapeWith({ crownKind: kind, minFootprint: 8 }),
      });
      const signature = profileOf(stamp).join(',');
      const clash = signatures.get(signature);
      expect(clash, `${name} ha la stessa firma di ${clash}`).toBeUndefined();
      signatures.set(signature, name);
    }
  });
});

describe('la terrazza', () => {
  /** Un profilo che prova soltanto l'operazione indicata, a ogni fascia. */
  function onlyOp(op: BandOp) {
    return { ...CLASS_PROFILE[0], shrinkBias: 1, shrinkOps: [op], growOps: [op] };
  }

  /** Voxel verniciati di pavimentazione, e quanti di loro chiedono il parapetto. */
  function terraceOf(stamp: VoxelStamp): { paved: number; railed: number } {
    let paved = 0;
    let railed = 0;
    for (let i = 0; i < stamp.voxels.length; i++) {
      if (stamp.voxels[i] !== CLASS_PROFILE[0].terrace) continue;
      paved++;
      if (stamp.surfaces[i] === SURFACE_KIND.roofTech) railed++;
    }
    return { paved, railed };
  }

  it('un arretramento da due e una terrazza, e porta il parapetto', () => {
    let seen = 0;
    for (let seed = 0; seed < 40; seed++) {
      const stamp = generateBuilding({
        class: 0, level: 8, seed: seed * 313 + 11, profile: onlyOp(BAND_OP.setback),
      });
      const { paved, railed } = terraceOf(stamp);
      // Il parapetto arriva da `emitRoofTech`, che guarda la superficie: una
      // terrazza pavimentata e non dichiarata sarebbe un pavimento sul vuoto.
      expect(railed).toBe(paved);
      if (paved > 0) seen++;
    }
    expect(seen).toBeGreaterThan(30);
  });

  it('uno scarto da un voxel resta un gradino', () => {
    // **E' la regola che misura la striscia e non la fascia.** Il guardiano
    // diceva `rect.w >= 3`, che con `minBandSide: 4` era sempre vero: ogni
    // scarto usciva pavimentato col parapetto, e a schermo la terrazza non era
    // un luogo ma una cornice su ogni piano di ogni edificio.
    for (const op of [BAND_OP.jog, BAND_OP.shrinkOneSide, BAND_OP.shrink]) {
      for (let seed = 0; seed < 40; seed++) {
        const stamp = generateBuilding({
          class: 0, level: 8, seed: seed * 313 + 11, profile: onlyOp(op),
        });
        expect(terraceOf(stamp).paved, `op${op} s${seed}`).toBe(0);
      }
    }
  });

  it('lo scarto muove davvero la fascia: il test sopra non e vuoto', () => {
    // Senza questo, «nessuna terrazza» sarebbe soddisfatto anche da una
    // grammatica che ha smesso di spostare le fasce.
    const origins = new Set<string>();
    const stamp = generateBuilding({
      class: 0, level: 10, seed: 4242, profile: onlyOp(BAND_OP.jog),
    });
    const plane = stamp.sizeX * stamp.sizeY;
    for (let sz = 0; sz < stamp.sizeZ; sz++) {
      let minX = stamp.sizeX;
      let minY = stamp.sizeY;
      for (let sy = 0; sy < stamp.sizeY; sy++) {
        for (let sx = 0; sx < stamp.sizeX; sx++) {
          if (stamp.voxels[plane * sz + sx + stamp.sizeX * sy] === STAMP_EMPTY) continue;
          if (sx < minX) minX = sx;
          if (sy < minY) minY = sy;
        }
      }
      origins.add(`${minX},${minY}`);
    }
    expect(origins.size).toBeGreaterThan(1);
  });
});

describe('le trasformazioni nuove', () => {
  /** Un profilo che prova soltanto l'operazione indicata, per isolarne l'effetto. */
  function onlyOp(cls: BuildingClass, op: BandOp) {
    return { ...CLASS_PROFILE[cls], shrinkOps: [op], growOps: [op], shrinkBias: 0.5 };
  }

  it('non fanno mai uscire una fascia dall impronta', () => {
    // La guardia di `nextRect` non e' cambiata, ma le due voci nuove la mettono
    // alla prova in modo diverso: `shear` sposta di due invece che di uno, e
    // `corner` cambia entrambi i lati insieme.
    for (const op of [BAND_OP.shear, BAND_OP.corner]) {
      for (const cls of ALL_CLASSES) {
        for (let level = 0; level <= BUILDER.maxLevel; level += 2) {
          for (let seed = 0; seed < 12; seed++) {
            const stamp = generateBuilding({
              class: cls as BuildingClass,
              level,
              seed: seed * 613 + 7,
              profile: onlyOp(cls as BuildingClass, op),
            });
            const label = `op${op} ${cls} l${level} s${seed}`;
            // Una fascia uscita dal riquadro si vedrebbe qui: `paint` indicizza
            // su `footprint`, quindi scriverebbe fuori dal proprio piano.
            expect(stamp.sizeX, label).toBe(stamp.sizeY);
            expect(stamp.voxels.length, label).toBe(stamp.sizeX * stamp.sizeY * stamp.sizeZ);
            expect(stamp.sizeX, label).toBeLessThanOrEqual(MAX_FOOTPRINT);
          }
        }
      }
    }
  });

  it('il repertorio si pesca, non si prende in testa', () => {
    // Il difetto che `preferredStart` corregge: prendendo sempre la prima che
    // regge, le voci dietro comparivano solo dove la testa non stava in piedi.
    // Qui tutte e tre reggono, quindi con la regola vecchia il conto sarebbe
    // 200-0-0.
    const profile = {
      ...CLASS_PROFILE[0],
      shrinkBias: 1,
      shrinkOps: [BAND_OP.keep, BAND_OP.jog, BAND_OP.setback],
    };
    // La fascia sta **dentro** il riquadro con un voxel di gioco per lato: sul
    // filo dell'impronta uno scarto uscirebbe e la guardia lo scarterebbe, cioe'
    // si misurerebbe il vincolo invece della pesca.
    const prev: BandRect = { x0: 1, y0: 1, w: 6, h: 6 };
    const box = { sizeX: 8, sizeY: 8, face: 0 };
    const counts = { keep: 0, jog: 0, setback: 0, altro: 0 };

    for (let seed = 0; seed < 200; seed++) {
      const rect = nextRect(mulberry32(seed * 7919 + 1), prev, box, profile, null, false, prev);
      if (rect.w === prev.w && rect.h === prev.h) {
        if (rect.x0 === prev.x0 && rect.y0 === prev.y0) counts.keep++;
        else counts.jog++;
      } else if (rect.w === prev.w - 2 || rect.h === prev.h - 2) counts.setback++;
      else counts.altro++;
    }

    // Tutte e tre esistono davvero...
    expect(counts.keep).toBeGreaterThan(0);
    expect(counts.jog).toBeGreaterThan(0);
    expect(counts.setback).toBeGreaterThan(0);
    expect(counts.altro).toBe(0);
    // ...ma la testa resta la preferenza, non una fra tante: e' la meta' del
    // contratto che una pesca uniforme cancellerebbe, e con essa la frase
    // «questo uso arretra profondo quando puo'».
    expect(counts.keep).toBeGreaterThan(counts.jog);
    expect(counts.jog).toBeGreaterThan(counts.setback);
  });

  it('pesca senza legare la sequenza del PRNG all esito', () => {
    // I due tiri di `preferredStart` si consumano sempre, anche quando il
    // repertorio ha una voce sola e non c'e' niente da scegliere: e' cio' che
    // tiene `recordStamp` capace di ritrovare i voxel da cancellare.
    const profile = { ...CLASS_PROFILE[0], shrinkBias: 1, shrinkOps: [BAND_OP.jog] };
    const prev: BandRect = { x0: 1, y0: 1, w: 6, h: 6 };
    const box = { sizeX: 8, sizeY: 8, face: 0 };
    for (let seed = 0; seed < 20; seed++) {
      const a = mulberry32(seed * 613 + 5);
      const b = mulberry32(seed * 613 + 5);
      expect(nextRect(a, prev, box, profile, null, false, prev))
        .toEqual(nextRect(b, prev, box, profile, null, false, prev));
      // E dopo la fascia le due sequenze restano allineate: se una avesse
      // consumato un tiro in piu' dell'altra, il confronto cadrebbe qui.
      expect(a()).toBe(b());
    }
  });

  it('`corner` conserva il centro invece di scivolare in diagonale', () => {
    // Senza il ricentro, due `corner` di fila porterebbero il corpo fuori
    // dall'impronta invece di girarlo — e la guardia lo scarterebbe, cioe' la
    // voce non produrrebbe mai niente.
    let turned = 0;
    for (let seed = 0; seed < 40; seed++) {
      const stamp = generateBuilding({
        class: ALL_CLASSES[3] as BuildingClass,
        level: 8,
        seed: seed * 101 + 3,
        profile: onlyOp(ALL_CLASSES[3] as BuildingClass, BAND_OP.corner),
        shape: shapeWith({ minFootprint: 8 }),
      });
      // Se il ricentro funziona la voce viene accettata, quindi la sagoma non e'
      // un prisma: almeno due quote hanno un conto di colonne diverso.
      if (new Set(profileOf(stamp)).size > 2) turned++;
    }
    expect(turned).toBeGreaterThan(20);
  });
});

describe('il tessuto ordinario', () => {
  const fallbacks = TYPOLOGIES.filter((entry) => entry.priority === 0);

  it('usa vuoti o tagli anche quando il luogo non sblocca una tipologia rara', () => {
    expect(fallbacks).toHaveLength(ALL_CLASSES.length);

    for (const fallback of fallbacks) {
      const request = {
        class: fallback.use,
        level: 6,
        seed: 4817,
        facing: 0,
        profile: typologyProfile(fallback),
      };
      const carved = generateBuilding({ ...request, shape: fallback.shape });
      const solid = generateBuilding({
        ...request,
        shape: {
          ...fallback.shape,
          courtyard: false,
          chamfer: 0,
          arcade: false,
        },
      });

      expect(carved.sizeX, fallback.id).toBe(solid.sizeX);
      expect(carved.sizeY, fallback.id).toBe(solid.sizeY);
      expect(carved.sizeZ, fallback.id).toBe(solid.sizeZ);
      expect(
        carved.voxels.some((voxel, index) => voxel === STAMP_EMPTY && solid.voxels[index] !== STAMP_EMPTY),
        fallback.id,
      ).toBe(true);
    }
  });

  it('alterna sottrazione e nuova crescita invece di rastremare soltanto', () => {
    for (const fallback of fallbacks) {
      let regrown = 0;
      for (let seed = 0; seed < 40; seed++) {
        const stamp = generateBuilding({
          class: fallback.use,
          level: 8,
          seed: seed * 613 + 7,
          facing: 0,
          profile: typologyProfile(fallback),
          shape: fallback.shape,
        });
        let previous = solidAt(stamp, stamp.bandStarts[0]);
        let found = false;
        for (let band = 1; band < stamp.bandStarts.length - 1; band++) {
          const current = solidAt(stamp, stamp.bandStarts[band]);
          if (current > previous) found = true;
          previous = current;
        }
        if (found) regrown++;
      }
      expect(regrown, fallback.id).toBeGreaterThan(5);
    }
  });
});
