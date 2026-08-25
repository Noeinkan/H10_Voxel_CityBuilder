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
  arcologyOf,
  type ArcologyRecipe,
} from '../arcology/config';
import { arcologyForBlock } from '../arcology/catalog';
import {
  arcologyOrigin,
  arcologySpan,
  generateArcology,
  worldBands,
  worldLandings,
  type WorldLanding,
} from '../arcology/generate';
import { arcologyAnchor, arcologyReady, type ArcologyRefusal } from '../arcology/siting';
import { AERIAL_PART } from '../aerial/config';
import type { AerialDriver } from './aerialDriver';
import { isDryLand } from '../grading/grade';
import { hashCoords } from '../rng';
import { tierAt } from '../skyline/tiers';
import { FACING, type Facing } from '../streets/streetGrid';
import { maxStageOf } from '../landmarks/config';
import { stageForBuildings } from '../landmarks/generate';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount, fitsChunkBudget } from './chunkBudget';
import type { ClearanceBox, ClearanceSites } from './clearanceSite';
import { BUILDER } from './config';
import { allowedLevel, riseOf, skylineQueryAt } from './hierarchy';
import { buildWorks, surveyGrade } from './siteWorks';
import { stampFootprint, trimStampZ } from './stamp';

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

  /**
   * Una passata: prima si sale, poi si fonda.
   *
   * **In quest'ordine e non nell'altro.** Una fondazione nuova apre un cantiere
   * che dura diverse passate; farla per prima vorrebbe dire che, finche' quel
   * cantiere e' aperto, l'arcologia gia' in piedi non avanza di uno stadio pur
   * avendone diritto. Salire e' anche la cosa che il giocatore vede piu' spesso.
   */
  pass(state: SimState): SimState {
    let next = this.climb(state);
    if (this.ctx.registry.arcologyCount >= ARCOLOGY.maxPerIsland) return next;
    if (this.ctx.growth.queued >= BUILDER.maxGrowing) return next;
    next = this.found(next);
    return next;
  }

  /**
   * Porta avanti gli stadi, e dichiara alla simulazione le fasce che aprono.
   *
   * **Cosa fa avanzare uno stadio**: gli edifici costruiti entro
   * `ARCOLOGY.radius`, come per un landmark e per la stessa ragione — la
   * desiderabilita', sotto un centro saturo, e' saturata anch'essa e farebbe
   * saltare tutti gli stadi al primo tick. Contare i record misura invece cio'
   * che la citta' ha davvero costruito, e non scende mai.
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
        const nearby = this.ctx.registry.countWithinRadius(
          record.x + (record.footprint >> 1),
          record.y + (footprintDepth(record) >> 1),
          ARCOLOGY.radius,
        );
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

    const budget = Math.min(ARCOLOGY.examinedPerPass, records.length);
    const seen = new Set<string>();

    for (let i = 0; i < budget; i++) {
      const record = records[this.cursor % records.length];
      this.cursor++;
      if (record.arcology !== undefined || record.aerial !== undefined) continue;

      const block = this.ctx.streets.blockAt(record.x, record.y);
      const key = `${block.kx},${block.ky}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const rect = this.ctx.streets.blockRect(block);
      const anchor = arcologyAnchor(rect);
      const blockSide = Math.min(rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
      const facing = this.facingAt(anchor.x, anchor.y, (blockSide >> 1) + 1);
      const recipe = arcologyForBlock(
        this.ctx.seed,
        block.kx,
        block.ky,
        rect,
        facing,
      );
      const span = arcologySpan(recipe, facing);

      const refusal = arcologyReady({
        existing: this.ctx.registry.arcologyCount,
        tier: tierAt(skylineQueryAt(this.ctx, anchor.x, anchor.y, state)),
        blockRect: rect,
        spanX: span.sizeX,
        spanY: span.sizeY,
        builtNeighbours: this.ctx.registry.countWithinRadius(
          anchor.x, anchor.y, ARCOLOGY.radius,
        ),
        cappedNeighbours: this.cappedAround(anchor.x, anchor.y, state),
      });
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

      const origin = arcologyOrigin(recipe, facing, anchor.x, anchor.y);
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
        ? this.build(anchor.x, anchor.y, recipe, facing) !== null
        : this.clearance.start(box, ARCOLOGY.clearing, () => {
          this.build(anchor.x, anchor.y, recipe, facing);
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
  ): BuildingRecord | null {
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
    if (registry.overlaps(
      origin.x, origin.y, span.sizeX, plan.padZ, span.sizeZ, span.sizeY,
    )) {
      return null;
    }
    if (!fitsChunkBudget(origin.x, origin.y, span.sizeX, span.sizeY, plan, first.stamp)) {
      return null;
    }
    // **Ogni stadio, non solo il primo.** Il tetto di chunk dipende da dove cade
    // il volume rispetto alle cuciture, quindi una ricetta che ci sta ovunque nel
    // test puo' non starci a questo allineamento — e sforare non e' un errore, e'
    // uno scarto silenzioso mille tick dopo. Meglio non cominciare.
    if (!this.fitsEveryStage(origin, plan.padZ, recipe, facing, recordSeed)) return null;

    surface.clearSiteDecor(origin.x, origin.y, span.sizeX, span.sizeY);
    buildWorks(world, terrain, origin.x, origin.y, span.sizeX, plan, span.sizeY, mask);

    const record = registry.add({
      x: origin.x,
      y: origin.y,
      baseZ: plan.padZ,
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
      uses: [],
    });

    growth.enqueueSegments(record, first.stamp, first.z0);
    this.openLandings(record, recipe, 0, facing);
    this.paintApron(record);
    surface.enqueueBlockStreets(this.ctx.streets.blockAt(x, y));
    return record;
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
    for (let py = record.y - margin; py < record.y + depth + margin; py++) {
      for (let px = record.x - margin; px < record.x + record.footprint + margin; px++) {
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
