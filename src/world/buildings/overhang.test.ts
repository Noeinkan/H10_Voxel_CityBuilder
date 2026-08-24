import { describe, expect, it } from 'vitest';
import {
  ALL_CLASSES,
  BUILDING_CLASS,
  addCatalyst,
  createSimState,
  tick,
  type BuildingClass,
} from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import { CHUNK } from '../chunkCoords';
import { BuildingRegistry, envelopeOf, type BuildingRecord } from './BuildingRegistry';
import { dirtyChunkCount } from './chunkBudget';
import {
  BAND_OP,
  BUILDER,
  CLASS_PROFILE,
  DEFAULT_TYPOLOGY_SHAPE,
  GRAMMAR,
  MAX_FOOTPRINT,
  type TypologyShape,
} from './config';
import { generateBuilding, groundSideOf, overhangFor } from './generate';
import { STAMP_EMPTY, stampFootprint, type VoxelStamp } from './stamp';

/**
 * Lo sbalzo: l'unica cosa del dominio che esca dall'impronta.
 *
 * Rompe un invariante che `generate.ts` dichiarava a parole — «nessuna fascia
 * puo' uscire dall'impronta» — e lo sostituisce con due che vanno tenuti insieme:
 * **nessuna fascia esce dall'inviluppo**, e **l'inviluppo non prende suolo**.
 * Questi test sono la seconda meta' di quella sostituzione.
 */

const FACES = [0, 1, 2, 3] as const;

function shapeWith(overrides: Partial<TypologyShape>): TypologyShape {
  return { ...DEFAULT_TYPOLOGY_SHAPE, ...overrides };
}

/** Un repertorio che sporge appena puo': isola l'effetto della voce nuova. */
function juttingProfile(cls: BuildingClass) {
  return {
    ...CLASS_PROFILE[cls],
    shrinkBias: 0,
    growOps: [BAND_OP.jut, BAND_OP.keep],
    shrinkOps: [BAND_OP.jut, BAND_OP.keep],
  };
}

function jutting(cls: BuildingClass, facing: number, seed: number, over = 2): VoxelStamp {
  return generateBuilding({
    class: cls,
    level: 8,
    seed,
    facing,
    profile: juttingProfile(cls),
    shape: shapeWith({ overhang: over, minFootprint: 8 }),
  });
}

describe('overhangFor', () => {
  it('senza fronte strada non si sporge', () => {
    // Il verso arriverebbe dal tiro d'accento, e chi ricostruisce l'inviluppo dal
    // solo record non saprebbe da che parte guardare.
    expect(overhangFor(shapeWith({ overhang: 2 }), undefined)).toBe(0);
  });

  it('non supera il tetto della grammatica', () => {
    expect(overhangFor(shapeWith({ overhang: 99 }), 0)).toBe(GRAMMAR.maxOverhang);
    expect(overhangFor(shapeWith({ overhang: -3 }), 0)).toBe(0);
  });
});

describe('l inviluppo dello stamp', () => {
  it('cresce sull asse del fronte e su nessun altro', () => {
    for (const cls of ALL_CLASSES) {
      for (const facing of FACES) {
        const plain = generateBuilding({
          class: cls as BuildingClass,
          level: 8,
          seed: 55,
          facing,
          profile: juttingProfile(cls as BuildingClass),
          shape: shapeWith({ minFootprint: 8 }),
        });
        const wide = jutting(cls as BuildingClass, facing, 55);
        const label = `${cls} f${facing}`;

        if (facing <= 1) {
          expect(wide.sizeX, label).toBe(plain.sizeX + GRAMMAR.maxOverhang);
          expect(wide.sizeY, label).toBe(plain.sizeY);
        } else {
          expect(wide.sizeX, label).toBe(plain.sizeX);
          expect(wide.sizeY, label).toBe(plain.sizeY + GRAMMAR.maxOverhang);
        }
      }
    }
  });

  it('tiene l ancora sull angolo del lotto', () => {
    // E' la proprieta' che permette a `anchoredVoxel` e a `growthQueue` di non
    // cambiare di una riga: il sito che la simulazione propone resta la colonna
    // da cui l'impronta si estende, anche quando lo stamp comincia due colonne
    // piu' in la'.
    for (const facing of FACES) {
      const stamp = jutting(ALL_CLASSES[0] as BuildingClass, facing, 71);
      expect(stamp.anchorX, `f${facing} x`).toBe(facing === 1 ? GRAMMAR.maxOverhang : 0);
      expect(stamp.anchorY, `f${facing} y`).toBe(facing === 3 ? GRAMMAR.maxOverhang : 0);
    }
  });

  it('sotto la quota franca non sporge niente', () => {
    // Uno sbalzo a un voxel da terra non e' uno sbalzo, e' un ingombro sul
    // marciapiede: `stampFootprint` limitato alla quota franca deve coincidere
    // esattamente con il quadrato dell'impronta.
    for (const cls of ALL_CLASSES) {
      for (const facing of FACES) {
        for (let seed = 0; seed < 6; seed++) {
          const stamp = jutting(cls as BuildingClass, facing, seed * 313 + 11);
          const side = groundSideOf(stamp, GRAMMAR.maxOverhang, facing);
          const plan = stampFootprint(stamp, GRAMMAR.overhangFromZ);

          for (let sy = 0; sy < stamp.sizeY; sy++) {
            for (let sx = 0; sx < stamp.sizeX; sx++) {
              const inCore = sx >= stamp.anchorX && sx < stamp.anchorX + side &&
                sy >= stamp.anchorY && sy < stamp.anchorY + side;
              if (plan[sy * stamp.sizeX + sx] === 1) {
                expect(inCore, `${cls} f${facing} s${seed} (${sx},${sy}) fuori impronta`).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('sopra la quota franca sporge davvero', () => {
    // Senza questo, tutto il resto della fase verificherebbe una macchina spenta.
    let sporgenti = 0;
    for (const cls of ALL_CLASSES) {
      for (const facing of FACES) {
        for (let seed = 0; seed < 6; seed++) {
          const stamp = jutting(cls as BuildingClass, facing, seed * 977 + 3);
          const side = groundSideOf(stamp, GRAMMAR.maxOverhang, facing);
          const full = stampFootprint(stamp);
          for (let sy = 0; sy < stamp.sizeY; sy++) {
            for (let sx = 0; sx < stamp.sizeX; sx++) {
              const inCore = sx >= stamp.anchorX && sx < stamp.anchorX + side &&
                sy >= stamp.anchorY && sy < stamp.anchorY + side;
              if (!inCore && full[sy * stamp.sizeX + sx] === 1) sporgenti++;
            }
          }
        }
      }
    }
    expect(sporgenti).toBeGreaterThan(0);
  });

  it('a zero lascia lo stamp esattamente com era', () => {
    for (const cls of ALL_CLASSES) {
      for (const facing of FACES) {
        const plain = generateBuilding({
          class: cls as BuildingClass, level: 7, seed: 8123, facing,
        });
        const zero = generateBuilding({
          class: cls as BuildingClass, level: 7, seed: 8123, facing,
          shape: shapeWith({ overhang: 0 }),
        });
        expect(zero.anchorX).toBe(0);
        expect(zero.anchorY).toBe(0);
        expect(Array.from(zero.voxels), `${cls} f${facing}`).toEqual(Array.from(plain.voxels));
      }
    }
  });

  it('l impronta di suolo non dipende dallo sbalzo', () => {
    // `footprint` si tira molto prima di qualunque fascia, e lo sbalzo allarga il
    // solo *filtro* di `nextRect`: lo stesso seme deve dare la stessa impronta con
    // e senza. E' la proprieta' su cui poggia il ripiego del Builder — rinunciare
    // allo sbalzo e riprovare — e senza di lei quel ripiego cambierebbe lotto.
    for (const cls of ALL_CLASSES) {
      for (const facing of FACES) {
        for (let seed = 0; seed < 12; seed++) {
          const args = { class: cls as BuildingClass, level: 9, seed: seed * 617 + 2, facing };
          const straight = generateBuilding({ ...args, shape: shapeWith({ overhang: 0 }) });
          const wide = generateBuilding({ ...args, shape: shapeWith({ overhang: 2 }) });
          expect(groundSideOf(wide, 2, facing), `${cls} f${facing} s${seed}`)
            .toBe(straight.sizeX);
        }
      }
    }
  });
});

describe('envelopeOf', () => {
  it('e l identita senza sbalzo', () => {
    const record = { x: 10, y: -4, footprint: 8 };
    expect(envelopeOf(record)).toEqual({ x: 10, y: -4, sizeX: 8, sizeY: 8 });
    expect(envelopeOf({ ...record, overhang: 2 })).toEqual({ x: 10, y: -4, sizeX: 8, sizeY: 8 });
  });

  it('cresce dalla parte del fronte, e da nessun altra', () => {
    const base = { x: 10, y: -4, footprint: 8, overhang: 2 };
    expect(envelopeOf({ ...base, facing: 0 })).toEqual({ x: 10, y: -4, sizeX: 10, sizeY: 8 });
    expect(envelopeOf({ ...base, facing: 1 })).toEqual({ x: 8, y: -4, sizeX: 10, sizeY: 8 });
    expect(envelopeOf({ ...base, facing: 2 })).toEqual({ x: 10, y: -4, sizeX: 8, sizeY: 10 });
    expect(envelopeOf({ ...base, facing: 3 })).toEqual({ x: 10, y: -6, sizeX: 8, sizeY: 10 });
  });

  it('contiene sempre l impronta', () => {
    // Se non la contenesse, `index` indicizzerebbe in `groundColumns` colonne che
    // non ha mai messo in `columns`, e `remove` ne lascerebbe indietro.
    for (const facing of FACES) {
      const env = envelopeOf({ x: 3, y: 7, footprint: 6, overhang: 2, facing });
      expect(env.x).toBeLessThanOrEqual(3);
      expect(env.y).toBeLessThanOrEqual(7);
      expect(env.x + env.sizeX).toBeGreaterThanOrEqual(3 + 6);
      expect(env.y + env.sizeY).toBeGreaterThanOrEqual(7 + 6);
    }
  });
});

describe('il budget di chunk regge l inviluppo', () => {
  it('un inviluppo massimo non supera il tetto, su nessuna fase di cucitura', () => {
    // **Aritmetica, non stima.** Un tratto lungo `E` copre al massimo due colonne
    // di chunk finche' `E <= CHUNK - 1`, e `edgeChunks` non ne aggiunge una terza
    // quando ne attraversa gia' due. Il conto va rifatto e non ricordato: e' la
    // riga che salta per prima quando `MAX_FOOTPRINT` o `maxOverhang` cambiano.
    const side = MAX_FOOTPRINT + GRAMMAR.maxOverhang;
    expect(side).toBeLessThan(CHUNK);

    // Una torre di livello massimo supera i 140 voxel: si misura sul caso peggiore
    // vero, non su un'altezza comoda.
    const height = 160;
    for (let phase = 0; phase < CHUNK; phase++) {
      for (let zPhase = 0; zPhase < CHUNK; zPhase += 8) {
        const count = dirtyChunkCount(phase, phase, side, zPhase, zPhase + height, side);
        expect(count, `fase ${phase}/${zPhase}`)
          .toBeLessThanOrEqual(BUILDER.maxDirtyChunksPerBuilding);
      }
    }
  });

  it('l inviluppo resta dentro due colonne di chunk per asse', () => {
    // **E' la ragione per cui `maxDirtyChunksPerBuilding` non e' dovuto salire.**
    // Non che l'inviluppo costi *quanto* l'impronta — a certe fasi di cucitura
    // costa una colonna in piu', ed e' giusto cosi' — ma che il fattore
    // orizzontale resti **due per asse**, che e' il numero da cui il tetto e'
    // calcolato. Vale finche' il lato sta sotto `CHUNK`: sopra, comincerebbero a
    // essere tre e il tetto andrebbe rifatto.
    //
    // Si misura su un intervallo di quota tutto interno a un chunk, cosi' il
    // fattore verticale vale uno e quello che resta e' il solo conto in pianta.
    const side = MAX_FOOTPRINT + GRAMMAR.maxOverhang;
    for (let phase = 0; phase < CHUNK; phase++) {
      expect(dirtyChunkCount(phase, phase, side, 8, 16, side), `fase ${phase}`)
        .toBeLessThanOrEqual(2 * 2);
    }
  });
});

describe('uno sbalzo non prende suolo', () => {
  /** Un record che sporge di due verso est, a partire da (10, 10). */
  function sporgente(registry: BuildingRegistry): BuildingRecord {
    return registry.add({
      x: 10, y: 10, baseZ: 20, footprint: 6, height: 30,
      class: ALL_CLASSES[0] as BuildingClass, level: 4, seed: 1,
      facing: 0, overhang: 2,
    });
  }

  it('la striscia entra in columns e non in groundColumns', () => {
    // E' il complemento esatto dei due invarianti gemelli — «una campata non
    // prende suolo», «un impalcato lo prende solo con la gamba» — e si legge
    // dagli stessi due indici.
    const registry = new BuildingRegistry();
    sporgente(registry);

    // Dentro l'impronta: occupata in tutti e due i sensi.
    expect(registry.at(12, 12)).toHaveLength(1);
    expect(registry.isOccupied(12, 12)).toBe(true);

    // Sotto lo sbalzo: `columns` la vede — niente si costruisce *attraverso* —
    // ma il suolo resta libero, quindi li' nasce ancora un lotto e la
    // carreggiata si dipinge ancora.
    for (const sx of [16, 17]) {
      expect(registry.at(sx, 12), `x=${sx}`).toHaveLength(1);
      expect(registry.isOccupied(sx, 12), `x=${sx}`).toBe(false);
    }

    // Oltre lo sbalzo: niente.
    expect(registry.at(18, 12)).toHaveLength(0);
  });

  it('overlaps vieta la stessa quota e concede quelle disgiunte', () => {
    const registry = new BuildingRegistry();
    sporgente(registry); // z 20..49

    // Dentro la striscia, alla stessa quota: vietato.
    expect(registry.overlaps(16, 10, 1, 30, 4)).toBe(true);
    // Dentro la striscia, sopra la cima: concesso — e' il motivo per cui
    // prenotare aria non toglie niente a nessuno.
    expect(registry.overlaps(16, 10, 1, 50, 4)).toBe(false);
    // Sotto la base, idem.
    expect(registry.overlaps(16, 10, 1, 10, 5)).toBe(false);
  });

  it('remove non lascia indietro la striscia', () => {
    // Il difetto che si prende togliendo dalla sola impronta: l'id resterebbe in
    // `columns` per sempre, e quelle colonne sarebbero occupate da un edificio
    // che non esiste piu'. Non lancia niente, e non si vede finche' qualcuno non
    // prova a costruirci.
    const registry = new BuildingRegistry();
    const stored = sporgente(registry);

    expect(registry.remove(stored.id)).toBe(true);
    for (const sx of [10, 12, 15, 16, 17]) {
      expect(registry.at(sx, 12), `x=${sx}`).toHaveLength(0);
    }
    expect(registry.overlaps(16, 10, 1, 30, 4)).toBe(false);
  });

  it('due vicini accostati con sbalzi opposti non collidono', () => {
    // **E' il vincolo che rende lo sbalzo direzionale invece che simmetrico.**
    // Con un inviluppo simmetrico due membri di una fila si vieterebbero a
    // vicenda, e con loro cadrebbe l'aggregazione in isolati — cioe' il modo in
    // cui questa citta' fa i fronti continui.
    const registry = new BuildingRegistry();
    // A guarda a ovest e sporge verso x calanti; B gli sta accosto a est.
    registry.add({
      x: 10, y: 10, baseZ: 20, footprint: 6, height: 30,
      class: ALL_CLASSES[0] as BuildingClass, level: 4, seed: 1,
      facing: 1, overhang: 2,
    });
    const envB = envelopeOf({ x: 16, y: 10, footprint: 6, overhang: 2, facing: 0 });
    expect(registry.overlaps(envB.x, envB.y, envB.sizeX, 20, 30, envB.sizeY)).toBe(false);
  });
});

describe('in una citta vera', () => {
  function grow(builds: number): readonly BuildingRecord[] {
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const builder = new Builder(new VoxelWorld(), terrain, 1337);

    let state = createSimState();
    for (const [x, y] of [[100, 100], [120, 100], [110, 120]] as const) {
      state = addCatalyst(state, {
        x, y, kind: 'market', class: BUILDING_CLASS.commercial, strength: 255, radius: 60,
      });
    }
    for (let i = 0; i < builds * BUILDER.ticksPerBuild; i++) {
      state = tick(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return [...builder.registry.all].filter((record) =>
      record.landmark === undefined && record.span === undefined && record.aerial === undefined);
  }

  it('qualche edificio sporge davvero', () => {
    // Senza questo, tutta la fase verificherebbe una macchina che nessuna riga
    // di catalogo accende mai.
    const records = grow(60);
    expect(records.length).toBeGreaterThan(30);
    expect(records.filter((r) => (r.overhang ?? 0) > 0).length).toBeGreaterThan(0);
  });

  it('nessuna striscia di sbalzo attraversa un vicino', () => {
    // **E' la proprieta' che rende lo sbalzo sicuro**, ed e' scritta come
    // differenza invece che in assoluto: cio' che questa fase deve garantire e'
    // che *lo sbalzo* non crei una sovrapposizione, non che la citta' non ne
    // abbia nessuna.
    //
    // La distinzione non e' accademica. Il confronto assoluto cade su una coppia
    // che non c'entra niente con gli sbalzi: un edificio nato su un impalcato in
    // quota e una torre a terra che **cresce fin dentro di lui**, perche' la
    // passata di promozione controlla il budget di chunk e le campate ma non
    // interroga `overlaps` per il volume nuovo. E' un difetto che c'era gia', non
    // lo introduce lo sbalzo, e correggerlo qui vorrebbe dire fermare la crescita
    // verticale sotto ogni impalcato — una decisione di gioco, non un ritocco.
    const records = grow(60);
    const boxes = records.map((r) => ({ record: r, env: envelopeOf(r) }));
    const overlaps = (
      a: { x: number; y: number; sizeX: number; sizeY: number },
      b: { x: number; y: number; sizeX: number; sizeY: number },
    ): boolean => a.x < b.x + b.sizeX && b.x < a.x + a.sizeX &&
      a.y < b.y + b.sizeY && b.y < a.y + a.sizeY;

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const zOverlap =
          a.record.baseZ < b.record.baseZ + b.record.height &&
          b.record.baseZ < a.record.baseZ + a.record.height;
        if (!zOverlap) continue;
        if (!overlaps(a.env, b.env)) continue;

        // Le impronte nude: se si toccavano gia' loro, la striscia non c'entra.
        const coreA = { x: a.record.x, y: a.record.y, sizeX: a.record.footprint, sizeY: a.record.footprint };
        const coreB = { x: b.record.x, y: b.record.y, sizeX: b.record.footprint, sizeY: b.record.footprint };
        expect(overlaps(coreA, coreB), `${a.record.id} e ${b.record.id}: e' lo sbalzo ad attraversare`)
          .toBe(true);
      }
    }
  });

  it('sotto uno sbalzo il suolo resta di chi ci sta', () => {
    // Il complemento: `columns` vieta di attraversare, `groundColumns` lascia il
    // suolo libero. Se le due coincidessero, uno sbalzo toglierebbe marciapiede.
    const records = grow(60);
    const sporgenti = records.filter((r) => (r.overhang ?? 0) > 0);
    expect(sporgenti.length).toBeGreaterThan(0);

    for (const record of sporgenti) {
      const env = envelopeOf(record);
      const over = record.overhang as number;
      // Le colonne della sola striscia, cioe' l'inviluppo meno l'impronta.
      let strip = 0;
      for (let dy = 0; dy < env.sizeY; dy++) {
        for (let dx = 0; dx < env.sizeX; dx++) {
          const cx = env.x + dx;
          const cy = env.y + dy;
          const inCore = cx >= record.x && cx < record.x + record.footprint &&
            cy >= record.y && cy < record.y + record.footprint;
          if (!inCore) strip++;
        }
      }
      expect(strip, `record ${record.id}`).toBe(over * record.footprint);
    }
  });
});

describe('lo stamp non si spezza mai in ritagli', () => {
  it('l inviluppo massimo sta sotto il segmento', () => {
    // `sliceStamps` azzera l'ancora nei ritagli (`cutout`), quindi su uno stamp
    // che sporge darebbe pezzi ancorati male. Non capita perche' l'inviluppo e'
    // molto piu' stretto di `segmentSide` — ma va **dimostrato**, non sperato: e'
    // esattamente il tipo di assunzione che salta al prossimo cambio di scala.
    expect(MAX_FOOTPRINT + GRAMMAR.maxOverhang).toBeLessThanOrEqual(BUILDER.segmentSide);
  });
});

describe('la fascia zero resta piena', () => {
  it('nessuno sbalzo buca l impronta al piano terra', () => {
    // La fondazione livella l'impronta e la fascia zero la riempie: se lo sbalzo
    // spostasse la fascia invece di allargarla, sotto resterebbe terra spianata
    // e scoperta.
    for (const cls of ALL_CLASSES) {
      for (const facing of FACES) {
        const stamp = jutting(cls as BuildingClass, facing, 4242);
        const side = groundSideOf(stamp, GRAMMAR.maxOverhang, facing);
        for (let dy = 0; dy < side; dy++) {
          for (let dx = 0; dx < side; dx++) {
            const sx = stamp.anchorX + dx;
            const sy = stamp.anchorY + dy;
            expect(stamp.voxels[sx + stamp.sizeX * sy], `${cls} f${facing} (${dx},${dy})`)
              .not.toBe(STAMP_EMPTY);
          }
        }
      }
    }
  });
});
