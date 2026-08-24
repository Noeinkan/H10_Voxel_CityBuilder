import { describe, expect, it } from 'vitest';
import { CATALYSTS, type CatalystId } from '../../sim';
import { PALETTE_SIZE } from '../../engine/paletteSlots';
import { FACING, type Facing } from '../streets/streetGrid';
import { solidCount, stampFootprint, STAMP_EMPTY, type VoxelStamp } from '../buildings/stamp';
import {
  BERTH,
  LANDMARK,
  LANDMARKS,
  SKYPORT,
  hasAloftRecipe,
  landmarkOf,
  maxStageOf,
  variantsOf,
  type LandmarkRecipe,
} from './config';
import {
  generateLandmark,
  landmarkMoorings,
  landmarkOrigin,
  landmarkSpan,
  stageForBuildings,
  variantIndexOf,
} from './generate';
import { createCanvas, drawPart, orientPart, orientedSpan, partBounds } from './parts';

const RECIPES = Object.values(LANDMARKS).filter(
  (recipe): recipe is LandmarkRecipe => recipe !== undefined,
);

const ALL_FACINGS: readonly Facing[] = [FACING.east, FACING.west, FACING.north, FACING.south];

/** Indici dei voxel pieni, per confrontare due stadi come insiemi. */
function solidSet(stamp: VoxelStamp): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < stamp.voxels.length; i++) {
    if (stamp.voxels[i] !== STAMP_EMPTY) out.add(i);
  }
  return out;
}

/**
 * Un seme che produce l'esemplare `wanted`, cercandolo per tentativi.
 *
 * `variantIndexOf` passa per un hash con un sale: invertirlo a mano
 * significherebbe riscrivere quell'hash nel test, cioe' far passare i test
 * anche se il sale cambiasse da una parte sola. Cercare il seme lo usa invece
 * come scatola nera, che e' quello che e'.
 */
/**
 * La sagoma del **solo tronco**, disegnata qui invece che chiesta al generatore.
 *
 * `generateLandmark` applica sempre un esemplare — anche con seme zero, che ne
 * sceglie uno come qualunque altro — quindi il tronco nudo non e' una risposta
 * che quella funzione sappia dare, e non deve esserlo: nel gioco non compare
 * mai da solo. Il riferimento se lo costruisce il test, con le stesse primitive
 * e senza passare dal codice che sta misurando.
 */
function trunkSet(recipe: LandmarkRecipe, stage: number, facing: Facing): Set<number> {
  const [long, short] = recipe.span;
  const { sizeX, sizeY } = orientedSpan(facing, long, short);
  const canvas = createCanvas(sizeX, sizeY, recipe.height);
  for (let s = 0; s <= stage; s++) {
    for (const part of recipe.parts[s]) drawPart(canvas, orientPart(part, facing, long, short));
  }

  const out = new Set<number>();
  for (let i = 0; i < canvas.voxels.length; i++) {
    if (canvas.voxels[i] !== STAMP_EMPTY) out.add(i);
  }
  return out;
}

function seedForVariant(recipe: LandmarkRecipe, wanted: number): number {
  for (let seed = 0; seed < 10_000; seed++) {
    if (variantIndexOf(recipe, seed) === wanted) return seed;
  }
  throw new Error(`nessun seme produce l'esemplare ${wanted} di ${recipe.kind}`);
}

describe('catalogo dei landmark', () => {
  it('ogni parte sta dentro l ingombro che la ricetta dichiara', () => {
    for (const recipe of RECIPES) {
      const [long, short] = recipe.span;
      // Tronco ed esemplari nello stesso ciclo: un esemplare che sfora sarebbe
      // scartato in silenzio da `drawPart`, e a schermo si vedrebbe come una
      // parte tagliata a meta' senza che niente si lamenti.
      const every = [recipe.parts, ...variantsOf(recipe).map((variant) => variant.parts)];
      for (const parts of every) {
        for (const stage of parts) {
          for (const part of stage) {
            const bounds = partBounds(part);
            expect(bounds.x0, `${recipe.kind} x0`).toBeGreaterThanOrEqual(0);
            expect(bounds.y0, `${recipe.kind} y0`).toBeGreaterThanOrEqual(0);
            expect(bounds.z0, `${recipe.kind} z0`).toBeGreaterThanOrEqual(0);
            expect(bounds.x1, `${recipe.kind} x1`).toBeLessThan(long);
            expect(bounds.y1, `${recipe.kind} y1`).toBeLessThan(short);
            expect(bounds.z1, `${recipe.kind} z1`).toBeLessThan(recipe.height);
          }
        }
      }
    }
  });

  it('gli stadi di un esemplare non superano quelli del tronco', () => {
    // `generateLandmark` scorre gli stadi del tronco e pesca `variant.parts[s]`:
    // una voce oltre l'ultimo stadio non verrebbe mai disegnata, e sarebbe una
    // parte scritta che non compare mai in nessuna partita.
    for (const recipe of RECIPES) {
      for (const variant of variantsOf(recipe)) {
        expect(variant.parts.length, `${recipe.kind}/${variant.name}`)
          .toBeLessThanOrEqual(recipe.parts.length);
      }
    }
  });

  it('usa solo indici di palette esistenti', () => {
    for (const recipe of RECIPES) {
      const stamp = generateLandmark({
        kind: recipe.kind,
        stage: maxStageOf(recipe),
        facing: FACING.east,
      });
      expect(stamp).not.toBeNull();
      for (const id of stamp!.voxels) expect(id).toBeLessThan(PALETTE_SIZE);
    }
  });

  it('le soglie di stadio salgono e partono da zero', () => {
    for (const recipe of RECIPES) {
      expect(recipe.stages[0], recipe.kind).toBe(0);
      expect(recipe.stages, recipe.kind).toHaveLength(recipe.parts.length);
      for (let i = 1; i < recipe.stages.length; i++) {
        expect(recipe.stages[i], recipe.kind).toBeGreaterThan(recipe.stages[i - 1]);
      }
    }
  });

  it('a parita di ruolo, stadio e verso lo stamp e identico byte per byte', () => {
    for (const recipe of RECIPES) {
      const request = { kind: recipe.kind, stage: maxStageOf(recipe), facing: FACING.north };
      const first = generateLandmark(request)!;
      const second = generateLandmark(request)!;
      expect(second.voxels).toEqual(first.voxels);
      expect(second.surfaces).toEqual(first.surfaces);
    }
  });

  it('uno stadio copre sempre quello precedente: cancellare non ha niente da togliere', () => {
    // E' l'invariante su cui poggia l'avanzamento: `Builder.upgrade` rigenera la
    // sagoma vecchia per toglierne i voxel scoperti, e qui non ce ne sono mai.
    //
    // Vale per **ogni esemplare**, non per il primo: l'avanzamento rigenera la
    // sagoma con il seme del record, e un solo esemplare non cumulativo
    // lascerebbe voxel orfani dello stadio prima.
    for (const recipe of RECIPES) {
      for (let v = 0; v < variantsOf(recipe).length; v++) {
        const seed = seedForVariant(recipe, v);
        const name = variantsOf(recipe)[v].name;
        for (let stage = 1; stage <= maxStageOf(recipe); stage++) {
          const before = solidSet(generateLandmark({ kind: recipe.kind, stage: stage - 1, facing: FACING.east, seed })!);
          const after = solidSet(generateLandmark({ kind: recipe.kind, stage, facing: FACING.east, seed })!);
          for (const index of before) {
            expect(after.has(index), `${recipe.kind}/${name} stadio ${stage}`).toBe(true);
          }
          expect(after.size, `${recipe.kind}/${name} stadio ${stage}`).toBeGreaterThan(before.size);
        }
      }
    }
  });

  it('ruotare cambia il verso e non la quantita di struttura', () => {
    for (const recipe of RECIPES) {
      const stage = maxStageOf(recipe);
      // Su ogni esemplare: le primitive nuove — traliccio, falda, smusso — sono
      // tutte a rischio di perdere l'invarianza se la maschera guarda `lx`
      // invece dell'asse maggiore, ed e' esattamente qui che si vedrebbe.
      for (let v = 0; v < variantsOf(recipe).length; v++) {
        const seed = seedForVariant(recipe, v);
        const name = `${recipe.kind}/${variantsOf(recipe)[v].name}`;
        const perFacing = ALL_FACINGS.map(
          (facing) => solidCount(generateLandmark({ kind: recipe.kind, stage, facing, seed })!),
        );
        for (const count of perFacing) expect(count, name).toBe(perFacing[0]);
      }

      const counts = ALL_FACINGS.map(
        (facing) => solidCount(generateLandmark({ kind: recipe.kind, stage, facing })!),
      );
      for (const count of counts) expect(count, recipe.kind).toBe(counts[0]);

      const [long, short] = recipe.span;
      expect(landmarkSpan(recipe.kind, FACING.east)).toEqual({
        sizeX: long,
        sizeY: short,
        sizeZ: recipe.height,
      });
      expect(landmarkSpan(recipe.kind, FACING.north)).toEqual({
        sizeX: short,
        sizeY: long,
        sizeZ: recipe.height,
      });
    }
  });

  it('la colonna cliccata cade dentro l ingombro, su ogni verso', () => {
    for (const recipe of RECIPES) {
      for (const facing of ALL_FACINGS) {
        const origin = landmarkOrigin(recipe.kind, facing, 100, 100)!;
        const span = landmarkSpan(recipe.kind, facing)!;
        expect(100 - origin.x, `${recipe.kind} ${facing}`).toBeGreaterThanOrEqual(0);
        expect(100 - origin.y, `${recipe.kind} ${facing}`).toBeGreaterThanOrEqual(0);
        expect(100 - origin.x, `${recipe.kind} ${facing}`).toBeLessThan(span.sizeX);
        expect(100 - origin.y, `${recipe.kind} ${facing}`).toBeLessThan(span.sizeY);
      }
    }
  });

  it('ogni landmark ha una firma verticale, non e un decalcomania', () => {
    // Il ruolo si deve riconoscere dalla sagoma in isometrica, e una sagoma e'
    // fatta di altezza: una struttura alta due voxel su un'impronta larga venti
    // e' una macchia di colore, cioe' esattamente il rombo di asfalto di prima.
    for (const recipe of RECIPES) {
      const stamp = generateLandmark({
        kind: recipe.kind,
        stage: maxStageOf(recipe),
        facing: FACING.east,
      })!;

      let top = 0;
      for (let z = 0; z < stamp.sizeZ; z++) {
        for (let i = 0; i < stamp.sizeX * stamp.sizeY; i++) {
          if (stamp.voxels[i + stamp.sizeX * stamp.sizeY * z] !== STAMP_EMPTY) top = z;
        }
      }
      expect(top, recipe.kind).toBeGreaterThanOrEqual(Math.floor(recipe.height / 2));
    }
  });

  it('lo stadio segue quello che la citta ha costruito intorno', () => {
    for (const recipe of RECIPES) {
      expect(stageForBuildings(recipe, 0), recipe.kind).toBe(0);
      expect(stageForBuildings(recipe, recipe.stages[1] - 1), recipe.kind).toBe(0);
      expect(stageForBuildings(recipe, recipe.stages[1]), recipe.kind).toBe(1);
      // Oltre l'ultima soglia non si sale piu': il tetto e' la ricetta.
      expect(stageForBuildings(recipe, 100_000), recipe.kind).toBe(maxStageOf(recipe));
    }
  });

  it('tutti i ruoli del catalogo hanno una struttura propria', () => {
    expect(RECIPES).toHaveLength(CATALYSTS.length);
    for (const definition of CATALYSTS) {
      expect(LANDMARKS[definition.id], definition.id).toBeDefined();
    }
  });

  it('ogni ruolo si distingue dagli altri per sagoma, non solo per colore', () => {
    // Il difetto da cui e' nata questa fase: otto ruoli con lo stesso rombo di
    // asfalto e un voxel d'accento diverso. Ingombro e altezza insieme sono la
    // firma piu' grossolana possibile, e devono gia' bastare a separarli.
    const signatures = new Set<string>();
    for (const recipe of RECIPES) {
      const stamp = generateLandmark({
        kind: recipe.kind,
        stage: maxStageOf(recipe),
        facing: FACING.east,
      })!;
      signatures.add(`${stamp.sizeX}x${stamp.sizeY}x${stamp.sizeZ}:${solidCount(stamp)}`);
    }
    expect(signatures.size).toBe(RECIPES.length);
  });

  it('ogni esemplare contiene il tronco per intero: il ruolo si legge comunque', () => {
    // E' l'invariante che tiene in piedi la nota di `generate.ts` contro la
    // varieta' fine a se stessa. Se un esemplare potesse *togliere* qualcosa al
    // tronco, due porti smetterebbero di avere una sagoma in comune e il
    // giocatore dovrebbe imparare ventisette forme invece di nove. Tenendo la
    // varieta' additiva, la leggibilita' e' garantita per costruzione.
    for (const recipe of RECIPES) {
      const stage = maxStageOf(recipe);
      const variants = variantsOf(recipe);
      const trunk = trunkSet(recipe, stage, FACING.east);
      for (let v = 0; v < variants.length; v++) {
        const seed = seedForVariant(recipe, v);
        const drawn = solidSet(generateLandmark({ kind: recipe.kind, stage, facing: FACING.east, seed })!);
        expect(drawn.size, `${recipe.kind}/${variants[v].name}`).toBeGreaterThan(0);
        // Il confronto vero e' contro il tronco, non contro l'esemplare zero:
        // due esemplari possono coprirsi a vicenda solo dove il tronco gia' c'e'.
        for (const index of trunk) {
          if (drawn.has(index)) continue;
          expect(
            { kind: recipe.kind, variant: variants[v].name, index },
            'un esemplare ha coperto un voxel del tronco con il vuoto',
          ).toEqual({ kind: recipe.kind, variant: variants[v].name, index: -1 });
        }
      }
    }
  });

  it('gli esemplari di un ruolo si distinguono, e non solo di nome', () => {
    // Un esemplare che aggiunge zero voxel sarebbe una riga di tabella che non
    // si vede: il conto e' la misura piu' grossolana possibile della differenza,
    // e deve gia' bastare a separarli.
    for (const recipe of RECIPES) {
      const variants = variantsOf(recipe);
      expect(variants.length, recipe.kind).toBeGreaterThan(1);

      const counts = new Set<number>();
      for (let v = 0; v < variants.length; v++) {
        const seed = seedForVariant(recipe, v);
        counts.add(solidCount(
          generateLandmark({ kind: recipe.kind, stage: maxStageOf(recipe), facing: FACING.east, seed })!,
        ));
      }
      expect(counts.size, recipe.kind).toBe(variants.length);

      const names = new Set(variants.map((variant) => variant.name));
      expect(names.size, recipe.kind).toBe(variants.length);
    }
  });

  it('lo stesso seme da sempre lo stesso esemplare, e i semi li raggiungono tutti', () => {
    for (const recipe of RECIPES) {
      const request = { kind: recipe.kind, stage: maxStageOf(recipe), facing: FACING.north, seed: 4242 };
      expect(generateLandmark(request)!.voxels).toEqual(generateLandmark(request)!.voxels);

      // Nessun esemplare irraggiungibile: una riga che nessun seme sceglie
      // sarebbe forma scritta e mai vista.
      const seen = new Set<number>();
      for (let seed = 0; seed < 600; seed++) seen.add(variantIndexOf(recipe, seed));
      expect(seen.size, recipe.kind).toBe(variantsOf(recipe).length);
    }
  });

  it('il verso e l esemplare sono due domande diverse', () => {
    // Il motivo per cui `LANDMARK.variantSalt` esiste. Il seme del record e'
    // `hashCoords(worldSeed, x, y)`, e da quello stesso intero il Builder ricava
    // il verso di ripiego con `& 3`: senza sale, verso ed esemplare
    // cambierebbero sempre insieme e la citta' mostrerebbe una regolarita' che
    // nessuno ha scritto.
    for (const recipe of RECIPES) {
      const pairs = new Set<string>();
      for (let seed = 0; seed < 2000; seed++) {
        pairs.add(`${seed & 3}:${variantIndexOf(recipe, seed)}`);
      }
      expect(pairs.size, recipe.kind).toBe(4 * variantsOf(recipe).length);
    }
  });

  it('gli ormeggi cadono dentro l ingombro dichiarato', () => {
    for (const recipe of RECIPES) {
      const [long, short] = recipe.span;
      for (const mooring of recipe.moorings ?? []) {
        expect({ kind: recipe.kind, ...inside(mooring, long, short, recipe.height) })
          .toEqual({ kind: recipe.kind, x: true, y: true, z: true });
      }
    }
  });

  it('una barca ormeggia sull acqua, non sulla banchina', () => {
    // **E' l'invariante che ha ridato il mare ai porti.** L'opera di terra si
    // getta solo dove la ricetta poggia (`stampFootprint` fino a `groundBand`);
    // un ormeggio su una di quelle colonne verrebbe quindi riempito di pietra, e
    // la barca si ritroverebbe in mezzo al molo. Vale su **ogni** esemplare,
    // perche' e' il seme a sceglierlo e nessuno sceglie il proprio.
    const afloat: readonly string[] = [BERTH.vessel, BERTH.ferry, BERTH.cargo];

    for (const recipe of RECIPES) {
      const wet = (recipe.moorings ?? []).filter((mooring) => afloat.includes(mooring.berth));
      if (wet.length === 0) continue;

      for (let v = 0; v < variantsOf(recipe).length; v++) {
        const seed = seedForVariant(recipe, v);
        const stamp = generateLandmark({
          kind: recipe.kind,
          stage: maxStageOf(recipe),
          facing: FACING.east,
          seed,
        })!;
        const ground = stampFootprint(stamp, LANDMARK.groundBand);

        for (const mooring of wet) {
          expect({
            kind: `${recipe.kind}/${variantsOf(recipe)[v].name}`,
            at: `${mooring.x},${mooring.y}`,
            built: ground[mooring.y * stamp.sizeX + mooring.x] === 1,
          }).toEqual({
            kind: `${recipe.kind}/${variantsOf(recipe)[v].name}`,
            at: `${mooring.x},${mooring.y}`,
            built: false,
          });
        }
      }
    }
  });

  it('ruotare porta gli ormeggi con se, ingombro e prua compresi', () => {
    for (const recipe of RECIPES) {
      if (recipe.moorings === undefined) continue;
      for (const facing of ALL_FACINGS) {
        const span = landmarkSpan(recipe.kind, facing)!;
        const moorings = landmarkMoorings(recipe.kind, facing, 100, 200);
        expect(moorings, recipe.kind).toHaveLength(recipe.moorings.length);

        for (const mooring of moorings) {
          expect({
            kind: `${recipe.kind} ${facing}`,
            x: mooring.x > 100 && mooring.x < 100 + span.sizeX,
            y: mooring.y > 200 && mooring.y < 200 + span.sizeY,
          }).toEqual({ kind: `${recipe.kind} ${facing}`, x: true, y: true });
        }
      }

      // Il mezzo gira con la struttura: est e nord non possono dare la stessa
      // prua, o meta' dei moli avrebbe le barche di traverso.
      const east = landmarkMoorings(recipe.kind, FACING.east, 0, 0)[0];
      const north = landmarkMoorings(recipe.kind, FACING.north, 0, 0)[0];
      expect(north.heading - east.heading).toBeCloseTo(Math.PI / 2, 9);
    }
  });
});

describe('scalo in quota', () => {
  it('e una ricetta a se, non un esemplare dell aeroporto', () => {
    expect(hasAloftRecipe('airport')).toBe(true);
    expect(hasAloftRecipe('port')).toBe(false);
    expect(landmarkOf('airport', true)).toBe(SKYPORT);
    expect(landmarkOf('airport')).not.toBe(SKYPORT);
    expect(landmarkOf('port', true)).toBeNull();
  });

  it('sta su un tetto: l ingombro non supera l impronta massima di un edificio', () => {
    // `MAX_FOOTPRINT` e' otto, e un tetto non e' mai piu' largo di cosi': una
    // ricetta piu' grande sarebbe forma scritta e mai posabile.
    expect(SKYPORT.span[0]).toBeLessThanOrEqual(8);
    expect(SKYPORT.span[1]).toBeLessThanOrEqual(8);
  });

  it('ogni parte sta dentro l ingombro, e gli stadi sono cumulativi', () => {
    const [long, short] = SKYPORT.span;
    for (const stage of SKYPORT.parts) {
      for (const part of stage) {
        const bounds = partBounds(part);
        expect(bounds.x0).toBeGreaterThanOrEqual(0);
        expect(bounds.y0).toBeGreaterThanOrEqual(0);
        expect(bounds.z0).toBeGreaterThanOrEqual(0);
        expect(bounds.x1).toBeLessThan(long);
        expect(bounds.y1).toBeLessThan(short);
        expect(bounds.z1).toBeLessThan(SKYPORT.height);
      }
    }

    for (let stage = 1; stage <= maxStageOf(SKYPORT); stage++) {
      const before = solidCount(
        generateLandmark({ kind: 'airport', stage: stage - 1, facing: FACING.east, aloft: true })!,
      );
      const after = solidCount(
        generateLandmark({ kind: 'airport', stage, facing: FACING.east, aloft: true })!,
      );
      expect(after).toBeGreaterThan(before);
    }
  });

  it('ormeggia in quota tre mestieri, e nessuna barca a terra', () => {
    const moorings = landmarkMoorings('airport', FACING.east, 40, 60, true);
    // Dirigibile al pilone, eVTOL sulla piazzola, pallone alla cima: su otto
    // colonne di tetto non ci sta una pista, e questi sono i tre modi che
    // restano di arrivare in cima a un grattacielo.
    expect(moorings.map((mooring) => mooring.berth).sort())
      .toEqual([BERTH.airship, BERTH.airship, BERTH.balloon, BERTH.pad]);
    for (const mooring of moorings) {
      // In quota, non sull'impalcato: un dirigibile appoggiato al piano e' un
      // capannone.
      expect(mooring.z).toBeGreaterThan(0);
    }
    // Prue opposte: due sagome lunghe sedici voxel appese allo stesso tetto si
    // attraverserebbero.
    const masts = moorings.filter((mooring) => mooring.berth === BERTH.airship);
    expect(Math.abs(masts[0].heading - masts[1].heading)).toBeCloseTo(Math.PI, 9);
  });
});

/** Il punto sta dentro il riquadro canonico e sotto la quota dichiarata? */
function inside(
  mooring: { readonly x: number; readonly y: number; readonly z: number },
  long: number,
  short: number,
  height: number,
): { x: boolean; y: boolean; z: boolean } {
  return {
    x: mooring.x >= 0 && mooring.x < long,
    y: mooring.y >= 0 && mooring.y < short,
    z: mooring.z >= 0 && mooring.z < height,
  };
}

describe('catalogo dei landmark — code', () => {
  it('un ruolo senza ricetta non produce uno stamp invece di produrne uno vuoto', () => {
    // Il ripiego deve restare riconoscibile dal chiamante anche ora che il
    // catalogo e' completo: un landmark assente e un landmark di zero voxel sono
    // due cose diverse, e confonderle riserverebbe un'impronta nel registry per
    // una struttura che non c'e'. Vale per il ruolo che un giorno verra'
    // aggiunto a `CATALYSTS` prima che qualcuno gli disegni una forma.
    const unknown = 'observatory' as CatalystId;
    expect(generateLandmark({ kind: unknown, stage: 0, facing: FACING.east })).toBeNull();
    expect(landmarkSpan(unknown, FACING.east)).toBeNull();
    expect(landmarkOrigin(unknown, FACING.east, 0, 0)).toBeNull();
  });
});
