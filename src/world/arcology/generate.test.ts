import { describe, expect, it } from 'vitest';
import { AERIAL } from '../aerial/config';
import {
  BUILDER,
  DEFAULT_BUILDING_FORM,
  LEVEL_CAPS,
  MAX_FOOTPRINT,
  TYPOLOGIES,
} from '../buildings/config';
import { dirtyChunkCount } from '../buildings/chunkBudget';
import { CHUNK, toChunk, toLocal } from '../chunkCoords';
import { generateBuilding } from '../buildings/generate';
import { solidCount, trimStampZ, type VoxelStamp } from '../buildings/stamp';
import { typologyProfile } from '../buildings/typology';
import { maxStageOf } from '../landmarks/config';
import { PART } from '../landmarks/parts';
import { FACING, type Facing } from '../streets/streetGrid';
import {
  ARCOLOGY,
  ARCOLOGY_RECIPES,
  BASE_ARCOLOGY_RECIPES,
  PROFILE_ARCOLOGY_RECIPES,
  stageThresholds,
  type ArcologyRecipe,
} from './config';
import { arcologySpan, generateArcology, worldBands, worldLandings } from './generate';
import { fillRatio, skyWindowOf } from './window';

const FACINGS: readonly Facing[] = [FACING.east, FACING.west, FACING.north, FACING.south];

/**
 * Chunk che un intervallo lungo `count` voxel attraversa, a un certo scostamento.
 *
 * L'intervallo `[o, o + count - 1]` cade in `toChunk(o + count - 1) -
 * toChunk(o) + 1` colonne di chunk. Il conteggio e' periodico di 32 nello
 * scostamento, quindi provare `o` in `0..31` basta a vedere ogni caso.
 */
function columnsOf(count: number, o: number): number {
  return toChunk(o + count - 1) - toChunk(o) + 1;
}

/**
 * Chunk **esterni** toccati da un intervallo: i due che stanno appena fuori,
 * quando l'intervallo comincia su una cucitura o finisce su una cucitura.
 *
 * I bordi interni — un intervallo che attraversa piu' chunk — producono chunk
 * che stanno gia' dentro `columnsOf`, quindi non aggiungono niente.
 */
function edgeSpan(count: number, o: number): number {
  const left = toLocal(o) === 0 ? 1 : 0;
  const right = toLocal(o + count - 1) === CHUNK - 1 ? 1 : 0;
  return left + right;
}

/**
 * Chunk sporcati da un delta nel **caso peggiore** di allineamento.
 *
 * `dirtyChunkCount` dipende da dove il volume cade rispetto alle cuciture; il
 * caso favorevole — angolo a `(0,0,0)` — e' quello che il test originale
 * misurava, e lasciava passare senza vederlo il caso a cavallo di cucitura, che
 * sporca un piano di chunk in piu'. Qui si prova ogni scostamento in `0..31` su
 * ciascun asse — tutte le posizioni, per periodicita' — e si prende il massimo.
 *
 * La formula e' l'unione dei quattro insiemi che `dirtyChunkCount` costruisce:
 *
 *   |Cz| · (|Cx∪Ex|·|Cy| + |Cx|·|Ey∖Cy|) + |Cx|·|Cy|·|Ez∖Cz|
 *
 * con `|Cx∪Ex| = |Cx| + |Ex∖Cx|`. La sua correttezza e' inchiodata dal test che
 * la confronta con la scansione esaustiva della funzione vera.
 */
function worstCaseDirtyChunks(sizeX: number, sizeY: number, height: number): number {
  if (sizeX <= 0 || sizeY <= 0 || height <= 0) return 0;
  let worst = 0;
  for (let oy = 0; oy < CHUNK; oy++) {
    const y0 = columnsOf(sizeY, oy);
    const ye = edgeSpan(sizeY, oy);
    for (let ox = 0; ox < CHUNK; ox++) {
      const x0 = columnsOf(sizeX, ox);
      const xe = edgeSpan(sizeX, ox);
      const spanning = (x0 + xe) * y0 + x0 * ye;
      const plan = x0 * y0;
      for (let oz = 0; oz < CHUNK; oz++) {
        const z0 = columnsOf(height, oz);
        const ze = edgeSpan(height, oz);
        const count = z0 * spanning + plan * ze;
        if (count > worst) worst = count;
      }
    }
  }
  return worst;
}

/** La stessa domanda, chiesta alla funzione vera su ogni scostamento. */
function bruteForceDirty(sizeX: number, sizeY: number, height: number): number {
  let worst = 0;
  for (let oz = 0; oz < CHUNK; oz++) {
    for (let oy = 0; oy < CHUNK; oy++) {
      for (let ox = 0; ox < CHUNK; ox++) {
        const count = dirtyChunkCount(ox, oy, sizeX, oz, oz + height, sizeY);
        if (count > worst) worst = count;
      }
    }
  }
  return worst;
}

/**
 * Le sagome gia' generate, per chiave di richiesta.
 *
 * **Una sagoma di arcologia e' la fixture piu' cara del dominio**: la piu' alta
 * chiede una tela da 48x48x735, e mezza dozzina di test chiedono esattamente la
 * stessa. La cache non indebolisce niente perche' nessuno la modifica — chi
 * verifica il *determinismo* chiama `generateArcology` diretta, ed e' l'unico
 * posto in cui due generazioni distinte sono il punto.
 */
const stamps = new Map<string, VoxelStamp>();

function stampOf(
  recipe: ArcologyRecipe,
  options: { stage: number; facing: Facing; from?: number; seed?: number },
): VoxelStamp {
  const key = `${recipe.kind}|${options.stage}|${options.facing}|${options.from ?? ''}|${options.seed ?? ''}`;
  const cached = stamps.get(key);
  if (cached !== undefined) return cached;
  const stamp = generateArcology(recipe, options);
  stamps.set(key, stamp);
  return stamp;
}

function finalStamp(recipe: ArcologyRecipe, facing: Facing = FACING.east): VoxelStamp {
  return stampOf(recipe, { stage: maxStageOf(recipe), facing });
}

describe('il catalogo delle arcologie', () => {
  it('usa le altezze finali e aggiunge stadi per raggiungerle', () => {
    expect(Object.fromEntries(
      BASE_ARCOLOGY_RECIPES.map((recipe) => [recipe.kind, [recipe.height, recipe.parts.length]]),
    )).toEqual({
      twinStem: [320, 6],
      branchingCore: [320, 6],
      skyWeave: [320, 6],
      spireRing: [320, 6],
      doubleBar: [440, 6],
      stackPair: [440, 6],
      quadCluster: [735, 7],
      triSpan: [440, 6],
    });
  });

  it('aggiunge variazioni dichiarate senza sostituire il catalogo originario', () => {
    expect(BASE_ARCOLOGY_RECIPES.map((recipe) => recipe.kind)).toEqual([
      'twinStem',
      'branchingCore',
      'skyWeave',
      'spireRing',
      'doubleBar',
      'stackPair',
      'quadCluster',
      'triSpan',
    ]);
    expect(Object.fromEntries(
      PROFILE_ARCOLOGY_RECIPES.map((recipe) => [recipe.kind, recipe.variationOf]),
    )).toEqual({
      terracedTwin: 'twinStem',
      splitCrown: 'branchingCore',
      steppedBar: 'doubleBar',
      courtCascade: 'quadCluster',
    });
    expect(ARCOLOGY_RECIPES).toEqual([
      ...BASE_ARCOLOGY_RECIPES,
      ...PROFILE_ARCOLOGY_RECIPES,
    ]);
  });

  it('le variazioni terminano corpi dello stesso stadio su quote diverse', () => {
    for (const recipe of PROFILE_ARCOLOGY_RECIPES) {
      const staggered = recipe.parts.some((stage) => {
        const tops = new Set(stage
          .filter((part) => part.kind === PART.shell)
          .map((part) => part.z + part.height));
        return tops.size > 1;
      });
      expect(staggered, recipe.kind).toBe(true);
    }
  });

  it('deriva soglie e numero di stadi dalla stessa forma', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      expect(recipe.stages.length, recipe.kind).toBe(recipe.parts.length);
      expect(recipe.stages, recipe.kind).toEqual(stageThresholds(recipe.parts.length));
      expect(recipe.stages.at(-1), recipe.kind).toBe(ARCOLOGY.finalStageNeighbours);
    }
  });

  it('nessuna coppia ripete la stessa firma di quote', () => {
    const seen = new Map<string, string>();
    for (const recipe of ARCOLOGY_RECIPES) {
      const signature = [...new Set(recipe.parts.flat().map((part) => part.z))]
        .sort((a, b) => a - b)
        .join(',');
      expect(seen.get(signature), `${recipe.kind} ripete le quote di ${seen.get(signature)}`).toBeUndefined();
      seen.set(signature, recipe.kind);
    }
  });

  it('ogni corpo rientra almeno due volte sui confini di stadio', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const sections = recipe.parts
        .map((stage) => Math.max(
          0,
          ...stage
            .filter((part) => part.kind === PART.shell)
            .map((part) => Math.min(part.w, part.h)),
        ))
        .filter((side) => side > 0);
      let retreats = 0;
      for (let i = 1; i < sections.length; i++) {
        if (sections[i] < sections[i - 1]) retreats++;
      }
      expect(retreats, recipe.kind).toBeGreaterThanOrEqual(2);
    }
  });

  it('le multi-blocco usano shell per i corpi e slab soltanto nel podio', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      if (recipe.blocks[0] === 1 && recipe.blocks[1] === 1) continue;
      const body = recipe.parts.slice(1).flat();
      expect(body.some((part) => part.kind === PART.shell), recipe.kind).toBe(true);
      expect(body.some((part) => part.kind === PART.slab), recipe.kind).toBe(false);
    }
  });

  it('dichiara un ingombro che sta in un isolato e non chiede ritagli in pianta', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const [long, short] = recipe.span;
      // Sotto ci sono gli isolati stretti, che misurano quattordici colonne;
      // sopra c'e' il lato del segmento, oltre il quale la comparsa si spezza
      // anche in pianta. Fra i due c'e' un numero solo che vada bene per
      // entrambi, ed e' quello che le ricette usano.
      const [bx, by] = recipe.blocks;
      if (bx === 1 && by === 1) {
        expect(long).toBeLessThanOrEqual(BUILDER.segmentSide);
        expect(short).toBeLessThanOrEqual(BUILDER.segmentSide);
      }
      expect(Math.min(long, short)).toBeGreaterThan(MAX_FOOTPRINT);
    }
  });

  it('le multi-blocco superano il segmento e si spezzano in pianta', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const [bx, by] = recipe.blocks;
      if (bx === 1 && by === 1) continue;
      const [long, short] = recipe.span;
      // Un ingombro multi-blocco supera `segmentSide` per definizione: e' la
      // differenza con le ricette da isolato, e la comparsa lo spezza in ritagli.
      expect(Math.max(long, short)).toBeGreaterThan(BUILDER.segmentSide);
    }
  });

  it('scavalca il vuoto: ogni ricetta ha una finestra di cielo', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const window = skyWindowOf(finalStamp(recipe), ARCOLOGY.window);

      expect(window, `${recipe.kind} non scavalca nessun vuoto`).not.toBeNull();
      expect(window!.z1 - window!.z0 + 1).toBeGreaterThanOrEqual(ARCOLOGY.window.minHeight);
      expect(window!.sizeX * window!.sizeY).toBeGreaterThanOrEqual(ARCOLOGY.window.minColumns);
    }
  });

  it('non riempie il proprio ingombro', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      expect(fillRatio(finalStamp(recipe)), recipe.kind).toBeLessThanOrEqual(ARCOLOGY.maxFill);
    }
  });

  it('riempie il minimo: non e un fuscello', () => {
    // `maxFill` e' un soffitto senza pavimento: sei guglie 3x3 su un ingombro da
    // settantadue riempiono l'otto per cento e passano, ma non si leggono come un
    // edificio. Il pavimento ferma quella ricetta.
    for (const recipe of ARCOLOGY_RECIPES) {
      expect(fillRatio(finalStamp(recipe)), recipe.kind).toBeGreaterThanOrEqual(ARCOLOGY.minFill);
    }
  });

  it('una volta aperta, la finestra non si richiude piu a nessuno stadio', () => {
    // Gli stadi **aggiungono**, quindi uno stadio successivo puo' benissimo
    // tappare il vuoto che quello prima aveva aperto: e' il modo piu' facile di
    // perdere il tratto distintivo senza che nessuno se ne accorga, perche' la
    // sagoma finale continuerebbe ad averne un'altra da qualche altra parte.
    for (const recipe of ARCOLOGY_RECIPES) {
      let opened = false;
      for (let stage = 0; stage <= maxStageOf(recipe); stage++) {
        const stamp = stampOf(recipe, { stage, facing: FACING.east });
        const window = skyWindowOf(stamp, ARCOLOGY.window);
        if (window !== null) opened = true;
        else expect(opened, `${recipe.kind} richiude la finestra allo stadio ${stage}`).toBe(false);
      }
      expect(opened, `${recipe.kind} non apre mai una finestra`).toBe(true);
    }
  });

  it('e il vertice della gerarchia: supera la torre piu alta che il catalogo sappia fare', () => {
    // La torre di punta: livello massimo, impronta massima, e **ogni** tipologia
    // del catalogo, perche' a dare le fasce piu' alte e' il profilo e non l'uso.
    // Se un edificio normale la raggiungesse, l'arcologia non sarebbe il vertice
    // di niente — sarebbe un'altra torre.
    let tallest = 0;
    for (const typology of TYPOLOGIES) {
      for (let seed = 1; seed <= 8; seed++) {
        const stamp = generateBuilding({
          class: typology.use,
          level: BUILDER.maxLevel,
          seed,
          footprintCap: MAX_FOOTPRINT,
          footprintFloor: MAX_FOOTPRINT,
          form: DEFAULT_BUILDING_FORM,
          profile: typologyProfile(typology),
          shape: typology.shape,
        });
        tallest = Math.max(tallest, stamp.sizeZ);
      }
    }

    expect(tallest).toBeGreaterThan(0);
    expect(LEVEL_CAPS.length).toBeGreaterThan(BUILDER.maxLevel);
    for (const recipe of ARCOLOGY_RECIPES) {
      expect(recipe.height, `${recipe.kind} non supera ${tallest}`).toBeGreaterThan(tallest);
    }
  });
});

describe('generateArcology', () => {
  it('e deterministico e cumulativo: lo stadio nuovo copre il vecchio', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const top = maxStageOf(recipe);
      let previous = generateArcology(recipe, { stage: 0, facing: FACING.east, seed: 7 });

      expect(previous.voxels).toEqual(
        generateArcology(recipe, { stage: 0, facing: FACING.east, seed: 7 }).voxels,
      );

      for (let stage = 1; stage <= top; stage++) {
        const next = generateArcology(recipe, { stage, facing: FACING.east, seed: 7 });
        let erased = -1;
        for (let i = 0; i < previous.voxels.length; i++) {
          if (previous.voxels[i] === 0) continue;
          if (next.voxels[i] !== 0) continue;
          erased = i;
          break;
        }
        // Una sola asserzione per stadio: il predicato resta cella per cella,
        // senza pagare milioni di matcher Vitest sull'inviluppo da 735 quote.
        expect(erased, `${recipe.kind} stadio ${stage}, cella cancellata ${erased}`).toBe(-1);
        previous = next;
      }
    }
  });

  it('il delta di uno stadio non riscrive quello di prima, e insieme fanno il cumulativo', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      for (let stage = 1; stage <= maxStageOf(recipe); stage++) {
        // `before` di uno stadio e' il `cumulative` di quello prima: senza cache
        // ogni stadio si rigenerava due volte.
        const cumulative = stampOf(recipe, { stage, facing: FACING.east, seed: 3 });
        const before = stampOf(recipe, { stage: stage - 1, facing: FACING.east, seed: 3 });
        const delta = stampOf(recipe, {
          stage,
          from: stage,
          facing: FACING.east,
          seed: 3,
        });

        let first = -1;
        for (let i = 0; i < cumulative.voxels.length; i++) {
          const union = delta.voxels[i] !== 0 ? delta.voxels[i] : before.voxels[i];
          if (union !== cumulative.voxels[i]) {
            first = i;
            break;
          }
        }
        expect(first, `${recipe.kind} stadio ${stage}`).toBe(-1);
      }
    }
  });

  it('e invariante per rotazione: lo stesso conto di voxel su tutti e quattro i versi', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const counts = FACINGS.map((facing) => solidCount(finalStamp(recipe, facing)));
      for (const count of counts) expect(count).toBe(counts[0]);
    }
  });

  it('la formula del caso peggiore coincide con la scansione esaustiva', () => {
    // `worstCaseDirtyChunks` deriva la sua formula a mano: qui la si inchioda
    // chiedendo la stessa domanda alla funzione vera su ogni scostamento.
    for (const [sx, sy, h] of [[20, 20, 70], [48, 20, 90], [48, 48, 80]] as const) {
      expect(worstCaseDirtyChunks(sx, sy, h), `${sx}x${sy}x${h}`).toBe(bruteForceDirty(sx, sy, h));
    }
  });

  it('nessun delta di stadio sfora il tetto di chunk nel caso peggiore', () => {
    // E' il difetto che si ripresenta a ogni cambio di scala: sforare non e' un
    // errore, e' uno scarto silenzioso. Il conto e' sul **delta** di ogni stadio
    // — mai sulla sagoma cumulativa — e nel **caso peggiore** di allineamento,
    // non sull'angolo favorevole a (0,0): un volume a cavallo di una cucitura
    // sporca un piano di chunk in piu', ed e' proprio quello che qui si vuole
    // veder arrivare prima di una ricetta nuova.
    for (const recipe of ARCOLOGY_RECIPES) {
      for (const facing of FACINGS) {
        for (let stage = 0; stage <= maxStageOf(recipe); stage++) {
          const raw = generateArcology(recipe, { stage, from: stage, facing, seed: 11 });
          const { stamp } = trimStampZ(raw);
          const count = worstCaseDirtyChunks(stamp.sizeX, stamp.sizeY, stamp.sizeZ);
          expect(
            count,
            `${recipe.kind} stadio ${stage} verso ${facing}: ${count} chunk > tetto ${BUILDER.maxDirtyChunksPerBuilding}`,
          ).toBeLessThanOrEqual(BUILDER.maxDirtyChunksPerBuilding);
        }
      }
    }
  });

  it('nessuna parte esce dall altezza dichiarata della ricetta', () => {
    // `drawPart` scarta in silenzio cio' che supera la tela: una parte con
    // `z + height` oltre `recipe.height` non comparirebbe e nessun tipo lo
    // direbbe. Questo test lo dice.
    for (const recipe of ARCOLOGY_RECIPES) {
      recipe.parts.forEach((stageParts, stage) => {
        stageParts.forEach((part, index) => {
          const top = part.z + part.height;
          expect(
            top,
            `${recipe.kind} stadio ${stage} parte ${index}: quota ${top} > altezza ${recipe.height}`,
          ).toBeLessThanOrEqual(recipe.height);
        });
      });
    }
  });
});

describe('le fasce e i piazzali', () => {
  it('ogni fascia ha una colonna sua, dentro l ingombro e su ogni verso', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      for (const facing of FACINGS) {
        const span = arcologySpan(recipe, facing);
        const bands = worldBands(recipe, facing, 0, 0);
        const seen = new Set<string>();

        expect(bands.length).toBe(recipe.bands.length);
        for (const band of bands) {
          expect(band.x).toBeGreaterThanOrEqual(0);
          expect(band.y).toBeGreaterThanOrEqual(0);
          expect(band.x).toBeLessThan(span.sizeX);
          expect(band.y).toBeLessThan(span.sizeY);
          seen.add(`${band.x},${band.y}`);
        }
        // Distinte, o `addBuilding` ne rifiuterebbe una: la simulazione tiene
        // un edificio per cella, ed e' proprio quella regola a permettere di
        // contare quattro usi senza insegnarle la verticale.
        expect(seen.size).toBe(bands.length);
      }
    }
  });

  it('ogni uso della ricetta compare in uno stadio che esiste', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      const uses = new Set(recipe.bands.map((band) => band.use));
      expect(uses.size).toBe(recipe.bands.length);
      for (const band of recipe.bands) {
        expect(band.stage).toBeGreaterThanOrEqual(0);
        expect(band.stage).toBeLessThanOrEqual(maxStageOf(recipe));
        expect(band.z).toBeLessThan(recipe.height);
      }
    }
  });

  it('ogni piazzale tocca il filo dell inviluppo, o la rete non ci arriverebbe', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      for (const facing of FACINGS) {
        const span = arcologySpan(recipe, facing);
        const landings = worldLandings(recipe, facing, 0, 0);

        expect(landings.length).toBeGreaterThan(0);
        for (const landing of landings) {
          const onEdge = landing.x === 0 || landing.y === 0 ||
            landing.x + landing.sizeX === span.sizeX ||
            landing.y + landing.sizeY === span.sizeY;
          expect(onEdge, `${recipe.kind} su verso ${facing}`).toBe(true);
          expect(landing.z).toBeGreaterThan(0);
          expect(landing.z).toBeLessThan(recipe.height);
        }
      }
    }
  });

  it('almeno un piazzale sta a una quota che la rete in quota sa raggiungere', () => {
    // Un percorso assorbe al massimo `maxNodes * stepPerNode` di dislivello, e
    // il capo piu' basso che gli si offre e' una mensola del centro. Con il solo
    // piazzale del mezzanino — settanta voxel sopra il piano finito — nessun
    // percorso ci attraccava **mai**: la struttura c'era, si raggiungeva solo
    // dalla propria scala interna, e la casella «innestarla nella rete» era
    // falsa nei fatti mentre tutto il resto della suite era verde.
    const reach = AERIAL.route.maxNodes * AERIAL.route.stepPerNode;
    for (const recipe of ARCOLOGY_RECIPES) {
      const lowest = Math.min(...recipe.landings.map((landing) => landing.z));
      expect(lowest, `${recipe.kind} attracca solo troppo in alto`).toBeLessThanOrEqual(reach);
    }
  });

  it('il piano di un piazzale e davvero costruito allo stadio che lo apre', () => {
    for (const recipe of ARCOLOGY_RECIPES) {
      for (const landing of recipe.landings) {
        const stamp = stampOf(recipe, { stage: landing.stage, facing: FACING.east });
        // Sotto la prima quota libera c'e' il piano su cui si cammina: se non
        // fosse pieno, il piazzale sarebbe un riquadro appeso al niente.
        for (let dy = 0; dy < landing.h; dy++) {
          for (let dx = 0; dx < landing.w; dx++) {
            const index = (landing.x + dx) +
              stamp.sizeX * ((landing.y + dy) + stamp.sizeY * (landing.z - 1));
            expect(stamp.voxels[index], `${recipe.kind} piazzale ${dx},${dy}`).not.toBe(0);
          }
        }
      }
    }
  });
});
