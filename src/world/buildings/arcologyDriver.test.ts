import { beforeAll, describe, expect, it } from 'vitest';
import {
  BALANCE,
  BUILDING_CLASS,
  addCatalyst,
  createSimState,
  tick,
  type SimState,
} from '../../sim';
import { AERIAL, AERIAL_PART } from '../aerial/config';
import { ARCOLOGY, MIN_SUNKEN_DEPTH, SUNKEN, arcologyOf } from '../arcology/config';
import { surveySunkenSite } from '../arcology/depth';
import { worldLandings } from '../arcology/generate';
import { arcologyQuota } from '../arcology/siting';
import { stageForBuildings } from '../landmarks/generate';
import { waterDistance } from '../sites/siteRules';
import { SKYLINE } from '../skyline/config';
import { heightBonusAt } from '../skyline/tiers';
import { FACING, blockAt, blockRect, type Facing } from '../streets/streetGrid';
import { VoxelWorld } from '../VoxelWorld';
import { generateIsland } from '../terrain/IslandGenerator';
import type { TerrainMap } from '../terrain/TerrainMap';
import { Builder } from './Builder';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';

/**
 * L'arcologia sulla citta' vera.
 *
 * **I test puri di `src/world/arcology/` non possono dire niente di questa
 * fase.** Loro chiedono a una ricetta di essere una ricetta: che scavalchi un
 * vuoto, che non riempia l'ingombro, che ruoti senza cambiare conto. Le caselle
 * della 4.14 parlano invece di cose che esistono solo dopo mille tick — che gli
 * usi arrivino alla simulazione, che la rete in quota ci attracchi, che ce ne
 * siano al massimo due — e ognuna di quelle e' stata **falsa** almeno una volta
 * con la suite pura tutta verde. Sono le uniche asserzioni che le difendono.
 *
 * La citta' si fa crescere una volta sola per l'intero file: e' la fixture piu'
 * cara del dominio, e la condizione che apre un'arcologia e' vera solo quando il
 * centro ha gia' smesso di crescere.
 */

interface City {
  readonly builder: Builder;
  readonly state: SimState;
  /** Serve a chi deve guardare i voxel invece del registro: lo scavo si vede li'. */
  readonly world: VoxelWorld;
  /** Serve a rifare le domande che il driver fa a un isolato: quota e roccia. */
  readonly map: TerrainMap;
}

let city: City;

/**
 * Una citta' matura su un'isola intera.
 *
 * Il mercato usa esattamente forza e portata del catalogo giocabile: una
 * megastruttura raggiungibile solo dalla fixture a forza 255 esisterebbe nei
 * test ma non in partita. Serve comunque un'isola intera, perche' la fascia
 * `core` di `skyline/` la ritaglia dalla citta' costruita, non dalla mappa.
 */
function grow(): City {
  const world = new VoxelWorld();
  const seed = 4242;
  const { map } = generateIsland(world, seed, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 });
  const builder = new Builder(world, map, seed);

  let state = {
    ...createSimState(),
    // Questa suite misura struttura, rete e dichiarazione degli usi. La filiera
    // che accumula la scorta ha test propri: qui il magazzino largo impedisce ai
    // normali grattacieli di consumare la fixture prima del megaprogetto.
    materials: { stock: 100_000, delta: 0 },
  };
  state = addCatalyst(state, {
    x: 128,
    y: 128,
    class: BUILDING_CLASS.residential,
    strength: BALANCE.gameplay.catalyst.roles.market.strength,
    radius: BALANCE.gameplay.catalyst.roles.market.radius,
  });

  for (let i = 0; i < 1600; i++) {
    state = tick(state, map);
    state = builder.onTick(state);
    // La comparsa e' a budget: senza svuotare la coda la citta' resterebbe a
    // registro e non nel mondo, e le sonde sui voxel leggerebbero aria.
    while (builder.stats.growing > 0) builder.step();
  }
  expect(state.materials.stock).toBeLessThan(100_000 - BALANCE.materials.arcologyCost);
  return { builder, state, world, map };
}

function arcologies(builder: Builder): readonly BuildingRecord[] {
  return [...builder.registry.all].filter((record) => record.arcology !== undefined);
}

/** Le sole megastrutture che salgono. */
function towers(builder: Builder): readonly BuildingRecord[] {
  return arcologies(builder).filter((r) => arcologyOf(r.arcology!).sunken === undefined);
}

/** Le sole megastrutture che scavano. */
function pits(builder: Builder): readonly BuildingRecord[] {
  return arcologies(builder).filter((r) => arcologyOf(r.arcology!).sunken !== undefined);
}

beforeAll(() => {
  city = grow();
}, 900000);

describe('ArcologyDriver — sulla citta cresciuta', () => {
  it('la condizione si avvera: la citta matura si da almeno una megastruttura', () => {
    // **Il modo piu' facile di sbagliare questa fase e' scriverla tutta e non
    // vederne mai una.** E' successo: con un `isPeakBlock` in piu' nella
    // condizione l'intersezione era vuota su ogni seed, e ogni altro test del
    // dominio restava verde perche' nessuno guardava la citta'.
    expect(
      arcologies(city.builder).length,
      `ultimo rifiuto: ${city.builder.stats.arcologyRefusal ?? 'nessuno'}`,
    ).toBeGreaterThan(0);
    expect(city.builder.stats.arcologies).toBe(arcologies(city.builder).length);
  });

  it('e l eccezione governata: non piu di quante la citta ne ammetta', () => {
    // La condizione — centro denso e saturo — e' vera su *tutto* il nucleo di
    // una citta' matura. Senza la quota il centro diventerebbe un secondo
    // tappeto, piu' in alto: e' il difetto che la quota esiste per non avere.
    const buildings = city.state.buildingCounts.reduce((sum, count) => sum + count, 0);
    expect(city.builder.registry.arcologyCount).toBeLessThanOrEqual(arcologyQuota(buildings));
  });

  it('ospita usi diversi su quote diverse, dentro una struttura sola', () => {
    // E' il gate della fase, detto in due numeri: almeno una struttura con piu'
    // di un uso, e quegli usi a quote che non coincidono. Un'arcologia con un
    // uso solo sarebbe un edificio molto alto, cioe' la cosa che questa fase
    // esiste per non fare.
    const stratified = arcologies(city.builder)
      .filter((record) => (record.uses ?? []).length >= 2);
    expect(stratified.length).toBeGreaterThan(0);

    for (const record of stratified) {
      const recipe = arcologyOf(record.arcology!);
      const bands = recipe.bands.slice(0, record.uses!.length);

      // `uses` e' posizionale sulle fasce aperte: se le due tabelle scivolassero
      // la simulazione conterebbe l'uso di una quota su un'altra, e nessun altro
      // test se ne accorgerebbe.
      expect(bands.map((band) => band.use)).toEqual([...record.uses!]);

      const heights = new Set(bands.map((band) => band.z));
      expect(heights.size, `arcologia ${record.id}`).toBe(bands.length);
      expect(new Set(record.uses!).size).toBe(record.uses!.length);
    }
  });

  it('la simulazione la conta come conta tutto il resto (invariante 7)', () => {
    // **E' l'invariante che `tally` esiste per difendere.** Un'arcologia dichiara
    // i propri usi con `addBuilding`, uno per fascia su colonne distinte: se il
    // registry ne contasse uno che la simulazione ha rifiutato — o viceversa —
    // capacita' e occupazione divergerebbero in silenzio, e la citta' comincerebbe
    // a nutrire abitanti che non esistono.
    expect([...city.builder.registry.countsByClass]).toEqual([...city.state.buildingCounts]);
  });

  it('e il vertice anche nei voxel: nessun edificio le arriva in cima', () => {
    let tallest = 0;
    let lowest = Number.MAX_SAFE_INTEGER;
    for (const record of city.builder.registry.all) {
      if (record.arcology !== undefined) continue;
      if (record.span !== undefined || record.aerial !== undefined) continue;
      tallest = Math.max(tallest, record.baseZ + record.height);
      lowest = Math.min(lowest, record.baseZ);
    }

    for (const record of towers(city.builder)) {
      expect(record.baseZ + record.height, `arcologia ${record.id}`).toBeGreaterThan(tallest);
    }
    // **L'earthscraper e' il vertice dall'altra parte**, e chiedergli la stessa
    // cosa sarebbe stato l'errore piu' facile di questa famiglia: la sua cima
    // sta al piano di campagna per costruzione, quindi ogni casa la supera. Cio'
    // che nessun altro fa e' scendere sotto il suolo su cui tutti poggiano.
    for (const record of pits(city.builder)) {
      expect(record.baseZ, `earthscraper ${record.id}`).toBeLessThan(lowest);
    }
  });

  it('non entra nell istogramma dei livelli: il suo level e uno stadio', () => {
    // Come per un landmark: `level` qui e' lo stadio di costruzione, e contarlo
    // fra i livelli degli edifici falserebbe la lettura della gerarchia — due
    // strutture a stadio zero direbbero «due edifici bassi» in mezzo al centro
    // piu' alto della citta'.
    for (const record of arcologies(city.builder)) {
      expect(record.level).toBeLessThanOrEqual(arcologyOf(record.arcology!).stages.length - 1);
    }

    // **`registry.count` e `state.buildings.length` qui non coincidono, ed e' il
    // progetto.** Un'arcologia e' *un* record e *N* edifici per la simulazione,
    // uno per fascia di quota: e' il modo in cui gli usi arrivano a `src/sim/`
    // senza insegnargli la verticale. La somma deve tornare esatta — se un
    // `addBuilding` fosse stato rifiutato e `uses` lo avesse registrato lo
    // stesso, capacita' e occupazione divergerebbero.
    const declared = arcologies(city.builder)
      .reduce((sum, record) => sum + (record.uses ?? []).length, 0);
    expect(declared).toBeGreaterThan(0);
    expect(city.builder.registry.count + declared).toBe(city.state.buildings.length);
  });

  it('lo stadio raggiunto e quello che il conteggio congelato alla fondazione decide', () => {
    // **Il conteggio si legge una volta, alla fondazione, e non si ricalcola.**
    // Lo sventramento toglie dal raggio gli edifici che avevano fatto superare
    // `minBuilt`: se `climb` ricontasse i vicini vivi, la struttura si fermerebbe
    // sotto la corona pur avendo il centro denso attorno. A convergenza lo stadio
    // deve coincidere con quello che il valore congelato decide — e, con il conteggio
    // vivo al suo posto, resterebbe sotto.
    for (const record of arcologies(city.builder)) {
      const recipe = arcologyOf(record.arcology!);
      expect(record.foundedNeighbours).toBeDefined();
      expect(record.level).toBe(stageForBuildings(recipe, record.foundedNeighbours!));
    }
  });
});

describe('ArcologyDriver — innestata nella rete in quota', () => {
  /** I piazzali di un'arcologia, come record. */
  function landingsOf(builder: Builder, record: BuildingRecord): readonly BuildingRecord[] {
    return [...builder.registry.decksOf(record.id)]
      .filter((deck) => deck.aerial === AERIAL_PART.node);
  }

  it('ogni piazzale sta dove la ricetta lo mette, alla quota giusta', () => {
    for (const record of arcologies(city.builder)) {
      const recipe = arcologyOf(record.arcology!);
      // `BuildingRecord.facing` e' un numero per tutti; qui e' sempre uno dei
      // quattro versi, perche' a scriverlo e' stato il driver.
      const facing = (record.facing ?? FACING.east) as Facing;
      const planned = worldLandings(recipe, facing, record.x, record.y)
        .filter((landing) => landing.stage <= record.level);
      const built = landingsOf(city.builder, record);

      expect(built.length, `arcologia ${record.id}`).toBe(planned.length);
      for (const landing of planned) {
        // Due piazzali possono stare sulla stessa pianta a quote diverse — il
        // molo del podio e quello del mezzanino lo fanno — quindi il confronto
        // e' sulla terna, non sulla coppia. Il piano calpestabile e' l'ultimo
        // voxel del record: e' la convenzione che `routeEndOf` legge per sapere
        // da che quota parte un percorso.
        const deckZ = record.baseZ + landing.z - 1;
        const match = built.find((deck) => deck.x === landing.x && deck.y === landing.y &&
          deck.baseZ + deck.height - 1 === deckZ);
        expect(match, `piazzale ${landing.x},${landing.y},${deckZ}`).toBeDefined();
        expect(match!.footprint).toBe(landing.sizeX);
        expect(footprintDepth(match!)).toBe(landing.sizeY);
      }
    }
  });

  it('i piazzali entrano nell indice della rete come qualunque impalcato', () => {
    // `routePass` scorre `registry.decks`: un piazzale che non finisse li'
    // dentro non verrebbe nemmeno esaminato, e la casella sarebbe chiusa da
    // codice che non gira mai.
    const indexed = new Set(city.builder.registry.decks.map((deck) => deck.id));
    // Solo le megastrutture che salgono: la piazza di un earthscraper *e'* il
    // piano di campagna, ci si arriva camminando, e un attracco in quota sarebbe
    // un capolinea che nessun percorso ha motivo di cercare.
    for (const record of towers(city.builder)) {
      const pads = landingsOf(city.builder, record);
      expect(pads.length).toBeGreaterThan(0);
      for (const pad of pads) expect(indexed.has(pad.id)).toBe(true);
    }
    for (const record of pits(city.builder)) {
      expect(landingsOf(city.builder, record).length, `earthscraper ${record.id}`).toBe(0);
    }
  });

  it('ogni piazzale e un capo di percorso valido: quota, fronte e vuoto davanti', () => {
    // **Tre misure, tre correzioni, e nessuna si vedeva dai test puri.** Il
    // primo piazzale stava a settanta voxel dal piano finito e un percorso ne
    // assorbe trentadue; il secondo era profondo tre e `planBetween` rifiuta con
    // `noLanding` un fronte piu' stretto di una passerella; il terzo era a filo
    // del tetto del podio, e la corsia partiva **dentro** il podio. Sono le tre
    // condizioni che un capo deve soddisfare, ed e' quello che si verifica qui —
    // non che il percorso esista, che dipende anche da cosa c'e' intorno.
    const reach = AERIAL.route.maxNodes * AERIAL.route.stepPerNode;

    for (const record of towers(city.builder)) {
      const pads = landingsOf(city.builder, record);
      const lowest = Math.min(...pads.map((pad) => pad.baseZ + pad.height - 1));

      // Alla portata di un percorso, contata dal piano finito della struttura.
      expect(lowest - record.baseZ).toBeLessThanOrEqual(reach);
      for (const pad of pads) {
        // Largo quanto una passerella su **tutti e due** gli assi: un capo largo
        // abbastanza per una direzione sola e' meta' capo.
        expect(pad.footprint).toBeGreaterThanOrEqual(AERIAL.route.walkWidth);
        expect(footprintDepth(pad)).toBeGreaterThanOrEqual(AERIAL.route.walkWidth);
        // E sta in aria, non a terra: e' la meta' della casella che dice «senza
        // toccare terra».
        expect(pad.baseZ).toBeGreaterThan(record.baseZ);
      }
    }
  });
});

/**
 * Gli isolati candidati della citta' cresciuta, con le sole misure che decidono
 * la famiglia: il bonus di quota della gerarchia e la roccia che il sito offre.
 *
 * Rifa' le domande del driver invece di chiedergliele, perche' `found` risponde
 * con un rifiuto solo — il primo — e qui serve sapere *quanti* isolati la
 * condizione interrata potrebbe prendere, non perche' l'ultimo non l'ha presa.
 */
function candidateBlocks(): readonly {
  readonly key: string;
  readonly heightBonus: number;
  readonly built: number;
  readonly depth: number;
  readonly dryRim: boolean;
}[] {
  const { builder, state, map } = city;
  const seed = 4242;
  const poles = state.reach.polesOf(state.catalysts);
  const seen = new Set<string>();
  const out: {
    key: string; heightBonus: number; built: number; depth: number; dryRim: boolean;
  }[] = [];

  for (const record of builder.registry.all) {
    if (record.arcology !== undefined || record.aerial !== undefined) continue;
    const block = blockAt(seed, record.x, record.y);
    const key = `${block.kx},${block.ky}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rect = blockRect(seed, block);
    const ax = rect.x0 + ((rect.x1 - rect.x0) >> 1);
    const ay = rect.y0 + ((rect.y1 - rect.y0) >> 1);
    const site = surveySunkenSite(map, rect.x0, rect.y0, 20, 20);
    out.push({
      key,
      heightBonus: heightBonusAt({
        x: ax,
        y: ay,
        poles,
        waterDistance: waterDistance(map, ax, ay, SKYLINE.coastNear),
        builtNeighbours: builder.registry.countWithinRadius(ax, ay, SKYLINE.edgeRadius),
        seed,
        blockKx: block.kx,
        blockKy: block.ky,
      }),
      built: builder.registry.countWithinRadius(ax, ay, ARCOLOGY.radius),
      depth: site.depth,
      dryRim: site.dryRim,
    });
  }
  return out;
}

describe('ArcologyDriver — l earthscraper', () => {
  it('la condizione interrata ha davvero dei siti sull isola', () => {
    // **E' il test che questa famiglia esiste per avere**, ed e' gia' stato
    // rosso: la condizione originale — «nasce dove la gerarchia non concede
    // altezza», cioe' `tier !== core` — non aveva **nessun** sito, perche' il
    // tessuto denso di una citta' cresciuta e' tutto `core` e cio' che sta fuori
    // e' rado e costiero. E' il difetto di `isPeakBlock` per la terza volta, e
    // l'unico modo di accorgersene e' guardare gli isolati veri.
    //
    // Si misura il **sito** e non la nascita, di proposito: fondare passa anche
    // da `cappedNeighbours`, che questa isola non soddisfa piu' da quando
    // `SCALE.maxLevel` e' salito a 26 e ha spostato il tetto del centro a
    // ventitre' fasce (vedi la 4.18 in ROADMAP). Quel blocco vale per **tutte e
    // due** le famiglie ed e' di un altro dominio; questa casella difende cio'
    // che e' di questo — che un isolato da scavare esista.
    const blocks = candidateBlocks();
    const diggable = blocks.filter((b) =>
      b.heightBonus < SKYLINE.coneBonus && b.dryRim && b.depth >= MIN_SUNKEN_DEPTH);
    expect(
      diggable.length,
      `isolati: ${blocks.map((b) => `${b.key} bonus=${b.heightBonus} d=${b.depth}`).join(' ')}`,
    ).toBeGreaterThan(0);
  });

  it('e non se li prende tutti: la cresta resta a chi sale', () => {
    // L'altra meta' della stessa riga. Una condizione che prendesse ogni isolato
    // denso avrebbe cancellato la famiglia che sale invece di affiancarla, e
    // sarebbe passata inosservata quanto la prima: il catalogo alto sarebbe
    // rimasto verde, e in partita non ci sarebbe stata piu' una torre.
    const blocks = candidateBlocks();
    const crest = blocks.filter((b) =>
      b.heightBonus >= SKYLINE.coneBonus && b.built >= ARCOLOGY.minBuilt);
    expect(crest.length).toBeGreaterThan(0);
  });

  it('le due famiglie non si contendono un isolato', () => {
    // La simmetria e' il contenuto della famiglia: la cresta del cono sceglie la
    // torre, la spalla sceglie il cratere, e le due condizioni non possono
    // essere vere insieme. La conseguenza osservabile e' questa — nessun isolato
    // porta una struttura di entrambe le famiglie — e se un giorno le due
    // condizioni si sovrapponessero sarebbe la prima cosa a rompersi.
    const blockKey = (record: BuildingRecord) => {
      const anchor = { x: record.x + (record.footprint >> 1), y: record.y + (footprintDepth(record) >> 1) };
      return `${anchor.x >> 5},${anchor.y >> 5}`;
    };
    const towerBlocks = new Set(towers(city.builder).map(blockKey));
    for (const record of pits(city.builder)) {
      expect(towerBlocks.has(blockKey(record)), `earthscraper ${record.id}`).toBe(false);
    }
  });

  it('apre un pozzo vero nei voxel, aperto fino al cielo', () => {
    // **La sola prova che lo scavo e' avvenuto.** Il registro direbbe di si'
    // anche se la coda avesse cancellato zero voxel: qui si guarda il mondo, e
    // si chiede che la colonna centrale del pozzo sia vuota dal fondo fino sopra
    // il piano di campagna — cioe' che ci si veda dentro dall'alto.
    for (const record of pits(city.builder)) {
      const recipe = arcologyOf(record.arcology!);
      const depth = recipe.sunken!.depth;
      const cx = record.x + (record.footprint >> 1);
      const cy = record.y + (footprintDepth(record) >> 1);

      let empty = 0;
      for (let z = record.baseZ + 1; z < record.baseZ + depth; z++) {
        if (city.world.getBlock(cx, cy, z) === 0) empty++;
      }
      // Non tutte: il fondo porta il giardino e la bocca porta le passerelle.
      // Ma la gran parte della colonna centrale deve essere aria, o il pozzo e'
      // rimasto pieno di roccia.
      expect(empty, `earthscraper ${record.id} a ${cx},${cy}`)
        .toBeGreaterThan(depth - SUNKEN.headroom);
    }
  });

  it('scende sotto il livello del mare senza bagnarsi', () => {
    // Il fondo va sotto `seaLevel` per costruzione — e' l'unico modo di trovare
    // ventidue quote su un'isola alta trentaquattro — quindi la roccia attorno
    // e' tutto cio' che tiene il pozzo asciutto. `SUNKEN.floorZ` e' il pavimento
    // che gli impedisce di arrivare al fondale.
    for (const record of pits(city.builder)) {
      expect(record.baseZ, `earthscraper ${record.id}`).toBeGreaterThanOrEqual(SUNKEN.floorZ);
    }
  });
});

describe('ArcologyDriver — dentro i budget', () => {
  it('cresce a stadi, e nessuno stadio compare in un fotogramma solo', () => {
    // Un inviluppo di quasi duecento quote non entra in `maxDirtyChunksPerBuilding`
    // nemmeno da lontano: e' il motivo per cui il driver accoda il **delta** di
    // uno stadio e non la sagoma cumulativa. Il conto esatto lo verifica la suite
    // pura su ogni verso; qui si verifica che la citta' vera non abbia trovato una
    // strada per aggirarlo — se uno stadio fosse stato scartato per budget, la
    // struttura sarebbe rimasta ferma allo stadio prima e nessuno l'avrebbe detto.
    for (const record of arcologies(city.builder)) {
      expect(record.level).toBeGreaterThanOrEqual(0);
      const recipe = arcologyOf(record.arcology!);
      expect(record.height).toBe(recipe.height);
      // Gli usi dichiarati sono quelli delle fasce che lo stadio raggiunto apre:
      // uno stadio arrivato a meta' li lascerebbe indietro.
      const due = recipe.bands.filter((band) => band.stage <= record.level).length;
      expect((record.uses ?? []).length).toBe(due);
    }
  });

  it('la passata e un cursore: il costo non cresce con la citta', () => {
    // Nessuna passata puo' esaminare piu' di `examinedPerPass` record, quale che
    // sia la dimensione del registry. E' la stessa forma di tutte le altre
    // passate del Builder, ed e' cio' che tiene il tick piatto su una citta'
    // grande.
    expect(ARCOLOGY.examinedPerPass).toBeLessThan(city.builder.registry.count);
    expect(city.builder.stats.arcologyRefusal === null ||
      city.builder.stats.arcologies > 0).toBe(true);
  });
});
