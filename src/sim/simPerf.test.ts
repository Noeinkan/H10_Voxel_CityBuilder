import { describe, expect, it } from 'vitest';
import { CATALYSTS } from './catalysts';
import { CELLS_PER_CHUNK } from './DesirabilityField';
import { CLASS_COUNT, type BuildingClass } from './classes';
import { nextBuildSites } from './nextBuildSites';
import { addBuilding, addCatalyst, createSimState, type SimState } from './SimState';
import { testTerrain } from './testTerrain';
import { tick } from './tick';

/**
 * Il criterio di costo del tick.
 *
 * La misura e' una media su molti tick, non un singolo campione: un tick da solo
 * dura molto meno della risoluzione dell'orologio, e il primo paga la
 * compilazione JIT. La soglia e' quella della specifica, 3 ms; il valore vero
 * sta a diversi ordini di grandezza sotto, ed e' cosi' per costruzione — il tick
 * legge tre contatori di edifici e un contatore di colonne edificabili, non
 * scorre ne' la mappa ne' il campo.
 */

const MAP_SIDE_CHUNKS = 8; //  8 x 32 = 256 celle di lato
const CATALYST_COUNT = 50;
const BUILDINGS = 400;
const TICK_BUDGET_MS = 3;

/**
 * Quanto una scansione puo' rallentare al crescere della citta'.
 *
 * Non e' un tetto in millisecondi di proposito: la scansione visita ogni cella
 * allocata e legge un `Uint8Array` per uso, quindi e' limitata dalla banda di
 * memoria e cambia di un ordine di grandezza fra un portatile, un CI e un
 * browser. Un numero assoluto misurerebbe la macchina.
 *
 * Cio' che invece vale ovunque e' che il costo **non dipenda dalla citta'**:
 * due stati con lo stesso campo allocato e un numero di edifici molto diverso
 * devono costare quasi uguale. Il fattore e' largo perche' deve cogliere una
 * regressione algoritmica — una ricerca per cella, un ciclo sugli edifici —
 * non il rumore di misura.
 */
const SITES_SCALING_RATIO = 3;

function cityOf256(buildings = BUILDINGS): SimState {
  let state = createSimState();

  // Catalizzatori sparsi con un passo primo rispetto al lato: si distribuiscono
  // senza allinearsi ai bordi di chunk.
  for (let i = 0; i < CATALYST_COUNT; i++) {
    // A giro sui sette ruoli: ognuno porta il proprio vettore di influenza,
    // quindi la citta' di prova esercita anche gli usi che un ruolo penalizza.
    const role = CATALYSTS[i % CATALYSTS.length];
    state = addCatalyst(state, {
      x: (i * 37) % 250,
      y: (i * 61) % 250,
      kind: role.id,
      class: role.class,
      strength: 120 + ((i * 13) % 130),
      radius: 12 + (i % 9),
    });
  }

  for (let i = 0; i < buildings; i++) {
    state = addBuilding(state, {
      x: (i * 7) % 250,
      y: (i * 11) % 250,
      class: (i % CLASS_COUNT) as BuildingClass,
      mixed: ((i + 1) % CLASS_COUNT) as BuildingClass,
    });
  }

  return state;
}

describe('costo del tick', () => {
  it('un tick su 256x256 con 50 catalizzatori sta sotto i 3 ms', () => {
    const terrainMap = testTerrain({ chunksX: MAP_SIDE_CHUNKS, chunksY: MAP_SIDE_CHUNKS });
    let state = cityOf256();

    expect(state.catalysts).toHaveLength(CATALYST_COUNT);
    expect(state.buildings.length).toBeGreaterThan(BUILDINGS / 2);
    expect(state.field.chunkCount).toBeGreaterThan(MAP_SIDE_CHUNKS * MAP_SIDE_CHUNKS - 1);

    // Riscaldamento: il primo tick paga la compilazione.
    for (let i = 0; i < 200; i++) state = tick(state, terrainMap);

    const runs = 5000;
    const start = performance.now();
    for (let i = 0; i < runs; i++) state = tick(state, terrainMap);
    const perTick = (performance.now() - start) / runs;

    expect(perTick).toBeLessThan(TICK_BUDGET_MS);
    expect(state.tickCount).toBe(200 + runs);
  });

  it('il tick non ricalcola nemmeno una cella del campo', () => {
    const terrainMap = testTerrain({ chunksX: MAP_SIDE_CHUNKS, chunksY: MAP_SIDE_CHUNKS });
    let state = cityOf256();
    state.field.resetCounters();

    for (let i = 0; i < 1000; i++) state = tick(state, terrainMap);

    // E' la ragione per cui il costo del tick non dipende dalla mappa.
    expect(state.field.totalRecomputedCells).toBe(0);
  });

  it('il costo del tick non cresce con la mappa', () => {
    const small = testTerrain({ chunksX: 2, chunksY: 2 });
    const large = testTerrain({ chunksX: 32, chunksY: 32 });

    expect(averageTickMs(cityOf256(), small)).toBeLessThan(TICK_BUDGET_MS);
    expect(averageTickMs(cityOf256(), large)).toBeLessThan(TICK_BUDGET_MS);
  });
});

describe('costo della selezione dei siti', () => {
  const terrainMap = testTerrain({ chunksX: MAP_SIDE_CHUNKS, chunksY: MAP_SIDE_CHUNKS });

  it('visita le celle allocate e non la citta: quadruplicare gli edifici non la rallenta', () => {
    // E' cio' che "costo limitato per colonna" chiede davvero: due citta' con lo
    // stesso campo allocato e un numero di edifici molto diverso devono costare
    // uguale. Se la scansione toccasse la lista degli edifici, si vedrebbe qui.
    const light = cityOf256(BUILDINGS / 4);
    const heavy = cityOf256(BUILDINGS);
    expect(heavy.buildings.length).toBeGreaterThan(light.buildings.length * 2);

    const lightMs = averageMs(() => {
      nextBuildSites(light, terrainMap, SITES_PER_SCAN);
    });
    const heavyMs = averageMs(() => {
      nextBuildSites(heavy, terrainMap, SITES_PER_SCAN);
    });

    expect(heavyMs).toBeLessThan(lightMs * SITES_SCALING_RATIO);
  }, 30_000);

  it('non alloca ne ricalcola: e una lettura sola', () => {
    const state = cityOf256();
    const chunksBefore = state.field.chunkCount;
    state.field.resetCounters();

    for (let i = 0; i < 100; i++) nextBuildSites(state, terrainMap, SITES_PER_SCAN);

    expect(state.field.chunkCount).toBe(chunksBefore);
    expect(state.field.totalRecomputedCells).toBe(0);
  });

  it('l uso misto non moltiplica i siti: una cella resta una riga', () => {
    // E' la ragione per cui l'uso misto non e' costato niente alla scansione:
    // un edificio a due usi resta un candidato, non due.
    const state = cityOf256();
    const sites = nextBuildSites(state, terrainMap, 500);
    const keys = sites.map((site) => `${site.x},${site.y}`);

    expect(new Set(keys).size).toBe(keys.length);
    expect(sites.some((site) => site.mixed !== -1)).toBe(true);
  });
});

describe('memoria del campo', () => {
  const terrainMap = testTerrain({ chunksX: MAP_SIDE_CHUNKS, chunksY: MAP_SIDE_CHUNKS });

  /**
   * Per colonna di chunk: un `Uint8Array` per uso, uno di occupazione e un
   * `Uint16Array` di affollamento. Nessuna struttura sparsa fra le dense,
   * nessun oggetto per cella: e' un conto che deve tornare a mano.
   */
  const perChunk = CELLS_PER_CHUNK * (CLASS_COUNT + 1) + CELLS_PER_CHUNK * 2;

  it('resta densa per colonna e limitata dai chunk toccati', () => {
    const state = cityOf256();

    expect(state.field.byteLength).toBe(state.field.chunkCount * perChunk);

    // Sette byte per colonna di mondo: quattro usi, l'occupazione e i due
    // dell'affollamento. **La citta' in quota non e' costata niente qui**, ne'
    // un indice `z` — che avrebbe moltiplicato per il numero di livelli tutti e
    // quattro gli usi — ne' il byte per colonna con cui era cominciata.
    expect(perChunk / CELLS_PER_CHUNK).toBe(CLASS_COUNT + 3);
    expect(state.field.byteLength).toBeLessThan(1_000_000);
  });

  it('la citta\' in quota si paga sulle colonne che la portano, non su tutte', () => {
    // Il passo della fixture ripassa sulle stesse colonne dopo 250 edifici:
    // duecentocinquanta stanno ognuno su una colonna sua, quattrocento ne
    // impilano centocinquanta. E' il caso che prima allargava la memoria a tutti.
    const flat = cityOf256(250);
    const stacked = cityOf256(400);

    expect(flat.field.stackedColumns).toBe(0);
    expect(stacked.field.stackedColumns).toBe(150);
    expect(stacked.field.stackAt(0, 0)).toBe(2);

    // La memoria densa e' la stessa a colonna vergine e a colonna impilata: e'
    // tutta la casella, ed e' anche la ragione per cui il conto sopra torna.
    expect(flat.field.byteLength).toBe(flat.field.chunkCount * perChunk);
    expect(stacked.field.byteLength).toBe(stacked.field.chunkCount * perChunk);
  });

  it('non cresce con i tick, solo con cio\' che il giocatore piazza', () => {
    let state = cityOf256();
    const before = state.field.byteLength;

    for (let i = 0; i < 2000; i++) state = tick(state, terrainMap);

    expect(state.field.byteLength).toBe(before);
  });

  it('non alloca dove nessun catalizzatore arriva', () => {
    // Il campo segue i catalizzatori, non la mappa: e' cio' che tiene la
    // memoria legata alla citta' e non all'isola.
    const empty = createSimState();
    expect(empty.field.chunkCount).toBe(0);
    expect(empty.field.byteLength).toBe(0);

    const role = CATALYSTS[0];
    const one = addCatalyst(empty, {
      x: 1000,
      y: 1000,
      kind: role.id,
      class: role.class,
      strength: 200,
      radius: 8,
    });
    expect(one.field.chunkCount).toBeLessThanOrEqual(4);
  });
});

/** Candidati chiesti dal costruttore in un'infornata: `sitesPerBuild * overfetch`. */
const SITES_PER_SCAN = 18;

/**
 * Media su molte esecuzioni, con un giro di riscaldamento per la compilazione.
 *
 * Il conteggio e' basso di proposito: una scansione completa su 256x256 costa
 * qualche millisecondo, e la suite gira i file in parallelo — mille giri
 * sforerebbero il timeout di vitest per contesa, non per una regressione.
 * Centoventi bastano a un confronto di rapporto, che e' cio' che il test chiede.
 */
function averageMs(run: () => void, runs = 120): number {
  for (let i = 0; i < 30; i++) run();
  const start = performance.now();
  for (let i = 0; i < runs; i++) run();
  return (performance.now() - start) / runs;
}

function averageTickMs(state: SimState, terrainMap: ReturnType<typeof testTerrain>): number {
  let current = state;
  for (let i = 0; i < 200; i++) current = tick(current, terrainMap);

  const runs = 2000;
  const start = performance.now();
  for (let i = 0; i < runs; i++) current = tick(current, terrainMap);
  return (performance.now() - start) / runs;
}
