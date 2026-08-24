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
  type BandOp,
  type TypologyShape,
} from './config';
import { generateBuilding } from './generate';
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
