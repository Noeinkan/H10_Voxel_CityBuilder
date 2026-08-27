import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  createSimState,
  tick,
  type SimState,
} from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { GRADING } from '../grading/config';
import { generateLandmark } from '../landmarks/generate';
import type { Facing } from '../streets/streetGrid';
import { TERRAIN } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import { STAMP_EMPTY } from './stamp';

/**
 * Quello che il cursore promette in montagna.
 *
 * **Il difetto si vedeva come un'assenza, ed era il peggiore dei tre modi di non
 * comparire.** Su un fianco ripido `surveyGrade` rifiutava l'opera sotto un
 * riquadro largo dodici colonne, quindi la struttura non compariva; la piazzola
 * di ripiego nemmeno, perche' `canPaint` scartava ogni colonna in parete. Il
 * catalizzatore si pagava, il campo funzionava, e sul terreno non compariva
 * **niente**. Ora un landmark adatta il pendio: affonda alla quota piu' bassa
 * dell'impronta, copre la parete che ci trova dentro e scava — solo li' — la
 * montagna che spunterebbe dal tetto.
 *
 * Il rilievo e' scritto a mano: in `testTerrain` la pendenza non si ricava dalle
 * quote, quindi «parete» qui e' parete davvero e non per dichiarazione.
 */

const PLATEAU = TERRAIN.beachMaxHeight + 8;

/** Colonna della cengia su cui il giocatore clicca. */
const SPOT = 40;
const ROW = 48;

/**
 * Una cengia alta `rows` righe, con la parete sopra e sotto.
 *
 * La colonna cliccata e' lavorabile, mentre il riquadro della ricetta esce
 * sulla parete — il caso che prima non compariva e ora si adatta.
 */
function ledge(rows: number): TerrainMap {
  const half = rows >> 1;
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: () => PLATEAU,
    slopeAt: (_x, y) =>
      Math.abs(y - ROW) <= half ? 0.1 : GRADING.maxTerraceSlope + 0.2,
  });
}

/** Due pedate piane: cambia solo quanti gradoni il landmark prova a cucire. */
function terraces(drop: number): TerrainMap {
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: (_x, y) => y < ROW ? PLATEAU : PLATEAU + drop,
    // Le pedate sono lavorabili; e' il dislivello complessivo dell'impronta,
    // non una parete dichiarata, a decidere quanto il landmark affonda.
    slopeAt: () => 0.1,
  });
}

/** Un piano con l'acqua fonda a sud: l'unico terreno che un landmark rifiuta. */
function deepWater(seaDepth: number): TerrainMap {
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: (_x, y) => y < ROW ? PLATEAU : TERRAIN.seaLevel - seaDepth,
    slopeAt: () => 0.1,
  });
}

/** Un piano con una sola parete a sud: sopra `edgeY` nessuna opera raddrizza. */
function cliff(edgeY: number): TerrainMap {
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: () => PLATEAU,
    slopeAt: (_x, y) => (y <= edgeY ? 0.1 : GRADING.maxTerraceSlope + 0.2),
  });
}

function builderOn(map: TerrainMap): Builder {
  return new Builder(new VoxelWorld(), map, 4242);
}

function settle(builder: Builder): void {
  let guard = 0;
  while ((builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) && guard++ < 5000) {
    builder.step();
  }
}

/** Il record del landmark piazzato, o null. */
function landmarkOf(builder: Builder, kind: string): { record: unknown } | null {
  for (const record of builder.registry.all) {
    if (record.landmark === kind) return { record };
  }
  return null;
}

describe('un landmark su una cengia di montagna', () => {
  it('appare anche dove la cengia non regge l ingombro intero', () => {
    // Il mercato e' profondo dodici colonne: su una cengia da sette il riquadro
    // esce sulla parete, e prima di questa fase non compariva niente. Ora la
    // struttura affonda e copre la parete dentro la propria impronta.
    const builder = builderOn(ledge(6));
    expect(builder.landmarkClearance(SPOT, ROW, 'market').refusal).toBeNull();

    builder.placeLandmark(SPOT, ROW, 'market');
    settle(builder);
    expect(landmarkOf(builder, 'market')).not.toBeNull();
  });

  it('e il preventivo e la stessa risposta che da il click', () => {
    // E' l'invariante del preventivo: cursore e click devono chiedere al terreno
    // la stessa cosa, o «Valid position» torna a essere un'opinione.
    const builder = builderOn(ledge(6));
    const quote = builder.landmarkClearance(SPOT, ROW, 'market');

    builder.placeLandmark(SPOT, ROW, 'market');
    settle(builder);

    expect(quote.refusal).toBeNull();
    expect(landmarkOf(builder, 'market')).not.toBeNull();
  });

  it('non rifiuta dove la cengia regge davvero l ingombro', () => {
    // Il controllo nuovo non deve diventare un divieto sulla montagna in
    // generale: dove il ripiano e' largo abbastanza il mercato ci sta, e ci va.
    const builder = builderOn(ledge(30));
    expect(builder.landmarkClearance(SPOT, ROW, 'market').refusal).toBeNull();

    builder.placeLandmark(SPOT, ROW, 'market');
    settle(builder);
    expect(landmarkOf(builder, 'market')).not.toBeNull();
  });

  it('cuce insieme anche un versante intero, affondando invece di riempire', () => {
    // Il monumento su un dislivello doppio del ciglio naturale: prima il
    // piazzamento rifiutava perche' il terrapieno sarebbe stato un muro alto
    // mezzo versante. Ora non c'e' terrapieno: la base scende al minimo e la
    // struttura emerge dal pendio.
    const builder = builderOn(terraces(GRADING.maxWorksStep * 2));
    expect(builder.landmarkClearance(SPOT, ROW, 'monument').refusal).toBeNull();

    builder.placeLandmark(SPOT, ROW, 'monument');
    settle(builder);
    expect(landmarkOf(builder, 'monument')).not.toBeNull();
  });

  it('apre il cantiere anche sulla parete: le case cadono e la struttura compare', () => {
    // La parete non e' piu' un motivo per non sgomberare: il riquadro si porta
    // via le case e la struttura arriva quando il suolo e' libero.
    const map = cliff(ROW + 2);
    const builder = builderOn(map);
    builder.materialize([
      { x: SPOT - 5, y: ROW - 6, class: BUILDING_CLASS.residential },
      { x: SPOT + 3, y: ROW - 4, class: BUILDING_CLASS.residential },
    ]);
    const before = builder.registry.count;
    expect(before).toBe(2);

    builder.placeLandmark(SPOT, ROW, 'market');

    let state: SimState = createSimState();
    let guard = 0;
    while (builder.stats.clearing > 0 && guard++ < 5000) {
      state = tick(state, map);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) builder.step();

    expect(builder.stats.cleared).toBe(before);
    expect(builder.registry.count).toBe(0);
    expect(landmarkOf(builder, 'market')).not.toBeNull();
  });

  it('l acqua fonda resta l unico rifiuto: la struttura non ci sta', () => {
    // La parete di roccia si copre, il fondale no: un landmark sull'acqua fonda
    // aprirebbe un buco rettangolare nel mare, e il preventivo lo dice.
    const builder = builderOn(deepWater(GRADING.maxQuayDepth + 12));
    expect(builder.landmarkClearance(SPOT, ROW, 'market').refusal).toBe('no-footing');
  });
});

describe('lo scavo di adattamento', () => {
  /**
   * Il mondo con le colonne di terreno **scritte davvero**, per misurare dove
   * lo scavo arriva e dove no.
   */
  function filledWorld(map: TerrainMap, drop: number): { world: VoxelWorld; builder: Builder } {
    const world = new VoxelWorld();
    for (let y = ROW - 24; y < ROW + 24; y++) {
      for (let x = SPOT - 24; x < SPOT + 24; x++) {
        const height = y < ROW ? PLATEAU : PLATEAU + drop;
        for (let z = 0; z < height; z++) world.setBlock(x, y, z, 7);
      }
    }
    return { world, builder: new Builder(world, map, 4242) };
  }

  it('scava la montagna sopra il tetto, dentro la sola impronta', () => {
    // Il monumento e' alto 26 voxel e affonda al piano basso: le colonne alte
    // dell'impronta spunterebbero dal tetto, e lo scavo le riporta giu' fino a
    // dove la struttura le copre.
    const drop = 40;
    const map = terraces(drop);
    const { world, builder } = filledWorld(map, drop);

    builder.placeLandmark(SPOT, ROW, 'monument');
    settle(builder);

    const record = [...builder.registry.all].find((r) => r.landmark === 'monument');
    expect(record).toBeDefined();
    expect(record!.baseZ).toBe(PLATEAU);
    const top = record!.baseZ + record!.height;

    // Dentro l'impronta, sopra il tetto, la montagna e' sparita...
    const insideY = ROW + 3;
    for (let z = top; z < PLATEAU + drop; z++) {
      expect(world.getBlock(SPOT, insideY, z)).toBe(0);
    }
    // ...ma la struttura c'e': la colonna alta dell'impronta e' coperta dal
    // monumento fino al suo tetto.
    let solid = 0;
    for (let z = PLATEAU; z < top; z++) {
      if (world.getBlock(SPOT, insideY, z) !== 0) solid++;
    }
    expect(solid).toBeGreaterThan(0);

    // Fuori dall'impronta — e fuori dal grembiule, che ridipinge il solo voxel
    // di sommita' — il pendio resta dov'era: lo scavo non esce dal confine
    // della struttura.
    const outsideY = ROW + 12;
    for (let z = top; z < PLATEAU + drop - 1; z++) {
      expect(world.getBlock(SPOT, outsideY, z)).toBe(7);
    }
  });

  it('espone lo stadio iniziale della cattedrale prima delle guglie future', () => {
    // La cattedrale riserva un inviluppo alto 28 voxel, ma allo stadio zero la
    // navata ne occupa soltanto sette. Usare il tetto dell'inviluppo per lo
    // scavo lascia quindi una collina moderata sopra ogni voxel visibile: il
    // record esiste, ma a schermo non emerge niente.
    const drop = 12;
    const map = terraces(drop);
    const { world, builder } = filledWorld(map, drop);

    builder.placeLandmark(SPOT, ROW, 'cathedral');
    settle(builder);

    const record = [...builder.registry.all].find((r) => r.landmark === 'cathedral');
    expect(record).toBeDefined();
    const stamp = generateLandmark({
      kind: 'cathedral',
      stage: 0,
      facing: record!.facing! as Facing,
      seed: record!.seed,
      form: record!.landmarkForm,
    });
    expect(stamp).not.toBeNull();

    let exposedColumns = 0;
    for (let dy = 0; dy < stamp!.sizeY; dy++) {
      for (let dx = 0; dx < stamp!.sizeX; dx++) {
        let roof = 0;
        for (let z = 0; z < stamp!.sizeZ; z++) {
          const index = dx + stamp!.sizeX * (dy + stamp!.sizeY * z);
          if (stamp!.voxels[index] !== STAMP_EMPTY) roof = z + 1;
        }
        if (roof === 0) continue;

        const x = record!.x + dx;
        const y = record!.y + dy;
        const roofZ = record!.baseZ + roof;
        const terrainZ = map.heightAt(x, y);
        if (terrainZ <= roofZ) continue;

        exposedColumns++;
        for (let z = roofZ; z < terrainZ; z++) {
          expect({ x, y, z, block: world.getBlock(x, y, z) })
            .toEqual({ x, y, z, block: 0 });
        }
      }
    }
    expect(exposedColumns).toBeGreaterThan(0);
  });
});
