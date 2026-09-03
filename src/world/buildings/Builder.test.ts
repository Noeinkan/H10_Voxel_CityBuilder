import { describe, expect, it } from 'vitest';
import {
  BUILDING_CLASS,
  addBuilding,
  addCatalyst,
  catalystById,
  createSimState,
  tick,
  type CharterId,
  type SimState,
} from '../../sim';
import { AERIAL_PART, type AerialPart } from '../aerial/config';
import { CHUNK } from '../chunkCoords';
import { LANDMARKS } from '../landmarks/config';
import { generateLandmark, landmarkSpan } from '../landmarks/generate';
import { footprintDepth } from './BuildingRegistry';
import { recordStamp } from './recordStamp';
import { anchorOf } from './growthQueue';
import { solidCount } from './stamp';
import { SPANS, SPAN_KIND } from '../spans/config';
import { SpanNetwork } from '../spans/network';
import { StreetNetwork } from '../streets/StreetNetwork';
import { STREETS } from '../streets/config';
import { FACING } from '../streets/streetGrid';
import type { BuildingRecord } from './BuildingRegistry';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { generateIsland } from '../terrain/IslandGenerator';
import { SURFACE_KIND, blockPalette } from '../visualBlock';
import { WATER_IDS } from '../terrain/config';
import { Builder, REJECT_REASONS } from './Builder';
import { BUILDER, CLASS_PROFILE, MAX_FOOTPRINT } from './config';
import { GRADING } from '../grading/config';
import { GROUND, groundKindOf, isDryLand, type GroundKind } from '../grading/grade';
import { SKYLINE } from '../skyline/config';
import { TIER } from '../skyline/tiers';
import { waterDistance, waterFacing } from '../sites/siteRules';
import { SITE } from '../sites/config';
import { groundKindAt } from './siteWorks';
import { TERRAIN } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';

/**
 * I soli edifici veri.
 *
 * Il registry ospita anche landmark, campate e la citta' in quota, che edifici
 * non sono: non hanno un uso urbano, la simulazione non li ha mai contati, una
 * campata non e' nemmeno appoggiata al suolo e una mensola non ha un'impronta
 * che rispetti il tetto degli edifici. Le asserzioni sulla crescita — impronta,
 * fronte strada, fila, opere sotto il piano — parlano di edifici, e vanno lette
 * su quelli.
 */
function buildingsOf(builder: Builder): readonly BuildingRecord[] {
  return [...builder.registry.all].filter((record) =>
    record.landmark === undefined &&
    record.span === undefined &&
    record.aerial === undefined);
}

/**
 * Tick necessari perche' il Builder faccia `builds` infornate.
 *
 * Le citta' di prova di questo file si misurano in **infornate**, non in tick:
 * quanto una fixture matura dipende da quante volte il Builder costruisce, e
 * `BUILDER.ticksPerBuild` decide quanti tick ci vogliono per una di quelle
 * volte. Scrivere i tick a mano legava ogni fixture del file a una
 * calibrazione del ritmo — rallentarlo rimpiccioliva in silenzio ogni citta',
 * e i test fallivano per la ragione sbagliata.
 */
function ticksFor(builds: number): number {
  return builds * BUILDER.ticksPerBuild;
}

/**
 * Un tick che tiene disarmato il **fronte del declino**.
 *
 * Le citta' di prova di questo file crescono per centinaia di infornate attorno
 * a un solo catalizzatore residenziale, senza un servizio in vista: sotto le
 * regole della 8.2 quella e' una citta' che smette di fondare e comincia a
 * perdere isolati, ed e' la risposta giusta — ma qui si provano campate,
 * mensole, opere di terra e sventramenti, che con la copertura non c'entrano
 * niente. Azzerare il fronte e' il modo esplicito di dire che questo file non
 * prova il declino; a provarlo e' `decayDriver.test.ts`.
 *
 * `tick` lo ricalcola a ogni giro, quindi va rimesso a zero a ogni giro: un
 * valore iniziale non basterebbe.
 */
function tickHeld(state: SimState, terrain: TerrainMap): SimState {
  return { ...tick(state, terrain), decayPressure: 0 };
}

describe('Builder', () => {
  it('trasforma un candidato della simulazione in voxel e occupazione', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    let state = createSimState();
    state = addCatalyst(state, {
      x: 24,
      y: 24,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 20,
    });

    state = builder.onTick(state);
    expect(builder.stats.placed).toBeGreaterThan(0);
    expect(state.buildings).toHaveLength(builder.stats.placed);
    expect(builder.registry.count).toBe(builder.stats.placed);

    while (builder.stats.growing > 0) builder.step();
    expect(world.solidVoxelCount).toBeGreaterThan(0);
  });

  it('materializza subito gli edifici gia presenti nello stato', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    const state = addBuilding(createSimState(), {
      x: 12,
      y: 12,
      class: BUILDING_CLASS.residential,
      level: 8,
    });

    builder.materialize(state.buildings);

    expect(builder.registry.count).toBe(1);
    expect([...builder.registry.all][0]?.level).toBe(8);
    expect(builder.stats.growing).toBe(0);
    expect(world.solidVoxelCount).toBeGreaterThan(0);
    // Il ripiego residenziale smussa gli spigoli (`chamfer: 1`): la colonna
    // d'ancora (12,12) e' un angolo tagliato, quindi si sonda un punto interno.
    expect(world.getSurfaceKind(14, 14, 12)).not.toBe(SURFACE_KIND.plain);
  });

  it('circonda il landmark di suolo pubblico a budget, senza cambiare la quota', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 3, chunksY: 3, height: 12 });
    const builder = new Builder(world, terrain, 1337);

    builder.placeLandmark(40, 40, 'market');
    expect(builder.stats.surfaceQueued).toBeGreaterThan(0);
    while (builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) builder.step();

    const record = [...builder.registry.all].find((r) => r.landmark !== undefined)!;
    const depth = record.footprintY ?? record.footprint;

    // Il grembiule sta **attorno** all'ingombro, non sotto: dentro il riquadro
    // c'e' la struttura, e appena fuori il suolo pubblico che la incornicia.
    expect(world.getBlock(record.x - 1, record.y + 1, 11)).toBe(PALETTE_SLOTS.asphalt);
    expect(world.getBlock(record.x + record.footprint, record.y + depth - 1, 11))
      .toBe(PALETTE_SLOTS.asphalt);
    expect(terrain.columnAt(40, 40)?.height).toBe(12);
  });

  it('bonifica la vegetazione che interseca un nuovo lotto', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const builder = new Builder(world, terrain, 1337);
    world.setBlock(11, 12, 12, PALETTE_SLOTS.wood);
    world.setBlock(11, 12, 13, PALETTE_SLOTS.grassLight);

    builder.materialize([{ x: 12, y: 12, class: BUILDING_CLASS.residential }]);

    expect(world.getBlock(11, 12, 12)).toBe(0);
    expect(world.getBlock(11, 12, 13)).toBe(0);
  });
});

/**
 * Il gate della 4.5, verificato invece che dichiarato.
 *
 * Sono le tre affermazioni che la fase fa e che a occhio non si controllano: le
 * campate poggiano su appoggi **veri**, non prendono **suolo**, e formano una
 * **rete** — un percorso continuo fra due isolati diversi che non passa da terra.
 */
describe('Builder — la rete in quota', () => {
  type City = { world: VoxelWorld; builder: Builder; streets: StreetNetwork };

  function buildCity(builds = 110): City {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const builder = new Builder(world, terrain, 1337);

    let state = createSimState();
    state = addCatalyst(state, {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < ticksFor(builds); i++) {
      state = tickHeld(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, builder, streets: new StreetNetwork(1337) };
  }

  /**
   * La citta' a un dato numero di round, costruita una volta sola.
   *
   * Far maturare la citta' e' di gran lunga la voce piu' cara del file — 110
   * infornate di `tick` piu' costruzione — e i test qui sotto la leggono soltanto:
   * nessuno chiama `step` o tocca il registry. Chi deve invece **provare** che due
   * generazioni coincidono usa `buildCity` direttamente, altrimenti si
   * confronterebbe con se stessa e passerebbe comunque.
   */
  const cities = new Map<number, City>();

  function city(builds = 110): City {
    const cached = cities.get(builds);
    if (cached !== undefined) return cached;
    const fresh = buildCity(builds);
    cities.set(builds, fresh);
    return fresh;
  }

  it('una citta matura si da delle campate', () => {
    const { builder } = city();
    // Se questo torna a zero la fase e' inerte: tutto il resto passerebbe
    // vacuamente, perche' non ci sarebbe niente da verificare.
    expect(builder.stats.spans).toBeGreaterThan(0);
  });


  it('un cortile d isolato diventa una piazza in quota', () => {
    // La piazza arriva piu' tardi dei ponti: ha bisogno che il perimetro di un
    // isolato sia costruito su almeno due lati e abbastanza alto. Su una citta'
    // ancora in crescita il cuore e' aperto e non ha muri a cui appoggiarsi.
    const { builder } = city(210);
    const plazas = builder.registry.spans.filter((s) => s.span === SPAN_KIND.plaza);

    expect(plazas.length).toBeGreaterThan(0);
    for (const plaza of plazas) {
      // Tre o piu' appoggi: e' cio' che la distingue da un ponte largo, ed e'
      // anche cio' che ne fa un nodo — le campate ci arrivano da lati diversi.
      expect((plaza.supports ?? []).length)
        .toBeGreaterThanOrEqual(SPANS.plaza.minSupports);
      expect(plaza.footprint).toBeGreaterThanOrEqual(SPANS.plaza.minSide);
      expect(footprintDepth(plaza)).toBeGreaterThanOrEqual(SPANS.plaza.minSide);
    }
  });

  /**
   * true se, su questo asse, entrambi i capi della corsa sono pieni per tutta
   * la larghezza dell'impalcato.
   *
   * L'asse non si indovina dalle misure: una campata larga quanto e' lunga e'
   * quadrata, e un ponte corto lo e' spesso. Si provano tutti e due.
   */
  function anchoredOn(world: VoxelWorld, span: BuildingRecord, axis: 0 | 1): boolean {
    const depth = footprintDepth(span);
    // La carreggiata sta in cima alla sezione: sotto ci sono le travi.
    const deckZ = span.baseZ + span.height - 1;
    const runFrom = axis === 0 ? span.x : span.y;
    const runTo = runFrom + (axis === 0 ? span.footprint : depth) - 1;
    const cross = axis === 0 ? span.y : span.x;
    const width = axis === 0 ? depth : span.footprint;

    return [runFrom - 1, runTo + 1].every((v) => {
      for (let w = cross; w < cross + width; w++) {
        const solid = axis === 0
          ? world.getBlock(v, w, deckZ)
          : world.getBlock(w, v, deckZ);
        if (solid === 0) return false;
      }
      return true;
    });
  }

  it('il gate: ogni campata poggia su appoggi reali', () => {
    const { world, builder } = city();
    const spans = builder.registry.spans;
    expect(spans.length).toBeGreaterThan(0);

    for (const span of spans) {
      // **La piazza non ha due testate, ne ha un perimetro.** Chiederle i due
      // capi pieni per tutta la larghezza e' chiederle di essere un ponte largo,
      // che e' proprio cio' che `minSupports` esiste per escludere: i suoi
      // appoggi li verifica il test della piazza, con la domanda giusta.
      if (span.span === SPAN_KIND.plaza) continue;
      // Piena per **tutta** la larghezza, ai due capi: una campata appoggiata a
      // meta' sporgerebbe nel vuoto da un lato, e a distanza di gioco si vede.
      expect(
        anchoredOn(world, span, 0) || anchoredOn(world, span, 1),
        `campata ${span.id} a ${span.x},${span.y} base=${span.baseZ}`,
      ).toBe(true);
    }
  });

  it('una campata non prende suolo: sotto restano lotti e carreggiata', () => {
    const { builder } = city();
    const spans = builder.registry.spans;
    expect(spans.length).toBeGreaterThan(0);

    for (const span of spans) {
      for (let dy = 0; dy < footprintDepth(span); dy++) {
        for (let dx = 0; dx < span.footprint; dx++) {
          const x = span.x + dx;
          const y = span.y + dy;
          // Una campata atterra dove i corpi si affacciano, quindi sporge sopra
          // le fasce basse dei propri appoggi: su quelle colonne il suolo e'
          // preso, ma da loro. L'invariante e' che a prenderlo non sia **mai**
          // la campata — una colonna coperta solo da campate resta libera, ed e'
          // cosi' che sotto un ponte si dipinge ancora la carreggiata e si
          // costruisce ancora un lotto.
          const onlySpans = builder.registry.at(x, y)
            .every((record) => record.span !== undefined);
          if (!onlySpans) continue;
          expect(
            builder.registry.isOccupied(x, y),
            `campata ${span.id} occupa ${x},${y}`,
          ).toBe(false);
        }
      }
    }
  });

  it('il gate: esiste un percorso continuo fra due isolati diversi', () => {
    const { builder } = city();
    // A uno la rete e' un ornamento — dei ponti che non portano da nessuna
    // parte. Da due in su e' un secondo piano stradale, ed e' la differenza che
    // il riferimento al Minneapolis Skyway mette al centro.
    expect(builder.stats.spanReach).toBeGreaterThanOrEqual(2);
  });

  it('nessuna campata chiude un ciclo: la rete e un albero', () => {
    const { builder } = city();
    const spans = builder.registry.spans;

    // Ogni campata ha unito due componenti separate quando e' nata, quindi
    // rimetterle una per volta non deve mai trovarne due gia' connesse.
    const network = new SpanNetwork();
    for (const span of spans) {
      expect(network.add({ supports: span.supports }), `campata ${span.id}`).toBe(true);
    }
  });

  it('nessun edificio regge piu campate di quante ne ammetta il tetto', () => {
    const { builder } = city();
    const network = SpanNetwork.of(builder.registry.spans);

    for (const record of builder.registry.all) {
      expect(network.degreeOf(record.id)).toBeLessThanOrEqual(SPANS.maxPerSupport);
    }
  });

  it('a parita di seed la rete in quota e identica', () => {
    // Due costruzioni vere, non la stessa dalla cache: e' l'unico test del blocco
    // per cui riusare la citta' significherebbe confrontarla con se stessa.
    const first = buildCity(60).builder.registry.spans
      .map((s) => `${s.x},${s.y},${s.baseZ},${s.span},${s.supports}`);
    const second = buildCity(60).builder.registry.spans
      .map((s) => `${s.x},${s.y},${s.baseZ},${s.span},${s.supports}`);

    expect(first).toEqual(second);
  });

  it('nessuna campata resta orfana quando l appoggio cambia livello', () => {
    const { builder } = city();
    const spans = builder.registry.spans;
    expect(spans.length).toBeGreaterThan(0);

    // Ogni campata viva deve avere appoggi vivi, e ogni appoggio deve essere
    // ancora l'edificio su cui era nata: un upgrade rigenera la sagoma, quindi
    // una campata sopravvissuta a un upgrade sarebbe attaccata a un volume che
    // non esiste piu'.
    for (const span of spans) {
      for (const id of span.supports ?? []) {
        expect(builder.registry.get(id), `appoggio ${id} di ${span.id}`).not.toBeNull();
      }
    }
  });
});

/**
 * Il gate della 4.9, verificato invece che dichiarato.
 *
 * La fase dice tre cose che a occhio non si controllano: qualcosa **sporge oltre
 * l'impronta** di un edificio, sopra ci si **costruisce**, e una gamba prende
 * suolo mentre l'impalcato che regge non lo prende.
 */
describe('Builder — la citta in quota', () => {
  type AerialCity = { world: VoxelWorld; builder: Builder };

  function buildAerialCity(builds: number, seed = 1337): AerialCity {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const builder = new Builder(world, terrain, seed);

    let state = createSimState();
    state = addCatalyst(state, {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < ticksFor(builds); i++) {
      state = tickHeld(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();
    return { world, builder };
  }

  let shared: AerialCity | null = null;
  function aerialCity(): AerialCity {
    if (shared === null) shared = buildAerialCity(210);
    return shared;
  }

  function partsOf(builder: Builder, part: AerialPart): readonly BuildingRecord[] {
    return [...builder.registry.all].filter((record) => record.aerial === part);
  }

  it('una citta matura si da delle mensole', () => {
    const { builder } = aerialCity();
    // Se questo torna a zero la fase e' inerte: tutto il resto passerebbe
    // vacuamente, perche' non ci sarebbe niente da verificare.
    expect(builder.stats.terraces).toBeGreaterThan(0);
    expect(partsOf(builder, AERIAL_PART.terrace).length).toBe(builder.stats.terraces);
  });

  it('una mensola sporge oltre l impronta del proprio ospite', () => {
    // **E' il fatto nuovo della fase.** La grammatica degli edifici dichiara che
    // nessuna fascia esce dal riquadro, e che per questo la collisione resta
    // bidimensionale: qui qualcosa esce, ed e' legale perche' il registry
    // confronta gli intervalli di quota colonna per colonna.
    const { builder } = aerialCity();

    for (const terrace of partsOf(builder, AERIAL_PART.terrace)) {
      const host = builder.registry.get(terrace.supports?.[0] ?? 0);
      expect(host, `mensola ${terrace.id} senza ospite`).not.toBeNull();
      if (host === null) continue;

      const outside =
        terrace.x + terrace.footprint > host.x + host.footprint ||
        terrace.x < host.x ||
        terrace.y + footprintDepth(terrace) > host.y + footprintDepth(host) ||
        terrace.y < host.y;
      expect(outside, `mensola ${terrace.id} tutta dentro l'ospite ${host.id}`).toBe(true);

      // E sta **in aria**: parte piu' in alto della base del proprio ospite.
      expect(terrace.baseZ).toBeGreaterThan(host.baseZ);
    }
  });

  it('una mensola non prende suolo, la sua gamba si', () => {
    const { builder } = aerialCity();

    for (const terrace of partsOf(builder, AERIAL_PART.terrace)) {
      // L'invariante del dominio, colonna per colonna: la mensola c'e' — quindi
      // niente le si costruisce attraverso — ma il suolo sotto resta di chi ci
      // sta, perche' in `groundColumns` non entra.
      for (let dy = 0; dy < footprintDepth(terrace); dy++) {
        for (let dx = 0; dx < terrace.footprint; dx++) {
          const at = builder.registry.at(terrace.x + dx, terrace.y + dy);
          expect(at.some((record) => record.id === terrace.id)).toBe(true);
        }
      }
    }

    for (const pier of partsOf(builder, AERIAL_PART.pier)) {
      // La gamba invece il suolo lo prende, ed e' per questo che nessun lotto le
      // nasce addosso.
      expect(builder.registry.isOccupied(pier.x, pier.y)).toBe(true);
    }
  });

  it('sopra una quota nasce un edificio, e ci sta dentro', () => {
    const { builder } = aerialCity();
    // Il gate vero della fase: **si abita sopra la citta'**.
    expect(builder.stats.stacked).toBeGreaterThan(0);

    const decks = builder.registry.decks;
    const stacked = buildingsOf(builder).filter((record) =>
      decks.some((deck) => record.baseZ === deck.baseZ + deck.height));
    expect(stacked.length).toBe(builder.stats.stacked);

    for (const record of stacked) {
      // In quota il lotto **e'** l'impalcato: non c'e' una maglia stradale a cui
      // riferirsi, e l'impronta sta dentro il riquadro che la ospita.
      const deck = decks.find((candidate) =>
        record.baseZ === candidate.baseZ + candidate.height &&
        record.x >= candidate.x &&
        record.y >= candidate.y &&
        record.x + record.footprint <= candidate.x + candidate.footprint &&
        record.y + footprintDepth(record) <= candidate.y + footprintDepth(candidate));
      expect(deck, `edificio ${record.id} in quota non sta dentro nessun impalcato`)
        .toBeDefined();
    }
  });

  it('la citta in quota si collega: nascono dei percorsi', () => {
    // **E' la riga che distingue questo incremento da quello prima.** Il planner
    // dei percorsi funzionava gia' e i test puri lo coprivano; su una citta'
    // cresciuta ne nascevano **zero**, perche' le mensole si prendevano la fascia
    // piu' alta di ciascun ospite e non si guardavano mai. Se questo torna a
    // zero, la rete e' di nuovo una promessa.
    const { builder } = aerialCity();
    expect(builder.stats.routes).toBeGreaterThan(0);

    // Un percorso e' fatto di tratti e di pianerottoli, e i suoi due capi sono
    // impalcati veri: un tratto d'estremita' che non trovasse il proprio capo in
    // registry sarebbe una passerella che finisce nel vuoto, cioe' il difetto
    // che il vincolo della fase esclude.
    const walks = partsOf(builder, AERIAL_PART.walk);
    expect(walks.length).toBeGreaterThan(0);

    for (const piece of [...walks, ...partsOf(builder, AERIAL_PART.node)]) {
      for (const support of piece.supports ?? []) {
        expect(builder.registry.get(support), `pezzo ${piece.id} senza capo`).not.toBeNull();
      }
      // E sta in aria: un pezzo di percorso comincia sopra il terreno della
      // propria colonna, mai dentro.
      expect(piece.baseZ).toBeGreaterThan(0);
    }
  });

  it('ci si muove fra i livelli: ogni montante tocca terra e impalcato', () => {
    // **L'altra meta' del gate.** Si abitava sopra la citta' senza poterci
    // arrivare: il montante e' la via, e questi sono i due fatti che deve
    // garantire — che poggi su qualcosa di vero, e che arrivi davvero al piano
    // che serve. Nessuna struttura sospesa, nemmeno qui.
    const { builder } = aerialCity();
    expect(builder.stats.lifts).toBeGreaterThan(0);

    const lifts = partsOf(builder, AERIAL_PART.lift);
    expect(lifts.length).toBe(builder.stats.lifts);

    for (const lift of lifts) {
      const served = builder.registry.get(lift.supports?.[0] ?? 0);
      expect(served, `montante ${lift.id} senza impalcato`).not.toBeNull();
      if (served === null) continue;

      // Arriva **esattamente** sotto il piano che serve.
      expect(lift.baseZ + lift.height).toBe(served.baseZ);
      // E prende suolo, come una gamba e a differenza di tutto il resto della
      // citta' in quota: e' la sola parte che comincia in basso.
      expect(builder.registry.isOccupied(lift.x, lift.y)).toBe(true);
    }
  });

  it('a parita di seed la citta in quota e identica', () => {
    const shapeOf = (builder: Builder): string =>
      [...builder.registry.all]
        .filter((record) => record.aerial !== undefined)
        .map((r) => `${r.aerial}:${r.x},${r.y},${r.baseZ},${r.footprint}x${footprintDepth(r)}`)
        .join('|');

    const a = buildAerialCity(120, 4242);
    const b = buildAerialCity(120, 4242);

    expect(shapeOf(a.builder)).toBe(shapeOf(b.builder));
    expect(a.builder.stats.terraces).toBe(b.builder.stats.terraces);
    // Percorsi e montanti entrano nel confronto: sono le due strutture nuove, e
    // sono anche quelle che scelgono un posto **cercandolo** — un pianerottolo
    // che scorre, un piede che si sposta per trovare un tetto. E' li' che un
    // ordine di visita non dichiarato si infilerebbe.
    expect(a.builder.stats.routes).toBe(b.builder.stats.routes);
    expect(a.builder.stats.lifts).toBe(b.builder.stats.lifts);
  });
});

/**
 * Il debito che la 4.12 aveva lasciato aperto, e che la 4.5 chiude.
 *
 * I landmark lineari — il molo, la pista, il viadotto — attraversano piu' piani
 * di chunk di una torre alta, e la 4.12 se l'era cavata alzando il tetto di
 * chunk sporchi apposta per loro. Da qui in avanti si spezzano in ritagli come
 * le campate, e il tetto torna a essere quello di ogni altra struttura: questi
 * test verificano che nessuna ricetta venga scartata **in silenzio**, che e' il
 * modo esatto in cui quel difetto si presenta.
 */
describe('Builder — i landmark si spezzano invece di farsi esentare', () => {
  function flat(): { world: VoxelWorld; builder: Builder } {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 4, chunksY: 4, height: 24 });
    return { world, builder: new Builder(world, terrain, 1337) };
  }

  // Che *ogni* ricetta ci stia, su ogni verso e a sedici offset diversi, lo
  // verifica gia' «nessuna ricetta sfora il tetto di chunk sporchi» piu' sotto:
  // quel test passava con il tetto alzato a quarantotto e passa ancora adesso
  // che non c'e' piu' — ed e' la prova che i ritagli hanno reso l'eccezione
  // inutile invece di nasconderla. Qui restano i due fatti che i ritagli
  // aggiungono e che nessun altro test coprirebbe.

  it('una ricetta lunga entra in coda a piu ritagli', () => {
    const { builder } = flat();
    // La pista e' ventisei colonne: oltre il lato di un ritaglio, quindi
    // dev'essere spezzata. Se un giorno `segmentSide` salisse sopra l'ingombro
    // piu' lungo del catalogo, questo test lo direbbe invece di lasciare che la
    // segmentazione diventi codice morto.
    builder.placeLandmark(40, 40, 'airport');
    expect(builder.stats.growing).toBeGreaterThan(1);
  });

  it('i ritagli scrivono tutti i voxel della ricetta, non solo il primo', () => {
    const { world, builder } = flat();
    builder.placeLandmark(40, 40, 'airport');
    while (builder.stats.growing > 0) builder.step();

    const record = [...builder.registry.all].find((r) => r.landmark === 'airport');
    expect(record).toBeDefined();
    if (record === undefined) return;

    let written = 0;
    for (let z = record.baseZ; z < record.baseZ + record.height; z++) {
      for (let y = record.y; y < record.y + footprintDepth(record); y++) {
        for (let x = record.x; x < record.x + record.footprint; x++) {
          if (world.getBlock(x, y, z) !== 0) written++;
        }
      }
    }

    const stamp = generateLandmark({ kind: 'airport', stage: 0, facing: record.facing as 0 });
    expect(stamp).not.toBeNull();
    // Il conto dei voxel pieni deve tornare esatto: un ritaglio dimenticato
    // lascerebbe un buco che nessun errore segnala.
    expect(written).toBe(solidCount(stamp!));
  });
});

/**
 * Il rapporto fra crescita e rete: la strada orienta e collega, ma i suoi
 * isolati teorici non sono contenitori. Il campo dei landmark deve restare
 * leggibile nella posizione degli edifici anche attraverso quei confini.
 */
describe('Builder — allineamento alla rete stradale', () => {
  function grow(seed: number, builds: number): {
    world: VoxelWorld;
    builder: Builder;
    records: readonly BuildingRecord[];
  } {
    const world = new VoxelWorld();
    // Otto colonne di chunk e non quattro: con il passo della maglia a 22 e un
    // asse principale ogni quattro, il primo arteriale dopo l'origine cade a
    // ottantotto colonne. Su 128 la citta' non ci arrivava, e il test avrebbe
    // letto "nessun asse principale" dove il vero problema era la fixture.
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const builder = new Builder(world, terrain, seed);

    let state = createSimState();
    state = addCatalyst(state, {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < ticksFor(builds); i++) {
      state = tickHeld(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, builder, records: buildingsOf(builder) };
  }

  it('la rete continua a orientare gli edifici senza decidere l ordine di crescita', () => {
    const { records } = grow(1337, 20);

    expect(records.length).toBeGreaterThan(5);
    expect(records.every((record) => record.facing !== undefined)).toBe(true);
  });

  it('le prime costruzioni restano piu vicine al landmark delle successive', () => {
    const records = [...grow(1337, 24).records].sort((a, b) => a.id - b.id);
    const distance = (record: BuildingRecord): number => {
      const cx = record.x + (record.footprint - 1) * 0.5;
      const cy = record.y + (footprintDepth(record) - 1) * 0.5;
      return Math.hypot(cx - 128, cy - 128);
    };
    const mean = (items: readonly BuildingRecord[]): number =>
      items.reduce((sum, record) => sum + distance(record), 0) / items.length;

    expect(records.length).toBeGreaterThanOrEqual(12);
    expect(mean(records.slice(0, 6))).toBeLessThan(mean(records.slice(-6)));
  });

  it('il tessuto attraversa gli assi teorici invece di rivelare i lotti', () => {
    const streets = new StreetNetwork(1337);
    const { records } = grow(1337, 20);

    let crossings = 0;
    for (const record of records) {
      let crosses = false;
      for (let dy = 0; dy < record.footprint; dy++) {
        for (let dx = 0; dx < record.footprint; dx++) {
          if (streets.isPavement(record.x + dx, record.y + dy)) crosses = true;
        }
      }
      if (crosses) crossings++;
    }

    expect(crossings).toBeGreaterThan(0);
  });

  it('la prima crescita resta composta da edifici ordinari entro otto voxel', () => {
    const { records } = grow(1337, 5);
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.footprint).toBeLessThanOrEqual(MAX_FOOTPRINT);
    }
  });

  it('il suolo non disegna gli anelli completi della maglia teorica', () => {
    const { world } = grow(1337, 20);

    const streets = new StreetNetwork(1337);
    let painted = 0;
    let theoretical = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const block = world.getBlock(x, y, 23);
        if (block === STREETS.minorPalette || block === STREETS.arterialPalette) painted++;
        if (streets.isPavement(x, y)) theoretical++;
      }
    }

    expect(theoretical).toBeGreaterThan(0);
    expect(painted).toBeLessThan(theoretical / 4);
  });

  it('a parita di seed la citta e identica', () => {
    const a = grow(1337, 15).records.map((r) => `${r.x},${r.y},${r.footprint},${r.facing}`);
    const b = grow(1337, 15).records.map((r) => `${r.x},${r.y},${r.footprint},${r.facing}`);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
  });
});

/**
 * L'anello che chiude la catena decisione → mandato → voxel.
 *
 * I test di `typology.ts` verificano la *regola* di selezione; qui si verifica
 * che il `Builder` porti davvero i mandati dello stato fino allo stamp, cioe'
 * che due citta' identiche in tutto tranne la decisione presa crescano diverse.
 */
describe('Builder — i mandati arrivano fino ai voxel', () => {
  function city(charters: readonly CharterId[], builds = 15) {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const builder = new Builder(world, terrain, 1337);

    let state = createSimState({ charters });
    state = addCatalyst(state, {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < ticksFor(builds); i++) {
      state = tickHeld(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    return builder.registry;
  }

  it('senza mandato nessuna tipologia concessa compare nella citta', () => {
    const built = new Set([...city([]).typologyHistogram].map(([id]) => id));

    expect(built.size).toBeGreaterThan(0);
    expect(built.has('gardenHousing')).toBe(false);
    expect(built.has('rationedBlock')).toBe(false);
  });

  it('con il mandato la citta cresce la tipologia che quel mandato concede', () => {
    const gardens = new Map(city(['communityGardens']).typologyHistogram);
    const rationed = new Map(city(['rationing']).typologyHistogram);

    expect(gardens.get('gardenHousing')).toBeGreaterThan(0);
    expect(gardens.has('rationedBlock')).toBe(false);
    expect(rationed.get('rationedBlock')).toBeGreaterThan(0);
    expect(rationed.has('gardenHousing')).toBe(false);
  });

  it('due decisioni opposte danno due citta con volumi diversi', () => {
    const gardens = [...city(['communityGardens']).all];
    const rationed = [...city(['rationing']).all];

    // **Quanto occupa il singolo edificio, non quanti ce ne sono.** Il confronto
    // era sul totale e pretendeva che le due citta' avessero lo stesso numero di
    // edifici; da quando la gerarchia verticale legge anche quanto e' costruito
    // attorno (`SKYLINE.edgeRadius`), un mandato che cambia le impronte cambia
    // anche di poco come si riempiono i lotti, e le due citta' possono
    // differire di un edificio. La media dice la stessa cosa senza dipendere da
    // quel pareggio: gli orti di quartiere si allargano, il razionamento
    // stringe.
    expect(gardens.length).toBeGreaterThan(0);
    expect(rationed.length).toBeGreaterThan(0);
    expect(meanFootprintArea(gardens)).toBeGreaterThan(meanFootprintArea(rationed));
  });

  function meanFootprintArea(records: readonly BuildingRecord[]): number {
    const total = records.reduce((sum, r) => sum + r.footprint * footprintDepth(r), 0);
    return total / records.length;
  }
});

/**
 * Le opere di terra non si vedono su un terreno piatto: la fixture piana dei
 * test precedenti le lascerebbe tutte spente. Qui il rilievo e' scritto dal
 * test — un fianco a gradoni, una linea di costa — e bioma ed edificabilita' li
 * ricava `testTerrain` dalle stesse funzioni del generatore, cosi' le colonne
 * sono classificate come lo sarebbero sull'isola vera.
 */
describe('Builder — opere di terra', () => {
  /** Fianco a gradoni: strisce ripide e strisce dolci alternate. */
  function hillside(): TerrainMap {
    return testTerrain({
      chunksX: 4,
      chunksY: 4,
      heightAt: (x) => 24 + Math.floor(x / 6),
      // Le strisce ripide non sono `buildable`: prima della 4.2 la citta' le
      // saltava del tutto, e sono meta' del fianco.
      slopeAt: (x) => (Math.floor(x / 8) % 2 === 0 ? 0.2 : 0.4),
    });
  }

  /** Costa: fondale, battigia e pianura in sequenza lungo x. */
  function coast(): TerrainMap {
    return testTerrain({
      chunksX: 4,
      chunksY: 4,
      heightAt: (x) => Math.max(4, Math.min(36, 4 + Math.floor(x / 2))),
      slopeAt: () => 0.15,
    });
  }

  function grow(terrain: TerrainMap, anchor: number, builds: number): {
    world: VoxelWorld;
    builder: Builder;
    records: readonly BuildingRecord[];
  } {
    const world = new VoxelWorld();
    const builder = new Builder(world, terrain, 1337);

    let state = createSimState();
    state = addCatalyst(state, {
      x: anchor,
      y: 64,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 80,
    });

    for (let i = 0; i < ticksFor(builds); i++) {
      state = tickHeld(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, builder, records: buildingsOf(builder) };
  }

  /**
   * Un'isola vera con sopra una citta' cresciuta dalla costa.
   *
   * Il catalizzatore va sulla colonna edificabile piu' vicina al mare: e' li'
   * che battigia, bassofondo e fianco stanno tutti dentro il raggio in cui la
   * citta' arriva davvero, e quindi l'unico posto da cui le quattro opere si
   * osservano tutte nello stesso mondo.
   */
  function growIsland(): {
    world: VoxelWorld;
    map: TerrainMap;
    builder: Builder;
  } {
    const world = new VoxelWorld();
    // Lato 256 e non 128: la calibrazione verticale di `TERRAIN` e' tarata su
    // 512, e sotto i 256 il tetto di `maxReliefSlope` schiaccia l'isola tutta
    // sotto `beachMaxHeight` — niente terra edificabile, niente fianchi, niente
    // da terrazzare. A 256 le pendenze sono gia' quelle vere; manca solo la
    // fascia rocciosa, che qui non serve.
    const { map } = generateIsland(world, 4242, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 });

    const anchor = seaward(map);
    const builder = new Builder(world, map, 4242);
    let state = createSimState();
    state = addCatalyst(state, {
      x: anchor.x,
      y: anchor.y,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 80,
    });

    for (let i = 0; i < ticksFor(30); i++) {
      state = tickHeld(state, map);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, map, builder };
  }

  /** I tipi di terreno sotto l'impronta di un edificio. */
  function lotGround(terrain: TerrainMap, record: BuildingRecord): GroundKind[] {
    const kinds: GroundKind[] = [];
    for (let dy = 0; dy < record.footprint; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        kinds.push(groundKindOf(
          terrain.biomeAt(record.x + dx, record.y + dy),
          terrain.slopeAt(record.x + dx, record.y + dy),
          terrain.heightAt(record.x + dx, record.y + dy),
        ));
      }
    }
    return kinds;
  }

  it('costruisce sul fianco in pendenza invece di saltarlo', () => {
    const terrain = hillside();
    const { records } = grow(terrain, 64, 20);

    const sloped = records.filter((r) => lotGround(terrain, r).includes(GROUND.sloped));
    // Prima della 4.2 queste colonne non erano `buildable` e nessun edificio
    // poteva nascerci: il fianco restava un buco nella citta'.
    expect(sloped.length).toBeGreaterThan(0);
  });

  it('il salto e costruito: il muro porta la grammatica delle infrastrutture', () => {
    const terrain = hillside();
    const { world } = grow(terrain, 64, 20);

    let wall = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        // Fino a 64: il fianco della fixture sta fra 24 e 45, e il muro con
        // lui. A 24 la scansione si fermava sotto il terreno.
        for (let z = 0; z < 64; z++) {
          if (world.getBlock(x, y, z) === 0) continue;
          if (world.getSurfaceKind(x, y, z) === SURFACE_KIND.utility) wall++;
        }
      }
    }
    // Solo le opere scrivono `utility`: il terreno e gli edifici no.
    expect(wall).toBeGreaterThan(0);
  });

  it('si riempie e non si scava: nessuna colonna perde il terreno che aveva', () => {
    // E' il vincolo centrale della fase, e uno dei test che ha bisogno di
    // un'isola vera: `testTerrain` riempie la `TerrainMap` ma non scrive un
    // voxel, quindi su quella fixture "il terreno e' sparito" e "il terreno non
    // c'e' mai stato" sarebbero indistinguibili.
    const { world, map, builder } = growIsland();
    expect(builder.registry.count).toBeGreaterThan(20);

    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const height = map.heightAt(x, y);
        for (let z = 0; z < height; z++) {
          if (world.getBlock(x, y, z) === 0) {
            expect({ x, y, z, height }).toBe('colonna piena fino alla quota naturale');
          }
        }
      }
    }
  });

  it('sull isola vera la citta raggiunge la costa e il fianco', () => {
    const { map, builder } = growIsland();

    let shore = 0;
    let sloped = 0;
    for (const record of builder.registry.all) {
      const kinds = lotGround(map, record);
      if (kinds.includes(GROUND.shore)) shore++;
      if (kinds.includes(GROUND.sloped)) sloped++;
    }
    // Sull'isola vera meta' della terra emersa non era `buildable`: battigia e
    // pendenza insieme. Se questi due tornano a zero, la 4.2 e' stata annullata.
    expect(shore).toBeGreaterThan(0);
    expect(sloped).toBeGreaterThan(0);
  });

  it('la costa diventa fronte costruito invece di un bordo', () => {
    const terrain = coast();
    const { records } = grow(terrain, 26, 20);

    const onShore = records.filter((r) => lotGround(terrain, r).includes(GROUND.shore));
    expect(onShore.length).toBeGreaterThan(0);
  });

  it('sulla battigia l edificio affonda alla quota piu bassa, senza banchina', () => {
    const terrain = coast();
    const { records } = grow(terrain, 26, 20);

    const onShore = records.filter((r) => lotGround(terrain, r).includes(GROUND.shore));
    expect(onShore.length).toBeGreaterThan(0);

    for (const record of onShore) {
      let lowest = Number.POSITIVE_INFINITY;
      for (let dy = 0; dy < record.footprint; dy++) {
        for (let dx = 0; dx < record.footprint; dx++) {
          const height = terrain.heightAt(record.x + dx, record.y + dy);
          if (height < lowest) lowest = height;
        }
      }
      // Come sul fianco: la base sta alla quota naturale piu' bassa, non al
      // piano della banchina — l'edificio sorge dalla battigia e non la livella.
      expect(record.baseZ).toBe(lowest);
    }
  });

  it('la banchina si spinge oltre la battigia, sopra l acqua', () => {
    // Sull'isola vera e non sulla fixture: il molo nasce dove la citta'
    // incontra il bassofondo, e una costa scritta a mano o lo mette sotto il
    // primo isolato o lo lascia fuori portata — in entrambi i casi il test
    // direbbe piu' di come e' fatta la fixture che di come e' fatta la citta'.
    const { world, map } = growIsland();

    let overWater = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        if (map.heightAt(x, y) >= TERRAIN.seaLevel) continue;
        // Pieno alla quota del molo dove il terreno lasciava acqua: e' banchina.
        if (world.getBlock(x, y, GRADING.quayLevel - 1) !== 0) overWater++;
      }
    }
    expect(overWater).toBeGreaterThan(0);
  });

  it('la banchina non si stacca dalla terra: niente piattaforme al largo', () => {
    // Il difetto che questo test blocca: `maxQuayDepth` ammette il fondale per
    // una quindicina di colonne, e l'anello di carreggiata di un isolato
    // costiero se le prendeva tutte. A schermo era un rettangolo grigio cavo in
    // mezzo al mare — la strada dell'isolato, costruita sull'acqua.
    const { world, map } = growIsland();

    let worst = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        if (isDryLand(map.biomeAt(x, y))) continue;
        if (world.getBlock(x, y, GRADING.quayLevel - 1) === 0) continue;
        worst = Math.max(worst, landDistance(map, x, y));
      }
    }

    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(GRADING.quayReach);
  });

  /** Distanza di Chebyshev dalla terra emersa piu' vicina, cercata a anelli. */
  function landDistance(map: TerrainMap, x: number, y: number): number {
    for (let d = 1; d <= GRADING.quayReach + 1; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
          const cx = x + dx;
          const cy = y + dy;
          if (!map.has(cx, cy)) continue;
          if (isDryLand(map.biomeAt(cx, cy))) return d;
        }
      }
    }
    return GRADING.quayReach + 1;
  }

  it('dove la struttura non ci sta — l acqua fonda — resta la piazzola, e si livella', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({
      chunksX: 1,
      chunksY: 1,
      // Acqua fonda da est: dentro l'ingombro del mercato, ma fuori dalla
      // piazzola. La struttura viene rifiutata e resta il ripiego. E' anche la
      // prova che il rifiuto e' silenzioso e non lascia il catalizzatore senza
      // segno.
      heightAt: (x) => (x < 12 ? 30 : TERRAIN.seaLevel - GRADING.maxQuayDepth - 6),
      slopeAt: () => 0.1,
    });
    const builder = new Builder(world, terrain, 1337);

    expect(builder.landmarkClearance(10, 16, 'market').refusal).toBe('no-footing');

    builder.placeLandmark(10, 16, 'market');
    while (builder.stats.surfaceQueued > 0) builder.step();

    expect(builder.registry.landmarkCount).toBe(0);
    expect(world.getBlock(10, 16, 29))
      .toBe(CLASS_PROFILE[BUILDING_CLASS.residential].accent);
  });

  it('la rampa non lascia gradini fra due colonne di carreggiata', () => {
    const terrain = coast();
    const streets = new StreetNetwork(1337);
    const { world, builder } = grow(terrain, 26, 20);

    // Una colonna sorvolata da una campata va saltata: `topSolid` troverebbe
    // l'impalcato invece della carreggiata, e il salto che misurerebbe sarebbe
    // il franco del ponte. Non basta `isOccupied`, ed e' voluto — una campata
    // non prende suolo, quindi sotto di lei la strada c'e' ancora davvero.
    //
    // **Vale identico per una mensola**, e per lo stesso invariante: un aggetto
    // sporge dal fronte strada — e' proprio cio' che la 4.9 esiste per fare — e
    // sotto di lui la carreggiata continua. La gamba invece il suolo lo prende,
    // e `isOccupied` la vede gia'.
    const flownOver = (x: number, y: number): boolean =>
      builder.registry.at(x, y).some((record) =>
        record.span !== undefined || record.aerial !== undefined);

    for (let y = 1; y < 127; y++) {
      for (let x = 1; x < 127; x++) {
        if (!streets.isPavement(x, y) || builder.registry.isOccupied(x, y)) continue;
        if (flownOver(x, y)) continue;
        const here = topSolid(world, x, y);
        if (here < 0) continue;
        for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
          if (!streets.isPavement(nx, ny) || builder.registry.isOccupied(nx, ny)) continue;
          if (flownOver(nx, ny)) continue;
          const there = topSolid(world, nx, ny);
          if (there < 0) continue;
          // Un voxel per colonna e' la pendenza massima che una strada
          // percorre: oltre, la carreggiata e' un salto e non una rampa.
          expect(Math.abs(here - there)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('a parita di seed il rilievo produce la stessa citta', () => {
    const a = grow(coast(), 26, 15).records.map((r) => `${r.x},${r.y},${r.baseZ},${r.footprint}`);
    const b = grow(coast(), 26, 15).records.map((r) => `${r.x},${r.y},${r.baseZ},${r.footprint}`);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
  });
});

/** Colonna edificabile piu' vicina al mare: e' li' che le opere si vedono. */
describe('Builder — landmark dei catalizzatori', () => {
  /** Un porto piazzato sulla colonna edificabile piu' vicina al mare. */
  function harbour(): {
    world: VoxelWorld;
    map: TerrainMap;
    builder: Builder;
    site: { x: number; y: number };
  } {
    const world = new VoxelWorld();
    const { map } = generateIsland(world, 4242, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 });
    const builder = new Builder(world, map, 4242);
    const site = seaward(map);

    builder.placeLandmark(site.x, site.y, 'port');
    while (builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) builder.step();

    return { world, map, builder, site };
  }

  /** true se il voxel e' acqua, di superficie o fonda. */
  function isWater(palette: number): boolean {
    return palette === WATER_IDS.surface || palette === WATER_IDS.deep;
  }

  /**
   * Un porto sul **fronte mare vero**, cioe' dove il gioco lo lascerebbe posare.
   *
   * `seaward` cerca la colonna *edificabile* piu' vicina all'acqua, e su
   * quest'isola quella sta a decine di colonne dalla costa: la spiaggia non e'
   * edificabile per il generatore, pur essendo lavorabilissima per le opere.
   * Qui la domanda e' un'altra — dove il vincolo di sito `'coastal'` direbbe di
   * si' — e la risposta e' la battigia con il mare a portata di `SITE`.
   */
  function harbourOnWater(): { world: VoxelWorld; builder: Builder } {
    const world = new VoxelWorld();
    const { map } = generateIsland(world, 4242, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 });

    for (let y = 24; y < 232; y++) {
      for (let x = 24; x < 232; x++) {
        if (groundKindAt(map, x, y) !== GROUND.shore) continue;
        if (!isDryLand(map.biomeAt(x, y))) continue;
        if (waterFacing(map, x, y, SITE.coastalRadius) === null) continue;

        const builder = new Builder(world, map, 4242);
        builder.placeLandmark(x, y, 'port');
        while (builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) builder.step();
        if (landmarkRecord(builder) !== null) return { world, builder };
      }
    }
    throw new Error('nessuna battigia dell isola di prova regge un porto');
  }

  /** Il record del landmark, se il luogo lo ha retto. */
  function landmarkRecord(builder: Builder): BuildingRecord | null {
    for (const record of builder.registry.all) {
      if (record.landmark !== undefined) return record;
    }
    return null;
  }

  it('un porto sulla costa diventa una struttura, non un rombo di asfalto', () => {
    const { builder, site } = harbour();

    const record = landmarkRecord(builder);
    expect(record).not.toBeNull();
    expect(record!.landmark).toBe('port');
    // La colonna cliccata cade dentro l'ingombro, che e' l'invariante su cui
    // `catalystIn` ritrova il catalizzatore a ogni avanzamento.
    expect(site.x).toBeGreaterThanOrEqual(record!.x);
    expect(site.x).toBeLessThan(record!.x + record!.footprint);
    expect(site.y).toBeGreaterThanOrEqual(record!.y);
    expect(site.y).toBeLessThan(record!.y + (record!.footprintY ?? record!.footprint));
  });

  it('il bacino resta acqua: il porto non porta all asciutto il proprio riquadro', () => {
    // **E' il difetto che la maschera dell'opera esiste per togliere.** Senza,
    // `buildWorks` portava tutta l'impronta alla quota della banchina: la meta'
    // sul mare diventava una piattaforma rettangolare, e la darsena disegnata
    // dentro lo stamp restava una pozza piu' alta del mare che la circondava.
    const { world, builder } = harbourOnWater();
    const record = landmarkRecord(builder)!;
    const depth = footprintDepth(record);

    let wet = 0;
    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        const x = record.x + dx;
        const y = record.y + dy;
        // Alla quota del pelo del mare: o e' rimasta acqua, o qualcuno l'ha
        // riempita di pietra.
        const palette = blockPalette(world.getBlock(x, y, TERRAIN.seaLevel - 1));
        if (isWater(palette)) wet++;
      }
    }

    // Un porto ha un bacino, e un bacino e' fatto di colonne d'acqua: qui il
    // riquadro e' venti per dodici e il braccio ne occupa una frazione.
    expect(wet).toBeGreaterThan(20);
  });

  it('sopra il bacino non c e nessun piano: il mare arriva fino in cima', () => {
    // Il complemento del test di sopra, e il difetto che si vedeva davvero: non
    // basta che l'acqua sia rimasta sotto, non deve esserci niente sopra.
    const { world, builder } = harbourOnWater();
    const record = landmarkRecord(builder)!;
    const depth = footprintDepth(record);

    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        const x = record.x + dx;
        const y = record.y + dy;
        if (!isWater(blockPalette(world.getBlock(x, y, TERRAIN.seaLevel - 1)))) continue;
        for (let z = TERRAIN.seaLevel; z < record.baseZ + record.height; z++) {
          expect({ x, y, z, block: world.getBlock(x, y, z) }).toEqual({ x, y, z, block: 0 });
        }
      }
    }
  });

  it('il landmark occupa il registry ma non conta come edificio', () => {
    const { builder } = harbour();

    expect(builder.registry.landmarkCount).toBe(1);
    expect(builder.registry.count).toBe(0);
    for (const count of builder.registry.countsByClass) expect(count).toBe(0);
    expect(builder.registry.typologyHistogram.size).toBe(0);
  });

  it('la struttura sale sopra la banchina: e volume, non colore', () => {
    const { world, builder } = harbour();
    const record = landmarkRecord(builder)!;

    let top = record.baseZ;
    for (let dy = 0; dy < (record.footprintY ?? record.footprint); dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        top = Math.max(top, topSolid(world, record.x + dx, record.y + dy));
      }
    }
    // Il magazzino dello stadio zero e' alto undici voxel sopra la banchina: se
    // questo scende al piano, la struttura e' tornata una decalcomania.
    expect(top - record.baseZ).toBeGreaterThan(8);
  });

  it('lo stadio avanza su quello che la citta costruisce, e rinforza il catalizzatore', () => {
    const { map, builder, site } = harbour();
    const definition = catalystById('port');

    let state = createSimState();
    state = addCatalyst(state, {
      x: site.x,
      y: site.y,
      class: definition.class,
      kind: 'port',
      strength: definition.strength,
      radius: definition.radius,
    });
    // Un porto da solo non fa crescere niente: la sua influenza sul
    // residenziale e' zero, e senza case non c'e' popolazione. Il mercato e' la
    // citta' che nel gioco vero il porto trova gia' li' — ed e' anche la
    // ragione per cui lo stadio conta gli edifici invece della desiderabilita'.
    state = addCatalyst(state, {
      x: site.x,
      y: site.y,
      class: BUILDING_CLASS.residential,
      kind: 'market',
      strength: 255,
      radius: 60,
    });

    const before = landmarkRecord(builder)!.level;
    expect(before).toBe(0);

    for (let i = 0; i < ticksFor(60); i++) {
      state = tickHeld(state, map);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }

    expect(builder.registry.count).toBeGreaterThan(0);
    expect(landmarkRecord(builder)!.level).toBeGreaterThan(before);
    // Il ritorno alla simulazione e' lieve ma reale, e passa da una funzione che
    // esisteva gia': `src/sim/` non sa cosa sia un landmark.
    expect(state.catalysts[0].strength).toBeGreaterThan(definition.strength);
    expect(state.catalysts[0].strength).toBeLessThanOrEqual(255);
  });

  it('il landmark avanza anche quando gli upgrade ordinari saturerebbero la coda', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 8, chunksY: 8, height: 12 });
    const builder = new Builder(world, map, 1337);
    const definition = catalystById('greenhouse');
    const centre = 128;

    builder.placeLandmark(centre, centre, 'greenhouse');
    while (builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) builder.step();

    let state = addCatalyst(createSimState(), {
      x: centre,
      y: centre,
      class: definition.class,
      kind: 'greenhouse',
      strength: 255,
      radius: definition.radius,
    });

    // Una citta' matura offre abbastanza candidati agli upgrade da occupare
    // tutti i posti. Se gli upgrade passano per primi, il landmark non arriva
    // mai alla coda: al giro dopo gli stessi posti vengono riempiti di nuovo.
    for (let dy = -36; dy <= 36; dy += 12) {
      for (let dx = -36; dx <= 36; dx += 12) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) continue;
        state = addBuilding(state, {
          x: centre + dx,
          y: centre + dy,
          class: BUILDING_CLASS.residential,
          level: 0,
        });
      }
    }
    builder.materialize(state.buildings);
    state = {
      ...state,
      tickCount: BUILDER.ticksPerUpgrade,
      materials: { ...state.materials, stock: 100_000 },
    };

    expect(builder.registry.countWithinRadius(centre, centre, definition.radius))
      .toBeGreaterThanOrEqual(LANDMARKS.greenhouse!.stages[1]);
    expect(landmarkRecord(builder)!.level).toBe(0);

    state = builder.onTick(state);

    expect(landmarkRecord(builder)!.level).toBe(1);
    expect(state.catalysts[0].strength).toBeGreaterThan(definition.strength);
  });

  it('nessuna ricetta sfora il tetto di chunk sporchi, su nessun verso', () => {
    // Il difetto che questo test blocca si e' gia' presentato una volta, quando
    // l'impronta degli edifici e' raddoppiata: sforare non e' un errore e viene
    // scartato in silenzio, quindi a sparire sarebbero esattamente le strutture
    // piu' grosse — senza che niente lo dica.
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 12 });

    for (const recipe of Object.values(LANDMARKS)) {
      if (recipe === undefined) continue;
      for (const facing of [FACING.east, FACING.west, FACING.north, FACING.south]) {
        for (let offset = 0; offset < CHUNK; offset += 2) {
          const builder = new Builder(new VoxelWorld(), terrain, 1337);
          const x = 64 + offset;
          const y = 64 + offset;
          const span = landmarkSpan(recipe.kind, facing)!;
          expect(
            span.sizeX * span.sizeY * span.sizeZ,
            `${recipe.kind} ${facing} ${offset}`,
          ).toBeGreaterThan(0);
          // Il conto vero lo fa il Builder, e l'unico modo di osservarlo e'
          // vedere se la struttura viene su: uno sforamento e' un rifiuto muto.
          builder.placeLandmark(x, y, recipe.kind);
          expect(
            [...builder.registry.all].some((record) => record.landmark !== undefined),
            `${recipe.kind} verso ${facing} offset ${offset}`,
          ).toBe(true);
        }
      }
    }
    expect(world.solidVoxelCount).toBe(0);
  });
});

/**
 * Il gate della fase 4.4, verificato invece che dichiarato: gli edifici vicini
 * possono condividere quota e corso di base, ma conservano la posizione scelta
 * dalla crescita radiale. L'aggregazione unisce la massa senza riscrivere il
 * tessuto come un nastro sul perimetro di un lotto teorico.
 */
describe('Builder — isolati terrazzati', () => {
  /** Fianco a gradoni, senza costa: le file si spezzano solo per dislivello. */
  function hillside(): TerrainMap {
    return testTerrain({
      chunksX: 4,
      chunksY: 4,
      heightAt: (x) => 24 + Math.floor(x / 6),
      slopeAt: (x) => (Math.floor(x / 8) % 2 === 0 ? 0.2 : 0.4),
    });
  }

  function grow(
    terrain: TerrainMap,
    seed: number,
    builds: number,
    catalysts: readonly (readonly [number, number])[],
    radius: number,
  ): {
    world: VoxelWorld;
    builder: Builder;
    records: readonly BuildingRecord[];
  } {
    const world = new VoxelWorld();
    const builder = new Builder(world, terrain, seed);

    let state = createSimState();
    for (const [x, y] of catalysts) {
      state = addCatalyst(state, {
        x,
        y,
        kind: 'market',
        class: BUILDING_CLASS.commercial,
        strength: 255,
        radius,
      });
    }

    for (let i = 0; i < ticksFor(builds); i++) {
      state = tickHeld(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, builder, records: buildingsOf(builder) };
  }

  /**
   * Un centro denso, cioe' tre catalizzatori sovrapposti.
   *
   * Non e' un dettaglio della fixture: un catalizzatore solo, anche a forza
   * massima, porta la densita' locale a 0,30 e non oltre — sotto
   * `CLUSTER.minDensity`, quindi senza corso di base. E' voluto: la fila
   * condivide la quota ovunque, e lo zoccolo se lo guadagna solo dove piu' campi
   * si sovrappongono. Misurato, non stimato: con tre mercati la densita' mediana
   * dell'area sale a 0,37.
   */
  function denseCity(builds = 30) {
    return grow(
      testTerrain({ chunksX: 8, chunksY: 8, height: 24 }),
      1337,
      builds,
      [[112, 112], [144, 112], [128, 144]],
      40,
    );
  }

  /** Le file con almeno due membri, ognuna ordinata lungo il proprio fronte. */
  function rows(records: readonly BuildingRecord[]): BuildingRecord[][] {
    const byId = new Map<number, BuildingRecord[]>();
    for (const record of records) {
      if (record.cluster === undefined) continue;
      const members = byId.get(record.cluster);
      if (members === undefined) byId.set(record.cluster, [record]);
      else members.push(record);
    }

    const out: BuildingRecord[][] = [];
    for (const members of byId.values()) {
      if (members.length < 2) continue;
      members.sort((a, b) => alongOf(a) - alongOf(b));
      out.push(members);
    }
    return out;
  }

  /** Coordinata lungo il fronte: y per est e ovest, x per nord e sud. */
  function alongOf(record: BuildingRecord): number {
    return record.facing === FACING.east || record.facing === FACING.west
      ? record.y
      : record.x;
  }

  it('gli edifici di una fila condividono quota e corso di base', () => {
    const built = rows(denseCity().records);

    expect(built.length).toBeGreaterThan(0);
    for (const members of built) {
      const first = members[0];
      for (const member of members) {
        expect(member.baseZ).toBe(first.baseZ);
        expect(member.baseBand).toBe(first.baseBand);
        // Il fronte e' lo stesso per tutti: due file che si incontrano su un
        // angolo devono restare due file, non fondersi in una.
        expect(member.facing).toBe(first.facing);
      }
    }
  });

  it('l aggregazione non riscrive il tessuto come un nastro regolare', () => {
    const built = rows(denseCity().records);

    expect(built.length).toBeGreaterThan(0);
    let organic = false;
    for (const members of built) {
      for (let i = 1; i < members.length; i++) {
        const previous = members[i - 1];
        // L'identita' condivisa non sposta l'edificio: almeno un aggregato della
        // fixture deve conservare uno scarto diverso dall'accostamento perfetto
        // che rendeva leggibile il vecchio perimetro quadrato.
        if (alongOf(members[i]) !== alongOf(previous) + previous.footprint) {
          organic = true;
        }
      }
    }
    expect(organic).toBe(true);
  });

  it('a superare il tetto d impronta e la massa, non il record', () => {
    const { records } = denseCity();
    const built = rows(records);

    for (const record of records) {
      expect(record.footprint).toBeLessThanOrEqual(MAX_FOOTPRINT);
    }

    const widest = Math.max(...built.map((members) => {
      const last = members[members.length - 1];
      return alongOf(last) + last.footprint - alongOf(members[0]);
    }));
    expect(widest).toBeGreaterThan(MAX_FOOTPRINT);
  });

  it('il corso di base condiviso e quello che il record dice, dopo gli upgrade', () => {
    // E' il test della cancellazione: l'`upgrade` rigenera la sagoma da togliere
    // dal solo record, e se non le passasse `baseBand` l'erase scriverebbe vuoto
    // su una fascia zero alta in modo diverso — cioe' bucherebbe lo zoccolo
    // proprio sotto il vicino, dove la fila deve leggersi continua.
    //
    // **Si confronta con la sagoma rigenerata, non con «tutto pieno».** Finche'
    // niente poteva bucare la fascia zero i due erano la stessa cosa, e «tutto
    // pieno» era la sonda piu' corta. Da quando un portico puo' aprire il piano
    // terra sul fronte strada non lo sono piu': la sonda direbbe di no a un vuoto
    // che la sagoma prevede. Il contratto non e' «lo zoccolo e' pieno», e' **«il
    // mondo dice quello che dice il record»** — che e' anche piu' stretto, perche'
    // ora accorgersi di un voxel di troppo, non solo di uno mancante.
    const { world, records } = denseCity();
    const clustered = records.filter((record) => record.baseBand !== undefined);

    expect(clustered.length).toBeGreaterThan(0);
    for (const record of clustered) {
      const stamp = recordStamp(record);
      const anchor = anchorOf(record);
      for (let z = record.baseZ; z < record.baseZ + (record.baseBand ?? 0); z++) {
        for (let dy = 0; dy < record.footprint; dy++) {
          for (let dx = 0; dx < record.footprint; dx++) {
            const sx = record.x + dx - anchor.x + stamp.anchorX;
            const sy = record.y + dy - anchor.y + stamp.anchorY;
            const sz = z - anchor.z + stamp.anchorZ;
            const wanted = stamp.voxels[sx + stamp.sizeX * (sy + stamp.sizeY * sz)] !== 0;
            const got = world.getBlock(record.x + dx, record.y + dy, z) !== 0;
            if (got !== wanted) {
              expect({ x: record.x + dx, y: record.y + dy, z, wanted, got })
                .toBe('lo zoccolo combacia con la sagoma registrata');
            }
          }
        }
      }
    }
  });

  it('su un fianco la fila si spezza a gradoni e affonda nel pendio', () => {
    const terrain = hillside();
    const { records } = grow(terrain, 1337, 20, [[64, 64]], 80);

    const ids = new Set(records.map((record) => record.cluster));
    // Piu' di una fila: il dislivello le spezza, ed e' il gradino che rende
    // terrazzato l'isolato invece di fermarne la crescita.
    expect(ids.size).toBeGreaterThan(1);

    for (const record of records) {
      let lowest = Number.POSITIVE_INFINITY;
      for (let dy = 0; dy < record.footprint; dy++) {
        for (let dx = 0; dx < record.footprint; dx++) {
          const height = terrain.heightAt(record.x + dx, record.y + dy);
          if (height < lowest) lowest = height;
        }
      }
      // Si affonda e non si riempie: la base sta alla quota piu' bassa
      // dell'impronta, e nessun cumulo di terra solleva la casa.
      expect(record.baseZ).toBe(lowest);
    }
  });

  it('nessun membro sparisce in silenzio per budget di chunk', () => {
    // E' il difetto che il commento di `maxDirtyChunksPerBuilding` racconta gia'
    // successo una volta: sforare non e' un errore e viene scartato senza che
    // niente lo dica, e a sparire sono proprio gli edifici che la fase aggiunge.
    const { builder } = grow(hillside(), 1337, 40, [[64, 64]], 80);
    const chunkBudget = REJECT_REASONS.indexOf('chunkBudget');

    expect(builder.stats.rejected[chunkBudget]).toBe(0);
    expect(builder.stats.clustered).toBeGreaterThan(0);
  });

  it('a parita di seed le file sono identiche', () => {
    const signature = (records: readonly BuildingRecord[]): string[] =>
      records.map((r) => `${r.x},${r.y},${r.footprint},${r.baseZ},${r.cluster},${r.baseBand}`);

    const a = signature(denseCity(30).records);
    const b = signature(denseCity(30).records);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
  });
});

/**
 * La gerarchia verticale, letta sulla citta' che ne esce.
 *
 * I test di `skyline/tiers.test.ts` verificano la *regola*; qui si verifica che
 * il `Builder` la porti fino ai record — cioe' che lo skyline sia una figura
 * della citta' e non solo una funzione che restituisce numeri giusti.
 */
describe('Builder — gerarchia verticale', () => {
  /** Una citta' cresciuta su un'isola vera, con un polo al centro. */
  function island(seed: number, builds = 45): {
    map: TerrainMap;
    builder: Builder;
    records: readonly BuildingRecord[];
  } {
    const world = new VoxelWorld();
    const { map } = generateIsland(world, seed, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 });
    const builder = new Builder(world, map, seed);

    let state = createSimState();
    state = addCatalyst(state, {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < ticksFor(builds); i++) {
      state = tickHeld(state, map);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { map, builder, records: buildingsOf(builder) };
  }

  /** Quanti edifici per livello, senza le voci vuote. */
  function levelsOf(records: readonly BuildingRecord[]): Map<number, number> {
    const out = new Map<number, number>();
    for (const record of records) out.set(record.level, (out.get(record.level) ?? 0) + 1);
    return out;
  }

  it('il gate: la citta ha almeno tre fasce di altezza e non e un altopiano', () => {
    const { records } = island(4242);
    const levels = levelsOf(records);

    expect(records.length).toBeGreaterThan(40);
    // Tre fasce popolate: e' la meta' leggibile del gate, quella che si vede
    // da inquadratura d'insieme senza aprire un overlay.
    expect(levels.size).toBeGreaterThanOrEqual(3);
    // E l'altra meta': nessun livello raccoglie la citta' intera. Un nucleo
    // saturo che sale tutto insieme e' esattamente l'altopiano che il commento di
    // `START_LEVEL_CDF` dichiara di voler evitare, e alzare `maxLevel` senza la
    // gerarchia lo avrebbe prodotto piu' alto invece che piu' vario.
    const biggest = Math.max(...levels.values());
    expect(biggest / records.length).toBeLessThan(0.85);
  });

  it('la corona attorno all edificato resta bassa, e la costa con lei', () => {
    const { map, records } = island(4242);
    const cap = SKYLINE.levelCap[TIER.fringe];

    let coastal = 0;
    for (const record of records) {
      const distance = waterDistance(map, record.x, record.y, SKYLINE.coastNear);
      if (distance === null) continue;
      coastal++;
      // La costa non porta torri: la linea di costa e' la sola figura che
      // l'isola offre a inquadratura d'insieme, e una torre sul filo la cancella.
      expect(record.level, `edificio a ${record.x},${record.y} a ${distance} dall'acqua`)
        .toBeLessThanOrEqual(cap);
    }
    // Se nessun edificio arrivasse alla costa il test passerebbe vacuamente.
    expect(coastal).toBeGreaterThan(0);
  });

  it('la gerarchia si vede su isole di forma diversa, non solo sul seed di prova', () => {
    // Il settimo punto della sotto-fase: una figura che esce solo su un seed e'
    // una coincidenza, non una regola.
    for (const seed of [4242, 1337, 90210]) {
      const levels = levelsOf(island(seed, 70).records);
      expect(levels.size, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('a parita di seed la citta alta e identica', () => {
    const signature = (records: readonly BuildingRecord[]): string[] =>
      records.map((r) => `${r.x},${r.y},${r.level},${r.footprint}`);

    expect(signature(island(4242, 40).records)).toEqual(signature(island(4242, 40).records));
  });
});

/**
 * Lo sventramento: un landmark che si pianta dentro la citta' gia' costruita.
 *
 * Il difetto che questi test bloccano e' **muto**, ed e' per questo che vanno
 * scritti: prima, un catalizzatore piantato in centro si pagava, entrava nella
 * simulazione e non produceva nessuna struttura — nessun record, quindi nessuno
 * stadio, quindi un monumento invisibile per sempre. Non falliva niente: non
 * compariva niente. Ora il piazzamento demolisce tutto il costruito — case,
 * torri, altri monumenti — e la struttura prende il suo posto.
 */
describe('Builder — sventramento', () => {

  /** Una citta' cresciuta su terreno piano, con il suo stato. */
  function city(builds: number): {
    world: VoxelWorld;
    terrain: TerrainMap;
    builder: Builder;
    state: SimState;
  } {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 8, chunksY: 8, height: 24 });
    const builder = new Builder(world, terrain, 1337);

    let state = addCatalyst(createSimState(), {
      x: 128,
      y: 128,
      class: BUILDING_CLASS.residential,
      strength: 255,
      radius: 96,
    });

    for (let i = 0; i < ticksFor(builds); i++) {
      state = tickHeld(state, terrain);
      state = builder.onTick(state);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.surfaceQueued > 0) builder.step();

    return { world, terrain, builder, state };
  }

  /** Porta avanti la partita finche' i cantieri non hanno finito. */
  function settle(
    builder: Builder,
    terrain: TerrainMap,
    state: SimState,
    rounds = 400,
  ): SimState {
    let next = state;
    for (let i = 0; i < rounds && builder.stats.clearing > 0; i++) {
      next = tickHeld(next, terrain);
      next = builder.onTick(next);
      while (builder.stats.growing > 0) builder.step();
    }
    while (builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) builder.step();
    return next;
  }

  /** Il riquadro occupato dal landmark che e' venuto su. */
  function landmarkBox(builder: Builder): {
    x: number;
    y: number;
    sizeX: number;
    sizeY: number;
  } {
    const record = [...builder.registry.all].find((r) => r.landmark !== undefined)!;
    return { x: record.x, y: record.y, sizeX: record.footprint, sizeY: footprintDepth(record) };
  }

  /**
   * La prima colonna che apre davvero un cantiere.
   *
   * **Non il centro del catalizzatore**, ed e' il punto della meccanica: il
   * centro e' fatto di torri, e le torri caddero come le case. Il gesto vive
   * nel tessuto basso attorno, ed e' quello che il giocatore cerca muovendo il
   * cursore.
   */
  function clearableSpot(builder: Builder): BuildingRecord {
    const spot = buildingsOf(builder).find((record) => {
      const quote = builder.landmarkClearance(record.x, record.y, 'market');
      return quote.refusal === null && quote.clears > 0;
    });
    expect(spot, 'la citta di prova deve avere una sacca sventrabile').toBeDefined();
    return spot!;
  }

  it('un riquadro pieno di tessuto basso apre un cantiere invece di non fare niente', () => {
    const { terrain, builder, state } = city(30);
    const spot = clearableSpot(builder);

    const quote = builder.landmarkClearance(spot.x, spot.y, 'market');
    expect(quote.refusal).toBeNull();
    expect(quote.clears).toBeGreaterThan(0);

    const before = state.buildings.length;
    builder.placeLandmark(spot.x, spot.y, 'market');

    // Il cantiere e' aperto e la struttura **non** c'e' ancora: fra il click e
    // il monumento passano le passate che servono a sgomberare.
    expect(builder.stats.clearing).toBe(1);
    expect(builder.registry.landmarkCount).toBe(0);

    const after = settle(builder, terrain, state);

    expect(builder.stats.clearing).toBe(0);
    expect(builder.stats.cleared).toBe(quote.clears);
    expect(builder.registry.landmarkCount).toBe(1);
    // La simulazione ha perso esattamente gli edifici che sono caduti, non uno
    // di piu': e' da qui che arriva il costo del gesto — meno capacita', quindi
    // sovraffollamento, quindi soddisfazione che scende.
    expect(before - after.buildings.length).toBe(quote.clears);
    expect(after.buildings.length).toBeLessThan(before);
  });

  it('cadono solo i condannati, e i loro voxel spariscono davvero', () => {
    const { world, terrain, builder, state } = city(30);
    const spot = clearableSpot(builder);

    const outside = buildingsOf(builder)
      .filter((r) => Math.abs(r.x - spot.x) > 40 || Math.abs(r.y - spot.y) > 40)
      .map((r) => r.id);
    expect(outside.length).toBeGreaterThan(0);

    builder.placeLandmark(spot.x, spot.y, 'market');
    settle(builder, terrain, state);

    // Chi era lontano dal riquadro e' ancora li'.
    for (const id of outside) expect(builder.registry.get(id)).not.toBeNull();

    // E dentro il riquadro non e' rimasto niente sopra la struttura: se la
    // sagoma rigenerata divergesse da quella scritta, qui ci sarebbe un moncone.
    const box = landmarkBox(builder);
    const landmark = [...builder.registry.all].find((r) => r.landmark !== undefined)!;
    const top = landmark.baseZ + landmark.height;
    let above = 0;
    for (let y = box.y; y < box.y + box.sizeY; y++) {
      for (let x = box.x; x < box.x + box.sizeX; x++) {
        for (let z = top; z < top + 30; z++) {
          if (world.getBlock(x, y, z) !== 0) above++;
        }
      }
    }
    expect(above).toBe(0);
  });

  it('un landmark non sostituisce un altro landmark: il preventivo rifiuta il riquadro', () => {
    // Un monumento non e' piu' demolibile dal piazzamento: il preventivo lo
    // segna come rifiuto, e il giocatore deve passare dalla gomma.
    const { terrain, builder, state } = city(30);
    const spot = clearableSpot(builder);

    builder.placeLandmark(spot.x, spot.y, 'market');
    settle(builder, terrain, state);
    expect(builder.registry.landmarkCount).toBe(1);

    // Sulla stessa colonna, con un ruolo diverso per non incappare nella
    // distanza minima: cio' che trova e' il monumento di prima, che adesso
    // rifiuta invece di essere contato fra chi cadra'.
    const quote = builder.landmarkClearance(spot.x, spot.y, 'university');
    expect(quote.refusal).toBe('landmark-in-the-way');
    expect(quote.clears).toBe(0);
  });

  it('un landmark non ne sostituisce un altro: il monumento vecchio resta', () => {
    const { terrain, builder, state } = city(30);
    const spot = clearableSpot(builder);

    builder.placeLandmark(spot.x, spot.y, 'market');
    settle(builder, terrain, state);
    expect(builder.registry.landmarkCount).toBe(1);

    builder.placeLandmark(spot.x, spot.y, 'university');
    settle(builder, terrain, state);

    // Il monumento nuovo non ha preso il posto del vecchio: resta il mercato,
    // e non compare un secondo record.
    expect(builder.registry.landmarkCount).toBe(1);
    const kinds = [...builder.registry.all]
      .filter((record) => record.landmark !== undefined)
      .map((record) => record.landmark);
    expect(kinds).toEqual(['market']);
  });

  it('una torre cade come ogni altra casa: nessuna altezza resta fuori portata', () => {
    const { terrain, builder, state } = city(120);

    // Una colonna che prima rifiutava **per altezza**: il centro di una citta'
    // matura e' fatto di torri, e il piazzamento le sventra come il tessuto.
    const tall = buildingsOf(builder).find((record) =>
      record.level > 4 &&
      builder.landmarkClearance(record.x, record.y, 'market').refusal === null);
    expect(tall, 'la citta di prova deve avere una torre nel riquadro').toBeDefined();
    if (tall === undefined) return;

    const before = builder.registry.count;
    builder.placeLandmark(tall.x, tall.y, 'market');
    settle(builder, terrain, state);

    // Il cantiere ha portato via la torre con il resto del riquadro, e il
    // monumento e' al suo posto.
    expect(builder.stats.cleared).toBeGreaterThan(0);
    expect(builder.registry.count).toBeLessThan(before);
    expect(builder.registry.get(tall.id)).toBeNull();
    expect(builder.registry.landmarkCount).toBe(1);
  });

  it('tutto l edificato e sventrabile, torri comprese', () => {
    // **Il gate della fase, misurato invece che dichiarato.** Prima la soglia
    // teneva le torri fuori portata; ora il gesto e' una gomma dichiarata e
    // nessuna altezza si salva. Il solo rifiuto rimasto sul costruito e' la
    // rete in quota — una torre che porta una mensola e' struttura, non altezza.
    const { builder } = city(120);
    const all = buildingsOf(builder);

    const viable = all.filter((record) => {
      const quote = builder.landmarkClearance(record.x, record.y, 'market');
      return quote.refusal === null && quote.clears > 0;
    });
    expect(viable.length).toBeGreaterThan(all.length / 8);

    const towers = all.filter((record) => record.level > 4);
    expect(towers.length).toBeGreaterThan(0);
    for (const tower of towers) {
      const refusal = builder.landmarkClearance(tower.x, tower.y, 'market').refusal;
      expect(refusal === null || refusal === 'structure-in-the-way').toBe(true);
    }
  });

  it('su terreno vergine il piazzamento resta quello di sempre', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 4, chunksY: 4, height: 24 });
    const builder = new Builder(world, terrain, 1337);

    expect(builder.landmarkClearance(60, 60, 'market').clears).toBe(0);
    builder.placeLandmark(60, 60, 'market');

    // Nessun cantiere: la struttura c'e' subito, come prima di questa fase.
    expect(builder.stats.clearing).toBe(0);
    expect(builder.stats.cleared).toBe(0);
    expect(builder.registry.landmarkCount).toBe(1);
  });

  it('la gomma demolisce un riquadro, senza recinto e con il conto alla simulazione', () => {
    const { terrain, builder, state } = city(30);
    const spot = clearableSpot(builder);

    const box = { x: spot.x, y: spot.y, sizeX: spot.footprint, sizeY: footprintDepth(spot) };
    const quote = builder.demolishSurvey(box.x, box.y, box.sizeX, box.sizeY);
    expect(quote.refusal).toBeNull();
    expect(quote.clears).toBeGreaterThanOrEqual(1);

    const before = state.buildings.length;
    expect(builder.demolish(box.x, box.y, box.sizeX, box.sizeY)).toBe(true);
    expect(builder.stats.clearing).toBe(1);
    // Niente recinto: la gomma non prenota un cantiere per una struttura che
    // non arriva, e la coda di superficie resta com'era.
    expect(builder.stats.surfaceQueued).toBe(0);

    const after = settle(builder, terrain, state);
    expect(builder.stats.clearing).toBe(0);
    expect(after.buildings.length).toBeLessThan(before);
    // L'edificio preso di mira non esiste piu' nel registry.
    expect(builder.registry.get(spot.id)).toBeNull();
  });

  it('la gomma su un riquadro vuoto non apre nessun cantiere', () => {
    const world = new VoxelWorld();
    const terrain = testTerrain({ chunksX: 4, chunksY: 4, height: 24 });
    const builder = new Builder(world, terrain, 1337);

    expect(builder.demolishSurvey(60, 60, 4, 4).clears).toBe(0);
    expect(builder.demolish(60, 60, 4, 4)).toBe(false);
    expect(builder.stats.clearing).toBe(0);
  });

  it('la gomma si puo annullare subito: i condannati tornano', () => {
    const { builder, state } = city(30);
    const spot = clearableSpot(builder);
    const box = { x: spot.x, y: spot.y, sizeX: spot.footprint, sizeY: footprintDepth(spot) };

    const quote = builder.demolishSurvey(box.x, box.y, box.sizeX, box.sizeY);
    const before = state.buildings.length;
    builder.demolish(box.x, box.y, box.sizeX, box.sizeY);
    expect(builder.stats.clearing).toBe(1);

    // L'annullamento ricostruisce ogni condannato e chiude il cantiere: lo stato
    // della simulazione non ha perso nessuno, perche' nessuno era ancora caduto.
    const undone = builder.undoDemolition(state);
    expect(undone.restored).toBe(quote.clears);
    expect(builder.stats.clearing).toBe(0);
    expect(builder.registry.get(spot.id)).not.toBeNull();
    expect(undone.state.buildings.length).toBe(before);
  });

  it('a cantiere chiuso non c e piu niente da annullare', () => {
    const { terrain, builder, state } = city(30);
    const spot = clearableSpot(builder);
    const box = { x: spot.x, y: spot.y, sizeX: spot.footprint, sizeY: footprintDepth(spot) };

    builder.demolish(box.x, box.y, box.sizeX, box.sizeY);
    const after = settle(builder, terrain, state);

    expect(builder.stats.clearing).toBe(0);
    expect(builder.registry.get(spot.id)).toBeNull();
    // Il cantiere e' finito: l'annullamento non ha piu' niente da ricostruire.
    expect(builder.undoDemolition(after).restored).toBe(0);
  });

  it('il preventivo distingue chi cade da chi resta', () => {
    const { builder } = city(30);
    const spot = clearableSpot(builder);
    const box = { x: spot.x, y: spot.y, sizeX: spot.footprint, sizeY: footprintDepth(spot) };

    const { doomed } = builder.demolishPreview(box.x, box.y, box.sizeX, box.sizeY);
    expect(doomed.length).toBeGreaterThan(0);
    expect(doomed.some((record) => record.id === spot.id)).toBe(true);
  });
});

function seaward(map: TerrainMap): { x: number; y: number } {
  let best = { x: 64, y: 64, distance: Number.MAX_SAFE_INTEGER };
  // Tutta l'isola e non un quadrante: dove cada la colonna edificabile piu'
  // vicina all'acqua e' una proprieta' della sagoma, e la sagoma cambia con il
  // seed. Cercando in un riquadro fisso, un'isola che li' non ha costa lasciava
  // l'ancora sul ripiego — e i test che seguono misuravano una citta' cresciuta
  // nel posto sbagliato invece di fallire dicendolo.
  for (let y = 16; y < 240; y++) {
    for (let x = 16; x < 240; x++) {
      if (!map.isBuildable(x, y)) continue;
      // Trentadue e non sedici: `buildableMaxSlope` vale 0,34 e la spiaggia e'
      // alta otto voxel, quindi la prima colonna edificabile sta **almeno** a
      // ventiquattro colonne dall'acqua per costruzione. Con il limite vecchio
      // la ricerca non trovava mai niente e l'ancora restava sul ripiego
      // `64,64`: la citta' cresceva dove capitava, e questi test misuravano se
      // la costa le passava accanto per fortuna.
      for (let r = 1; r < best.distance && r < 32; r++) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          if (map.heightAt(x + dx, y + dy) < TERRAIN.seaLevel) best = { x, y, distance: r };
        }
      }
    }
  }
  return best;
}

/** Quota del voxel pieno piu' alto di una colonna, -1 se e' vuota. */
function topSolid(world: VoxelWorld, x: number, y: number): number {
  for (let z = 40; z >= 0; z--) {
    if (world.getBlock(x, y, z) !== 0) return z;
  }
  return -1;
}




