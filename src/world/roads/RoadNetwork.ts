import { BIOME } from '../terrain/config';
import { GROUND, groundKindOf } from '../grading/grade';
import type { TerrainMap } from '../terrain/TerrainMap';
import { ROADS, ROAD_RANK, type RoadRank } from './config';
import { EMPTY_PLAN, normalisePoles, planRoads, type RoadPlan, type RoadPole } from './network';
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
 * costerebbe piu' di una ricostruzione.
 *
 * **Quanto spesso, invece, non lo decide il giocatore.** Questo file e' nato
 * dicendo «una manciata di volte per partita», contando sul fatto che i poli
 * arrivassero da un catalizzatore piantato a mano; ma un landmark che avanza di
 * stadio rinforza il proprio catalizzatore da solo (`setCatalystStrength` in
 * `buildings/landmarkDriver.ts`), e su una citta' matura succede ogni pochi
 * secondi. Da qui le due cose che tengono in piedi la premessa: la firma ignora
 * cio' che non disegna — vedi `signatureOf` — e la ricostruzione non paga piu' i
 * poli che non puo' collegare, che e' il lavoro di `roads/regions.ts`.
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
  /**
   * Quante volte il tracciato e' cambiato.
   *
   * Serve a chi tiene una memoria su «questa colonna e' libera?»: una strada che
   * si sposta **libera** il suolo che teneva, ed e' il quarto modo di liberarlo
   * dopo il registry, l'impalcato e il terreno. Sale sia quando la rete si rifa'
   * per intero sia quando un capillare aggiunge colonne, perche' entrambi
   * cambiano la risposta.
   */
  private revisions = 0;

  /** Il contatore di invalidazione per chi memorizza cosa la strada tiene. */
  get revision(): number {
    return this.revisions;
  }

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
   * La firma e' una stringa e non l'identita' dell'array: ogni tick della
   * simulazione ricrea i catalizzatori, quindi un confronto per riferimento
   * rifarebbe la rete dieci volte al secondo. Cosa ci sta dentro, e perche' meno
   * di quanto sembri, e' in `signatureOf`.
   */
  update(poles: readonly RoadPole[]): boolean {
    const signature = signatureOf(poles);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.revisions++;

    if (poles.length === 0) {
      this.plan = EMPTY_PLAN;
      this.painted = [];
      this.spans = [];
      this.index = new Map();
      // La fascia segue la rete anche quando la rete non c'e' piu': tenerla
      // lascerebbe affacci su strade svanite, che e' il difetto che la riga
      // gemella in fondo a questo metodo evita nel caso normale.
      this.frontage = new Set();
      return true;
    }

    // Il riquadro si calcola **prima** della sonda e non dentro la chiamata: e'
    // anche l'estensione su cui la sonda tiene da parte le proprie risposte, e
    // passarlo due volte sarebbe l'unico modo di farle divergere.
    const bounds = boundsOf(poles);
    this.plan = planRoads(poles, this.probe(bounds), bounds);
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

    const bounds = boundsAround(x, y, x, y, ROADS.laneReach);
    const trace = traceRoad({
      fromX: x,
      fromY: y,
      toAny: (cx, cy) => this.index.has(`${cx},${cy}`),
      bounds,
      probe: this.probe(bounds),
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
    if (fresh.length > 0) this.revisions++;
    return fresh;
  }

  /**
   * La sonda del tracciato, con le sue risposte tenute da parte sul riquadro.
   *
   * **Le due letture sono pure per la durata di una ricerca, ed e' questo che
   * rende lecito memorizzarle.** `costOf` legge terreno, seme e suolo occupato;
   * nessuno dei tre cambia mentre `planRoads` o `connect` girano, perche' sono
   * chiamate sincrone e chi scrive nel registry — il Builder — sta aspettando
   * che ritornino. La memoria vive quindi quanto l'oggetto restituito da qui,
   * cioe' una ricostruzione o un capillare, e non un tick di piu': non e' una
   * cache da invalidare, e non c'e' niente che possa restare vecchio.
   *
   * **Senza, la stessa colonna si ricalcolava centinaia di volte.**
   * `planRoads` fa una ricerca per polo — fino a `maxPoles` meno uno — e ognuna
   * interroga `costAt` una volta per ogni passo verso ognuno degli otto vicini.
   * Misurato su una citta' matura caricata da salvataggio, una ricostruzione
   * bloccava il frame per dodici-diciassette secondi, e piu' di due terzi di
   * quel tempo se ne andava a rifare le stesse sei letture di `TerrainMap` e la
   * stessa interrogazione del registry per riottenere la stessa risposta.
   *
   * Il riquadro e' quello della ricerca, quindi la memoria e' grande quanto il
   * campo che la ricerca puo' visitare; una colonna chiesta fuori da li' si
   * calcola e non si tiene, invece di allargare l'array per un caso che il
   * tracciato non produce.
   */
  private probe(bounds: TraceBounds): RoadProbe {
    const width = bounds.x1 - bounds.x0 + 1;
    const height = bounds.y1 - bounds.y0 + 1;
    const cells = width > 0 && height > 0 ? width * height : 0;
    // `NaN` vuol dire «non ancora chiesto», e non e' una scelta di gusto:
    // `Infinity` e' un valore **legale** di `costAt` — dice che di qui non si
    // passa — quindi non puo' fare da segnaposto. `Float64Array` e non
    // `Float32Array` perche' il termine continuo di `terrainCost.ts` e' un
    // numero con la virgola: arrotondarlo cambierebbe quale di due cammini
    // uguali vince, cioe' il disegno delle strade.
    const costs = new Float64Array(cells).fill(Number.NaN);
    const levels = new Float64Array(cells).fill(Number.NaN);

    /** L'indice nella memoria, o -1 per una colonna fuori dal riquadro. */
    const slot = (x: number, y: number): number => {
      const lx = x - bounds.x0;
      const ly = y - bounds.y0;
      if (lx < 0 || ly < 0 || lx >= width || ly >= height) return -1;
      return ly * width + lx;
    };

    return {
      levelAt: (x, y) => {
        const at = slot(x, y);
        if (at === -1) return this.levelOf(x, y);
        const known = levels[at];
        // `v === v` e' falso solo per `NaN`, ed e' il test piu' corto che
        // distingue «non calcolato» da un valore qualunque.
        if (known === known) return known;
        const value = this.levelOf(x, y);
        levels[at] = value;
        return value;
      },
      costAt: (x, y) => {
        const at = slot(x, y);
        if (at === -1) return this.costOf(x, y);
        const known = costs[at];
        if (known === known) return known;
        const value = this.costOf(x, y);
        costs[at] = value;
        return value;
      },
    };
  }

  /**
   * Quota del piano su cui la carreggiata si appoggerebbe.
   *
   * Sull'acqua il piano di riferimento e' il pelo: misurare la pendenza di un
   * ponte dal fondale lo farebbe rifiutare da `maxRise` sempre.
   */
  private levelOf(x: number, y: number): number {
    const water = this.terrain.waterTopAt(x, y);
    const ground = this.terrain.heightAt(x, y);
    return water > ground ? water : ground;
  }

  /**
   * Quanto costa a una strada attraversare la colonna, letto per davvero.
   *
   * **L'ordine dei rami e' la regola, non un dettaglio.** L'acqua si controlla
   * per prima perche' una colonna sommersa e' sempre da scavalcare, quale che
   * sia la sua pendenza; il costruito viene dopo il terreno perche' un edificio
   * su una parete resta una parete. E' lo stesso ordine di `reachCost.ts`, per
   * la stessa ragione.
   */
  private costOf(x: number, y: number): number {
    if (!this.terrain.has(x, y)) return Number.POSITIVE_INFINITY;
    // L'acqua non prende il termine continuo: sotto c'e' una campata, e una
    // campata che serpeggia e' un difetto di posa, non una strada organica.
    if (this.terrain.biomeAt(x, y) === BIOME.ocean) return ROADS.waterCost;
    const shape = terrainPenalty(this.seed, x, y, this.terrain.slopeAt(x, y));
    if (this.kindOf(x, y) === GROUND.refused) return ROADS.steepCost + shape;
    if (this.occupied(x, y)) return ROADS.builtCost + shape;
    if (!this.terrain.isBuildable(x, y)) return ROADS.steepCost + shape;
    return ROADS.landCost + shape;
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
 * Cio' che, cambiando, cambia il disegno delle strade. Niente altro.
 *
 * **L'intensita' dei poli non c'e', e la sua assenza e' il punto.** `planRoads`
 * la legge in un posto solo — l'ordine di `normalisePoles` — quindi due liste di
 * poli che normalizzano nella stessa sequenza di colonne danno la stessa rete,
 * colonna per colonna, qualunque numero ci sia scritto sopra. Tenere
 * l'intensita' nella firma voleva dire rifare tutto a ogni avanzamento di stadio
 * di un landmark, che ne aggiunge otto al proprio catalizzatore: una
 * ricostruzione intera per un numero che non sposta un voxel.
 *
 * **Quello che ci sta dentro sono le colonne tenute e il riquadro.** Le prime
 * nell'ordine in cui `planRoads` le usera', perche' l'ordine decide a cosa ogni
 * ramo si attacca; il secondo perche' dipende da **tutti** i poli e non solo da
 * quelli tenuti, e allargandolo la ricerca trova cammini che prima non c'erano.
 *
 * Fuori restano terreno e suolo occupato, ed e' come era prima: un edificio
 * nuovo non rifa' le strade. Chi ha bisogno di una strada dove non c'e' la chiede
 * a `connect`.
 *
 * Resta una conseguenza da sapere: i poli dentro `plan.connected` e
 * `plan.orphans` portano l'intensita' che avevano **all'ultima ricostruzione**.
 * Nessuno la legge — servono a sapere *quali* poli, non quanto forti — e chi ne
 * avesse bisogno la chieda ai catalizzatori, che sono la fonte.
 */
function signatureOf(poles: readonly RoadPole[]): string {
  if (poles.length === 0) return '';
  const bounds = boundsOf(poles);
  let out = `${bounds.x0},${bounds.y0},${bounds.x1},${bounds.y1}`;
  for (const pole of normalisePoles(poles)) out += `|${pole.x},${pole.y}`;
  return out;
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
