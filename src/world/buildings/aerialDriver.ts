import { BUILDING_CLASS } from '../../sim';
import { hashCoords } from '../rng';
import { GROUND } from '../grading/grade';
import { AERIAL, AERIAL_PART, isBuildable, type AerialPart } from '../aerial/config';
import type { AerialColumn, AerialProbe, DeckPlan, Pier } from '../aerial/deckPlan';
import {
  AERIAL_FACES,
  planTerrace,
  type AerialFace,
  type AerialSupport,
  type TerracePlan,
  type TerraceResult,
} from '../aerial/terracePlan';
import { planRoute, type RouteEnd, type RoutePlan } from '../aerial/routePlan';
import { generateDeck, generatePier } from '../aerial/generate';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount } from './chunkBudget';
import { anchorOf } from './growthQueue';
import { groundKindAt } from './siteWorks';
import type { SpanDriver } from './spanDriver';
import { STAMP_EMPTY } from './stamp';

/**
 * La citta' in quota: mensole, percorsi, gambe e i piani su cui si costruisce.
 *
 * **Due passate e non una**, perche' sono due atti urbani distinti: la mensola
 * e' il *dettaglio* — una facciata che sporge — e il percorso e' il
 * *collegamento*. Una citta' che si legga intrecciata ha bisogno di molte
 * mensole e di pochi percorsi, quindi vanno a cadenze diverse.
 *
 * **Dipende dalle campate e non viceversa.** Una gamba piantata dentro una
 * piazza in quota la lascerebbe a registro con un palo in mezzo, quindi qui si
 * chiede a `SpanDriver` di far cadere cio' che sta nel volume — vale la regola
 * del suolo, chi ci sta sopra vince. La freccia va in un verso solo: le campate
 * non sanno che la citta' in quota esiste.
 */
export class AerialDriver {
  private terraceCursor = 0;
  private routeCursor = 0;

  /**
   * Quante mensole porta ciascun edificio.
   *
   * Una mappa sparsa invece di una domanda al registry: la passata la consulta
   * per ogni record che esamina, e ricavarla dai record vorrebbe dire risolvere
   * le mensole di ciascuno per sapere se vale la pena provarci.
   *
   * **Era una maschera di facce, ed e' diventata un conteggio.** Da quando la
   * mensola nasce sul solo fronte strada le facce non sono piu' quattro: le
   * mensole di un ospite si distinguono per **quota**, non per lato, e a tenerle
   * separate basta `planDeck`, che rifiuta come `blocked` la corsa gia' occupata
   * e manda il tentativo su quella sopra.
   */
  private readonly terraceCount = new Map<number, number>();

  /** Percorsi che arrivano a un edificio, e le coppie gia' collegate. */
  private readonly routeCount = new Map<number, number>();
  private readonly routePairs = new Set<string>();

  /**
   * Le gambe di ciascun impalcato, e gli impalcati su cui qualcuno ha costruito.
   *
   * **Un impalcato vuoto cade quando il suo ospite cresce, uno abitato no.** E'
   * il compromesso che tiene insieme le due regole della fase: «chi regge non
   * cresce» congelava mezza citta' — misurato, la fascia alta della gerarchia
   * scendeva da quaranta edifici a diciannove — mentre far cadere una mensola con
   * una casa sopra sarebbe una demolizione. Vuota, invece, la passata la
   * ripropone alla quota nuova: la citta' in quota **insegue** quella sotto,
   * esattamente come fa la rete delle campate.
   */
  private readonly deckPiers = new Map<number, number[]>();
  private readonly inhabitedDecks = new Set<number>();

  private terracesBuilt = 0;
  private routesBuilt = 0;
  private piersBuilt = 0;

  /**
   * Colonne su cui esiste un piano oltre al suolo.
   *
   * **E' cio' che rende una colonna gia' costruita di nuovo candidabile senza
   * pagarlo su tutte le altre.** `lotIsFree` gira per migliaia di colonne a
   * infornata e il suo primo rifiuto e' «il suolo e' preso»: aggiungere li' una
   * domanda al registry costerebbe su ogni colonna dell'isola. Un insieme sparso
   * si interroga solo sul ramo che oggi esce subito, quindi una citta' tutta al
   * suolo costa esattamente quello che costa oggi.
   */
  private readonly deckColumns = new Set<string>();

  /**
   * Come si presenta il luogo alle regole della citta' in quota.
   *
   * Riusa `solid` della sonda delle campate — e' la stessa domanda al mondo — e
   * cambia la lettura di colonna, perche' qui non serve sapere se il suolo e'
   * libero ma **su cosa si puo' poggiare**: il terreno o un tetto, indifferente.
   * E' quella indifferenza a permettere a una gamba di stare sopra la citta'
   * invece che accanto.
   */
  private readonly probe: AerialProbe;

  constructor(
    private readonly ctx: BuildContext,
    private readonly spans: SpanDriver,
  ) {
    this.probe = {
      ground: (x, y): AerialColumn => {
        const support = ctx.registry.supportAt(x, y);
        const height = ctx.terrain.heightAt(x, y);
        return {
          height,
          top: Math.max(height, support.z),
          pavement: ctx.streets.isPavement(x, y),
          free: !ctx.registry.isOccupied(x, y),
          firm: groundKindAt(ctx.terrain, x, y) !== GROUND.refused,
          carrier: support.z > height ? support.id : 0,
        };
      },
      solid: (x, y, z) => ctx.world.getBlock(x, y, z) !== STAMP_EMPTY,
    };
  }

  get terraces(): number {
    return this.terracesBuilt;
  }

  get routes(): number {
    return this.routesBuilt;
  }

  get piers(): number {
    return this.piersBuilt;
  }

  /**
   * Come questo dominio vede il luogo, per chi ne condivide le regole.
   *
   * La passata della guida chiede al mondo esattamente le stesse due cose — su
   * cosa si poggia, e dov'e' il vuoto — e costruirsene una copia vorrebbe dire
   * due letture diverse dello stesso posto.
   */
  get siteProbe(): AerialProbe {
    return this.probe;
  }

  /** true se qualcuno ha costruito su questo impalcato. */
  isInhabited(deckId: number): boolean {
    return this.inhabitedDecks.has(deckId);
  }

  /** true se su questa colonna corre un piano oltre al suolo. */
  hasDeck(x: number, y: number): boolean {
    return this.deckColumns.has(`${x},${y}`);
  }

  /**
   * Segna un impalcato come abitato: da adesso non cade piu'.
   *
   * Togliere l'ospite a un impalcato su cui qualcuno ha gia' costruito sarebbe
   * una demolizione, e demolire non e' nel vocabolario di questo progetto.
   */
  markInhabited(deckId: number): void {
    this.inhabitedDecks.add(deckId);
  }

  /**
   * true se cio' che questo edificio porta gli impedisce di promuovere.
   *
   * Un impalcato **abitato** lo ferma, e cosi' un tratto di percorso o un nodo:
   * quelli non cadono mai. Una mensola vuota no — `releaseDecks` la fa cadere
   * quando la promozione e' decisa, e la passata successiva la ripropone alla
   * quota nuova. Fermare l'ospite in tutti i casi era la lettura semplice, ed e'
   * misurato che non funziona: la fascia alta della gerarchia scendeva da
   * quaranta edifici a diciannove, perche' una mensola arriva presto e da quel
   * momento la torre non sale piu'.
   */
  blocksUpgrade(hostId: number): boolean {
    return this.ctx.registry.decksOf(hostId).some((deck) =>
      this.pinned(deck.id) || deck.aerial !== AERIAL_PART.terrace);
  }

  /**
   * true se questo impalcato non puo' piu' cadere.
   *
   * Due modi di essere inchiodati, e sono lo stesso fatto visto da due parti:
   * qualcuno ci **sta sopra** — un lotto in quota — oppure qualcuno ci si
   * **appende**. Il secondo era scoperto, e il difetto e' esattamente quello che
   * `buildRoute` dichiara di voler evitare: «i due capi reggono il percorso, e il
   * percorso li immobilizza». Senza, l'ospite di una mensola-capolinea poteva
   * promuovere, `releaseDecks` la faceva cadere, e il tratto restava con un
   * `supports` che non risolve piu' — cioe' una passerella che finisce nel vuoto.
   *
   * `carries` risponde per tutti e due i modi di appendersi, e non solo per i
   * capolinea: anche la gamba di un percorso che poggia sul piano di una mensola
   * la mette fra chi regge. E' la stessa domanda che l'upgrade di un edificio si
   * fa gia' prima di promuovere, posta un piano piu' in alto.
   */
  private pinned(deckId: number): boolean {
    return this.inhabitedDecks.has(deckId) || this.ctx.registry.carries(deckId);
  }

  /**
   * Quante quote ammette una colonna. E' la risposta del mondo a `nextBuildSites`.
   *
   * **E' qui che si chiude il primo dei tre punti della diagnosi.** Il campo
   * conta le quote spese e chiede quante ce ne siano; la risposta e' il suolo
   * piu' gli impalcati edificabili che passano di qui, e non ha bisogno di
   * nessuna coordinata verticale dall'altra parte del confine.
   *
   * Un campo e non un metodo perche' viene passata come funzione: legata una
   * volta sola, non alloca una chiusura per infornata.
   */
  readonly headroomAt = (x: number, y: number): number => {
    // Il caso normale, e l'unico su una citta' tutta a terra: nessun impalcato
    // sopra, una quota sola. Una lettura di Set e via.
    if (!this.deckColumns.has(`${x},${y}`)) return 1;

    let decks = 1;
    for (const record of this.ctx.registry.at(x, y)) {
      if (record.aerial !== undefined && isBuildable(record.aerial)) decks++;
    }
    return decks;
  };

  /**
   * Fa cadere le mensole vuote di un edificio che sta per promuovere.
   *
   * **Chi promuove si scrolla di dosso cio' che non e' abitato.** La sagoma nuova
   * non ha piu' la parete a cui la mensola era appesa, quindi o la mensola segue
   * o sparisce: qui sparisce, e la passata successiva la ripropone alla quota
   * nuova. E' la stessa scelta che le campate fanno da sempre — la citta' in
   * quota insegue quella sotto invece di fossilizzarla.
   */
  releaseDecks(hostId: number): void {
    for (const deck of [...this.ctx.registry.decksOf(hostId)]) {
      if (deck.aerial !== AERIAL_PART.terrace) continue;
      if (this.pinned(deck.id)) continue;
      this.dropDeck(deck);
    }
  }

  /**
   * Appende mensole ai fronti degli edifici che hanno finito di crescere.
   *
   * **E' il dettaglio, non il collegamento**, ed e' la ragione per cui va piu'
   * spesso della rete: una citta' che si legga intrecciata ha bisogno di molte
   * mensole e di pochi percorsi. Un cursore come le altre passate, quindi il
   * costo non cresce con la citta'.
   */
  terracePass(): void {
    const records = [...this.ctx.registry.all];
    if (records.length === 0) return;

    const budget = Math.min(AERIAL.terrace.examinedPerPass, records.length);
    let built = 0;

    for (let i = 0; i < budget && built < AERIAL.terrace.perPass; i++) {
      const record = records[this.terraceCursor % records.length];
      this.terraceCursor++;
      if (!settled(record)) continue;
      if ((this.terraceCount.get(record.id) ?? 0) >= AERIAL.terrace.maxPerHost) continue;

      const result = this.planTerraceOn(record);
      if (!result.ok) continue;
      if (!this.buildTerrace(result.plan)) continue;
      built++;
    }
  }

  /**
   * Collega due mensole che hanno finito di crescere, anche di isolati diversi.
   *
   * **E' il fatto della fase.** Le campate della 4.5 legano coppie che si
   * guardano da vicino; qui il compagno si cerca in un raggio di isolati, e il
   * percorso ci arriva con gambe proprie.
   *
   * **Si scorrono le mensole, non gli edifici.** E' la stessa scelta della
   * passata delle campate, che scorre `registry.spans`: sono unita', non
   * migliaia, e sono esattamente i luoghi da cui un percorso puo' partire.
   */
  routePass(): void {
    const decks = this.ctx.registry.decks;
    if (decks.length === 0) return;

    const budget = Math.min(AERIAL.route.examinedPerPass, decks.length);
    let built = 0;

    for (let i = 0; i < budget && built < AERIAL.route.perPass; i++) {
      const record = decks[this.routeCursor % decks.length];
      this.routeCursor++;
      if ((this.routeCount.get(record.id) ?? 0) >= AERIAL.route.maxPerHost) continue;

      const partner = this.routePartner(record);
      if (partner === null) continue;

      const result = planRoute({
        a: routeEndOf(record, this.openSideOf(record)),
        b: routeEndOf(partner, this.openSideOf(partner)),
        ground: this.probe.ground,
        solid: this.probe.solid,
      });
      // La coppia si segna comunque: un rifiuto non cambia finche' i due capi non
      // cambiano, e riprovarla a ogni passata sarebbe il costo piu' alto del
      // dominio speso per sentirsi dire di no.
      this.routePairs.add(pairKey(record.id, partner.id));
      if (!result.ok) continue;
      if (!this.buildRoute(result.plan)) continue;
      built++;
    }
  }

  /**
   * La mensola che nascerebbe su questa colonna, o perche' no. **Non scrive.**
   *
   * E' la domanda del cursore, e passa dalla stessa `planTerraceOn` della
   * passata automatica e del click: tre strade diverse per lo stesso piazzamento
   * finirebbero per accettare tre insiemi di luoghi diversi, ed e' esattamente
   * il difetto che `catalystFailure` esiste per non avere.
   *
   * `noHost` non e' un rifiuto del dominio in quota — li' una mensola ha sempre
   * un ospite per costruzione — ma del gesto: il giocatore ha cliccato dove non
   * c'e' un edificio a cui appenderla.
   */
  terraceSite(x: number, y: number): TerraceResult {
    const host = this.buildingAt(x, y);
    if (host === null) return { ok: false, refusal: 'noHost' };
    if ((this.terraceCount.get(host.id) ?? 0) >= AERIAL.terrace.maxPerHost) {
      return { ok: false, refusal: 'hostFull' };
    }
    return this.planTerraceOn(host);
  }

  /**
   * Posa una mensola sull'edificio di questa colonna. false se il fronte non la
   * regge o se non entra nel budget di chunk.
   *
   * E' la porta del giocatore: la convalida economica sta in `game/actions.ts`,
   * qui c'e' solo quella del mondo. Il budget di chunk resta l'ultima parola e
   * si puo' scoprire solo scrivendo, quindi il cursore puo' dire di si' e il
   * click no — lo stesso patto che vale per un catalizzatore.
   */
  placeTerrace(x: number, y: number): boolean {
    const result = this.terraceSite(x, y);
    return result.ok && this.buildTerrace(result.plan);
  }

  /**
   * Materializza gli appoggi di una piattaforma che disegna da se' il proprio piano.
   *
   * Lo Skyport porta gia' soletta e bordo nella propria ricetta: registrarlo come
   * una seconda terrazza sovrapposta duplicerebbe il volume. Le gambe restano
   * pero' quelle di `planDeck`, perche' uno sporto di otto voxel non smette di
   * aver bisogno di un appoggio solo perche' sopra cambia destinazione d'uso.
   */
  commitFacadeSupports(deck: DeckPlan, hostId: number): readonly number[] | null {
    this.dropDeckSpans(deck);
    if (!this.deckFits(deck, [hostId])) return null;

    const piers: number[] = [];
    for (const pier of deck.piers) piers.push(this.commitPier(pier));
    return piers;
  }

  /** Cancella un impalcato e le gambe che si era contate, e li toglie dal registry. */
  private dropDeck(record: BuildingRecord): void {
    // **Cio' che si appoggiava alla mensola cade con lei.** Una campata puo'
    // atterrare sul suo filo — la sonda guarda il mondo, e li' il mondo e' pieno
    // — e toglierle il piano sotto la lascerebbe a mezz'aria, che e' esattamente
    // il difetto che il gate della 4.5 esiste per escludere. Il riquadro si
    // allarga di una colonna per prendere anche chi la tocca senza entrarci.
    this.spans.dropIntersecting(
      record.x - 1, record.y - 1,
      record.footprint + 2, footprintDepth(record) + 2,
      record.baseZ, record.baseZ + record.height,
    );

    for (const pierId of this.deckPiers.get(record.id) ?? []) {
      const pier = this.ctx.registry.get(pierId);
      if (pier === null) continue;
      // Anche una gamba puo' fare da testata a una campata: sparisce lei,
      // sparisce chi ci si appoggiava.
      this.spans.dropIntersecting(
        pier.x - 1, pier.y - 1,
        pier.footprint + 2, footprintDepth(pier) + 2,
        pier.baseZ, pier.baseZ + pier.height,
      );
      this.ctx.growth.clearVolume(
        pier.x, pier.y, pier.footprint, footprintDepth(pier),
        pier.baseZ, pier.baseZ + pier.height,
      );
      this.ctx.registry.remove(pierId);
      this.piersBuilt--;
    }
    this.deckPiers.delete(record.id);

    this.ctx.growth.clearVolume(
      record.x, record.y, record.footprint, footprintDepth(record),
      record.baseZ, record.baseZ + record.height,
    );
    for (let dy = 0; dy < footprintDepth(record); dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        this.deckColumns.delete(`${record.x + dx},${record.y + dy}`);
      }
    }
    // Il posto torna libero: l'ospite potra' riaverne una piu' in alto.
    const host = record.supports?.[0];
    if (host !== undefined) {
      const left = (this.terraceCount.get(host) ?? 1) - 1;
      if (left > 0) this.terraceCount.set(host, left);
      else this.terraceCount.delete(host);
    }
    this.ctx.registry.remove(record.id);
    if (record.aerial === AERIAL_PART.terrace) this.terracesBuilt--;
  }

  /**
   * La mensola che un edificio reggerebbe, o perche' no.
   *
   * E' la stessa domanda per la passata automatica e per il giocatore, e passa
   * di qui entrambe le volte: due strade diverse per lo stesso piazzamento
   * finirebbero per accettare due insiemi di luoghi diversi, ed e' esattamente
   * il difetto che `catalystFailure` esiste per non avere.
   */
  private planTerraceOn(record: BuildingRecord): TerraceResult {
    // **La mensola sta sul fronte strada, e su nessun altro lato.** Girare fra le
    // quattro facce distribuiva le mensole su tutta la sagoma, ed e' misurato che
    // cosi' la rete non esiste: un percorso fra due mensole rivolte verso il
    // cuore dell'isolato ha il corridoio sopra i corpi degli edifici, il colmo
    // sale sopra i loro tetti e il dislivello da assorbire diventa quello di una
    // torre. Sul fronte strada il corridoio corre invece **sopra la carreggiata**,
    // dove non c'e' niente da scavalcare, e due vicini dello stesso isolato
    // guardano lo stesso vuoto.
    //
    // Un ospite senza fronte — materializzato da un salvataggio, o nato dove la
    // maglia non arriva — torna a provarle tutte: meglio una mensola orientata
    // come capita che nessuna mensola.
    const faces: readonly AerialFace[] = record.facing === undefined
      ? AERIAL_FACES
      : [record.facing as AerialFace];

    return planTerrace({
      host: aerialSupportOf(record),
      faces,
      ground: this.probe.ground,
      solid: this.probe.solid,
    });
  }

  /** L'edificio vero che occupa il suolo di questa colonna, se ce n'e' uno. */
  private buildingAt(x: number, y: number): BuildingRecord | null {
    for (const record of this.ctx.registry.at(x, y)) {
      if (record.aerial !== undefined || record.span !== undefined) continue;
      if (record.landmark !== undefined) continue;
      return record;
    }
    return null;
  }

  /** Scrive una mensola: l'impalcato, e le gambe che si e' contata da sola. */
  private buildTerrace(plan: TerracePlan): boolean {
    // **L'ospite e' eccettuato dalla collisione.** La mensola parte dalla parete,
    // che su una fascia rientrata cade ancora dentro l'impronta dichiarata: e'
    // attaccata a lui, non in conflitto con lui. E' anche la prima volta che
    // qualcosa in questo progetto sporge oltre la propria impronta.
    const except = [plan.host];
    this.dropDeckSpans(plan.deck);
    if (!this.deckFits(plan.deck, except)) return false;

    this.commitDeck(AERIAL_PART.terrace, plan.deck, [plan.host]);
    this.terraceCount.set(plan.host, (this.terraceCount.get(plan.host) ?? 0) + 1);
    this.terracesBuilt++;
    return true;
  }

  /**
   * La mensola compagna migliore per questa, o `null`.
   *
   * La piu' vicina fra quelle abbastanza lontane: sotto `minSeparation` il
   * collegamento lo fa gia' una campata, meglio e senza gambe. A parita' vince
   * l'id piu' basso, cosi' la scelta non dipende dall'ordine con cui il registry
   * restituisce i vicini.
   */
  private routePartner(record: BuildingRecord): BuildingRecord | null {
    let best: BuildingRecord | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const open = this.openSideOf(record);

    for (const other of this.ctx.registry.decks) {
      if (other.id === record.id) continue;
      if (this.routePairs.has(pairKey(record.id, other.id))) continue;
      if ((this.routeCount.get(other.id) ?? 0) >= AERIAL.route.maxPerHost) continue;
      // **Si esce dalla mensola dalla parte libera.** Una mensola sporge da una
      // facciata: dall'altro lato c'e' il proprio ospite, e un percorso che
      // partisse di li' comincerebbe dentro un edificio. E' la meta' esatta dei
      // compagni possibili, ed e' la meta' che non puo' funzionare.
      if (!facesToward(open, record, other)) continue;
      if (!facesToward(this.openSideOf(other), other, record)) continue;

      // **Il vuoto fra i due riquadri, non fra i due angoli.** La regola misura
      // da bordo a bordo, e due mensole con gli angoli a quattordici colonne ne
      // hanno in mezzo sei: sarebbero tutte rifiutate per `badSeparation` dopo
      // averle esaminate.
      const distance = gapBetween(record, other);
      if (distance < AERIAL.route.minSeparation) continue;
      if (distance > AERIAL.route.maxSeparation) continue;
      if (distance < bestDistance ||
        (distance === bestDistance && best !== null && other.id < best.id)) {
        best = other;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Da che parte un impalcato guarda il vuoto, o `null` se non ha un ospite.
   *
   * E' il verso che va dal centro dell'edificio che lo porta al centro suo: per
   * una mensola e' la direzione in cui sporge, ed e' l'unica da cui un percorso
   * puo' partire senza infilarsi dentro l'ospite. Un nodo non ha un ospite e
   * guarda dappertutto.
   */
  private openSideOf(record: BuildingRecord): { axis: 0 | 1; sign: number } | null {
    const hostId = record.supports?.[0];
    if (hostId === undefined) return null;
    const host = this.ctx.registry.get(hostId);
    if (host === null) return null;

    const dx = (2 * record.x + record.footprint) - (2 * host.x + host.footprint);
    const dy = (2 * record.y + footprintDepth(record)) - (2 * host.y + footprintDepth(host));
    if (dx === 0 && dy === 0) return null;
    return Math.abs(dx) >= Math.abs(dy)
      ? { axis: 0, sign: Math.sign(dx) }
      : { axis: 1, sign: Math.sign(dy) };
  }

  /**
   * Scrive un percorso intero, o niente.
   *
   * **Tutta la convalida prima di qualunque scrittura.** Un percorso che si
   * ferma a meta' lascia tratti che non portano da nessuna parte e gambe senza
   * piano sopra, che e' peggio di non averlo: e' la stessa regola che il primo
   * tentativo di questa fase ha imparato a sue spese con le piattaforme.
   */
  private buildRoute(plan: RoutePlan): boolean {
    const except = [plan.fromId, plan.toId];
    for (const piece of plan.pieces) this.dropDeckSpans(piece.deck);
    for (const piece of plan.pieces) {
      if (!this.deckFits(piece.deck, except)) return false;
    }

    for (let i = 0; i < plan.pieces.length; i++) {
      const piece = plan.pieces[i];
      // I due capi reggono il percorso, e il percorso li immobilizza: e' il
      // guinzaglio, e vale per i tratti d'estremita' come per una mensola.
      const supports: number[] = [];
      if (i === 0) supports.push(plan.fromId);
      if (i === plan.pieces.length - 1) supports.push(plan.toId);
      this.commitDeck(piece.part, piece.deck, supports);
    }

    for (const id of [plan.fromId, plan.toId]) {
      this.routeCount.set(id, (this.routeCount.get(id) ?? 0) + 1);
    }
    this.routesBuilt++;
    return true;
  }

  /**
   * **Vale qui la regola del suolo: chi ci sta sopra vince.**
   *
   * Una campata nel volume cade invece di impedirlo — vale per l'impalcato come
   * per le gambe, e la gamba e' il caso che conta: la sonda guarda il mondo, e
   * una campata registrata ma non ancora comparsa e' aria per lei. Senza questo
   * una gamba veniva piantata **dentro** una piazza in quota gia' decisa, e la
   * piazza restava a registro con un palo in mezzo.
   */
  private dropDeckSpans(deck: DeckPlan): void {
    const { rect } = deck;
    this.spans.dropIntersecting(
      rect.x, rect.y, rect.sizeX, rect.sizeY, deck.baseZ, deck.baseZ + deck.height,
    );
    for (const pier of deck.piers) {
      this.spans.dropIntersecting(
        pier.x, pier.y, AERIAL.pierSide, AERIAL.pierSide,
        pier.baseZ, pier.baseZ + pier.height,
      );
    }
  }

  /**
   * true se l'impalcato e le sue gambe entrano nel budget e non urtano niente.
   *
   * **Il tetto di chunk sporchi si misura sul pezzo che si scrive**, che e' un
   * segmento di impalcato o una gamba: e' tutto il senso di averli separati.
   */
  private deckFits(deck: DeckPlan, except: readonly number[]): boolean {
    const { rect } = deck;
    const top = deck.baseZ + deck.height;

    for (const segment of deck.segments) {
      const count = dirtyChunkCount(
        segment.x, segment.y, segment.sizeX, deck.baseZ, top, segment.sizeY,
      );
      if (count > AERIAL.maxDirtyChunks) return false;
    }
    for (const pier of deck.piers) {
      const count = dirtyChunkCount(
        pier.x, pier.y, AERIAL.pierSide,
        pier.baseZ, pier.baseZ + pier.height, AERIAL.pierSide,
      );
      if (count > AERIAL.maxDirtyChunks) return false;
    }

    if (this.ctx.registry.overlaps(
      rect.x, rect.y, rect.sizeX, deck.baseZ, deck.height, rect.sizeY, except,
    )) {
      return false;
    }
    for (const pier of deck.piers) {
      if (this.ctx.registry.overlaps(
        pier.x, pier.y, AERIAL.pierSide, pier.baseZ, pier.height, AERIAL.pierSide, except,
      )) {
        return false;
      }
    }
    return true;
  }

  /**
   * Scrive un impalcato e le sue gambe: un record per l'uno, uno per ciascuna.
   *
   * La differenza fra i due e' l'invariante del dominio — la gamba prende suolo,
   * l'impalcato no — e sta tutta nel campo `aerial` del record.
   */
  private commitDeck(part: AerialPart, deck: DeckPlan, supports: readonly number[]): void {
    const { rect } = deck;
    const record = this.ctx.registry.add({
      x: rect.x,
      y: rect.y,
      baseZ: deck.baseZ,
      footprint: rect.sizeX,
      footprintY: rect.sizeY,
      height: deck.height,
      // Come per una campata: `tally` lo salta, e questo campo non entra in
      // nessun istogramma. Civico e' il meno arbitrario dei quattro — un piano
      // pubblico e' spazio pubblico — ma resta inerte per costruzione.
      class: BUILDING_CLASS.civic,
      level: 0,
      seed: hashCoords(this.ctx.seed, rect.x, rect.y),
      aerial: part,
      supports: [...supports, ...deck.carriers],
    });

    for (const segment of deck.segments) {
      this.ctx.growth.enqueue(
        record.id,
        { x: segment.x, y: segment.y, z: deck.baseZ },
        generateDeck(deck, part, segment),
      );
    }

    const piers: number[] = [];
    for (const pier of deck.piers) piers.push(this.commitPier(pier));
    if (piers.length > 0) this.deckPiers.set(record.id, piers);

    // Solo cio' su cui si costruisce entra fra le quote: su un tratto di
    // percorso ci si passa, e un edificio in mezzo lo chiuderebbe.
    if (!isBuildable(part)) return;
    for (let dy = 0; dy < rect.sizeY; dy++) {
      for (let dx = 0; dx < rect.sizeX; dx++) {
        this.deckColumns.add(`${rect.x + dx},${rect.y + dy}`);
      }
    }
  }

  private commitPier(pier: Pier): number {
    const record = this.ctx.registry.add({
      x: pier.x,
      y: pier.y,
      baseZ: pier.baseZ,
      footprint: AERIAL.pierSide,
      footprintY: AERIAL.pierSide,
      height: pier.height,
      class: BUILDING_CLASS.civic,
      level: 0,
      seed: hashCoords(this.ctx.seed, pier.x, pier.y),
      aerial: AERIAL_PART.pier,
      supports: pier.carrier === 0 ? undefined : [pier.carrier],
    });
    this.ctx.growth.enqueue(record.id, anchorOf(record), generatePier(pier));
    this.piersBuilt++;
    return record.id;
  }
}

/**
 * true se questo edificio puo' portare qualcosa in quota.
 *
 * **Chi regge non cresce**, quindi ospitare e' una rinuncia e non un premio:
 * la passata di upgrade salta chi porta, e quell'edificio si ferma dov'e'. La
 * soglia di livello e' il prezzo che si accetta di pagare — vedi `minHostLevel`,
 * dove sta anche la misura che ha escluso la regola piu' ovvia.
 */
function settled(record: BuildingRecord): boolean {
  if (record.aerial !== undefined || record.span !== undefined) return false;
  if (record.landmark !== undefined || record.arcology !== undefined) return false;
  return record.level >= AERIAL.minHostLevel;
}

/** Un record ridotto a cio' che le regole in quota guardano di lui. */
function aerialSupportOf(record: BuildingRecord): AerialSupport {
  return {
    id: record.id,
    x: record.x,
    y: record.y,
    sizeX: record.footprint,
    sizeY: footprintDepth(record),
    baseZ: record.baseZ,
    height: record.height,
  };
}

/**
 * La chiave di una coppia di edifici, indipendente dall'ordine.
 *
 * Un percorso si propone una volta sola per coppia, come una campata: senza,
 * la passata riesaminerebbe le stesse due torri a ogni giro per sentirsi dire
 * di no dalla stessa geometria.
 */
function pairKey(a: number, b: number): string {
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * true se `target` non sta dietro le spalle di `from`.
 *
 * Non chiede che sia *davanti*: una mensola si lascia anche di fianco, e sono i
 * due lati che rendono possibile una rete invece di una manciata di coppie
 * allineate. Chiede solo che non stia dall'altra parte dell'ospite, dove un
 * percorso comincerebbe dentro un muro.
 */
function facesToward(
  open: { axis: 0 | 1; sign: number } | null,
  from: BuildingRecord,
  target: BuildingRecord,
): boolean {
  if (open === null) return true;
  const delta = open.axis === 0
    ? (2 * target.x + target.footprint) - (2 * from.x + from.footprint)
    : (2 * target.y + footprintDepth(target)) - (2 * from.y + footprintDepth(from));
  // Dietro **e** oltre il proprio ingombro: un compagno appena di lato conta
  // come di lato, ed e' raggiungibile dal fianco.
  const behind = delta * open.sign < 0;
  const span = open.axis === 0 ? from.footprint : footprintDepth(from);
  return !behind || Math.abs(delta) < 2 * span;
}

/** Un record di impalcato ridotto al capo di percorso che e'. */
function routeEndOf(
  record: BuildingRecord,
  open: { axis: 0 | 1; sign: number } | null,
): RouteEnd {
  return {
    id: record.id,
    open: open ?? undefined,
    rect: {
      x: record.x,
      y: record.y,
      sizeX: record.footprint,
      sizeY: footprintDepth(record),
    },
    // Il piano calpestabile e' l'ultimo voxel dell'impalcato: sopra c'e' l'aria
    // in cui il percorso parte.
    deckZ: record.baseZ + record.height - 1,
  };
}

/** Vuoto di Chebyshev fra due impronte: zero se si toccano o si sovrappongono. */
function gapBetween(a: BuildingRecord, b: BuildingRecord): number {
  const gapX = Math.max(a.x - (b.x + b.footprint), b.x - (a.x + a.footprint));
  const gapY = Math.max(
    a.y - (b.y + footprintDepth(b)),
    b.y - (a.y + footprintDepth(a)),
  );
  return Math.max(0, gapX, gapY);
}
