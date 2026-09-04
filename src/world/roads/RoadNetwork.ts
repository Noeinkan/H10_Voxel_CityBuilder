import { BIOME } from '../terrain/config';
import { GROUND, groundKindOf } from '../grading/grade';
import type { TerrainMap } from '../terrain/TerrainMap';
import { ROADS, ROAD_RANK, type RoadRank } from './config';
import { EMPTY_PLAN, planRoads, type RoadPlan, type RoadPole } from './network';
import { strokeRoads, strokeViaduct, type RoadSurface, type ViaductSurface } from './stroke';
import { terrainPenalty } from './terrainCost';
import { planViaducts } from './viaduct';
import { boundsAround, traceRoad, type RoadProbe, type TraceBounds } from './trace';

/**
 * Il tracciato visto da chi costruisce: lo tiene, lo rifa' quando serve, e
 * risponde per colonna.
 *
 * **Non e' una funzione pura, e non puo' esserlo.** La maglia catastale di
 * `streets/` lo e' e deve restarlo; questo dipende da dove il giocatore ha
 * piantato i catalizzatori, quindi ha uno stato. Non va pero' **salvato**, che
 * e' un'altra cosa: i poli stanno gia' nel salvataggio come catalizzatori e il
 * terreno e' funzione del seed, quindi al caricamento la rete si rifa' identica.
 * E' la stessa regola del campo di desiderabilita' — si ricostruisce, non si
 * serializza.
 *
 * **Si rifa' per intero e non si aggiorna.** Un polo nuovo puo' cambiare quale
 * tratto e' il tronco dall'altra parte dell'isola: il carico e' una proprieta'
 * dell'albero, non del singolo tratto, e un aggiornamento incrementale corretto
 * costerebbe piu' di una ricostruzione. La ricostruzione gira quando il
 * giocatore pianta un catalizzatore, cioe' una manciata di volte per partita.
 */
export class RoadNetwork {
  private plan: RoadPlan = EMPTY_PLAN;
  private painted: readonly RoadSurface[] = [];
  private spans: readonly ViaductSurface[] = [];
  private index = new Map<string, RoadRank>();
  /**
   * Le colonne entro `frontageReach` da una carreggiata: la fascia di fronte
   * strada, gia' dilatata.
   *
   * **E' un indice e non una misura, e la differenza e' di quattro ordini di
   * grandezza.** La ricerca del lotto chiede l'affaccio per *ogni* ancoraggio
   * che prova, e gli ancoraggi di un rettangolo da cinque isolati per lato sono
   * decine di migliaia: rispondere scandendo un riquadro di quattrocento celle
   * per volta significava sedici milioni di letture per lotto, e si vedeva —
   * la stessa batteria di test passava da cinquantasette secondi a
   * quattrocentosessanta. Dilatare una volta sola quando la rete cambia costa
   * `strade x 169` inserimenti e rende la domanda una lettura.
   */
  private frontage = new Set<string>();
  private signature = '';

  constructor(
    private readonly terrain: TerrainMap,
    /**
     * true se un edificio occupa la colonna.
     *
     * Entra come funzione e non come registry per la stessa ragione per cui
     * `createReachCost` prende una `StepCost`: cosi' questo dominio non importa
     * `buildings/`, che invece importa lui.
     */
    private readonly occupied: (x: number, y: number) => boolean,
    /**
     * Il seme del mondo, che qui serve solo al campo di divagazione.
     *
     * E' cio' che rende il tracciato ricostruibile: due partite sullo stesso
     * seme piegano le strade nello stesso modo, e il salvataggio continua a non
     * dover serializzare niente.
     */
    private readonly seed: number = 0,
  ) {}

  /** Le colonne di carreggiata a terra, larghezza gia' applicata. */
  get surface(): readonly RoadSurface[] {
    return this.painted;
  }

  /** Le colonne di impalcato in quota, spalle comprese. */
  get viaducts(): readonly ViaductSurface[] {
    return this.spans;
  }

  /** I poli che il tracciato non ha saputo raggiungere. */
  get orphans(): readonly RoadPole[] {
    return this.plan.orphans;
  }

  /** Rango della carreggiata in questa colonna, o null se non e' strada. */
  rankAt(x: number, y: number): RoadRank | null {
    return this.index.get(`${x},${y}`) ?? null;
  }

  hasRoad(x: number, y: number): boolean {
    return this.index.has(`${x},${y}`);
  }

  /**
   * true se esiste almeno una carreggiata.
   *
   * Chi ordina i candidati per fronte strada lo chiede prima di ordinarli: con
   * la rete vuota ogni distanza vale `reach + 1`, l'ordinamento e' una permuta
   * identita' costosa, e a inizio partita — nessun catalizzatore, nessuna strada
   * — sarebbe il caso normale invece che l'eccezione.
   */
  get hasAnyRoad(): boolean {
    return this.index.size > 0;
  }

  /**
   * Distanza di Chebyshev dalla carreggiata piu' vicina, al piu' `reach`.
   *
   * Oltre `reach` risponde `reach + 1` invece della distanza vera: chi la chiama
   * la usa per ordinare candidati che stanno tutti dentro il raggio, e il valore
   * esatto di cio' che sta fuori non cambia nessuna decisione. Scandisce ad
   * anelli e si ferma al primo colpo, quindi su una colonna sul fronte strada
   * costa nove letture invece di centosessantanove.
   */
  distanceToRoad(x: number, y: number, reach: number = ROADS.frontageReach): number {
    if (this.index.size === 0) return reach + 1;
    if (this.hasRoad(x, y)) return 0;
    for (let ring = 1; ring <= reach; ring++) {
      for (let d = -ring; d <= ring; d++) {
        if (this.hasRoad(x + d, y - ring)) return ring;
        if (this.hasRoad(x + d, y + ring)) return ring;
      }
      // Gli angoli sono gia' stati letti dalle due righe: le due colonne si
      // fermano prima, o ogni anello leggerebbe quattro celle due volte.
      for (let d = -ring + 1; d <= ring - 1; d++) {
        if (this.hasRoad(x - ring, y + d)) return ring;
        if (this.hasRoad(x + ring, y + d)) return ring;
      }
    }
    return reach + 1;
  }

  /**
   * true se un'impronta ancorata qui ha un affaccio su strada.
   *
   * Si misura sul **bordo dell'impronta** allargato di `frontageReach` e non dal
   * solo angolo: un lotto e' sul fronte se una qualunque delle sue facce vede la
   * carreggiata, e prendere l'angolo minimo darebbe un affaccio diverso a
   * seconda di come l'impronta e' ancorata, che e' un artefatto del sistema di
   * coordinate e non un fatto urbano.
   */
  touchesRoad(x: number, y: number, footprint: number): boolean {
    if (this.frontage.size === 0) return false;
    // I quattro angoli e il centro invece dell'impronta intera: la fascia e'
    // gia' larga `frontageReach`, quindi un'impronta che tocchi la strada in un
    // punto qualunque ha per forza un angolo dentro la fascia — a meno che la
    // strada non passi esattamente in mezzo, che e' il caso in cui il lotto la
    // copre, e allora ci pensa il centro.
    const far = footprint - 1;
    const half = far >> 1;
    return this.frontage.has(`${x},${y}`) ||
      this.frontage.has(`${x + far},${y}`) ||
      this.frontage.has(`${x},${y + far}`) ||
      this.frontage.has(`${x + far},${y + far}`) ||
      this.frontage.has(`${x + half},${y + half}`);
  }

  /** Allarga la fascia di fronte strada attorno a delle colonne nuove. */
  private widenFrontage(cells: Iterable<{ readonly x: number; readonly y: number }>): void {
    const reach = ROADS.frontageReach;
    for (const cell of cells) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          this.frontage.add(`${cell.x + dx},${cell.y + dy}`);
        }
      }
    }
  }

  /**
   * Rifa' il tracciato se i poli sono cambiati. true se qualcosa e' cambiato.
   *
   * La firma e' la lista dei poli normalizzata a stringa, e non l'identita'
   * dell'array: ogni tick della simulazione ricrea i catalizzatori, quindi un
   * confronto per riferimento rifarebbe la rete dieci volte al secondo.
   */
  update(poles: readonly RoadPole[]): boolean {
    const signature = poles
      .map((pole) => `${pole.x},${pole.y},${pole.strength}`)
      .sort()
      .join(';');
    if (signature === this.signature) return false;
    this.signature = signature;

    if (poles.length === 0) {
      this.plan = EMPTY_PLAN;
      this.painted = [];
      this.spans = [];
      this.index = new Map();
      return true;
    }

    this.plan = planRoads(poles, this.probe(), boundsOf(poles));
    this.painted = strokeRoads(this.plan.nodes);

    const carries = (x: number, y: number): boolean => this.groundCarries(x, y);
    const clearanceAt = (x: number, y: number): number => this.clearanceAt(x, y);
    const runs = this.plan.paths.flatMap((path) => planViaducts(path, { carries, clearanceAt }));
    this.spans = strokeViaduct(runs.flatMap((run) => run.columns));

    this.index = new Map();
    for (const cell of this.painted) this.index.set(`${cell.x},${cell.y}`, cell.rank);
    for (const cell of this.spans) this.index.set(`${cell.x},${cell.y}`, cell.rank);
    // La fascia si rifa' con la rete e non si conserva: un tratto che sparisce
    // perche' i poli sono cambiati lascerebbe dietro di se' un affaccio su una
    // strada che non c'e' piu'.
    this.frontage = new Set();
    this.widenFrontage(this.painted);
    this.widenFrontage(this.spans);
    return true;
  }

  /**
   * Attacca alla rete un pezzo di citta' nato lontano. Le colonne nuove, o
   * vuoto se non serviva o non si poteva.
   *
   * **Non fa niente quasi sempre, ed e' il punto.** Un edificio che nasce sul
   * fronte di un tratto esistente e' gia' collegato, e in una citta' che cresce
   * per contiguita' e' il caso di quasi tutti: la lettura che lo verifica e' un
   * anello su un indice in memoria, e si ferma al primo colpo.
   *
   * **E quando serve, e' il capillare.** Un vicolo da un voxel dal nuovo lotto
   * alla prima carreggiata che incontra. E' l'unica parte della rete che cresce
   * con la citta' invece che con i poli, ed e' anche quella che la rende
   * utilizzabile: senza, il tracciato resterebbe la manciata di tratti fra i
   * catalizzatori e il tessuto non avrebbe su cosa affacciarsi.
   *
   * Il rango resta `lane` e non si rivaluta: un vicolo non diventa un'arteria
   * perche' ci si e' costruito attorno. La gerarchia la misura l'albero dei
   * poli, e questo non e' un ramo dell'albero — e' una foglia attaccata dopo.
   */
  connect(x: number, y: number): readonly RoadSurface[] {
    if (this.index.size === 0) return [];
    if (this.distanceToRoad(x, y, ROADS.frontageReach) <= ROADS.frontageReach) return [];

    const trace = traceRoad({
      fromX: x,
      fromY: y,
      toAny: (cx, cy) => this.index.has(`${cx},${cy}`),
      bounds: boundsAround(x, y, x, y, ROADS.laneReach),
      probe: this.probe(),
    });
    if (trace === null) return [];

    const lane = strokeRoads(trace.steps.map((step) => ({ ...step, rank: ROAD_RANK.lane })));
    const fresh: RoadSurface[] = [];
    for (const cell of lane) {
      const key = `${cell.x},${cell.y}`;
      if (this.index.has(key)) continue;
      this.index.set(key, cell.rank);
      fresh.push(cell);
    }
    this.painted = [...this.painted, ...fresh];
    this.widenFrontage(fresh);
    return fresh;
  }

  /**
   * La sonda del tracciato: quanto costa a una strada attraversare la colonna.
   *
   * **L'ordine dei rami e' la regola, non un dettaglio.** L'acqua si controlla
   * per prima perche' una colonna sommersa e' sempre da scavalcare, quale che sia
   * la sua pendenza; il costruito viene dopo il terreno perche' un edificio su
   * una parete resta una parete. E' lo stesso ordine di `reachCost.ts`, per la
   * stessa ragione.
   */
  private probe(): RoadProbe {
    return {
      levelAt: (x, y) => {
        const water = this.terrain.waterTopAt(x, y);
        const ground = this.terrain.heightAt(x, y);
        // Sull'acqua il piano di riferimento e' il pelo: misurare la pendenza di
        // un ponte dal fondale lo farebbe rifiutare da `maxRise` sempre.
        return water > ground ? water : ground;
      },
      costAt: (x, y) => {
        if (!this.terrain.has(x, y)) return Number.POSITIVE_INFINITY;
        // L'acqua non prende il termine continuo: sotto c'e' una campata, e una
        // campata che serpeggia e' un difetto di posa, non una strada organica.
        if (this.terrain.biomeAt(x, y) === BIOME.ocean) return ROADS.waterCost;
        const shape = terrainPenalty(this.seed, x, y, this.terrain.slopeAt(x, y));
        if (this.kindOf(x, y) === GROUND.refused) return ROADS.steepCost + shape;
        if (this.occupied(x, y)) return ROADS.builtCost + shape;
        if (!this.terrain.isBuildable(x, y)) return ROADS.steepCost + shape;
        return ROADS.landCost + shape;
      },
    };
  }

  /** true se la carreggiata puo' appoggiarsi al terreno di questa colonna. */
  private groundCarries(x: number, y: number): boolean {
    if (!this.terrain.has(x, y)) return false;
    if (this.terrain.biomeAt(x, y) === BIOME.ocean) return false;
    return this.kindOf(x, y) !== GROUND.refused;
  }

  /** Quota che un impalcato deve scavalcare qui: il pelo, o il terreno. */
  private clearanceAt(x: number, y: number): number {
    return Math.max(this.terrain.waterTopAt(x, y), this.terrain.heightAt(x, y));
  }

  private kindOf(x: number, y: number): number {
    return groundKindOf(
      this.terrain.biomeAt(x, y),
      this.terrain.slopeAt(x, y),
      this.terrain.heightAt(x, y),
      this.terrain.waterTopAt(x, y),
    );
  }
}

/**
 * Il riquadro di ricerca: i poli, piu' il gioco per aggirare un ostacolo.
 *
 * Il margine e' `laneReach` per lato, cioe' lo stesso numero oltre il quale un
 * capillare rinuncia: e' abbastanza per girare attorno a una darsena o a uno
 * sperone, e non abbastanza perche' una strada faccia il giro dell'isola per
 * evitare una salita — che e' la stessa taratura, e la stessa ragione, di
 * `STREETS.linkMargin`.
 */
function boundsOf(poles: readonly RoadPole[]): TraceBounds {
  let x0 = Number.MAX_SAFE_INTEGER;
  let y0 = Number.MAX_SAFE_INTEGER;
  let x1 = Number.MIN_SAFE_INTEGER;
  let y1 = Number.MIN_SAFE_INTEGER;
  for (const pole of poles) {
    if (pole.x < x0) x0 = pole.x;
    if (pole.y < y0) y0 = pole.y;
    if (pole.x > x1) x1 = pole.x;
    if (pole.y > y1) y1 = pole.y;
  }
  return {
    x0: x0 - ROADS.laneReach,
    y0: y0 - ROADS.laneReach,
    x1: x1 + ROADS.laneReach,
    y1: y1 + ROADS.laneReach,
  };
}
