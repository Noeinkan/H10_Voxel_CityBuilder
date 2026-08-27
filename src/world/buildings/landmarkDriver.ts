import {
  BALANCE,
  catalystById,
  catalystRoleOf,
  setCatalystStrength,
  type BuildingClass,
  type CatalystId,
  type SimState,
} from '../../sim';
import { hashCoords } from '../rng';
import { GRADING } from '../grading/config';
import { GROUND, WORKS, isDryLand, type GradePlan } from '../grading/grade';
import { FACING, type Facing } from '../streets/streetGrid';
import { sightAnyWater, sightWater, type WaterSight } from '../sites/siteRules';
import { SITE } from '../sites/config';
import {
  LANDMARK,
  facadeFormOf,
  footprintOf,
  growsFootprint,
  hasFacadeForm,
  hasWaterForm,
  landmarkOf,
  maxStageOf,
  waterFormFor,
  type LandmarkFormId,
  type PartsRecipe,
} from '../landmarks/config';
import { planFacadeLandmark } from '../landmarks/facadePlan';
import {
  generateLandmark,
  landmarkOrigin,
  landmarkSpan,
  landmarkWaterColumn,
  stageForBuildings,
} from '../landmarks/generate';
import { orientPart } from '../landmarks/parts';
import { classifyWater } from '../terrain/waterClass';
import { WATER_IDS } from '../terrain/config';
import { SURFACE_KIND } from '../visualBlock';
import { AERIAL_FACES, type AerialFace, type AerialSupport } from '../aerial/terracePlan';
import type { DeckPlan } from '../aerial/deckPlan';
import { placeRecipe, type Placement } from './landmarkSiting';
import { footprintDepth, type BuildingRecord } from './BuildingRegistry';
import type { AerialDriver } from './aerialDriver';
import type { BuildContext } from './buildContext';
import { fitsChunkBudget } from './chunkBudget';
import type { ClearanceRefusal } from './clearance';
import { OPEN_SITE, recordsIn, type ClearanceBox, type ClearanceSites } from './clearanceSite';
import { BUILDER, CLASS_PROFILE } from './config';
import {
  buildWorks,
  groundKindAt,
  surveyGrade,
  surveyLandmarkGrade,
  type WorksMask,
} from './siteWorks';
import { EMPTY_STAMP, STAMP_EMPTY, stampFootprint, type VoxelStamp } from './stamp';

/**
 * I monumenti dei catalizzatori: il piazzamento, il grembiule e gli stadi.
 *
 * **Un landmark e' un edificio con un altro generatore**, ed e' per questo che
 * vive accanto al Builder invece che dentro: entra nel registry come un record
 * qualunque e da li' eredita collisione, budget di chunk e comparsa a budget
 * senza una riga in piu'. Cio' che ha di proprio — quale ricetta lo disegna,
 * come si orienta, cosa lo fa avanzare di stadio — sta tutto qui.
 *
 * `level` e' lo **stadio**, non il livello urbano, e i record con `landmark`
 * restano fuori dagli istogrammi: la simulazione non li ha mai contati come
 * edifici, e continua a non sapere che esistono (invariante 7).
 */
/**
 * Perche' la struttura non comparira', pur restando il piazzamento valido.
 *
 * Due motivi vengono dal costruito e li decide `clearance.ts`; il terzo viene
 * dal **terreno**, ed e' l'unico che resta: l'acqua fonda dentro l'impronta —
 * la sola cosa che una struttura non puo' ne' coprire ne' scavare. Un fianco
 * di montagna non rifiuta piu': la struttura affonda, copre la parete dentro
 * il proprio ingombro e scava la vetta che spunterebbe dal tetto.
 */
export type LandmarkRefusal = ClearanceRefusal | 'no-footing';

/**
 * Cosa il piazzamento di un landmark trova nel suo riquadro.
 *
 * Era `ClearanceVerdict` sotto un altro nome, e non lo e' piu': il cantiere sa
 * cosa e' costruito, non cosa regge sotto. Il nome vale comunque la riga — chi
 * legge `landmarkClearance` sul `Builder` non deve andare a cercare che tipo
 * torna un cantiere generico.
 */
export interface LandmarkSite {
  /** Edifici che porterebbe via. Zero dove il riquadro e' gia' libero. */
  readonly clears: number;
  /** Quanti dei condannati sono landmark: vedi `ClearanceVerdict`. */
  readonly landmarks: number;
  /** Perche' non ci si puo' piantare, o null. */
  readonly refusal: LandmarkRefusal | null;
}

/** Riquadro che nessuna opera regge: la struttura non ci sta, comunque vada. */
const NO_FOOTING: LandmarkSite = { clears: 0, landmarks: 0, refusal: 'no-footing' };

/**
 * Cosa impedisce a una struttura di appendersi a una facciata.
 *
 * Sono quattro gesti diversi e non un «qui no»: cercare un edificio, cercarne
 * uno **piu' grande**, cercarne uno **piu' alto**, cercarne uno libero. E' la
 * stessa ragione per cui i rifiuti della mensola sono tre — la regola che una
 * torre debba essere alta abbastanza perche' ci si appenda uno scalo non la
 * indovina nessuno.
 */
export type AloftRefusal =
  | 'needs-facade'
  | 'facade-too-narrow'
  | 'facade-too-low'
  | 'facade-occupied';

/** La piattaforma di facciata su cui una struttura in quota si posa. */
export interface AloftSite {
  /** L'edificio che la porta: da qui in avanti non promuove piu'. */
  readonly hostId: number;
  /** Angolo minimo dell'ingombro, interamente fuori dalla parete. */
  readonly x: number;
  readonly y: number;
  /** Prima quota occupata dalla piattaforma. */
  readonly z: number;
  readonly facing: Facing;
  /** Il piano strutturale: porta con se' gli appoggi che lo sbalzo richiede. */
  readonly deck: DeckPlan;
}

/** Il verdetto sulla facciata, o due null quando il ruolo a terra non ha alternative. */
export interface AloftVerdict {
  readonly site: AloftSite | null;
  readonly refusal: AloftRefusal | null;
}

/** «Questa domanda non si applica»: il ruolo non sa stare in quota. */
const NOT_ALOFT: AloftVerdict = { site: null, refusal: null };

export class LandmarkDriver {
  /**
   * Record che hanno gia' alzato lo stadio e aspettano che lo sventramento del
   * sedime nuovo finisca. Serve a non riaprire la stessa crescita due volte
   * mentre il cantiere sgombera: il record non e' nella coda di comparsa, quindi
   * `growth.isGrowing` da solo non basterebbe.
   */
  private readonly pendingGrowth = new Set<number>();

  constructor(
    private readonly ctx: BuildContext,
    /**
     * Il cantiere, condiviso con chiunque altro debba farsi spazio.
     *
     * I condannati **restano nel registry** finche' i loro voxel non sono
     * spariti, ed e' la parte che fa funzionare tutto il resto: il riquadro
     * resta prenotato da cio' che si sta abbattendo, non c'e' una finestra in
     * cui il sito legge libero con i voxel ancora dentro, e la passata di
     * upgrade li salta da sola perche' li vede in coda di comparsa.
     */
    private readonly clearance: ClearanceSites,
    private readonly aerial: AerialDriver,
  ) {}

  /**
   * Costruisce il landmark di un catalizzatore, con il suo grembiule attorno.
   *
   * **Ha sostituito `decorateCatalyst`, che dipingeva un rombo di asfalto.**
   * Quel rombo era identico per tutti e otto i ruoli — cambiava il colore di un
   * voxel — e il porto in particolare non aveva nessuna struttura: quello che si
   * vedeva sull'acqua era la carreggiata dell'isolato costiero.
   *
   * **L'ingombro e' quello finale, riservato subito.** Uno stadio non allarga
   * mai l'impronta: la riempie. Cosi' un landmark non puo' restare bloccato a
   * meta' perche' nel frattempo e' cresciuto un edificio accanto, e la sagoma
   * dello stadio precedente non ha mai niente da cancellare.
   *
   * Un ruolo senza ricetta ottiene il solo grembiule, che e' esattamente cio'
   * che tutti e otto avevano prima.
   */
  place(x: number, y: number, kind: CatalystId, aloft?: boolean): void {
    // `aloft` e' il verso scelto dal giocatore, non un indizio dal luogo. Senza
    // (`undefined`) vale il vecchio patto: la facciata vince quando c'e' —
    // puntare un grattacielo con lo strumento dell'aeroporto **e'** la richiesta
    // di uno scalo appeso. Esplicito, `true` appende e basta, `false` scarta la
    // facciata e costruisce a terra anche se sotto la colonna c'e' un edificio.
    if (aloft !== false) {
      const verdict = this.aloftSiteAt(x, y, kind);
      if (verdict.site !== null) {
        this.buildAloft(verdict.site, kind);
        return;
      }
      if (verdict.refusal !== null || aloft === true) return;
    }

    const built = this.buildStructure(x, y, kind);
    if (built !== null) this.paintApron(built, landmarkOf(kind)!.apron);
    // **Il riquadro pieno non e' piu' un rifiuto muto.** Finche' la struttura
    // poteva solo nascere su terreno vergine, un catalizzatore piantato in
    // centro si pagava e non si vedeva: nessun record, quindi nessuno stadio,
    // quindi un monumento invisibile per sempre. Adesso apre un cantiere, e la
    // struttura arriva quando il riquadro e' sgombero.
    else if (!this.open(x, y, kind)) this.paintPlaza(x, y, catalystById(kind).class);
    // Il grembiule da solo sarebbe una macchia in mezzo al verde: accodare
    // l'isolato che lo contiene lo porta contro una carreggiata vera.
    this.ctx.surface.enqueueBlockStreets(this.ctx.streets.blockAt(x, y));
  }

  /**
   * Cosa il piazzamento troverebbe qui, senza toccare niente.
   *
   * E' la domanda del cursore, e **la stessa che fa il click**: se rispondesse
   * con criteri diversi, "Valid position" tornerebbe a essere un'opinione — ed e'
   * esattamente quello che era diventata. Il terreno restava fuori «perche' qui
   * interessa solo cosa e' gia' costruito», ma la struttura non compare per due
   * ragioni e non per una: su un fianco di montagna e' l'opera a non reggere, e
   * il cursore diceva «Valid position» a un click che non avrebbe prodotto
   * niente — nemmeno la piazzola, perche' `canPaint` scarta le colonne in parete.
   *
   * **L'ordine e' quello di `catalystFailure`**: prima cosa regge il terreno, poi
   * cosa ci sta sopra. Dire quante case porta via un riquadro che nessuna opera
   * reggerebbe manderebbe a cercare una sacca bassa dove il problema e' la parete.
   */
  siteAt(x: number, y: number, kind: CatalystId, aloft?: boolean): LandmarkSite {
    // Su una facciata non c'e' niente da sgomberare: la struttura si posa fuori
    // da cio' che c'e', non al suo posto. Vale anche per la facciata rifiutata — a dirlo e'
    // il rifiuto del piazzamento, non il conto delle demolizioni.
    if (aloft !== false) {
      const verdict = this.aloftSiteAt(x, y, kind);
      if (verdict.site !== null || verdict.refusal !== null || aloft === true) return OPEN_SITE;
    }

    const spot = this.placementAt(x, y, kind);
    if (spot === null) return OPEN_SITE;
    if (this.footingAt(spot, kind, hashCoords(this.ctx.seed, x, y)) === null) return NO_FOOTING;

    return this.clearance.survey(boxOf(spot), BALANCE.gameplay.catalyst.clearing);
  }

  /**
   * La facciata che questa colonna offre a un ruolo, o perche' non ne offre una.
   *
   * **La presenza di un edificio sotto la colonna sceglie la strada**, e non c'e'
   * un secondo strumento: puntare una torre con l'aeroporto in mano chiede uno
   * scalo in quota, puntare il prato accanto chiede un campo di volo. E' l'unica
   * decisione di forma di questo dominio che dipende dal luogo invece che dal
   * seme, e sta qui perche' qui c'e' il registry.
   *
   * Due null significano «la domanda non si applica»: o il ruolo non ha una
   * forma in quota, o sotto la colonna non c'e' niente a cui appendersi. In
   * entrambi i casi decide la strada di terra.
   */
  aloftSiteAt(x: number, y: number, kind: CatalystId): AloftVerdict {
    if (!hasFacadeForm(kind)) return NOT_ALOFT;

    const host = this.buildingAt(x, y);
    if (host === null) return NOT_ALOFT;
    if (host.level < LANDMARK.aloftMinLevel) {
      return { site: null, refusal: 'facade-too-low' };
    }

    // Come per la terrazza, il fronte strada e' la prima scelta: li' lo sporto
    // guarda un vuoto vero. Un record senza fronte prova tutti i lati in ordine.
    const faces: readonly AerialFace[] = host.facing === undefined
      ? AERIAL_FACES
      : [host.facing as AerialFace];
    let refusal: AloftRefusal = 'facade-too-narrow';

    for (const face of faces) {
      const span = landmarkSpan(kind, face as Facing, facadeFormOf(kind)!);
      if (span === null) return NOT_ALOFT;
      const result = planFacadeLandmark({
        host: aerialSupportOf(host),
        faces: [face],
        sizeX: span.sizeX,
        sizeY: span.sizeY,
        ...this.aerial.siteProbe,
      });
      if (!result.ok) {
        refusal = result.refusal === 'noRun'
          ? 'facade-too-narrow'
          : result.refusal === 'tooLow'
            ? 'facade-too-low'
            : 'facade-occupied';
        continue;
      }

      const { deck } = result.plan;
      if (this.ctx.registry.overlaps(
        deck.rect.x,
        deck.rect.y,
        span.sizeX,
        deck.baseZ,
        span.sizeZ,
        span.sizeY,
        [host.id],
      )) {
        refusal = 'facade-occupied';
        continue;
      }
      return {
        site: {
          hostId: host.id,
          x: deck.rect.x,
          y: deck.rect.y,
          z: deck.baseZ,
          facing: face as Facing,
          deck,
        },
        refusal: null,
      };
    }

    return { site: null, refusal };
  }

  /** L'edificio ordinario sotto la colonna, anche se un impalcato lo attraversa. */
  private buildingAt(x: number, y: number): BuildingRecord | null {
    for (const record of this.ctx.registry.at(x, y)) {
      if (record.aerial !== undefined || record.span !== undefined ||
        record.landmark !== undefined || record.aloft === true) continue;
      return record;
    }
    return null;
  }

  /**
   * Posa la struttura sulla piattaforma di facciata: niente opera di terra,
   * niente grembiule.
   *
   * Le due assenze sono la stessa cosa detta due volte — **qui sotto non c'e'
   * terreno** — e sono anche tutto cio' che distingue questo percorso da quello
   * di terra: stamp, record, coda di comparsa e avanzamento di stadio sono la
   * macchina di sempre.
   */
  private buildAloft(site: AloftSite, kind: CatalystId): void {
    const { registry, growth, seed } = this.ctx;
    const form = facadeFormOf(kind);
    if (form === null) return;
    const recordSeed = hashCoords(seed, site.x, site.y);
    const stamp = generateLandmark({
      kind,
      stage: 0,
      facing: site.facing,
      seed: recordSeed,
      form,
    });
    const span = landmarkSpan(kind, site.facing, form);
    if (stamp === null || span === null) return;

    // Un piano di opera senza opera: `footZ === padZ` fa contare zero chunk alla
    // fondazione, che e' esattamente quanto ne sporca una struttura che non
    // scava. I ritagli si misurano poi come per chiunque altro.
    const plan: GradePlan = { works: WORKS.none, padZ: site.z, footZ: site.z, fill: 0 };
    if (!fitsChunkBudget(site.x, site.y, span.sizeX, span.sizeY, plan, stamp)) return;
    if (registry.overlaps(
      site.x, site.y, span.sizeX, site.z, span.sizeZ, span.sizeY, [site.hostId],
    )) return;

    const piers = this.aerial.commitFacadeSupports(site.deck, site.hostId);
    if (piers === null) return;

    const record = registry.add({
      x: site.x,
      y: site.y,
      baseZ: site.z,
      footprint: span.sizeX,
      footprintY: span.sizeY,
      height: span.sizeZ,
      class: catalystById(kind).class,
      level: 0,
      seed: recordSeed,
      facing: site.facing,
      landmark: kind,
      landmarkForm: form,
      aloft: true,
      supports: [site.hostId, ...piers],
    });

    growth.enqueueSegments(record, stamp);
  }

  /**
   * Porta avanti di uno stadio il landmark che il suo quartiere ha meritato.
   *
   * **Cosa fa avanzare uno stadio.** Il numero di edifici costruiti entro il
   * raggio del catalizzatore, non la desiderabilita'. Il campo, sotto un
   * catalizzatore, e' quasi sempre saturo — il catalizzatore *e'* la sorgente di
   * quel valore — e un landmark che leggesse quello salterebbe tutti gli stadi
   * al primo tick. Contare i record misura invece cio' che la citta' ha
   * davvero costruito li' attorno: e' il modello dei monumenti di Anno 1800,
   * una costruzione a fasi che corona una citta' gia' edificata, detto con il
   * solo dato che il Builder possiede.
   *
   * Non serve nessuno stato: lo stadio e' una funzione pura del contenuto del
   * registry. **Non scende**, e adesso che lo sventramento demolisce e' una
   * garanzia esplicita e non piu' una conseguenza: il confronto con
   * `record.level` fa avanzare e basta, quindi un quartiere che perde edifici
   * non fa arretrare il monumento che li ha visti costruire.
   *
   * **Il ritorno alla simulazione e' un numero, non un meccanismo.** Un landmark
   * cresciuto rende il proprio catalizzatore un po' piu' forte, e lo fa da
   * `setCatalystStrength`, che esisteva gia': `src/sim/` continua a non sapere
   * cosa sia un landmark (invariante 7).
   */
  pass(state: SimState): SimState {
    let next = state;
    let advanced = 0;

    for (const record of this.ctx.registry.all) {
      if (advanced >= LANDMARK.stagesPerPass) break;
      if (this.ctx.growth.queued >= BUILDER.maxGrowing) break;

      const kind = record.landmark;
      if (kind === undefined) continue;
      if (this.ctx.growth.isGrowing(record.id)) continue;
      if (this.pendingGrowth.has(record.id)) continue;

      const recipe = landmarkOf(kind, record.landmarkForm);
      if (recipe === null || record.level >= maxStageOf(recipe)) continue;

      // Il catalizzatore si ritrova dal riquadro e non da `record.x`, che e'
      // l'angolo minimo dell'ingombro: la colonna cliccata sta dentro il
      // riquadro ma quasi mai nel suo spigolo, perche' e' la ricetta a dire
      // dove cade — la banchina sotto il dito, il molo davanti.
      const index = catalystIn(next, record, kind, this.ctx.registry.get(record.supports?.[0] ?? 0));
      if (index === -1) continue;

      const catalyst = next.catalysts[index];
      const definition = catalystById(kind);
      const nearby = this.ctx.registry.withinRadius(
        catalyst.x, catalyst.y, definition.radius,
      ).length;
      if (stageForBuildings(recipe, nearby) <= record.level) continue;

      next = this.advance(next, record, kind, index);
      advanced++;
    }

    return next;
  }

  /**
   * L'acqua che questo ruolo deve guardare, o null se non ne guarda nessuna.
   *
   * Una marcia sola per le due domande che il fronte mare pone — da che parte
   * sta il mare, e a quante colonne — perche' il piazzamento di un porto le fa
   * tutte e due: la prima orienta la struttura, la seconda la fa scorrere fin
   * dove il mare comincia davvero.
   *
   * **Cerca l'acqua a galla, non la battigia.** Il vincolo di sito si accontenta
   * dell'orlo bagnato — e ha ragione, quello *e'* un sito costiero — ma un molo
   * che si ferma sull'orlo e' un molo sulla sabbia: qui la domanda e' dove
   * cominci il volume in cui una barca sta, e su un'isola a quote quantizzate
   * fra le due risposte ci sono celle intere.
   */
  private coastAt(x: number, y: number, kind: CatalystId): WaterSight | null {
    const site = catalystById(kind).site;
    if (site !== 'coastal' && site !== 'waterfront') return null;
    // La marina guarda l'acqua a qualsiasi quota — il lago conta quanto il mare —
    // e per quello la ricerca usa `sightAnyWater`, che sonda lo specchio della
    // colonna invece del solo livello del mare.
    const anyLevel = site === 'waterfront';
    // Il ripiego non e' una formalita': dove non c'e' acqua a galla nemmeno a
    // quattordici colonne, la battigia resta l'unica cosa che dica da che parte
    // guardare — e un molo verso il mare sbagliato e' un molo dentro la collina.
    const near = anyLevel
      ? sightAnyWater(this.ctx.terrain, x, y, SITE.shoreReach)
      : sightWater(this.ctx.terrain, x, y, SITE.shoreReach, true);
    return near
      ?? (anyLevel
        ? sightAnyWater(this.ctx.terrain, x, y, SITE.coastalRadius)
        : sightWater(this.ctx.terrain, x, y, SITE.coastalRadius));
  }

  /**
   * La forma d'acqua che il luogo seleziona, o `undefined` per la forma a terra.
   *
   * **La profondita' e l'esposizione dell'acqua decidono il mestiere del porto.**
   * Il selettore sonda la colonna `waterline` della ricetta — quella su cui il
   * piazzamento ha appena portato la battigia — e ne classifica lo specchio con
   * `classifyWater`: mare aperto, canale protetto o bassofondo. Il risultato e'
   * una forma d'acqua, cioe' una **variante fissata** della stessa sagoma, e non
   * una geometria nuova.
   *
   * `undefined` copre due casi diversi e giusti entrambi: un ruolo che non ha
   * forme d'acqua, e una colonna che non e' davvero sommersa — il piazzamento
   * puo' posare la banchina sull'orlo senza far scorrere la struttura, e li' il
   * seme sceglie l'esemplare come per qualunque altro landmark.
   */
  private waterFormAt(spot: Placement, kind: CatalystId): LandmarkFormId | undefined {
    if (!hasWaterForm(kind)) return undefined;
    const column = landmarkWaterColumn(kind, spot.facing, spot.x, spot.y);
    if (column === null) return undefined;

    const waterZ = this.ctx.terrain.waterTopAt(column.x, column.y);
    const depth = waterZ - this.ctx.terrain.heightAt(column.x, column.y);
    if (depth <= 0) return undefined;

    const waterClass = classifyWater(
      column.x,
      column.y,
      depth,
      (wx, wy) => this.ctx.terrain.heightAt(wx, wy),
      waterZ,
    );
    return waterFormFor(kind, waterClass) ?? undefined;
  }

  /**
   * Il verso in cui la struttura guarda.
   *
   * Un ruolo costiero guarda l'acqua — un molo che esce dalla parte sbagliata e'
   * un molo dentro la collina — e tutti gli altri la strada, come gia' fa
   * l'impronta di un edificio. Senza ne' l'una ne' l'altra resta il seme, che e'
   * arbitrario ma stabile: due partite sullo stesso seed mettono il monumento
   * nello stesso verso.
   */
  private facingAt(x: number, y: number, coast: WaterSight | null): Facing {
    if (coast !== null) return coast.facing;
    return this.ctx.streets.facingOf(x, y, 1)
      ?? ((hashCoords(this.ctx.seed, x, y) & 3) as Facing);
  }

  /** Dove la struttura si posa davvero, cliccando qui. Il conto sta in `landmarkSiting.ts`. */
  private placementAt(x: number, y: number, kind: CatalystId): Placement | null {
    const recipe = landmarkOf(kind);
    if (recipe === null) return null;

    const coast = this.coastAt(x, y, kind);
    return placeRecipe(recipe, this.facingAt(x, y, coast), x, y, coast);
  }

  /**
   * Apre il cantiere: condanna cio' che occupa il riquadro e ne accoda la fine.
   *
   * La regola su cosa puo' cadere e il modo in cui cade stanno in
   * `clearanceSite.ts`; qui resta la sola cosa che e' dei landmark, cioe' che
   * sul riquadro sgombero ci va **questa** struttura.
   */
  private open(x: number, y: number, kind: CatalystId): boolean {
    const spot = this.placementAt(x, y, kind);
    if (spot === null) return false;
    // **Non si sgombera per niente.** Se il terreno non regge l'opera, la
    // richiamata ricadrebbe comunque sulla piazzola: abbattere prima le case
    // sarebbe un cantiere aperto per una struttura che non puo' comparire. E
    // nemmeno si sgombera per una struttura che il volume esterno fermerebbe:
    // il riquadro puo' essere libero e la sagoma toccare comunque cio' che sta
    // fuori — un monumento che sborda sull'angolo — quindi la verifica si fa
    // escludendo i condannati e contando tutti gli altri.
    const recordSeed = hashCoords(this.ctx.seed, x, y);
    if (this.footingAt(spot, kind, recordSeed) === null) return false;
    const box = boxOf(spot);
    const except = recordsIn(this.ctx.registry, box).map((record) => record.id);
    if (!this.structureFits(spot, kind, recordSeed, except)) return false;

    return this.clearance.start(box, BALANCE.gameplay.catalyst.clearing, () => {
      this.finishClearance(x, y, kind, box);
    });
  }

  /**
   * Costruisce la struttura sul riquadro appena sgomberato, o riapre il cantiere.
   *
   * **La citta' non aspetta la demolizione.** Gli angoli del riquadro che i
   * condannati non occupano restano liberi, e la simulazione ci costruisce
   * mentre il cantiere e' aperto: quando l'ultimo condannato cade, il riquadro
   * puo' avere gia' un inquilino nuovo. La struttura non si arrende — riapre il
   * cantiere e riprova — e solo quando la regola rifiuta o il posto non regge
   * resta la piazzola.
   */
  private finishClearance(x: number, y: number, kind: CatalystId, box: ClearanceBox): void {
    const built = this.buildStructure(x, y, kind);
    if (built !== null) {
      this.paintApron(built, landmarkOf(kind)!.apron);
      return;
    }
    if (this.clearance.start(box, BALANCE.gameplay.catalyst.clearing, () => {
      this.finishClearance(x, y, kind, box);
    })) {
      return;
    }
    this.paintPlaza(x, y, catalystById(kind).class);
  }

  /**
   * true se la struttura entra nel luogo, ignorando i record elencati.
   *
   * E' la meta' di `buildStructure` che decide **prima** di scrivere: la
   * sagoma dello stadio zero, l'opera che la regge e il volume contro il
   * registry. `except` e' l'elenco di chi e' gia' condannato — il cantiere lo
   * usera' per verificare che demolire serva davvero.
   */
  private structureFits(
    spot: Placement,
    kind: CatalystId,
    recordSeed: number,
    except: readonly number[],
  ): boolean {
    const stamp = generateLandmark({
      kind,
      stage: 0,
      facing: spot.facing,
      seed: recordSeed,
      form: this.waterFormAt(spot, kind),
    });
    if (stamp === null) return false;
    const footing = this.footingAt(spot, kind, recordSeed);
    if (footing === null) return false;
    if (this.ctx.registry.overlaps(
      spot.x, spot.y, spot.span.sizeX, footing.plan.padZ, stamp.sizeZ, spot.span.sizeY, except,
    )) {
      return false;
    }
    return fitsChunkBudget(spot.x, spot.y, spot.span.sizeX, spot.span.sizeY, footing.plan, stamp);
  }

  /**
   * L'opera che reggerebbe la struttura qui, o null se non ce n'e' una.
   *
   * **Sta a parte perche' la fanno in tre**, e finche' la faceva solo chi
   * costruisce il cursore poteva dire una cosa e il click farne un'altra: adesso
   * il preventivo, l'apertura del cantiere e la costruzione chiedono la stessa
   * cosa allo stesso terreno.
   *
   * **L'opera si getta sotto cio' che la ricetta occupa, non sotto il
   * riquadro.** Il riquadro di un porto e' per meta' specchio d'acqua, e
   * portarlo tutto alla quota della banchina produceva una piattaforma
   * rettangolare in mezzo al mare con dentro una pozza piu' alta del mare
   * stesso. La maschera si chiede allo **stadio finale**, perche' l'opera si
   * costruisce una volta sola: uno stadio successivo non deve poter scoprire
   * di aver bisogno di terra che nessuno ha gettato.
   *
   * **Il pendio non e' piu' un rifiuto.** Un landmark copre il proprio ingombro
   * e scava la montagna che spunterebbe dal tetto, quindi una parete dentro
   * l'impronta non lo ferma: a fermarlo resta solo l'acqua fonda. E' la regola
   * che prima produceva il difetto piu' muto del piazzamento — su un fianco il
   * catalizzatore si pagava, il campo funzionava e a schermo non compariva
   * niente.
   */
  private footingAt(spot: Placement, kind: CatalystId, recordSeed: number): Footing | null {
    const form = this.waterFormAt(spot, kind);
    const recipe = landmarkOf(kind, form);
    if (recipe === null) return null;

    // La maschera si chiede allo stadio che l'opera deve reggere. Una ricetta
    // che cresce di sedime riserva solo lo stadio zero: il terreno dei prossimi
    // stadi si getta a ogni avanzamento, non al piazzamento. Una ricetta a
    // sedime fisso chiede lo stadio finale, come da sempre.
    const maskStage = growsFootprint(recipe) ? 0 : maxStageOf(recipe);
    const finalStamp = generateLandmark({
      kind,
      stage: maskStage,
      facing: spot.facing,
      seed: recordSeed,
      form,
    });
    const mask = finalStamp === null
      ? undefined
      : stampFootprint(finalStamp, LANDMARK.groundBand);

    const surveyed = recipe.waterline === undefined
      ? surveyLandmarkGrade(
        this.ctx.terrain, spot.x, spot.y, spot.span.sizeX, spot.span.sizeY, mask,
      )
      : surveyGrade(
        this.ctx.terrain, spot.x, spot.y, spot.span.sizeX, spot.span.sizeY, mask,
        // Chi dichiara `lakeQuay` chiede di costruire anche sull'acqua dolce: il
        // sondaggio misura allora le colonne del lago contro il proprio pelo.
        recipe.lakeQuay === true,
      );
    if (surveyed === null) return null;

    // Un landmark terrestre si inserisce nel pendio; uno costiero no. Nel suo
    // riquadro il minimo e' il fondale sotto i moli, non una quota a cui possa
    // stare la banchina: deve conservare il piano finito e costruire l'opera che
    // lo collega al fondo. `waterline` e' la distinzione dichiarata dalla
    // ricetta, quindi porto e traghetto seguono la stessa regola senza elenchi.
    const plan = recipe.waterline === undefined
      ? { ...surveyed, padZ: surveyed.footZ }
      : surveyed;
    return { plan, mask };
  }

  /** Costruisce la struttura e ne restituisce il record, o null se il luogo non la regge. */
  private buildStructure(x: number, y: number, kind: CatalystId): BuildingRecord | null {
    const { world, terrain, registry, growth, surface, seed } = this.ctx;
    const spot = this.placementAt(x, y, kind);
    if (spot === null) return null;
    const { facing, span } = spot;
    const origin = { x: spot.x, y: spot.y };
    const form = this.waterFormAt(spot, kind);

    // Il seme del record si calcola qui e non alla riga di `registry.add`: lo
    // legge anche il generatore, per scegliere l'esemplare, e le due risposte
    // devono venire dallo stesso intero. Altrimenti la sagoma scritta non
    // sarebbe quella che il record dichiara, e un avanzamento — che il seme lo
    // rilegge dal record — ne ritroverebbe un'altra.
    const recordSeed = hashCoords(seed, x, y);
    const stamp = generateLandmark({ kind, stage: 0, facing, seed: recordSeed, form });
    if (stamp === null) return null;

    const footing = this.footingAt(spot, kind, recordSeed);
    if (footing === null) return null;
    const { plan, mask } = footing;

    if (registry.overlaps(origin.x, origin.y, span.sizeX, plan.padZ, span.sizeZ, span.sizeY)) {
      return null;
    }
    if (!fitsChunkBudget(origin.x, origin.y, span.sizeX, span.sizeY, plan, stamp)) {
      return null;
    }

    surface.clearSiteDecor(origin.x, origin.y, span.sizeX, span.sizeY);
    buildWorks(world, terrain, origin.x, origin.y, span.sizeX, plan, span.sizeY, mask);

    const record = registry.add({
      x: origin.x,
      y: origin.y,
      baseZ: plan.padZ,
      footprint: span.sizeX,
      footprintY: span.sizeY,
      height: span.sizeZ,
      class: catalystById(kind).class,
      level: 0,
      seed: recordSeed,
      facing,
      landmark: kind,
      landmarkForm: form,
    });

    growth.enqueueSegments(record, stamp);
    this.enqueueBasinDig(record, kind, form, mask);
    if (landmarkOf(kind, form)?.waterline === undefined) {
      this.enqueueSlopeCarve(record, stamp, mask);
    }
    return record;
  }

  /**
   * Scava il bacino davanti alla struttura e lo allaga fino al pelo.
   *
   * **E' la darsena, non il mare che capitava di esserci.** Dove la ricetta non
   * poggia — le colonne fuori dalla maschera dell'opera, dentro la sola
   * impronta — il terreno scende a `basinDepth` sotto il pelo dell'acqua della
   * colonna `waterline`, e l'acqua lo riempie: sul mare il bacino taglia la
   * spiaggia, sul lago allarga la conca dentro la riva. Il muro di banchina
   * che `buildWorks` ha gia' costruito scende a incontrarne il fondo, colonna
   * per colonna e solo sul bordo fra l'opera e l'acqua.
   *
   * **Si scava, e solo qui e nella montagna sopra il tetto.** E' la seconda
   * eccezione al "si riempie e non si scava", e come la prima ha il confine
   * nell'impronta della struttura e viaggia sulla stessa coda di comparsa: il
   * terreno sopra il fondo va via con la cancellazione a budget, l'acqua
   * compare con la scrittura a budget. Chi non dichiara `basinDepth` non passa
   * di qui: il porto e il traghetto vivono dell'acqua che c'era gia'.
   */
  private enqueueBasinDig(
    record: BuildingRecord,
    kind: CatalystId,
    form: LandmarkFormId | undefined,
    mask: WorksMask | undefined,
  ): void {
    const recipe = landmarkOf(kind, form);
    const depth = recipe?.basinDepth;
    if (recipe === null || depth === undefined || mask === undefined) return;

    // Il pelo a cui si scava e' quello della colonna che la ricetta dichiara
    // d'acqua: il piazzamento l'ha gia' portata sulla battigia, quindi e'
    // quello giusto — mare o conca — anche se il click era a monte.
    const column = landmarkWaterColumn(
      kind, (record.facing ?? FACING.east) as Facing, record.x, record.y, form,
    );
    if (column === null) return;
    const waterZ = this.ctx.terrain.waterTopAt(column.x, column.y);
    const floor = waterZ - depth;

    const { terrain, growth } = this.ctx;
    const depthY = footprintDepth(record);
    let top = waterZ;
    for (let dy = 0; dy < depthY; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        const height = terrain.heightAt(record.x + dx, record.y + dy);
        if (height > top) top = height;
      }
    }
    if (top <= floor) return;
    const sizeZ = top - floor;

    const voxels = new Uint8Array(record.footprint * depthY * sizeZ);
    const surfaces = new Uint8Array(record.footprint * depthY * sizeZ);
    const erased = new Uint8Array(record.footprint * depthY * sizeZ);
    const at = (dx: number, dy: number, z: number) =>
      dx + record.footprint * (dy + depthY * (z - floor));
    const basin = (dx: number, dy: number): boolean =>
      mask[dy * record.footprint + dx] === 0;
    const touchesBasin = (dx: number, dy: number): boolean =>
      basin(dx - 1, dy) || basin(dx + 1, dy) || basin(dx, dy - 1) || basin(dx, dy + 1);

    for (let dy = 0; dy < depthY; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        const cx = record.x + dx;
        const cy = record.y + dy;
        const height = terrain.heightAt(cx, cy);

        if (basin(dx, dy)) {
          // Colonna d'acqua: il terreno sopra il fondo scavato va tolto, e
          // l'acqua lo riempie fino al pelo. Le colonne gia' piu' profonde del
          // fondo — il mare aperto — restano intatte, con la loro acqua.
          if (height <= floor) continue;
          for (let z = floor; z < height; z++) erased[at(dx, dy, z)] = 1;
          for (let z = floor; z < waterZ; z++) {
            voxels[at(dx, dy, z)] = WATER_IDS.surface;
            surfaces[at(dx, dy, z)] = classifyWater(
              cx, cy, waterZ - floor,
              (wx, wy) => terrain.heightAt(wx, wy),
              waterZ,
            );
          }
        } else if (height > floor && touchesBasin(dx, dy)) {
          // Il muro di banchina scende a incontrare il fondo scavato, sotto il
          // piede che `buildWorks` gli ha gia' costruito sopra il terreno.
          for (let z = floor; z < height; z++) {
            voxels[at(dx, dy, z)] = GRADING.quayWall;
            surfaces[at(dx, dy, z)] = SURFACE_KIND.utility;
          }
        }
      }
    }

    growth.enqueue(record.id, { x: record.x, y: record.y, z: floor }, {
      sizeX: record.footprint,
      sizeY: depthY,
      sizeZ,
      anchorX: 0,
      anchorY: 0,
      anchorZ: 0,
      voxels,
      surfaces,
      bandStarts: [0, sizeZ],
    }, {
      sizeX: record.footprint,
      sizeY: depthY,
      sizeZ,
      anchorX: 0,
      anchorY: 0,
      anchorZ: 0,
      voxels: erased,
      surfaces: new Uint8Array(erased.length),
      bandStarts: [0, sizeZ],
    });
  }

  /**
   * Scava la montagna che spunterebbe dal tetto, **dentro la sola impronta**.
   *
   * Un landmark affonda alla quota piu' bassa del proprio ingombro, quindi su un
   * fianco ripido una parte della struttura resta sotto la montagna: senza
   * questo scavo il pendio attraverserebbe il tetto e la struttura — pur
   * esistendo — leggerebbe come un volume sepolto. La fascia sopra la quota del
   * tetto **dello stadio visibile** viene tolta con la stessa coda di comparsa
   * della struttura, colonna per colonna e solo dove la maschera dichiara che
   * la ricetta poggia: il pendio fuori dall'impronta resta dov'e'. L'inviluppo
   * finale non e' un tetto — nella cattedrale, per esempio, riserva le guglie
   * future 21 voxel sopra la navata iniziale — e usarlo lascerebbe sepolto tutto
   * cio' che il giocatore ha appena costruito.
   *
   * **Si scava, e solo qui.** Il mondo si riempie e non si scava da nessun'altra
   * parte; questa e' l'unica eccezione, e il suo confine e' l'impronta della
   * struttura — mai il riquadro, mai il grembiule.
   */
  private enqueueSlopeCarve(
    record: BuildingRecord,
    stamp: VoxelStamp,
    mask: WorksMask | undefined,
  ): void {
    const { world, terrain, growth } = this.ctx;
    const depth = footprintDepth(record);

    let carveZ = Number.MAX_SAFE_INTEGER;
    let carveTop = 0;
    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        if (mask !== undefined && mask[dy * record.footprint + dx] === 0) continue;
        const roof = stampColumnTop(stamp, dx, dy);
        if (roof === 0) continue;
        const top = record.baseZ + roof;
        const height = terrain.heightAt(record.x + dx, record.y + dy);
        for (let z = top; z < height; z++) {
          if (world.getBlock(record.x + dx, record.y + dy, z) === STAMP_EMPTY) continue;
          if (z < carveZ) carveZ = z;
          if (height > carveTop) carveTop = height;
          break;
        }
      }
    }
    if (carveTop <= carveZ) return;

    const carveHeight = carveTop - carveZ;
    const voxels = new Uint8Array(record.footprint * depth * carveHeight);
    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < record.footprint; dx++) {
        if (mask !== undefined && mask[dy * record.footprint + dx] === 0) continue;
        const roof = stampColumnTop(stamp, dx, dy);
        if (roof === 0) continue;
        const top = record.baseZ + roof;
        const height = terrain.heightAt(record.x + dx, record.y + dy);
        for (let z = top; z < height; z++) {
          if (world.getBlock(record.x + dx, record.y + dy, z) === STAMP_EMPTY) continue;
          voxels[dx + record.footprint * (dy + depth * (z - carveZ))] = 1;
        }
      }
    }

    // Una sagoma nuova vuota e la fascia da togliere come "precedente": la
    // stessa macchina che demolisce un edificio a budget scava la montagna, e
    // nessun altro percorso di scrittura nasce qui.
    growth.enqueue(record.id, { x: record.x, y: record.y, z: carveZ }, EMPTY_STAMP, {
      sizeX: record.footprint,
      sizeY: depth,
      sizeZ: carveHeight,
      anchorX: 0,
      anchorY: 0,
      anchorZ: 0,
      voxels,
      surfaces: new Uint8Array(voxels.length),
      bandStarts: [0, carveHeight],
    });
  }

  /**
   * La cornice di suolo pubblico attorno a una struttura.
   *
   * E' un **anello attorno all'ingombro**, non un rombo attorno al click: con la
   * struttura al centro un rombo di raggio quattro finirebbe tutto sotto il
   * pavimento, e il filtro della coda lo scarterebbe colonna per colonna
   * lasciando il landmark posato sull'erba.
   *
   * Segue il terreno invece di livellarsi. La struttura ha gia' la propria
   * fondazione; portare anche la cornice alla quota del piano costruirebbe un
   * muro di contenimento largo quanto tutto l'anello, cioe' un podio che nessun
   * dislivello ha chiesto.
   *
   * **Si ferma sulla battigia.** Il suolo pubblico e' suolo: prolungarlo sul
   * bassofondo — che `canPaint` ammette, perche' una banchina ci si costruisce —
   * dipingeva un anello di asfalto sul fondale attorno a ogni porto, visibile in
   * trasparenza sotto il pelo dell'acqua come un rettangolo scavato nel mare.
   */
  private paintApron(record: BuildingRecord, margin: number): void {
    const depth = footprintDepth(record);
    for (let py = record.y - margin; py < record.y + depth + margin; py++) {
      for (let px = record.x - margin; px < record.x + record.footprint + margin; px++) {
        if (!isDryLand(this.ctx.terrain.biomeAt(px, py))) continue;
        this.ctx.surface.enqueue({ x: px, y: py, palette: LANDMARK.apronPalette, priority: 1 });
      }
    }
  }

  /**
   * La piazzola di un ruolo senza ricetta: il rombo di prima, con il suo voxel
   * d'accento al centro.
   *
   * Sopravvive perche' e' il ripiego, non perche' sia rimasto indietro: un ruolo
   * aggiunto a `CATALYSTS` prima che qualcuno gli disegni una forma resta
   * giocabile e visibile.
   */
  private paintPlaza(x: number, y: number, cls: BuildingClass): void {
    const radius = BUILDER.catalystPlazaRadius;
    const deck = this.plazaDeck(x, y, radius);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const centre = dx === 0 && dy === 0;
        this.ctx.surface.enqueue({
          x: x + dx,
          y: y + dy,
          palette: centre ? CLASS_PROFILE[cls].accent : LANDMARK.apronPalette,
          priority: centre ? 2 : 1,
          deck,
          wall: GRADING.terraceWall,
          coping: GRADING.terraceCoping,
        });
      }
    }
  }

  /**
   * Quota di una piazza, o `undefined` se il terreno non chiede di livellarla.
   *
   * Una piazza e' un piano: seguire il terreno voxel per voxel la fa leggere
   * come un pezzo di prato colorato di grigio. Ma livellare un dislivello di un
   * voxel produce un gradino che nessuno legge come progetto, quindi sotto
   * `plazaMinStep` la piazza resta dipinta dov'e' — che e' anche il motivo per
   * cui su terreno piano questa fase non cambia niente.
   *
   * Le colonne che nessuna opera regge non entrano nel massimo: una piazza sul
   * ciglio non deve alzarsi fino alla roccia che le sta accanto.
   */
  private plazaDeck(x: number, y: number, radius: number): number | undefined {
    let lowest = Number.MAX_SAFE_INTEGER;
    let highest = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        if (groundKindAt(this.ctx.terrain, x + dx, y + dy) === GROUND.refused) continue;
        const height = this.ctx.terrain.heightAt(x + dx, y + dy);
        if (height < lowest) lowest = height;
        if (height > highest) highest = height;
      }
    }
    if (highest === 0 || highest - lowest < GRADING.plazaMinStep) return undefined;
    return highest;
  }

  /**
   * Scrive lo stadio successivo di un landmark.
   *
   * Non c'e' niente da cancellare, e non e' una scorciatoia: gli stadi sono
   * cumulativi dentro un riquadro che non cambia mai, quindi lo stadio nuovo
   * copre sempre il vecchio. E' anche il motivo per cui non serve rivalidare il
   * terreno o l'occupazione — l'ingombro e' lo stesso riservato al piazzamento.
   *
   * **Una ricetta che cresce di sedime esce da qui.** Li' il riquadro *cambia*,
   * quindi l'avanzamento e' uno sventramento del terreno nuovo piu' una posa,
   * e sta in `growFootprint`.
   */
  private advance(
    state: SimState,
    record: BuildingRecord,
    kind: CatalystId,
    catalystIndex: number,
  ): SimState {
    const stage = record.level + 1;
    const facing = (record.facing ?? FACING.east) as Facing;
    const recipe = landmarkOf(kind, record.landmarkForm);
    if (recipe !== null && growsFootprint(recipe) && record.aloft !== true) {
      return this.growFootprint(state, record, kind, recipe, stage, catalystIndex);
    }

    // Lo stesso seme del piazzamento, che il record conserva: un avanzamento
    // deve ritrovare l'esemplare gia' scritto, non sceglierne un altro. E' anche
    // cio' che tiene vero l'invariante su cui poggia tutta questa funzione — lo
    // stadio nuovo copre il vecchio — perche' due esemplari diversi non si
    // coprono affatto, e la sagoma di prima resterebbe a pezzi in giro.
    const stamp = generateLandmark({
      kind,
      stage,
      facing,
      seed: record.seed,
      form: record.landmarkForm,
    });
    if (stamp === null) return state;

    const replaced = this.ctx.registry.replace(record.id, { ...record, level: stage });
    if (replaced === null) return state;

    this.ctx.growth.enqueueSegments(replaced, stamp);
    if (record.aloft !== true && recipe?.waterline === undefined) {
      this.enqueueSlopeCarve(replaced, stamp, stampFootprint(stamp, LANDMARK.groundBand));
    }

    // Il ritorno alla simulazione e' un numero: il catalizzatore diventa un po'
    // piu' forte, e `src/sim/` non sa perche'. La base si rilegge dal catalogo
    // invece di sommarsi a quella corrente, cosi' due avanzamenti non si
    // accumulano oltre quello che lo stadio dichiara.
    const base = catalystById(kind).strength;
    return setCatalystStrength(
      state,
      catalystIndex,
      base + stage * BALANCE.gameplay.catalyst.stageBonus,
    );
  }

  /**
   * Avanza di uno stadio un landmark che cresce di sedime.
   *
   * **Il riquadro cambia, quindi niente no-op.** Lo stadio sale subito — solo il
   * livello, per non riaprire la crescita — e il nuovo terreno si sventra a
   * strisce con il cantiere di sempre. Quando l'ultima striscia e' sgombera, la
   * sagoma nuova copre la vecchia e l'impronta del record si allarga.
   *
   * **L'ancora resta ferma.** La colonna cliccata si recupera dallo stadio
   * corrente, e il sedime nuovo le cresce attorno come la ricetta dichiara.
   */
  private growFootprint(
    state: SimState,
    record: BuildingRecord,
    kind: CatalystId,
    recipe: PartsRecipe,
    stage: number,
    catalystIndex: number,
  ): SimState {
    const facing = (record.facing ?? FACING.east) as Facing;
    const anchor = this.anchorColumnOf(record, recipe, facing);
    const newOrigin = landmarkOrigin(kind, facing, anchor.x, anchor.y, record.landmarkForm, stage);
    const newSpan = landmarkSpan(kind, facing, record.landmarkForm, stage);
    if (newOrigin === null || newSpan === null) return state;

    const oldBox = {
      x: record.x,
      y: record.y,
      sizeX: record.footprint,
      sizeY: footprintDepth(record),
    };
    const newBox = {
      x: newOrigin.x,
      y: newOrigin.y,
      sizeX: newSpan.sizeX,
      sizeY: newSpan.sizeY,
    };

    // La sagoma vecchia si fotografa prima di alzare il livello: e' quella che
    // l'avanzamento cancella, perche' lo stadio nuovo la sostituisce e non la
    // copre.
    const oldStamp = generateLandmark({
      kind,
      stage: record.level,
      facing,
      seed: record.seed,
      form: record.landmarkForm,
    });
    if (oldStamp === null) return state;

    // Il livello sale subito, ma l'impronta resta quella vecchia: allargarla
    // prima che il terreno sia sgombero farebbe leggere il landmark come un
    // ostacolo dentro le strisce da sventrare, e il cantiere rifiuterebbe.
    const bumped = this.ctx.registry.replace(record.id, { ...record, level: stage });
    if (bumped === null) return state;
    this.pendingGrowth.add(record.id);

    const rule = BALANCE.gameplay.catalyst.clearing;
    const strips = ringStrips(oldBox, newBox);
    // Ci si ferma davanti a cio' che la regola non sventra — una struttura, un
    // altro monumento — riportando il livello indietro: meglio uno stadio che
    // aspetta di una crescita che non rispetta il proprio quartiere.
    for (const strip of strips) {
      if (this.clearance.survey(strip, rule).refusal !== null) {
        this.ctx.registry.replace(record.id, { ...record });
        this.pendingGrowth.delete(record.id);
        return state;
      }
    }

    let pending = 0;
    const apply = (): void => {
      pending--;
      if (pending === 0) {
        this.pendingGrowth.delete(record.id);
        this.applyGrownStage(record.id, kind, stage, facing, oldBox, newBox, newSpan.sizeZ, oldStamp);
      }
    };
    for (const strip of strips) {
      if (this.clearance.survey(strip, rule).clears === 0) continue;
      if (this.clearance.start(strip, rule, apply, { fence: false })) pending++;
    }
    if (pending === 0) {
      this.pendingGrowth.delete(record.id);
      this.applyGrownStage(record.id, kind, stage, facing, oldBox, newBox, newSpan.sizeZ, oldStamp);
    }

    const base = catalystById(kind).strength;
    return setCatalystStrength(
      state,
      catalystIndex,
      base + stage * BALANCE.gameplay.catalyst.stageBonus,
    );
  }

  /**
   * Posa la sagoma dello stadio nuovo sul sedime appena sgomberato.
   *
   * L'impronta del record si allarga solo ora, a cantiere chiuso: la sagoma
   * vecchia si cancella e la nuova la sostituisce — il sedime e' cambiato, quindi
   * non c'e' un "copre il vecchio" a cui affidarsi. Il terreno nuovo si riempie
   * alla quota di sempre, la montagna che spuntasse dal tetto si scava, e il
   * grembiule segue l'impronta nuova.
   */
  private applyGrownStage(
    id: number,
    kind: CatalystId,
    stage: number,
    facing: Facing,
    oldBox: ClearanceBox,
    newBox: ClearanceBox,
    newHeight: number,
    oldStamp: VoxelStamp,
  ): void {
    const record = this.ctx.registry.get(id);
    if (record === null) return;
    const recipe = landmarkOf(kind, record.landmarkForm);
    if (recipe === null) return;

    const stamp = generateLandmark({
      kind,
      stage,
      facing,
      seed: record.seed,
      form: record.landmarkForm,
    });
    if (stamp === null) return;

    const replaced = this.ctx.registry.replace(id, {
      ...record,
      x: newBox.x,
      y: newBox.y,
      footprint: newBox.sizeX,
      footprintY: newBox.sizeY,
      height: newHeight,
    });
    if (replaced === null) return;

    // Prima cade la sagoma vecchia, poi compare la nuova: due code per lo stesso
    // record, ammesse una per volta, che e' il ritmo di ogni demolizione.
    this.ctx.growth.enqueue(
      replaced.id,
      { x: oldBox.x, y: oldBox.y, z: replaced.baseZ },
      EMPTY_STAMP,
      oldStamp,
    );

    const mask = stampFootprint(stamp, LANDMARK.groundBand);
    this.ctx.surface.clearSiteDecor(replaced.x, replaced.y, replaced.footprint, footprintDepth(replaced));
    this.fillNewGround(replaced, mask);
    this.ctx.growth.enqueueSegments(replaced, stamp);
    this.enqueueSlopeCarve(replaced, stamp, mask);
    this.paintApron(replaced, recipe.apron);
  }

  /**
   * Porta il terreno nuovo alla quota del piano, dove e' piu' basso.
   *
   * La struttura affonda alla quota fissata al piazzamento — `baseZ` — quindi
   * una colonna del sedime nuovo piu' bassa di quella quota lascerebbe la
   * sagoma a mezz'aria. L'opera si ri-getta sull'intera impronta nuova con la
   * stessa maschera del corpo: le colonne vecchie sono gia' alla quota giusta, e
   * la riempie solo il terreno nuovo che ne ha bisogno.
   */
  private fillNewGround(record: BuildingRecord, mask: WorksMask | undefined): void {
    const plan: GradePlan = { works: WORKS.none, padZ: record.baseZ, footZ: record.baseZ, fill: 0 };
    buildWorks(
      this.ctx.world,
      this.ctx.terrain,
      record.x,
      record.y,
      record.footprint,
      plan,
      footprintDepth(record),
      mask,
    );
  }

  /**
   * La colonna cliccata, recuperata dall'angolo minimo del record.
   *
   * Il record conserva l'angolo minimo dell'impronta corrente; l'ancora — il
   * punto fermo di tutta la crescita — si riottiene sommando dove la ricetta
   * dichiara che cade il click dentro quel riquadro, ruotato sul verso vero.
   */
  private anchorColumnOf(
    record: BuildingRecord,
    recipe: PartsRecipe,
    facing: Facing,
  ): { x: number; y: number } {
    const footprint = footprintOf(recipe, record.level);
    const [long, short] = footprint.span;
    const [ax, ay] = footprint.anchor;
    const spot = orientPart(
      { kind: 0, x: ax, y: ay, w: 1, h: 1, z: 0, height: 1, palette: 0, surface: 0 },
      facing,
      long,
      short,
    );
    return { x: record.x + spot.x, y: record.y + spot.y };
  }
}

/** Quota locale subito sopra il voxel piu' alto della colonna, o zero se e' vuota. */
function stampColumnTop(stamp: VoxelStamp, x: number, y: number): number {
  for (let z = stamp.sizeZ - 1; z >= 0; z--) {
    const index = x + stamp.sizeX * (y + stamp.sizeY * z);
    if (stamp.voxels[index] !== STAMP_EMPTY) return z + 1;
  }
  return 0;
}

/**
 * Indice del catalizzatore che questo landmark rappresenta, o -1.
 *
 * Chiede **il ruolo e il riquadro insieme**: un ingombro largo venti colonne
 * ne contiene facilmente due, e il solo riquadro rinforzerebbe il mercato
 * accanto invece del porto che quella struttura e'.
 */
function catalystIn(
  state: SimState,
  record: BuildingRecord,
  kind: CatalystId,
  host: BuildingRecord | null,
): number {
  // Uno Skyport sta interamente fuori dalla torre: il catalizzatore, invece,
  // resta nella colonna cliccata dentro l'ospite. Per tutti gli altri landmark
  // le due impronte coincidono come prima.
  const anchor = record.aloft === true && host !== null ? host : record;
  const depth = footprintDepth(anchor);
  return state.catalysts.findIndex((catalyst) =>
    catalystRoleOf(catalyst) === kind &&
    catalyst.x >= anchor.x && catalyst.x < anchor.x + anchor.footprint &&
    catalyst.y >= anchor.y && catalyst.y < anchor.y + depth);
}

/** La sagoma minima che il pianificatore delle piattaforme legge dal registry. */
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

/** L'ingombro in pianta di una ricetta, gia' portato sul verso vero. */
function boxOf(spot: Placement): ClearanceBox {
  return { x: spot.x, y: spot.y, sizeX: spot.span.sizeX, sizeY: spot.span.sizeY };
}

/**
 * Le strisce di `newBox` fuori da `oldBox`, come rettangoli disgiunti.
 *
 * L'anello che una struttura che cresce deve sventrare non e' un rettangolo, e
 * il cantiere sgombera un riquadro per volta: lo si spezza in due fasce
 * orizzontali — sopra e sotto — piu' due verticali nella fascia centrale. L'ordine
 * non conta, i rettangoli non si toccano.
 */
export function ringStrips(oldBox: ClearanceBox, newBox: ClearanceBox): ClearanceBox[] {
  const ox0 = oldBox.x;
  const oy0 = oldBox.y;
  const ox1 = oldBox.x + oldBox.sizeX;
  const oy1 = oldBox.y + oldBox.sizeY;
  const nx0 = newBox.x;
  const ny0 = newBox.y;
  const nx1 = newBox.x + newBox.sizeX;
  const ny1 = newBox.y + newBox.sizeY;

  const out: ClearanceBox[] = [];
  const strip = (x: number, y: number, sizeX: number, sizeY: number): void => {
    if (sizeX <= 0 || sizeY <= 0) return;
    out.push({ x, y, sizeX, sizeY });
  };

  strip(nx0, ny0, nx1 - nx0, oy0 - ny0);
  strip(nx0, oy1, nx1 - nx0, ny1 - oy1);
  const top = Math.max(ny0, oy0);
  const bottom = Math.min(ny1, oy1);
  strip(nx0, top, ox0 - nx0, bottom - top);
  strip(ox1, top, nx1 - ox1, bottom - top);
  return out;
}

/** Cio' che il terreno concede a un riquadro: il piano, e dove l'opera esiste. */
interface Footing {
  readonly plan: GradePlan;
  /** Colonne che l'opera deve reggere, o `undefined` per tutta l'impronta. */
  readonly mask: WorksMask | undefined;
}

