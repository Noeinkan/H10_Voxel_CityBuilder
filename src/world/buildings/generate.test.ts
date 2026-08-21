import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, type BuildingClass } from '../../sim';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import {
  BAND_OP,
  BUILDER,
  CLASS_PROFILE,
  CLUSTER,
  CROWN_KIND,
  DEFAULT_TYPOLOGY_SHAPE,
  GRAMMAR,
  LEVEL_CAPS,
  MAX_FOOTPRINT,
} from './config';
import { generateBuilding, startLevel } from './generate';
import { anchoredVoxel, STAMP_EMPTY, bandCount, solidCount, type VoxelStamp } from './stamp';
import { SURFACE_KIND } from '../visualBlock';
import { START_LEVEL_CDF } from './config';
import { TERRAIN } from '../terrain/config';

type StampCase = { stamp: VoxelStamp; cls: BuildingClass; level: number };

/** Tutte le combinazioni di classe e livello, con una manciata di seed. */
function* everyStamp(seeds = 24): Generator<StampCase> {
  for (const cls of ALL_CLASSES) {
    for (let level = 0; level <= BUILDER.maxLevel; level++) {
      for (let seed = 0; seed < seeds; seed++) {
        yield { stamp: generateBuilding({ class: cls, level, seed: seed * 7919 + 13 }), cls, level };
      }
    }
  }
}

describe('generateBuilding', () => {
  it('trasforma l\'ancora locale in una coordinata voxel 3D', () => {
    const stamp = generateBuilding({ class: ALL_CLASSES[0], level: 0, seed: 13 });
    const world = anchoredVoxel({ x: 40, y: -7, z: 23 }, stamp, stamp.anchorX, stamp.anchorY, stamp.anchorZ);
    expect(world).toEqual({ x: 40, y: -7, z: 23 });
  });

  it('e\' deterministico sugli stessi argomenti', () => {
    for (const cls of ALL_CLASSES) {
      for (let level = 0; level <= BUILDER.maxLevel; level++) {
        const a = generateBuilding({ class: cls, level, seed: 12345 });
        const b = generateBuilding({ class: cls, level, seed: 12345 });
        expect(b.sizeX).toBe(a.sizeX);
        expect(b.sizeY).toBe(a.sizeY);
        expect(b.sizeZ).toBe(a.sizeZ);
        expect(b.anchorX).toBe(a.anchorX);
        expect(b.anchorY).toBe(a.anchorY);
        expect(b.anchorZ).toBe(a.anchorZ);
        expect(Array.from(b.voxels)).toEqual(Array.from(a.voxels));
        expect(Array.from(b.surfaces)).toEqual(Array.from(a.surfaces));
        expect(b.bandStarts).toEqual(a.bandStarts);
      }
    }
  });

  it('cambia al variare del solo seed', () => {
    // Non ogni coppia deve differire — con impronta 1x1 lo spazio delle forme e'
    // piccolo — ma la stragrande maggioranza si', altrimenti il seed non conta.
    let different = 0;
    const total = 64;
    for (let seed = 0; seed < total; seed++) {
      const a = generateBuilding({ class: ALL_CLASSES[0], level: 3, seed });
      const b = generateBuilding({ class: ALL_CLASSES[0], level: 3, seed: seed + 1 });
      const same =
        a.sizeX === b.sizeX &&
        a.sizeZ === b.sizeZ &&
        Array.from(a.voxels).every((v, i) => v === b.voxels[i]);
      if (!same) different++;
    }
    expect(different).toBeGreaterThan(total * 0.9);
  });

  it('rispetta i tetti di impronta e di fasce del livello', () => {
    for (const { stamp, level } of everyStamp()) {
      const caps = LEVEL_CAPS[level];
      expect(stamp.sizeX).toBe(stamp.sizeY);
      expect(stamp.sizeX).toBeGreaterThanOrEqual(caps.minFootprint);
      expect(stamp.sizeX).toBeLessThanOrEqual(Math.min(caps.maxFootprint, MAX_FOOTPRINT));

      // Fasce del corpo, coronamento e unico dettaglio sul tetto.
      expect(bandCount(stamp)).toBeGreaterThanOrEqual(caps.minBands + 2);
      expect(bandCount(stamp)).toBeLessThanOrEqual(caps.maxBands + 2);
    }
  });

  it('un tetto di impronta pari a quella scelta restituisce lo stesso stamp', () => {
    // E' la proprieta' su cui poggia la cancellazione: il Builder rigenera
    // l'impronta di un edificio passandogli il footprint che ha in archivio.
    for (const cls of ALL_CLASSES) {
      for (let level = 0; level <= BUILDER.maxLevel; level++) {
        for (let seed = 0; seed < 32; seed++) {
          const natural = generateBuilding({ class: cls, level, seed });
          const capped = generateBuilding({ class: cls, level, seed, footprintCap: natural.sizeX });
          expect(Array.from(capped.voxels)).toEqual(Array.from(natural.voxels));
          expect(capped.sizeZ).toBe(natural.sizeZ);
        }
      }
    }
  });

  it('un tetto piu\' stretto restringe davvero l\'impronta', () => {
    for (const cls of ALL_CLASSES) {
      for (let seed = 0; seed < 32; seed++) {
        expect(generateBuilding({ class: cls, level: BUILDER.maxLevel, seed, footprintCap: 1 }).sizeX).toBe(1);
      }
    }
  });

  it('un upgrade puo allargarsi ma non restringe mai l\'impronta esistente', () => {
    for (const cls of ALL_CLASSES) {
      for (let level = 1; level <= BUILDER.maxLevel; level++) {
        for (let seed = 0; seed < 32; seed++) {
          const previous = generateBuilding({ class: cls, level: level - 1, seed });
          const upgraded = generateBuilding({
            class: cls,
            level,
            seed,
            footprintCap: MAX_FOOTPRINT,
            footprintFloor: previous.sizeX,
          });
          expect(upgraded.sizeX).toBeGreaterThanOrEqual(previous.sizeX);
        }
      }
    }
  });

  it('il corso di base condiviso sposta la quota e non la sagoma', () => {
    // E' il contratto su cui poggia tutta la 4.4: entrare in una fila cambia
    // l'altezza della fascia zero e nient'altro. Se toccasse anche la sequenza
    // del PRNG, due edifici sullo stesso seme smetterebbero di essere
    // confrontabili e un upgrade non riconoscerebbe piu' la sagoma da cancellare.
    for (const cls of ALL_CLASSES) {
      for (let level = 0; level <= BUILDER.maxLevel; level++) {
        for (let seed = 0; seed < 16; seed++) {
          const natural = generateBuilding({ class: cls, level, seed });
          const clustered = generateBuilding({
            class: cls,
            level,
            seed,
            baseBandHeight: CLUSTER.baseHeight,
          });

          expect(clustered.sizeX).toBe(natural.sizeX);
          expect(bandCount(clustered)).toBe(bandCount(natural));
          expect(clustered.bandStarts[1]).toBe(CLUSTER.baseHeight);

          // Ogni fascia sopra la zero conserva la propria altezza...
          for (let b = 1; b < bandCount(natural); b++) {
            expect(clustered.bandStarts[b + 1] - clustered.bandStarts[b])
              .toBe(natural.bandStarts[b + 1] - natural.bandStarts[b]);
          }

          // ...e i propri voxel, traslati della differenza di zoccolo.
          const shift = clustered.bandStarts[1] - natural.bandStarts[1];
          const plane = natural.sizeX * natural.sizeY;
          for (let sz = natural.bandStarts[1]; sz < natural.sizeZ; sz++) {
            expect(Array.from(clustered.voxels.slice(
              (sz + shift) * plane,
              (sz + shift + 1) * plane,
            ))).toEqual(Array.from(natural.voxels.slice(sz * plane, (sz + 1) * plane)));
          }
        }
      }
    }
  });

  it('non ha fasce sospese: ognuna poggia su almeno meta\' della propria area', () => {
    for (const { stamp } of everyStamp()) {
      for (let sz = 1; sz < stamp.sizeZ; sz++) {
        let area = 0;
        let supported = 0;
        for (let sy = 0; sy < stamp.sizeY; sy++) {
          for (let sx = 0; sx < stamp.sizeX; sx++) {
            const here = stamp.voxels[sx + stamp.sizeX * (sy + stamp.sizeY * sz)];
            if (here === STAMP_EMPTY) continue;
            area++;
            const below = stamp.voxels[sx + stamp.sizeX * (sy + stamp.sizeY * (sz - 1))];
            if (below !== STAMP_EMPTY) supported++;
          }
        }
        if (area === 0) continue;
        expect(supported * 2).toBeGreaterThanOrEqual(area);
      }
    }
  });

  it('nessun voxel esce dal riquadro e nessuno stamp e\' vuoto', () => {
    for (const { stamp } of everyStamp()) {
      expect(stamp.voxels.length).toBe(stamp.sizeX * stamp.sizeY * stamp.sizeZ);
      expect(stamp.surfaces.length).toBe(stamp.voxels.length);
      expect(solidCount(stamp)).toBeGreaterThan(0);
      expect(stamp.bandStarts[0]).toBe(0);
      expect(stamp.bandStarts[stamp.bandStarts.length - 1]).toBe(stamp.sizeZ);
    }
  });

  it('usa solo indici di palette validi', () => {
    // Un `expect` per voxel qui sono milioni di chiamate, ed e' l'assertion a
    // costare, non la generazione: si cerca il primo indice fuori scala e lo si
    // asserisce una volta sola, portando con se' il contesto per il messaggio.
    const slots = Object.keys(PALETTE_SLOTS).length;
    expect(firstStampWhere(everyStamp(8), ({ stamp }) => {
      for (const id of stamp.voxels) if (id < 0 || id >= slots) return `indice ${id} fuori dai ${slots} slot`;
      return null;
    })).toBeNull();
  });

  it('assegna una grammatica sci-fi a ogni voxel edilizio', () => {
    // Quattro usi su tre grammatiche: i tre bit alti di `visualBlock` sono
    // tutti impegnati, quindi il commerciale riusa quella del residenziale.
    const expected = [
      SURFACE_KIND.habitat,
      SURFACE_KIND.habitat,
      SURFACE_KIND.industrial,
      SURFACE_KIND.civic,
    ];
    expect(firstStampWhere(everyStamp(8), ({ stamp, cls }) => {
      const used = new Set<number>();
      for (let i = 0; i < stamp.voxels.length; i++) {
        const surface = stamp.surfaces[i];
        if (stamp.voxels[i] === STAMP_EMPTY) {
          if (surface !== SURFACE_KIND.plain) return `voxel vuoto con superficie ${surface}`;
        } else {
          used.add(surface);
          if (surface <= SURFACE_KIND.plain || surface > SURFACE_KIND.utility) {
            return `superficie ${surface} fuori dalla grammatica`;
          }
        }
      }
      if (!used.has(expected[cls])) return `manca la grammatica dell'uso ${cls}`;
      if (!used.has(SURFACE_KIND.roofTech)) return 'manca la grammatica di tetto';
      if (!used.has(SURFACE_KIND.utility)) return 'manca la grammatica di servizio';
      return null;
    })).toBeNull();
  });

  it('ha un unico dettaglio di tetto coerente con la classe', () => {
    let checked = 0;
    for (const { stamp, cls } of everyStamp(12)) {
      const top = stamp.sizeZ - 1;
      const topIds: number[] = [];
      for (let i = 0; i < stamp.sizeX * stamp.sizeY; i++) {
        const id = stamp.voxels[i + stamp.sizeX * stamp.sizeY * top];
        if (id !== STAMP_EMPTY) topIds.push(id);
      }
      // "Unico" e' il dettaglio, non il voxel: il prisma sul tetto e' largo
      // `roofPropSide` per lato, e tutti i suoi voxel sono dello stesso indice.
      expect(new Set(topIds)).toEqual(new Set([CLASS_PROFILE[cls].roofProp]));
      expect(topIds.length).toBeLessThanOrEqual(GRAMMAR.roofPropSide ** 2);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('produce uno skyline piu alto del rilievo, e una punta a matita', () => {
    let tallest = 0;
    for (let seed = 0; seed < 64; seed++) {
      const stamp = generateBuilding({ class: ALL_CLASSES[3], level: BUILDER.maxLevel, seed });
      tallest = Math.max(tallest, stamp.sizeZ);
      expect(stamp.sizeX).toBe(MAX_FOOTPRINT);
      // **La 4.6 ha cambiato questo numero, e va detto invece che allentato.**
      // Stava a dieci perche' il livello massimo era sei; con dodici la punta
      // arriva a diciannove a uno, cioe' una torre-matita. Non e' una
      // regressione tollerata: e' l'unica forma disponibile finche'
      // `MAX_FOOTPRINT` resta otto, e otto non puo' salire senza allargare
      // `STREETS.pitch` — l'isolato piu' stretto e' largo quattordici colonne.
      // Il tetto qui resta perche' *un* tetto serve: oltre venti a uno non e'
      // piu' una guglia, e' un filo.
      expect(stamp.sizeZ / stamp.sizeX).toBeLessThanOrEqual(20);
    }
    // Sedici-diciannove fasce da sei-otto voxel piu' coronamento e dettaglio: un
    // civico di livello massimo arriva a centocinquanta voxel. **E' il punto
    // della fase**, non un effetto collaterale: la torre di punta supera il
    // rilievo che la ospita, e da inquadratura d'insieme la citta' smette di
    // stare sotto la collina.
    expect(tallest).toBeGreaterThan(TERRAIN.maxHeight);
    expect(tallest).toBeGreaterThanOrEqual(140);
    expect(tallest).toBeLessThanOrEqual(165);
  });

  it('le tabelle indicizzate per livello coprono tutti i livelli', () => {
    // La rete che mancava, e che a ogni cambio di scala e' servita: con
    // `maxLevel` alzato e `START_LEVEL_CDF` fermo a sette voci, `startLevel`
    // leggeva `undefined`, il confronto era falso a ogni giro e **ogni** edificio
    // nasceva al livello massimo. Un difetto che non lancia niente e si vede solo
    // guardando la citta'.
    expect(LEVEL_CAPS).toHaveLength(BUILDER.maxLevel + 1);
    expect(START_LEVEL_CDF).toHaveLength(BUILDER.maxLevel + 1);
    // La cumulata resta una cumulata: non decresce e chiude a uno, altrimenti la
    // coda lunga diventa una coda che non finisce.
    for (let i = 1; i < START_LEVEL_CDF.length; i++) {
      expect(START_LEVEL_CDF[i]).toBeGreaterThanOrEqual(START_LEVEL_CDF[i - 1]);
    }
    expect(START_LEVEL_CDF[START_LEVEL_CDF.length - 1]).toBe(1);
  });

  it('porta una faccia d\x27accento con un indice diverso dal corpo', () => {
    // La fascia di base riempie sempre il riquadro, quindi su un'impronta larga
    // almeno due la prima quota sopra lo zoccolo contiene sia il corpo sia la
    // faccia: se la faccia d'accento non ci fosse, quella quota sarebbe di un
    // colore solo. Si guarda sopra lo zoccolo e non alla base perche' lo
    // zoccolo e' monocromo per definizione, ed e' alto `plinthHeight`.
    let wide = 0;
    for (const { stamp, level } of everyStamp(24)) {
      if (stamp.sizeX < 2 || level < GRAMMAR.luminousFullLevel) continue;
      wide++;

      const ids = new Set<number>();
      const plane = stamp.sizeX * stamp.sizeY;
      for (let i = 0; i < plane; i++) {
        const id = stamp.voxels[i + plane * GRAMMAR.plinthHeight];
        if (id !== STAMP_EMPTY) ids.add(id);
      }
      expect(ids.size).toBeGreaterThanOrEqual(2);
    }
    expect(wide).toBeGreaterThan(0);
  });

  it('accende la faccia d\x27accento per livello, non su ogni edificio', () => {
    // Una casa appena costruita non deve sembrare un'insegna: sotto la prima
    // soglia la faccia d'accento tiene la grammatica del proprio uso, e nessun
    // voxel chiede la superficie luminosa.
    for (const { stamp, level } of everyStamp(12)) {
      if (level < GRAMMAR.luminousFromLevel) {
        expect(countSurface(stamp, SURFACE_KIND.luminous)).toBe(0);
      }
    }

    // Sopra si accende, e sopra la seconda soglia molto di piu': la lama passa
    // da una riga per fascia alla fascia intera.
    let partial = 0;
    let full = 0;
    for (let seed = 0; seed < 32; seed++) {
      partial += countSurface(
        generateBuilding({ class: ALL_CLASSES[0], level: GRAMMAR.luminousFromLevel, seed }),
        SURFACE_KIND.luminous,
      );
      full += countSurface(
        generateBuilding({ class: ALL_CLASSES[0], level: GRAMMAR.luminousFullLevel, seed }),
        SURFACE_KIND.luminous,
      );
    }
    expect(partial).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(partial * 2);
  });

  it('trasforma in terrazza la rientranza che la grammatica lascia scoperta', () => {
    // Un corpo che non rientra mai non ha niente di scoperto, quindi nessun
    // voxel di terrazza. Con l'arretramento in repertorio, invece, ne compare.
    const profile = CLASS_PROFILE[ALL_CLASSES[0]];
    const shared = {
      class: ALL_CLASSES[0],
      level: 5,
      seed: 909,
      shape: { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat },
    } as const;
    const solid = generateBuilding({
      ...shared,
      profile: { ...profile, shrinkOps: [BAND_OP.keep], growOps: [BAND_OP.keep] },
    });
    const stepped = generateBuilding({
      ...shared,
      profile: { ...profile, shrinkBias: 1, shrinkOps: [BAND_OP.setback], growOps: [BAND_OP.setback] },
    });

    expect(countPalette(solid, profile.terrace)).toBe(0);
    expect(countPalette(stepped, profile.terrace)).toBeGreaterThan(0);
  });

  it('pianta la terrazza solo dove la tipologia chiede un giardino', () => {
    const profile = CLASS_PROFILE[ALL_CLASSES[0]];
    const shape = { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat };
    const request = {
      class: ALL_CLASSES[0],
      level: 5,
      seed: 31,
      profile: { ...profile, shrinkBias: 1, shrinkOps: [BAND_OP.setback], growOps: [BAND_OP.setback] },
    } as const;
    const paved = generateBuilding({ ...request, shape });
    const planted = generateBuilding({ ...request, shape: { ...shape, roofGarden: true } });

    // Stesso volume: il giardino non e' una fascia in piu', e' un altro slot
    // sugli stessi voxel di sommita'.
    expect(planted.sizeX).toBe(paved.sizeX);
    expect(planted.sizeZ).toBe(paved.sizeZ);
    expect(solidCount(planted)).toBe(solidCount(paved));

    expect(countPalette(paved, profile.garden)).toBe(0);
    expect(countPalette(planted, profile.garden)).toBeGreaterThan(0);
    // Il bordo resta pavimentato: ci si affaccia, e il parapetto lo dice.
    expect(countPalette(planted, profile.terrace)).toBeGreaterThan(0);
  });

  it('non lascia scendere una fascia del corpo sotto il lato minimo', () => {
    // Senza il pavimento, una catena di rientranze porta la cima a un voxel e la
    // torre finisce a punta di spillo — e sopra un voxel tutti i coronamenti si
    // assomigliano. Il coronamento puo' assottigliarsi oltre: e' il suo mestiere.
    for (const { stamp } of everyStamp(8)) {
      const bands = stamp.bandStarts.length - 1;
      for (let b = 0; b < bands - 2; b++) {
        const span = bandSpan(stamp, stamp.bandStarts[b]);
        if (span === null) continue;
        expect(span.w).toBeGreaterThanOrEqual(GRAMMAR.minBandSide);
        expect(span.h).toBeGreaterThanOrEqual(GRAMMAR.minBandSide);
      }
    }
  });

  it('da\x27 a ogni uso una silhouette propria a parita di livello e seme', () => {
    // E' il gate della fase: i repertori sono per uso, quindi quattro usi sullo
    // stesso seme non possono uscire con lo stesso volume.
    const shapes = new Set<string>();
    for (const cls of ALL_CLASSES) {
      const stamp = generateBuilding({ class: cls, level: 5, seed: 2024 });
      shapes.add(`${stamp.sizeX}x${stamp.sizeZ}:${solidCount(stamp)}`);
    }
    expect(shapes.size).toBe(ALL_CLASSES.length);
  });
});

describe('startLevel', () => {
  it('resta dentro i livelli previsti, e non nasce nessuno gia in cima', () => {
    let atTop = 0;
    for (let seed = 0; seed < 500; seed++) {
      const level = startLevel(seed);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(BUILDER.maxLevel);
      if (level === BUILDER.maxLevel) atTop++;
    }
    // La forma esatta del difetto da cui questa fase si e' dovuta guardare: con
    // la cumulata piu' corta di `maxLevel` il ciclo cadeva in fondo e restituiva
    // il livello massimo a tutti. Il grattacielo non e' un punto di partenza.
    expect(atTop).toBe(0);
  });

  it('ha una coda lunga: il livello base resta il caso comune', () => {
    let base = 0;
    const total = 2000;
    for (let seed = 0; seed < total; seed++) if (startLevel(seed) === 0) base++;
    expect(base / total).toBeGreaterThan(0.6);
    expect(base / total).toBeLessThan(0.85);
  });
});

/**
 * Primo motivo di violazione fra gli stamp, con il caso che l'ha prodotto, o
 * `null` se sono tutti a posto. Esiste perche' su questi cicli l'assertion costa
 * piu' della generazione: un `expect` per voxel sono milioni di chiamate, e la
 * differenza fra dieci secondi e un decimo sta tutta li'.
 */
function firstStampWhere(
  cases: Generator<StampCase>,
  reason: (item: StampCase) => string | null,
): string | null {
  for (const item of cases) {
    const why = reason(item);
    if (why !== null) return `classe ${item.cls} livello ${item.level}: ${why}`;
  }
  return null;
}

function countSurface(stamp: VoxelStamp, surface: number): number {
  let count = 0;
  for (let i = 0; i < stamp.surfaces.length; i++) {
    if (stamp.voxels[i] !== STAMP_EMPTY && stamp.surfaces[i] === surface) count++;
  }
  return count;
}

function countPalette(stamp: VoxelStamp, id: number): number {
  let count = 0;
  for (let i = 0; i < stamp.voxels.length; i++) if (stamp.voxels[i] === id) count++;
  return count;
}

/** Riquadro occupato dalla quota indicata, o null se e' vuota. */
function bandSpan(stamp: VoxelStamp, z: number): { w: number; h: number } | null {
  const plane = stamp.sizeX * stamp.sizeY;
  let minX = stamp.sizeX;
  let maxX = -1;
  let minY = stamp.sizeY;
  let maxY = -1;
  for (let sy = 0; sy < stamp.sizeY; sy++) {
    for (let sx = 0; sx < stamp.sizeX; sx++) {
      if (stamp.voxels[sx + stamp.sizeX * sy + plane * z] === STAMP_EMPTY) continue;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
  }
  if (maxX < 0) return null;
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}
