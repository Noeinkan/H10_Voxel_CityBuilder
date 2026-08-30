import {
  BALANCE,
  BUILDING_CLASS,
  addBuilding,
  deferConstruction,
  spendConstructionMaterials,
  type BuildingClass,
  type SimState,
} from '../../sim';
import {
  ARCOLOGY,
  MIN_SUNKEN_DEPTH,
  SUNKEN,
  arcologyOf,
  sunkenDepthOf,
  type ArcologyRecipe,
} from '../arcology/config';
import { arcologyForBlock, type ArcologyFamily } from '../arcology/catalog';
import { surveySunkenSite } from '../arcology/depth';
import {
  arcologyGaps,
  arcologyStanding,
  compareProspects,
  sunkenGaps,
  type ArcologyProspect,
  type ArcologyStanding,
} from '../arcology/prospect';
import {
  arcologyOrigin,
  arcologySpan,
  generateArcology,
  worldBands,
  worldLandings,
  type WorldLanding,
} from '../arcology/generate';
import {
  arcologyAnchor,
  arcologyQuota,
  arcologyReady,
  earthscraperReady,
  type ArcologyRefusal,
} from '../arcology/siting';
import { AERIAL_PART } from '../aerial/config';
import type { AerialDriver } from './aerialDriver';
import { isDryLand } from '../grading/grade';
import { hashCoords } from '../rng';
import { FACING, type Facing } from '../streets/streetGrid';
import { maxStageOf } from '../landmarks/config';
import { stageForBuildings } from '../landmarks/generate';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount, fitsChunkBudget } from './chunkBudget';
import type { ClearanceBox, ClearanceSites } from './clearanceSite';
import { BUILDER } from './config';
import { allowedLevel, riseOf } from './hierarchy';
import { buildWorks, surveyGrade } from './siteWorks';
import { EMPTY_STAMP, sliceStamps, stampFootprint, trimStampZ, type VoxelStamp } from './stamp';
import { sunkenDigStamp } from './sunkenDig';

/**
 * Le megastrutture: dove nascono, come salgono, cosa dichiarano alla citta'.
 *
 * **Vive accanto al Builder e non dentro `src/world/arcology/`**, per la stessa
 * ragione del driver dei landmark: quella cartella e' pura e non conosce il
 * mondo — ricette, condizione e finestra di cielo si misurano senza un
 * `VoxelWorld` — e tutto cio' che ha bisogno del registry, del terreno e della
 * coda di comparsa sta qui.
 *
 * **Nessuno la posa.** Non c'e' uno strumento in toolbar e non c'e' un costo:
 * la passata cerca da sola l'isolato in cui la condizione e' vera, e l'unica
 * leva del giocatore sono le condizioni. E' la differenza fra questa fase e la
 * 4.12, dove il gesto c'era ed era il click sul catalizzatore.
 *
 * **Tre invarianti, e conviene tenerle sott'occhio insieme.**
 *
 * - *L'ingombro e' quello finale, riservato al piazzamento.* Uno stadio non
 *   allarga mai: riempie. Ne segue che l'arcologia non puo' restare bloccata a
 *   meta' e che non c'e' mai niente da cancellare.
 * - *Si accoda il **delta**, non la sagoma cumulativa.* Su un inviluppo di
 *   centonovantadue quote riportare in coda tutta la struttura a ogni stadio
 *   sforerebbe il tetto di chunk sporchi, e sforare e' uno scarto silenzioso.
 * - *`uses` e' il registro di cio' che e' stato dichiarato alla simulazione*,
 *   non un elenco di intenzioni: una fascia ci entra **dopo** che `addBuilding`
 *   l'ha accettata. E' questo che tiene `countsByClass` uguale a
 *   `buildingCounts` senza un secondo contatore da tenere allineato.
 */
export class ArcologyDriver {
  private cursor = 0;

  /**
   * Il rifiuto piu' recente, o null se l'ultima passata non ha guardato niente.
   *
   * **Serve a distinguere «non ancora» da «mai».** Zero arcologie e' il valore
   * normale per quasi tutta una partita, quindi da solo non dice niente: con
   * `notCapped` la citta' sta ancora crescendo e prima o poi arrivera', con
   * `notPeak` su tutti i seed vorrebbe dire che la condizione e' insoddisfacibile
   * e che il numero da tarare e' un altro. E' la stessa ragione per cui
   * `REJECT_REASONS` esiste per gli edifici.
   */
  private lastRefusal: ArcologyDriverRefusal | null = null;

  /**
   * Il candidato piu' avanti fra quelli che l'ultima passata ha guardato.
   *
   * **E' `lastRefusal` con i numeri dentro, e serve a un lettore diverso.** Il
   * rifiuto risponde alla domanda dell'overlay — «la condizione e'
   * insoddisfacibile?» — e per quella un enum basta. Al giocatore serve l'altra:
   * «ci stiamo arrivando?», che `notCapped` non distingue da `notCapped`, mentre
   * `1/2` e `0/2` sono due partite diverse.
   *
   * **Non costa una scansione in piu'.** Le due misure care — `builtNeighbours`
   * e `cappedNeighbours` — la passata le calcola gia' per ogni candidato che
   * arriva al predicato, ed e' esattamente li' che le lacune si raccolgono: si
   * riusa l'oggetto che sta per essere passato ad `arcologyReady`.
   */
  private lastProspect: ArcologyProspect | null = null;

  /**
   * Il migliore visto **in questa passata**, per non farlo peggiorare a meta'.
   *
   * Senza, il primo candidato del cursore sostituirebbe il migliore di un attimo
   * prima solo per essere arrivato dopo, e la riga della voce oscillerebbe fra
   * due isolati vicini a ogni giro. Con, una passata che non guarda niente
   * lascia in piedi l'ultima osservazione vera — che e' la stessa semantica di
   * `lastRefusal`, e va tenuta uguale apposta.
   */
  private passProspect: ArcologyProspect | null = null;

  /**
   * Quota e candidato dell'ultima passata, gia' pronti per l'interfaccia.
   *
   * Si tiene invece di ricavarlo su richiesta perche' `Builder.stats` e' un
   * getter senza stato, e la quota e' una funzione degli edifici: chiederglielo
   * a ogni ridisegno dell'HUD — a 150 ms — vorrebbe dire passare lo `SimState`
   * fin qui per un numero che cambia ogni venti tick.
   */
  private lastStanding: ArcologyStanding = arcologyStanding(0, 0, null);

  constructor(
    private readonly ctx: BuildContext,
    private readonly clearance: ClearanceSites,
    /**
     * Serve a una cosa sola: scrollare le mensole vuote da cio' che si sta per
     * abbattere, prima di chiedere al cantiere se il riquadro si sgombera. La
     * freccia va in un verso solo — la citta' in quota non sa che le arcologie
     * esistono.
     */
    private readonly aerial: AerialDriver,
  ) {}

  /** Arcologie esistenti, per l'overlay di debug. */
  get count(): number {
    return this.ctx.registry.arcologyCount;
  }

  get refusal(): ArcologyDriverRefusal | null {
    return this.lastRefusal;
  }

  get prospect(): ArcologyProspect | null {
    return this.lastProspect;
  }

  get standing(): ArcologyStanding {
    return this.lastStanding;
  }

  /**
   * Una passata: prima si sale, poi si fonda.
   *
   * **In quest'ordine e non nell'altro.** Una fondazione nuova apre un cantiere
   * che dura diverse passate; farla per prima vorrebbe dire che, finche' quel
   * cantiere e' aperto, l'arcologia gia' in piedi non avanza di uno stadio pur
   * avendone diritto. Salire e' anche la cosa che il giocatore vede piu' spesso.
   */
  pass(state: SimState): SimState {
    const next = this.walk(state);
    // **Il referto si chiude qui e non dentro `walk`**, che ha tre uscite: e' il
    // solo punto in cui si e' certi di passare comunque, e la quota va letta
    // sullo stato **dopo**, perche' `declare` puo' averne cambiato i conteggi.
    this.lastStanding = arcologyStanding(
      this.totalBuildings(next),
      this.ctx.registry.arcologyCount,
      this.lastProspect,
    );
    return next;
  }

  private walk(state: SimState): SimState {
    let next = this.climb(state);
    if (this.ctx.registry.arcologyCount >= arcologyQuota(this.totalBuildings(state))) {
      // **La quota piena non lascia la passata senza referto.** Qui non si guarda
      // nessun isolato, quindi non c'e' un candidato da raccontare; ma e' anche
      // il momento in cui l'unico numero che sale da solo — quanti edifici
      // aprono la prossima — e' anche l'unico che vale la pena dire.
      this.lastProspect = null;
      return next;
    }
    if (this.ctx.growth.queued >= BUILDER.maxGrowing) return next;
    next = this.found(next);
    return next;
  }

  /** Gli edifici della citta': la quota delle arcologie ne e' una funzione. */
  private totalBuildings(state: SimState): number {
    return state.buildingCounts.reduce((sum, count) => sum + count, 0);
  }

  /**
   * true se nessuna arcologia esistente sta a meno di `ARCOLOGY.minSpacing`
   * blocchi dal candidato.
   *
   * **E' la distribuzione, non un secondo tetto.** La quota dice *quante*
   * arcologie la citta' ammette; questa dice *dove*: senza, una citta' grande
   * le metterebbe tutte nello stesso quadrante del centro.
   */
  private spacedOut(kx: number, ky: number): boolean {
    for (const record of this.ctx.registry.all) {
      if (record.arcology === undefined) continue;
      const block = this.ctx.streets.blockAt(record.x, record.y);
      if (Math.max(Math.abs(block.kx - kx), Math.abs(block.ky - ky)) < ARCOLOGY.minSpacing) {
        return false;
      }
    }
    return true;
  }

  /**
   * Su questo isolato si scava, se la roccia lo permette.
   *
   * **Un tiro sull'indice dell'isolato, non una regola della gerarchia**, per la
   * ragione misurata accanto alla scelta della famiglia: ogni criterio legato al
   * cono si e' rivelato vuoto o pieno a seconda di come il giocatore dispone i
   * poli, e una famiglia che compare o sparisce per quello non e' una scelta di
   * progetto. Il sale e' quello della forma, spostato di un bit: due domande
   * diverse sullo stesso isolato non devono ricevere lo stesso tiro.
   *
   * Deterministico per costruzione — nessuno stato, nessun ordine di visita —
   * come tutto il resto di questo dominio.
   */
  private digsHere(kx: number, ky: number): boolean {
    return (hashCoords(this.ctx.seed ^ (ARCOLOGY.kindSalt >>> 1), kx, ky) & 1) === 1;
  }

  /**
   * Porta avanti gli stadi, e dichiara alla simulazione le fasce che aprono.
   *
   * **Cosa fa avanzare uno stadio**: gli edifici costruiti entro
   * `ARCOLOGY.radius`, come per un landmark e per la stessa ragione — la
   * desiderabilita', sotto un centro saturo, e' saturata anch'essa e farebbe
   * saltare tutti gli stadi al primo tick. A differenza del landmark, pero', il
   * conteggio **non si ricalcola**: la fondazione sventra l'isolato, e il
   * conteggio vivo scenderebbe proprio sotto la soglia che lo stadio successivo
   * chiede. Si legge `foundedNeighbours`, congelato alla fondazione.
   *
   * La riconciliazione delle fasce e' **dichiarativa e non a evento**: si
   * confronta cio' che il record dice di aver dichiarato con cio' che lo stadio
   * corrente ammette, e si colma la differenza. Farlo al momento
   * dell'avanzamento sarebbe stato piu' breve e avrebbe avuto un buco — il
   * cantiere finisce dentro `ClearanceSites.pass`, che non ha lo stato della
   * simulazione in mano e non potrebbe dichiarare niente.
   */
  private climb(state: SimState): SimState {
    let next = state;
    let advanced = 0;

    for (const record of this.ctx.registry.all) {
      const kind = record.arcology;
      if (kind === undefined) continue;

      const recipe = arcologyOf(kind);
      if (advanced < ARCOLOGY.stagesPerPass &&
        !this.ctx.growth.isGrowing(record.id) &&
        record.level < maxStageOf(recipe) &&
        this.ctx.growth.queued < BUILDER.maxGrowing
      ) {
        const nearby = record.foundedNeighbours ?? 0;
        if (stageForBuildings(recipe, nearby) > record.level) {
          this.advance(record, recipe);
          advanced++;
        }
      }

      // Sempre, anche senza avanzamento: e' la riga che chiude il buco fra il
      // cantiere e la simulazione, e costa il confronto di due lunghezze.
      next = this.declare(next, record.id, recipe);
    }

    return next;
  }

  /** Scrive lo stadio successivo, e apre i piazzali che quello stadio porta. */
  private advance(record: BuildingRecord, recipe: ArcologyRecipe): void {
    const stage = record.level + 1;
    const facing = (record.facing ?? FACING.east) as Facing;
    const delta = trimStampZ(generateArcology(recipe, {
      stage,
      from: stage,
      facing,
      seed: record.seed,
    }));

    const replaced = this.ctx.registry.replace(record.id, { ...record, level: stage });
    if (replaced === null) return;

    this.ctx.growth.enqueueSegments(replaced, delta.stamp, delta.z0);
    this.openLandings(replaced, recipe, stage, facing);
  }

  /**
   * Dichiara alla simulazione le fasce che lo stadio corrente ha aperto.
   *
   * **`addBuilding` puo' rifiutare**, e il rifiuto va creduto: la simulazione
   * tiene un edificio per cella, e se quella colonna fosse gia' sua il conteggio
   * direbbe una cosa e il registry un'altra. Si controlla che la lista degli
   * edifici sia davvero cresciuta, e solo allora la fascia entra in `uses`.
   */
  private declare(state: SimState, id: number, recipe: ArcologyRecipe): SimState {
    const record = this.ctx.registry.get(id);
    if (record === null) return state;

    const wanted = recipe.bands.filter((band) => band.stage <= record.level);
    const declared = record.uses?.length ?? 0;
    if (declared >= wanted.length) return state;

    const facing = (record.facing ?? FACING.east) as Facing;
    // Le fasce sono in ordine di stadio e `uses` cresce in coda, quindi le prime
    // `declared` sono esattamente quelle gia' dichiarate: si riprende da li'.
    const eligible = worldBands(recipe, facing, record.x, record.y)
      .filter((band) => band.stage <= record.level);
    const uses: BuildingClass[] = [...(record.uses ?? [])];

    let next = state;
    for (let i = declared; i < eligible.length; i++) {
      const band = eligible[i];
      const grown = addBuilding(next, { x: band.x, y: band.y, class: band.use });
      // Un rifiuto ferma la fila invece di saltarla: `uses` e' posizionale, e
      // dichiarare la quarta fascia senza la terza direbbe alla passata
      // successiva che la terza c'e' gia'. Si riprova al giro dopo.
      if (grown.buildings.length === next.buildings.length) break;
      next = grown;
      uses.push(band.use);
    }

    if (uses.length === declared) return next;
    this.ctx.registry.replace(record.id, { ...record, uses });
    return next;
  }

  /**
   * Cerca l'isolato in cui la condizione e' vera, e ci apre il cantiere.
   *
   * **Un cursore sui record, non una scansione della mappa.** I candidati stanno
   * dove c'e' citta', e la citta' e' esattamente cio' che il registry elenca:
   * scorrere le colonne costerebbe quanto l'isola invece che quanto la citta', e
   * la maggior parte di quelle colonne e' prato.
   */
  private found(state: SimState): SimState {
    const records = [...this.ctx.registry.all];
    if (records.length === 0) return state;

    this.passProspect = null;
    const budget = Math.min(ARCOLOGY.examinedPerPass, records.length);
    const seen = new Set<string>();
    const buildings = this.totalBuildings(state);

    for (let i = 0; i < budget; i++) {
      const record = records[this.cursor % records.length];
      this.cursor++;
      if (record.arcology !== undefined || record.aerial !== undefined) continue;

      const block = this.ctx.streets.blockAt(record.x, record.y);
      const key = `${block.kx},${block.ky}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!this.spacedOut(block.kx, block.ky)) continue;

      // Il verso si legge sul singolo isolato del record; poi il catalogo puo'
      // allargare il riquadro al cluster per le ricette multi-blocco.
      const single = this.ctx.streets.blockRect(block);
      const singleAnchor = arcologyAnchor(single);
      const blockSide = Math.min(single.x1 - single.x0 + 1, single.y1 - single.y0 + 1);
      const facing = this.facingAt(singleAnchor.x, singleAnchor.y, (blockSide >> 1) + 1);

      // **La roccia apre la possibilita', l'isolato sceglie fra le due.**
      //
      // Prima decideva la gerarchia — cresta si sale, spalla si scava — ed era
      // una regola leggibile che la misura ha svuotata: cinque poli sovrapposti,
      // cioe' quello che un giocatore mette davvero in un centro, riempiono il
      // cono su **tutto** il nucleo, quindi ogni isolato candidato risultava
      // cresta e la famiglia interrata non ha mai avuto un sito. Un'intera meta'
      // del catalogo esisteva solo nei test.
      //
      // Ora la domanda e' una sola e riguarda il luogo: **c'e' roccia asciutta
      // abbastanza per un pozzo?** Se non c'e', si sale, come sempre. Se c'e',
      // le due famiglie sono entrambe legittime su quell'isolato e a decidere e'
      // un tiro deterministico sul suo indice — lo stesso mestiere di
      // `kindSalt`, che sceglie gia' la forma: cosi' su un'isola con piu' centri
      // torri e crateri convivono invece di escludersi, e la variete' non
      // dipende piu' da come il giocatore ha disposto i poli.
      //
      // La profondita' si misura sul singolo isolato, che e' una stima prudente
      // — il riquadro del cluster e' piu' grande e il suo massimo non puo' che
      // salire, quindi al peggio si scarta una ricetta che sarebbe entrata.
      // Quella vera la rimisura `earthscraperReady` sull'impronta effettiva.
      const probe = surveySunkenSite(
        this.ctx.terrain,
        single.x0,
        single.y0,
        single.x1 - single.x0 + 1,
        single.y1 - single.y0 + 1,
      );
      const canDig = probe.dryRim && probe.depth >= MIN_SUNKEN_DEPTH;
      const family: ArcologyFamily = canDig && this.digsHere(block.kx, block.ky)
        ? 'sunken'
        : 'tall';

      const pick = arcologyForBlock(
        this.ctx.seed, block.kx, block.ky, facing, family,
        family === 'sunken' ? probe.depth : undefined,
      );
      const recipe = pick.recipe;
      const rect = pick.rect;
      const anchor = arcologyAnchor(rect);
      const span = arcologySpan(recipe, facing);
      const origin = arcologyOrigin(recipe, facing, anchor.x, anchor.y);

      // Il conteggio si legge qui, **prima** dello sventramento, e viaggia fino
      // a `build` per essere congelato su `foundedNeighbours`: e' la stessa
      // misura che decide la fondazione e, da li' in poi, ogni stadio.
      const builtNeighbours = this.ctx.registry.countWithinRadius(
        anchor.x, anchor.y, ARCOLOGY.radius,
      );

      const common = {
        existing: this.ctx.registry.arcologyCount,
        buildings,
        blockRect: rect,
        spanX: span.sizeX,
        spanY: span.sizeY,
        builtNeighbours,
        cappedNeighbours: this.cappedAround(anchor.x, anchor.y, state),
      };
      // Sull'impronta vera, non sulla stima: il contorno asciutto di un cluster
      // da due isolati non e' quello del primo.
      const site = family === 'sunken'
        ? surveySunkenSite(this.ctx.terrain, origin.x, origin.y, span.sizeX, span.sizeY)
        : null;
      const dig = site === null ? null : {
        ...common,
        availableDepth: site.depth,
        requiredDepth: sunkenDepthOf(recipe),
        dryRim: site.dryRim,
      };

      // **Le lacune si raccolgono dallo stesso oggetto del predicato**, e un
      // giro prima di leggerne il verdetto: e' la riga che garantisce che il
      // referto e il rifiuto non possano parlare di due misure diverse. Non
      // costa niente — `builtNeighbours` e `cappedNeighbours` sono gia' in
      // `common`, ed erano l'unica parte cara.
      this.consider({
        x: anchor.x,
        y: anchor.y,
        kind: recipe.kind,
        gaps: dig === null ? arcologyGaps(common) : sunkenGaps(dig),
      });

      const refusal = dig === null ? arcologyReady(common) : earthscraperReady(dig);
      if (refusal !== null) {
        // L'ultimo vince, e va bene cosi': il cursore scorre isolati vicini fra
        // loro, che sono nella stessa fascia e allo stesso stadio di crescita.
        this.lastRefusal = refusal;
        continue;
      }
      this.lastRefusal = null;

      // La maturita' urbanistica apre la possibilita', il magazzino apre il
      // cantiere. Si controlla prima di sgomberare: una citta' che non puo'
      // pagare non deve perdere ne' edifici ne' mensole mentre aspetta le
      // fabbriche.
      if (state.materials.stock < BALANCE.materials.arcologyCost) {
        this.lastRefusal = 'materials';
        return deferConstruction(state, BALANCE.materials.arcologyCost);
      }

      const box: ClearanceBox = {
        x: origin.x,
        y: origin.y,
        sizeX: span.sizeX,
        sizeY: span.sizeY,
      };
      // Il riquadro libero si costruisce subito; quello pieno apre un cantiere e
      // la struttura arriva quando e' sgombero. E' la stessa macchina del
      // landmark, e la differenza sta tutta nella soglia: qui si sventra anche il
      // tessuto alto, perche' la condizione dice che il tessuto **e'** alto.
      // **Prima si scrollano le mensole vuote, poi si chiede.** Senza questa
      // riga la condizione era vera e il riquadro rifiutava sempre: misurato su
      // una citta' matura, a fermarlo erano novanta colonne di edifici che
      // *portano* una mensola piu' le quattro mensole stesse — mai un landmark e
      // mai un percorso. Ed e' la stessa mossa che `upgradePass` fa da sempre
      // prima di promuovere un ospite: una mensola vuota non e' citta', e' una
      // proposta che la passata successiva rifara' altrove. Quella **abitata** o
      // quella su cui atterra un percorso restano, e allora il rifiuto e' vero.
      this.releaseDecksIn(box);

      const verdict = this.clearance.survey(box, ARCOLOGY.clearing);
      if (verdict.refusal !== null) {
        this.lastRefusal = 'blocked';
        continue;
      }

      const started = verdict.clears === 0
        ? this.build(anchor.x, anchor.y, recipe, facing, builtNeighbours) !== null
        : this.clearance.start(box, ARCOLOGY.clearing, () => {
          this.build(anchor.x, anchor.y, recipe, facing, builtNeighbours);
        });
      // Un rifiuto del luogo — terreno che non regge, volume gia' impegnato,
      // budget di chunk — non consuma la passata: il prossimo isolato del
      // cursore puo' andare bene, e aspettare venti tick per scoprirlo sarebbe
      // solo lentezza.
      if (started) {
        return spendConstructionMaterials(state, BALANCE.materials.arcologyCost) ?? state;
      }
      this.lastRefusal = 'site';
    }

    return state;
  }

  /**
   * Tiene il candidato se e' piu' avanti di quelli gia' visti in questa passata.
   *
   * Il cursore scorre isolati vicini fra loro, quindi il primo che capita non e'
   * il piu' rappresentativo: per il **rifiuto** vince l'ultimo — sono tutti nella
   * stessa fascia e allo stesso stadio, quindi e' indifferente — ma per il
   * referto no, perche' e' quello che la voce indichera' al giocatore.
   */
  private consider(candidate: ArcologyProspect): void {
    if (this.passProspect !== null && compareProspects(candidate, this.passProspect) >= 0) {
      return;
    }
    this.passProspect = candidate;
    this.lastProspect = candidate;
  }

  /**
   * Scrolla le mensole vuote appese a cio' che sta dentro il riquadro.
   *
   * **Non e' una demolizione, ed e' per questo che passa da `releaseDecks`.**
   * Quella funzione lascia in piedi tutto cio' che e' abitato o su cui qualcuno
   * si appende (`pinned`), e toglie solo le proposte che nessuno ha ancora
   * raccolto — le stesse che `upgradePass` toglie quando un ospite promuove. Se
   * dopo questa passata il riquadro rifiuta ancora, dentro c'e' qualcosa che e'
   * davvero citta', e il rifiuto e' quello giusto.
   */
  private releaseDecksIn(box: ClearanceBox): void {
    const seen = new Set<number>();
    for (let dy = 0; dy < box.sizeY; dy++) {
      for (let dx = 0; dx < box.sizeX; dx++) {
        for (const record of this.ctx.registry.at(box.x + dx, box.y + dy)) {
          if (seen.has(record.id)) continue;
          seen.add(record.id);
          this.aerial.releaseDecks(record.id);
        }
      }
    }
  }

  /**
   * Quanti vicini hanno gia' finito di crescere.
   *
   * **E' la misura che rende l'arcologia una risposta e non un capriccio**, ed e'
   * anche la piu' cara di questo dominio: `withinRadius` materializza i record e
   * ognuno costa una `allowedLevel`. Gira solo dove fascia, isolato eletto e
   * ingombro sono gia' passati — cioe' su una manciata di isolati per partita —
   * ed e' il motivo per cui in `arcologyReady` sta per ultima.
   */
  private cappedAround(x: number, y: number, state: SimState): number {
    let capped = 0;
    for (const record of this.ctx.registry.withinRadius(x, y, ARCOLOGY.radius)) {
      if (record.landmark !== undefined || record.span !== undefined ||
        record.aerial !== undefined || record.arcology !== undefined) {
        continue;
      }
      const cap = allowedLevel(this.ctx, record.x, record.y, state, riseOf(this.ctx, record));
      if (record.level >= Math.min(cap, BUILDER.maxLevel) ||
        this.aerial.blocksUpgrade(record.id)) {
        capped++;
      }
    }
    return capped;
  }

  /**
   * Getta la fondazione e accoda lo stadio zero. null se il luogo non la regge.
   *
   * **La maschera dell'opera si chiede allo stadio finale**, come per un
   * landmark e per un motivo che qui pesa di piu': l'opera si getta una volta
   * sola, e uno stadio successivo non deve poter scoprire di aver bisogno di
   * terra che nessuno ha gettato. `ARCOLOGY.groundBand` la limita alle prime
   * quote — sopra c'e' quasi tutto vuoto, e riempirlo di terra chiuderebbe
   * proprio la finestra di cielo.
   */
  private build(
    x: number,
    y: number,
    recipe: ArcologyRecipe,
    facing: Facing,
    foundedNeighbours: number,
  ): BuildingRecord | null {
    if (recipe.sunken !== undefined) {
      return this.buildSunken(x, y, recipe, facing, foundedNeighbours);
    }
    const { world, terrain, registry, growth, surface, seed } = this.ctx;
    const span = arcologySpan(recipe, facing);
    const origin = arcologyOrigin(recipe, facing, x, y);
    const recordSeed = hashCoords(seed, x, y);

    const first = trimStampZ(generateArcology(recipe, { stage: 0, facing, seed: recordSeed }));
    const whole = generateArcology(recipe, {
      stage: maxStageOf(recipe),
      facing,
      seed: recordSeed,
    });
    const mask = stampFootprint(whole, ARCOLOGY.groundBand);

    const plan = surveyGrade(terrain, origin.x, origin.y, span.sizeX, span.sizeY, mask);
    if (plan === null) return null;
    // Come un edificio, l'arcologia affonda nel pendio invece di riempirlo: la
    // base scende alla quota piu' bassa dell'impronta, e il podio non solleva
    // un terrapieno sotto di se'.
    const sunk = { ...plan, padZ: plan.footZ };
    if (registry.overlaps(
      origin.x, origin.y, span.sizeX, sunk.padZ, span.sizeZ, span.sizeY,
    )) {
      return null;
    }
    if (!fitsChunkBudget(origin.x, origin.y, span.sizeX, span.sizeY, sunk, first.stamp)) {
      return null;
    }
    // **Ogni stadio, non solo il primo.** Il tetto di chunk dipende da dove cade
    // il volume rispetto alle cuciture, quindi una ricetta che ci sta ovunque nel
    // test puo' non starci a questo allineamento — e sforare non e' un errore, e'
    // uno scarto silenzioso mille tick dopo. Meglio non cominciare.
    if (!this.fitsEveryStage(origin, sunk.padZ, recipe, facing, recordSeed)) return null;

    surface.clearSiteDecor(origin.x, origin.y, span.sizeX, span.sizeY);
    buildWorks(world, terrain, origin.x, origin.y, span.sizeX, sunk, span.sizeY, mask);

    const record = registry.add({
      x: origin.x,
      y: origin.y,
      baseZ: sunk.padZ,
      footprint: span.sizeX,
      footprintY: span.sizeY,
      height: span.sizeZ,
      // La classe del record non conta niente: gli usi veri stanno in `uses`, e
      // `tally` legge quelli. Civico e' il meno arbitrario dei quattro, come per
      // un impalcato in quota, e resta inerte per costruzione.
      class: BUILDING_CLASS.civic,
      level: 0,
      seed: recordSeed,
      facing,
      arcology: recipe.kind,
      foundedNeighbours,
      uses: [],
    });

    growth.enqueueSegments(record, first.stamp, first.z0);
    this.openLandings(record, recipe, 0, facing);
    this.paintApron(record);
    surface.enqueueBlockStreets(this.ctx.streets.blockAt(x, y));
    return record;
  }

  /**
   * Apre il pozzo e accoda lo stadio zero. null se il luogo non lo regge.
   *
   * **L'opera di terra non passa di qui, ed e' la differenza vera con `build`.**
   * Un'arcologia che sale poggia sul terreno e ha bisogno che qualcuno glielo
   * porti a quota; qui il terreno dentro l'ingombro **se ne va**, e la lastra
   * della piazza — l'anello di sommita' della ricetta — e' cio' che prende il
   * suo posto. Chiamare `buildWorks` avrebbe riempito fino a `padZ` proprio le
   * colonne che lo scavo apre un istante dopo, cioe' avrebbe pagato due volte
   * per il risultato di prima.
   *
   * **Prima il pozzo, poi la struttura**, e non e' un dettaglio di comparsa:
   * `admitPending` ammette una voce per struttura in ordine di arrivo, quindi
   * accodare lo scavo per primo garantisce che il cratere si apra e solo dopo
   * gli anelli comincino a comparirci dentro. L'ordine opposto avrebbe scritto
   * la struttura dentro la roccia — invisibile — per poi far sparire il terreno
   * tutto insieme alla fine.
   */
  private buildSunken(
    x: number,
    y: number,
    recipe: ArcologyRecipe,
    facing: Facing,
    foundedNeighbours: number,
  ): BuildingRecord | null {
    const { terrain, registry, growth, surface, seed } = this.ctx;
    const depth = sunkenDepthOf(recipe);
    const span = arcologySpan(recipe, facing);
    const origin = arcologyOrigin(recipe, facing, x, y);
    const recordSeed = hashCoords(seed, x, y);

    // Rimisurato qui e non ereditato da `found`: fra la condizione e questa
    // chiamata puo' esserci stato un cantiere lungo mille tick, e il terreno di
    // un'altra struttura puo' essere cambiato nel frattempo.
    const site = surveySunkenSite(terrain, origin.x, origin.y, span.sizeX, span.sizeY);
    if (!site.dryRim || site.depth < depth) return null;

    // La piazza sta al piano finito; `z = 0` dello stamp sta `depth` piu' sotto.
    const baseZ = site.padZ - depth;
    if (baseZ < SUNKEN.floorZ) return null;

    const first = trimStampZ(generateArcology(recipe, { stage: 0, facing, seed: recordSeed }));
    const dig = sunkenDigStamp(recipe, facing, origin.x, origin.y, baseZ, terrain);

    if (registry.overlaps(
      origin.x, origin.y, span.sizeX, baseZ, span.sizeZ, span.sizeY,
    )) {
      return null;
    }
    if (!this.fitsEveryStage(origin, baseZ, recipe, facing, recordSeed)) return null;
    if (!this.fitsDig(origin, baseZ, dig)) return null;

    surface.clearSiteDecor(origin.x, origin.y, span.sizeX, span.sizeY);

    const record = registry.add({
      x: origin.x,
      y: origin.y,
      baseZ,
      footprint: span.sizeX,
      footprintY: span.sizeY,
      height: span.sizeZ,
      class: BUILDING_CLASS.civic,
      level: 0,
      seed: recordSeed,
      facing,
      arcology: recipe.kind,
      foundedNeighbours,
      uses: [],
    });

    this.enqueueDig(record, dig);
    growth.enqueueSegments(record, first.stamp, first.z0);
    this.paintApron(record);
    surface.enqueueBlockStreets(this.ctx.streets.blockAt(x, y));
    return record;
  }

  /**
   * Accoda lo scavo a segmenti, con la stessa macchina che demolisce.
   *
   * `EMPTY_STAMP` come sagoma nuova e la roccia come «precedente»: la coda non
   * scrive niente e cancella tutto, a budget e senza un secondo percorso di
   * scrittura. E' la forma che `enqueueSlopeCarve` ha stabilito, con in piu' il
   * taglio a segmenti — un cratere multi-blocco e' largo quarantotto voxel, e
   * una voce sola sforerebbe il tetto di chunk sporchi che `enqueueSegments`
   * rispetta per costruzione.
   */
  private enqueueDig(record: BuildingRecord, dig: VoxelStamp): void {
    if (dig.sizeZ === 0) return;
    for (const slice of sliceStamps(dig, BUILDER.segmentSide)) {
      this.ctx.growth.enqueue(record.id, {
        x: record.x + slice.offsetX,
        y: record.y + slice.offsetY,
        z: record.baseZ,
      }, EMPTY_STAMP, slice.stamp);
    }
  }

  /**
   * Riapre il pozzo di un'arcologia caricata. No-op su tutto il resto.
   *
   * **Senza questa riga il salvataggio perde la famiglia intera, e in
   * silenzio.** `Builder.restore` ridisegna gli stamp e nient'altro: terreno e
   * strade si rifanno dal seme perche' sono funzioni pure, quindi la roccia
   * torna dov'era e la struttura resta murata dentro — visibile solo con una
   * vista di sezione, e indistinguibile da un salvataggio corrotto.
   *
   * Si chiama **prima** di scrivere la sagoma, non dopo: lo scavo cancella tutto
   * cio' che trova nell'imbuto, e girato dopo porterebbe via la struttura appena
   * ridisegnata.
   */
  reopenPit(record: BuildingRecord): void {
    const kind = record.arcology;
    if (kind === undefined) return;
    const recipe = arcologyOf(kind);
    if (recipe.sunken === undefined) return;

    const facing = (record.facing ?? FACING.east) as Facing;
    const dig = sunkenDigStamp(
      recipe, facing, record.x, record.y, record.baseZ, this.ctx.terrain,
    );
    if (dig.sizeZ === 0) return;
    // A budget non serve: il caricamento scrive gia' tutte le sagome di colpo,
    // ed e' lo stesso momento in cui la citta' intera ricompare.
    this.ctx.growth.writeStamp(
      { x: record.x, y: record.y, z: record.baseZ }, dig, 0, dig.sizeZ, true,
    );
  }

  /** true se lo scavo, a questo allineamento, sta nel tetto di chunk sporchi. */
  private fitsDig(
    origin: { x: number; y: number },
    baseZ: number,
    dig: VoxelStamp,
  ): boolean {
    if (dig.sizeZ === 0) return true;
    for (const slice of sliceStamps(dig, BUILDER.segmentSide)) {
      const count = dirtyChunkCount(
        origin.x + slice.offsetX,
        origin.y + slice.offsetY,
        slice.stamp.sizeX,
        baseZ,
        baseZ + slice.stamp.sizeZ,
        slice.stamp.sizeY,
      );
      if (count > BUILDER.maxDirtyChunksPerBuilding) return false;
    }
    return true;
  }

  /** true se ogni stadio, a questo allineamento, sta nel tetto di chunk sporchi. */
  private fitsEveryStage(
    origin: { x: number; y: number },
    baseZ: number,
    recipe: ArcologyRecipe,
    facing: Facing,
    seed: number,
  ): boolean {
    for (let stage = 0; stage <= maxStageOf(recipe); stage++) {
      const { z0, stamp } = trimStampZ(generateArcology(recipe, {
        stage,
        from: stage,
        facing,
        seed,
      }));
      const count = dirtyChunkCount(
        origin.x,
        origin.y,
        stamp.sizeX,
        baseZ + z0,
        baseZ + z0 + stamp.sizeZ,
        stamp.sizeY,
      );
      if (count > BUILDER.maxDirtyChunksPerBuilding) return false;
    }
    return true;
  }

  /**
   * I piazzali di uno stadio, come nodi della rete in quota.
   *
   * **Un record senza sagoma propria, e non e' una finzione.** I voxel del piano
   * li ha gia' disegnati la ricetta; questo record dice alla rete in quota «qui
   * si arriva», che e' l'unica cosa che di un piazzale la rete deve sapere.
   * Entrando in `registry.decks` diventa un capolinea per `routePass` senza che
   * `aerialDriver` debba imparare cosa sia un'arcologia.
   *
   * Che sopra non ci nasca un edificio lo garantisce gia' l'inviluppo
   * dell'arcologia, che `overlaps` copre a tutte le quote: non serve un secondo
   * controllo, serve saperlo.
   */
  private openLandings(
    record: BuildingRecord,
    recipe: ArcologyRecipe,
    stage: number,
    facing: Facing,
  ): void {
    for (const landing of worldLandings(recipe, facing, record.x, record.y)) {
      if (landing.stage !== stage) continue;
      this.commitLanding(record, landing);
    }
  }

  /**
   * Riapre le piazzole di un'arcologia caricata.
   *
   * Una piazzola non e' voxel: e' un record di un voxel d'altezza che dichiara
   * «qui sopra si costruisce», e i suoi voxel sono quelli dell'arcologia stessa,
   * che `recordStamp` ha gia' ridisegnato. Non entra nel salvataggio — e' una
   * parte in quota come le altre — ma a differenza di una campata si ricava
   * interamente dalla ricetta e dallo stadio, quindi si rimette dov'era invece
   * di aspettare il prossimo avanzamento. Senza, un'arcologia caricata perde i
   * propri appoggi e la citta' smette di poterci salire sopra.
   */
  adopt(): void {
    for (const record of [...this.ctx.registry.all]) {
      if (record.arcology === undefined) continue;
      const recipe = arcologyOf(record.arcology);
      const facing = (record.facing ?? FACING.east) as Facing;
      for (let stage = 0; stage <= record.level; stage++) {
        this.openLandings(record, recipe, stage, facing);
      }
    }
  }

  private commitLanding(host: BuildingRecord, landing: WorldLanding): void {
    this.ctx.registry.add({
      x: landing.x,
      y: landing.y,
      // La quota del **piano**: `decksAt` ci somma l'altezza per dire da dove si
      // costruisce, ed e' la stessa convenzione di `commitDeck`.
      baseZ: host.baseZ + landing.z - 1,
      footprint: landing.sizeX,
      footprintY: landing.sizeY,
      height: 1,
      class: host.class,
      level: 0,
      seed: hashCoords(this.ctx.seed, landing.x, landing.y),
      aerial: AERIAL_PART.node,
      supports: [host.id],
    });
  }

  /**
   * La cornice di suolo pubblico attorno all'ingombro.
   *
   * Un anello e non un rombo, come per un landmark: con la struttura al centro
   * un rombo finirebbe tutto sotto il pavimento. Si ferma sulla battigia per la
   * stessa ragione di sempre — il suolo pubblico e' suolo.
   */
  private paintApron(record: BuildingRecord): void {
    const margin = ARCOLOGY.apron;
    const depth = footprintDepth(record);
    // **Su un pozzo il grembiule si ferma al bordo dell'ingombro.** La coda di
    // superficie dipinge a `heightAt - 1`, cioe' alla quota che il terreno
    // *aveva*: sopra una colonna scavata quel voxel non c'e' piu', e il
    // calpestio ci resterebbe sospeso in mezzo al vuoto — un coperchio d'asfalto
    // sulla bocca del cratere. E' lo stesso difetto che la passeggiata del
    // distretto costiero evita scartando le colonne gia' scavate, e qui la
    // lastra della piazza la posa gia' la ricetta.
    const sunken = record.arcology !== undefined &&
      arcologyOf(record.arcology).sunken !== undefined;

    for (let py = record.y - margin; py < record.y + depth + margin; py++) {
      for (let px = record.x - margin; px < record.x + record.footprint + margin; px++) {
        if (sunken &&
          px >= record.x && px < record.x + record.footprint &&
          py >= record.y && py < record.y + depth) {
          continue;
        }
        if (!isDryLand(this.ctx.terrain.biomeAt(px, py))) continue;
        this.ctx.surface.enqueue({ x: px, y: py, palette: ARCOLOGY.apronPalette, priority: 1 });
      }
    }
  }

  /**
   * Il verso in cui la struttura guarda.
   *
   * L'ancora sta al **centro** dell'isolato, quindi una carreggiata a un voxel
   * non c'e' quasi mai: il raggio e' mezzo ingombro, cioe' fin dove la strada
   * piu' vicina puo' stare. Senza nessuna resta il seme, arbitrario ma stabile.
   */
  private facingAt(x: number, y: number, reach: number): Facing {
    return this.ctx.streets.facingOf(x, y, reach)
      ?? ((hashCoords(this.ctx.seed, x, y) & 3) as Facing);
  }
}

export type ArcologyDriverRefusal = ArcologyRefusal | 'materials';
