/**
 * Quando le passate della crescita girano, e quanto lavoro un tick puo' spendere.
 *
 * **Due difetti, due rimedi, un file.** Il primo e' che tutte le cadenze
 * partivano da zero: al tick 120 declino, infornata, upgrade, porto, arcologie,
 * campate, guide, archi, campagna, fusioni e percorsi cadevano insieme, e il
 * frame che li pagava era sempre lo stesso. Il secondo e' che una passata non
 * aveva un tetto: sulla citta' della 6.2 l'infornata piu' cara leggeva
 * cinquantunmila colonne in un frame solo, e su un centro saturo sotto cinque
 * catalizzatori ne legge in media duecentosessantamila. Il primo difetto si
 * risolve sfasando, il secondo contando; stanno insieme perche' decidono la stessa cosa
 * — in quale tick cade un lavoro — e due moduli che la decidessero ciascuno per
 * se' si pesterebbero i piedi.
 *
 * **Si conta il lavoro, non il tempo.** Le passate decidono la citta', in
 * ordine: una passata che si fermasse a tre millisecondi d'orologio farebbe
 * crescere una citta' diversa su un PC lento e su uno veloce, e nessun test
 * potrebbe piu' fissarla. Il tetto e' un numero di letture, e i millisecondi
 * restano l'allarme che il soak sorveglia.
 *
 * **Puro e generico.** Non conosce il `Builder`, lo stato della simulazione ne'
 * i contatori: riceve un tavolo di passate e un metro, e restituisce l'ordine in
 * cui girano. E' cio' che lo rende verificabile con passate finte.
 */

/** Una passata del ciclo come la vede il calendario: nome, ritmo, peso. */
export interface PassCadence {
  readonly name: string;
  /** Tick fra un giro e il successivo. */
  readonly period: number;
  /**
   * La 6.2 la misura fra le care: lo sfasamento la tiene lontana dalle altre
   * care prima di pensare al numero di passate per tick.
   */
  readonly heavy?: boolean;
  /**
   * La passata a cui questa e' legata: ogni volta che questa gira, quella ha
   * girato `lag` tick prima.
   *
   * **Serve dove l'ordine e' la regola**, non una comodita', e le regole sono di
   * due specie. A `lag` zero le due cadono nello stesso tick, e l'ordine lo
   * decide il tavolo: l'arcologia prenota il magazzino prima degli upgrade,
   * l'arco prende il vuoto prima del ponte — sfasate, fra un'arcologia e la
   * successiva girerebbero degli upgrade che spendono il magazzino che lei
   * aspetta. A `lag` positivo questa viene dopo, in un altro tick: gli upgrade
   * dopo l'infornata, perche' si contendono gli stessi posti di `maxGrowing`.
   *
   * Il periodo di questa deve essere un multiplo di quello dell'altra.
   */
  readonly anchor?: PassAnchor;
}

export interface PassAnchor {
  readonly pass: string;
  readonly lag: number;
}

/**
 * Lo sfasamento di ogni passata: gira al tick `t` se `(t + offset) % period` e'
 * zero.
 *
 * **Prima si separano le care, poi si riempie.** Due passate si incontrano se e
 * solo se i loro sfasamenti sono congrui modulo il massimo comun divisore dei
 * periodi, quindi separare le care e' un problema a coppie: una ricerca
 * all'indietro trova il primo insieme di sfasamenti in cui nessuna coppia di care
 * cade mai nello stesso tick. Le altre si piazzano all'avido sull'iperperiodo —
 * il minimo comune multiplo dei periodi —, una alla volta nell'ordine del tavolo:
 * ognuna prende lo sfasamento che rende il tick peggiore meno carico, contando
 * prima le care, poi tutte, poi la somma dei quadrati, che preferisce due tick da
 * uno a un tick da due. A parita' vince lo sfasamento piu' piccolo.
 *
 * **L'avido da solo non bastava**, ed e' misurato: sul tavolo del Builder dava
 * all'upgrade lo sfasamento 1 accanto all'infornata a 0, e i percorsi in quota —
 * periodo 24, che incontra ogni periodo 10 con lo sfasamento della stessa parita'
 * — non trovavano piu' un tick libero da entrambi.
 *
 * Non e' l'ottimo per le leggere, ma e' deterministico e un periodo nuovo nel
 * tavolo si sistema da solo, senza una tabella di numeri da ritoccare a mano.
 * Chi e' legata a un'altra sceglie soltanto fra gli sfasamenti che il legame
 * consente, e si piazza dopo di lei.
 */
export function staggerOffsets(cadences: readonly PassCadence[]): ReadonlyMap<string, number> {
  const byName = new Map<string, PassCadence>();
  for (const cadence of cadences) {
    if (!Number.isInteger(cadence.period) || cadence.period < 1) {
      throw new Error(`pass ${cadence.name}: period must be a positive integer`);
    }
    if (byName.has(cadence.name)) throw new Error(`pass ${cadence.name}: duplicate name`);
    byName.set(cadence.name, cadence);
  }
  const partnerOf = (cadence: PassCadence): PassCadence | null => {
    if (cadence.anchor === undefined) return null;
    const partner = byName.get(cadence.anchor.pass);
    if (partner === undefined) throw new Error(`pass ${cadence.name}: unknown anchor ${cadence.anchor.pass}`);
    if (cadence.period % partner.period !== 0) {
      throw new Error(`pass ${cadence.name}: period is not a multiple of ${partner.name}`);
    }
    if (!Number.isInteger(cadence.anchor.lag) || cadence.anchor.lag < 0) {
      throw new Error(`pass ${cadence.name}: lag must be a non-negative integer`);
    }
    // Nello stesso tick l'ordine e' quello del tavolo: una legata scritta dopo il
    // compagno dichiarerebbe di precederlo e girerebbe dopo.
    if (cadence.anchor.lag === 0 && cadences.indexOf(partner) < cadences.indexOf(cadence)) {
      throw new Error(`pass ${cadence.name}: must come before ${partner.name}`);
    }
    return partner;
  };

  // Chi e' legata viene dopo il proprio compagno: l'ordine del tavolo, con le
  // catene risolte a monte.
  const order: PassCadence[] = [];
  const visiting = new Set<PassCadence>();
  const visit = (cadence: PassCadence): void => {
    if (order.includes(cadence)) return;
    if (visiting.has(cadence)) throw new Error(`pass ${cadence.name}: anchors form a cycle`);
    visiting.add(cadence);
    const partner = partnerOf(cadence);
    if (partner !== null) visit(partner);
    visiting.delete(cadence);
    order.push(cadence);
  };
  for (const cadence of cadences) visit(cadence);

  const candidatesOf = (cadence: PassCadence, known: ReadonlyMap<string, number>): number[] => {
    const partner = partnerOf(cadence);
    if (partner === null) return range(cadence.period);
    const base = modulo(known.get(partner.name)! - cadence.anchor!.lag, partner.period);
    const candidates: number[] = [];
    for (let offset = base; offset < cadence.period; offset += partner.period) candidates.push(offset);
    return candidates;
  };

  // Le care, piu' i compagni a cui sono legate: il loro sfasamento decide quello
  // delle care, quindi la ricerca deve poterlo scegliere.
  const group = new Set<PassCadence>();
  for (const cadence of cadences) {
    if (cadence.heavy !== true) continue;
    for (let link: PassCadence | null = cadence; link !== null; link = partnerOf(link)) group.add(link);
  }
  const grouped = order.filter((cadence) => group.has(cadence));
  const apart = separate(grouped, candidatesOf);

  const span = cadences.reduce((acc, cadence) => lcm(acc, cadence.period), 1);
  const all = new Int32Array(span);
  const heavy = new Int32Array(span);
  let maxAll = 0;
  let maxHeavy = 0;
  const offsets = new Map<string, number>();

  const place = (cadence: PassCadence, candidates: readonly number[]): void => {
    const weight = cadence.heavy === true ? 1 : 0;
    let best = -1;
    let bestHeavy = 0;
    let bestAll = 0;
    let bestSquares = 0;
    for (const offset of candidates) {
      let peakHeavy = maxHeavy;
      let peakAll = maxAll;
      let squares = 0;
      for (let t = (cadence.period - offset) % cadence.period; t < span; t += cadence.period) {
        peakAll = Math.max(peakAll, all[t] + 1);
        peakHeavy = Math.max(peakHeavy, heavy[t] + weight);
        squares += 2 * all[t] + 1;
      }
      const better = best === -1 ||
        peakHeavy < bestHeavy ||
        (peakHeavy === bestHeavy && (peakAll < bestAll ||
          (peakAll === bestAll && squares < bestSquares)));
      if (!better) continue;
      best = offset;
      bestHeavy = peakHeavy;
      bestAll = peakAll;
      bestSquares = squares;
    }
    for (let t = (cadence.period - best) % cadence.period; t < span; t += cadence.period) {
      all[t]++;
      heavy[t] += weight;
    }
    maxAll = bestAll;
    maxHeavy = bestHeavy;
    offsets.set(cadence.name, best);
  };

  for (const cadence of grouped) {
    place(cadence, apart === null ? candidatesOf(cadence, offsets) : [apart.get(cadence.name)!]);
  }
  for (const cadence of cadences) {
    if (group.has(cadence) || cadence.anchor !== undefined) continue;
    place(cadence, range(cadence.period));
  }
  for (const cadence of order) {
    if (group.has(cadence) || cadence.anchor === undefined) continue;
    place(cadence, candidatesOf(cadence, offsets));
  }
  return offsets;
}

/**
 * Il lavoro speso dall'inizio del tick, letto da contatori monotoni.
 *
 * **Il metro non misura: legge.** I contatori stanno accanto al lavoro vero —
 * la ricerca sa quante colonne ha letto, il registry quanti record ha scorso —
 * e qui si guarda soltanto quanto sono saliti. E' la stessa scelta di
 * `PassProfile`, per la stessa ragione: a parita' di seme il numero e' identico
 * a ogni run.
 */
export class WorkMeter {
  private start = 0;
  private limit = Number.POSITIVE_INFINITY;

  constructor(private readonly read: () => number) {}

  /** Riparte da zero con un tetto nuovo. */
  begin(limit: number): void {
    this.start = this.read();
    this.limit = limit;
  }

  get spent(): number {
    return this.read() - this.start;
  }

  get exhausted(): boolean {
    return this.read() - this.start >= this.limit;
  }
}

/** Cosa lascia un giro di passata: lo stato e se ha finito. */
export interface PassRun<S> {
  readonly state: S;
  /** `false` solo per chi sa fermarsi sul budget e riprendere al tick dopo. */
  readonly done: boolean;
}

export interface ScheduledPass<S> extends PassCadence {
  run(state: S): PassRun<S>;
}

/**
 * La coda delle passate dovute, con il tetto al tick.
 *
 * **Chi e' dovuto entra in coda, e ne esce solo quando ha finito.** A ogni tick
 * le passate che cadono si accodano nell'ordine del tavolo. Poi la coda si
 * svuota dalla testa finche' il metro non dice basta.
 *
 * **Un giro saltato si recupera, uno solo.** Una passata che cade mentre e'
 * ancora in coda non si accoda due volte: annota il debito, e appena finisce
 * torna in fondo per pagarlo. Senza, l'infornata che si prende tredici tick
 * perde il giro del decimo, e il ritmo lo decide il tetto invece di
 * `ticksPerBuild`. Piu' di uno no: un ritardo lungo non deve diventare una
 * raffica di passate arretrate pagate tutte insieme.
 *
 * **Almeno una passata per tick**, anche a budget speso: senza, una passata
 * atomica piu' cara del tetto non girerebbe mai, e la coda crescerebbe per
 * sempre.
 *
 * **Chi si ferma sul budget va in fondo**, ed e' il turno a giro dei sistemi a
 * quanti di tempo: la passata che aspettava dietro di lei gira prima che lei
 * riprenda.
 *
 * **Un legame a ritardo zero e' un ordine anche in coda**: il compagno non passa
 * davanti a chi deve precederlo nello stesso tick, nemmeno se questa e' stata
 * rimandata. Un legame a ritardo positivo no, e l'ho misurato: tenere gli
 * upgrade fermi dietro un'infornata lunga li spingeva a ridosso dell'infornata
 * dopo, che trovava `maxGrowing` pieno. Cio' che l'infornata deve agli upgrade
 * — i posti in coda presi per prima — lo tiene lei, prenotandoli.
 */
export class PassScheduler<S> {
  readonly offsets: ReadonlyMap<string, number>;
  private readonly queue: ScheduledPass<S>[] = [];
  /** Chi e' caduto mentre era ancora in coda, e ha un giro da recuperare. */
  private readonly owed = new Set<ScheduledPass<S>>();
  /** Chi deve aspettare chi in coda: il compagno di un legame a ritardo zero. */
  private readonly leaders = new Map<ScheduledPass<S>, ScheduledPass<S>[]>();

  constructor(private readonly passes: readonly ScheduledPass<S>[]) {
    this.offsets = staggerOffsets(passes);
    for (const pass of passes) {
      if (pass.anchor === undefined || pass.anchor.lag > 0) continue;
      const partner = passes.find((other) => other.name === pass.anchor!.pass)!;
      this.leaders.set(partner, [...(this.leaders.get(partner) ?? []), pass]);
    }
  }

  /** Le passate in attesa, dalla prossima a girare. */
  get pending(): readonly string[] {
    return this.queue.map((pass) => pass.name);
  }

  /** Dimentica la coda: serve quando il mondo sotto le passate e' stato sostituito. */
  clear(): void {
    this.queue.length = 0;
    this.owed.clear();
  }

  /**
   * Il tick: accoda le passate che cadono, poi le fa girare finche' il budget
   * tiene. Il metro va fatto ripartire da chi chiama, prima.
   */
  tick(state: S, tickCount: number, meter: WorkMeter): S {
    for (const pass of this.passes) {
      if (!isDue(tickCount, pass.period, this.offsets.get(pass.name)!)) continue;
      if (this.queue.includes(pass)) this.owed.add(pass);
      else this.queue.push(pass);
    }

    let next = state;
    let ran = 0;
    while (this.queue.length > 0) {
      if (ran > 0 && meter.exhausted) break;
      // Il primo in coda che non aspetta nessuno. Esiste sempre: i legami non
      // fanno cicli, e chi sta in cima a una catena non aspetta.
      const index = this.queue.findIndex((pass) =>
        !(this.leaders.get(pass) ?? []).some((leader) => this.queue.includes(leader)));
      const [pass] = this.queue.splice(index, 1);
      const outcome = pass.run(next);
      next = outcome.state;
      ran++;
      if (!outcome.done) {
        this.queue.push(pass);
        break;
      }
      if (this.owed.delete(pass)) this.queue.push(pass);
    }
    return next;
  }
}

/** true se una passata di questo periodo e sfasamento cade in questo tick. */
export function isDue(tickCount: number, period: number, offset: number): boolean {
  return (tickCount + offset) % period === 0;
}

/** Il primo tick `>= from` in cui la passata cade. */
export function nextDueTick(from: number, period: number, offset: number): number {
  const phase = (from + offset) % period;
  return phase === 0 ? from : from + period - phase;
}

/**
 * Il primo insieme di sfasamenti, in ordine lessicografico, in cui nessuna
 * coppia di care cade mai nello stesso tick; `null` se non esiste.
 *
 * Due passate si incontrano se e solo se i loro sfasamenti sono congrui modulo
 * il massimo comun divisore dei periodi: il vincolo si verifica a coppie, senza
 * scorrere l'iperperiodo. Le leggere del gruppo — i compagni a cui una cara e'
 * legata — non hanno vincoli propri: ci sono perche' il loro sfasamento decide
 * quello di chi e' legato a loro.
 */
function separate(
  cadences: readonly PassCadence[],
  candidatesOf: (cadence: PassCadence, known: ReadonlyMap<string, number>) => number[],
): ReadonlyMap<string, number> | null {
  const chosen = new Map<string, number>();
  const search = (index: number): boolean => {
    if (index === cadences.length) return true;
    const cadence = cadences[index];
    for (const offset of candidatesOf(cadence, chosen)) {
      let clash = false;
      for (let other = 0; other < index && !clash && cadence.heavy === true; other++) {
        const previous = cadences[other];
        if (previous.heavy !== true) continue;
        clash = (offset - chosen.get(previous.name)!) % gcd(cadence.period, previous.period) === 0;
      }
      if (clash) continue;
      chosen.set(cadence.name, offset);
      if (search(index + 1)) return true;
      chosen.delete(cadence.name);
    }
    return false;
  };
  return search(0) ? chosen : null;
}

function modulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}
