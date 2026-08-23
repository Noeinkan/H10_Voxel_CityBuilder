import { urbanProfileAt, type LocalUrbanProfile, type SimState } from '../../sim';
import type { BuildingRecord } from './BuildingRegistry';
import type { AerialDriver } from './aerialDriver';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount } from './chunkBudget';
import { BUILDER, MAX_FOOTPRINT, upgradeThresholdOf } from './config';
import { generateBuilding } from './generate';
import { anchorOf } from './growthQueue';
import { allowedLevel, riseOf } from './hierarchy';
import { recordStamp } from './recordStamp';
import { buildWorks, isCoastal, surveyGrade } from './siteWorks';
import type { SpanDriver } from './spanDriver';
import { selectTypology, typologyProfile } from './typology';
import { formOf, localUpgradeDiscount } from './urbanForm';
import type { VoxelStamp } from './stamp';

/**
 * La crescita verticale: chi promuove, e cosa diventa.
 *
 * **Quando l'isola si riempie, questa e' l'unica cosa che ancora cambia.**
 * `nextBuildSites` smette di produrre candidati e la citta' puo' solo salire, il
 * che rende questa passata l'ultima leva sulla figura dello skyline.
 *
 * La passata riparte da dove si era fermata invece di ricominciare da capo: con
 * duemila edifici, rileggere il campo su tutti a ogni passata sarebbe la sola
 * cosa nel ciclo il cui costo cresce con la citta'.
 */
export class UpgradeDriver {
  private cursor = 0;
  private upgraded = 0;

  constructor(
    private readonly ctx: BuildContext,
    private readonly spans: SpanDriver,
    private readonly aerial: AerialDriver,
  ) {}

  get count(): number {
    return this.upgraded;
  }

  /**
   * Promuove al livello successivo gli edifici su cui la desiderabilita' e'
   * salita abbastanza.
   */
  pass(state: SimState): void {
    const records = [...this.ctx.registry.all];
    if (records.length === 0) return;

    const budget = Math.min(BUILDER.upgradesPerPass, records.length);
    for (let i = 0; i < budget; i++) {
      if (this.ctx.growth.queued >= BUILDER.maxGrowing) break;

      const record = records[this.cursor % records.length];
      this.cursor++;
      if (this.ctx.growth.isGrowing(record.id)) continue;
      // Un landmark cresce di stadio, non di livello, e su un altro segnale:
      // la passata dei landmark se ne occupa con la propria soglia e il proprio
      // generatore.
      if (record.landmark !== undefined) continue;
      // Una campata non ha un livello: e' l'edificio che la regge a cambiare, e
      // quando cambia lei cade con lui.
      if (record.span !== undefined) continue;
      // E la citta' in quota non ha un livello affatto: mensole, tratti, nodi e
      // gambe sono struttura, e non promuovono.
      if (record.aerial !== undefined) continue;
      // **Chi regge qualcosa di abitato non cresce.** E' una domanda sola e sta
      // qui in alto perche' risponde di no senza leggere niente; il *togliere* —
      // che e' un atto — sta in fondo, quando la promozione e' decisa.
      if (this.aerial.blocksUpgrade(record.id)) continue;
      if (record.level >= BUILDER.maxLevel) continue;

      const nextLevel = record.level + 1;
      // **Le due domande, in quest'ordine.** La gerarchia dice *fin dove* la
      // colonna puo' salire e non costa un profilo locale; la desiderabilita'
      // dice *se* questo edificio se l'e' meritato. Chiedere prima quella che
      // risponde di no piu' spesso, e senza leggere il campo, e' anche cio' che
      // tiene la passata al costo di prima su una citta' che ora ha il doppio
      // dei livelli da scalare.
      if (nextLevel > allowedLevel(this.ctx, record.x, record.y, state, riseOf(this.ctx, record))) {
        continue;
      }

      const profile = urbanProfileAt(state, record.x, record.y);
      const threshold = upgradeThresholdOf(nextLevel) - localUpgradeDiscount(formOf(profile));
      if (state.field.valueAt(record.x, record.y, record.class) <= threshold) {
        continue;
      }

      // La promozione e' decisa: **ora** le mensole vuote cadono, e la passata
      // successiva le ripropone alla quota nuova. Farlo prima le avrebbe fatte
      // oscillare a ogni edificio che la passata scarta per soglia.
      this.aerial.releaseDecks(record.id);
      this.upgrade(record, nextLevel, profile);
    }
  }

  /**
   * Sostituisce un edificio con la sua versione di livello superiore.
   *
   * Stesso seed e stesso ancoraggio, quindi la torre nuova si riconosce come la
   * vecchia cresciuta. L'impronta si allarga solo se il registry conferma che
   * l'anello aggiuntivo e' libero; altrimenti il livello nuovo viene rigenerato
   * con l'impronta vecchia come tetto, e cresce solo in altezza.
   */
  private upgrade(record: BuildingRecord, nextLevel: number, profile: LocalUrbanProfile): void {
    const { world, terrain, streets, registry, growth, surface } = this.ctx;
    // Salendo di livello la colonna puo' meritare una tipologia diversa: una
    // casa-bottega che diventa podio commerciale e' proprio il racconto che
    // questa fase deve rendere visibile.
    const nextTypology = selectTypology({
      use: record.class,
      mixed: record.mixed,
      level: nextLevel,
      profile,
      coastal: isCoastal(terrain, record.x, record.y),
    });

    const nextForm = formOf(profile);

    // Lo stamp da cancellare e' quello **registrato**, e la ragione per cui non
    // si rigenera qui sta in `recordStamp.ts`: la stessa domanda se la fa anche
    // lo sventramento, e scritta due volte divergerebbe.
    const old = recordStamp(record);

    // L'allargamento non puo' sfondare l'isolato: la fascia di base riempie
    // sempre l'impronta, e un voxel in piu' verso est finirebbe in mezzo alla
    // carreggiata. Un edificio gia' accostato al fronte ha stanza zero e cresce
    // solo in altezza — che e' anche il motivo per cui i lotti d'angolo
    // diventano le torri dell'isolato invece di allargarsi sulla strada.
    const room = this.blockRoom(record);
    let stamp = generateBuilding({
      class: record.class,
      level: nextLevel,
      seed: record.seed,
      footprintCap: Math.min(MAX_FOOTPRINT, room),
      footprintFloor: record.footprint,
      form: nextForm,
      profile: typologyProfile(nextTypology),
      shape: nextTypology.shape,
      mixed: record.mixed,
      facing: record.facing,
      baseBandHeight: record.baseBand,
    });
    if (stamp.sizeX > record.footprint && !this.fitsWider(record, stamp)) {
      stamp = generateBuilding({
        class: record.class,
        level: nextLevel,
        seed: record.seed,
        footprintCap: record.footprint,
        footprintFloor: record.footprint,
        form: nextForm,
        profile: typologyProfile(nextTypology),
        shape: nextTypology.shape,
        mixed: record.mixed,
        facing: record.facing,
        baseBandHeight: record.baseBand,
      });
    }

    if (dirtyChunkCount(record.x, record.y, stamp.sizeX, record.baseZ, record.baseZ + stamp.sizeZ) >
        BUILDER.maxDirtyChunksPerBuilding) {
      return;
    }

    // La sagoma su cui le sue campate poggiavano sta per cambiare: cadono con
    // lei, e la passata successiva le ripropone alla quota nuova. E' il vincolo
    // della 4.5 — «segue o sparisce, mai resta a mezz'aria» — e va fatto **prima**
    // di `replace`, perche' dopo il record vecchio non c'e' piu'.
    this.spans.dropSupportedBy(record.id);
    // E quelle di altri che il volume nuovo attraverserebbe: un edificio che
    // cresce in altezza vince su un ponte che gli passa davanti.
    this.spans.dropIntersecting(
      record.x, record.y, stamp.sizeX, stamp.sizeX,
      record.baseZ, record.baseZ + stamp.sizeZ,
    );

    if (stamp.sizeX > record.footprint) {
      surface.clearExpandedSiteDecor(record, stamp.sizeX);
    }

    const replaced = registry.replace(record.id, {
      x: record.x,
      y: record.y,
      baseZ: record.baseZ,
      footprint: stamp.sizeX,
      height: stamp.sizeZ,
      class: record.class,
      mixed: record.mixed,
      level: nextLevel,
      seed: record.seed,
      form: nextForm,
      typology: nextTypology.id,
      district: profile.district,
      specialization: profile.specialization,
      facing: record.facing,
      // La fila non si rinegozia a ogni livello: un membro che promuove resta lo
      // stesso membro, con la stessa quota e lo stesso zoccolo. Ricalcolarli qui
      // spezzerebbe la continuita' della fila proprio mentre cresce.
      cluster: record.cluster,
      baseBand: record.baseBand,
    });
    if (replaced === null) return;

    // La fondazione dell'anello aggiuntivo va gettata prima di salire: senza,
    // l'impronta allargata poggerebbe nel vuoto sulle colonne nuove.
    if (stamp.sizeX > record.footprint) {
      const widened = surveyGrade(terrain, record.x, record.y, stamp.sizeX);
      // La quota resta quella dell'edificio, non quella che l'opera nuova
      // proporrebbe: l'anello aggiunto deve raggiungere il piano gia' costruito,
      // e rialzare il piano sotto una torre che c'e' gia' la lascerebbe sepolta.
      if (widened !== null) {
        buildWorks(
          world, terrain, record.x, record.y, stamp.sizeX,
          { ...widened, padZ: record.baseZ },
        );
      }
    }

    surface.enqueueBlockStreets(streets.blockAt(replaced.x, replaced.y));
    growth.enqueue(replaced.id, anchorOf(replaced), stamp, old);
    this.upgraded++;
  }

  /**
   * Lato massimo che l'impronta puo' raggiungere restando dentro l'isolato.
   *
   * Non scende mai sotto l'impronta attuale: un edificio materializzato da una
   * partita salvata puo' avere l'ancora su una colonna che la rete di oggi
   * considera carreggiata, e in quel caso il riquadro dell'isolato non lo
   * contiene. Rimpicciolirlo per questo sarebbe una demolizione mascherata da
   * upgrade.
   */
  private blockRoom(record: BuildingRecord): number {
    const rect = this.ctx.streets.blockRect(this.ctx.streets.blockAt(record.x, record.y));
    return Math.max(
      record.footprint,
      Math.min(rect.x1 - record.x + 1, rect.y1 - record.y + 1),
    );
  }

  /** true se l'impronta allargata non tocca nessun altro edificio. */
  private fitsWider(record: BuildingRecord, stamp: VoxelStamp): boolean {
    const widened = surveyGrade(this.ctx.terrain, record.x, record.y, stamp.sizeX);
    if (widened === null) return false;
    if (widened.padZ > record.baseZ) return false;

    for (let dy = 0; dy < stamp.sizeX; dy++) {
      for (let dx = 0; dx < stamp.sizeX; dx++) {
        for (const other of this.ctx.registry.at(record.x + dx, record.y + dy)) {
          if (other.id === record.id) continue;
          if (other.baseZ < record.baseZ + stamp.sizeZ &&
            record.baseZ < other.baseZ + other.height) {
            return false;
          }
        }
      }
    }
    return true;
  }

}
