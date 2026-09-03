import {
  deferConstruction,
  upgradeBuilding,
  upgradeMaterialCost,
  urbanProfileAt,
  type LocalUrbanProfile,
  type SimState,
} from '../../sim';
import { envelopeOf, type BuildingRecord } from './BuildingRegistry';
import type { AerialDriver } from './aerialDriver';
import type { BuildContext } from './buildContext';
import { dirtyChunkCount } from './chunkBudget';
import { BUILDER, MAX_FOOTPRINT, typologyById, upgradeThresholdOf } from './config';
import { buildStamp, urbanFootprintCap } from './assemble';
import { withArch } from './archStamp';
import { groundSideOf } from './generate';
import { sliceStamps, type VoxelStamp } from './stamp';
import { anchorOf } from './growthQueue';
import { allowedLevel, riseOf } from './hierarchy';
import { recordStamp } from './recordStamp';
import { traitsOf } from './structureKind';
import { buildWorks, isCoastal, surveyGrade } from './siteWorks';
import type { SpanDriver } from './spanDriver';
import { selectTypology, typologyProfile } from './typology';
import { styleOf, styledProfile } from './style';
import { blockRoom, lotRoleOf } from './blockForm';
import { formOf, localUpgradeDiscount } from './urbanForm';

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
  pass(state: SimState): SimState {
    const records = [...this.ctx.registry.all];
    if (records.length === 0) return state;

    let next = state;
    const budget = Math.min(BUILDER.upgradesPerPass, records.length);
    for (let i = 0; i < budget; i++) {
      if (this.ctx.growth.queued >= BUILDER.maxGrowing) break;

      const record = records[this.cursor % records.length];
      this.cursor++;
      if (this.ctx.growth.isGrowing(record.id)) continue;
      // **Chi non promuove lo dice la tabella dei tratti**, e le quattro ragioni
      // che stavano qui sotto forma di quattro `if` stanno adesso accanto alla
      // riga che le riguarda in `structureKind.ts`: un landmark e un'arcologia
      // crescono di stadio e non di livello, una campata non ha un livello
      // perche' e' l'edificio che la regge a cambiare, e la citta' in quota non
      // ne ha affatto — mensole, tratti, nodi e gambe sono struttura.
      if (!traitsOf(record).promotes) continue;
      if (record.level >= BUILDER.maxLevel) continue;

      const nextLevel = record.level + 1;
      // **Le due domande, in quest'ordine.** La gerarchia dice *fin dove* la
      // colonna puo' salire e non costa un profilo locale; la desiderabilita'
      // dice *se* questo edificio se l'e' meritato. Chiedere prima quella che
      // risponde di no piu' spesso, e senza leggere il campo, e' anche cio' che
      // tiene la passata al costo di prima su una citta' che ora ha il doppio
      // dei livelli da scalare.
      if (nextLevel > allowedLevel(this.ctx, record.x, record.y, next, riseOf(this.ctx, record))) {
        continue;
      }

      const profile = urbanProfileAt(next, record.x, record.y);
      const threshold = upgradeThresholdOf(nextLevel) - localUpgradeDiscount(formOf(profile));
      if (next.field.valueAt(record.x, record.y, record.class) <= threshold) {
        continue;
      }

      const cost = upgradeMaterialCost(nextLevel);
      if (next.materials.stock < cost) {
        next = deferConstruction(next, cost);
        continue;
      }

      const replaced = this.upgrade(record, nextLevel, profile, next);
      if (replaced === null) continue;
      const specialization = nextTypologySpecialization(replaced);
      next = upgradeBuilding(next, {
        x: replaced.x,
        y: replaced.y,
        class: replaced.class,
        level: replaced.level,
        ...(replaced.mixed === undefined ? {} : { mixed: replaced.mixed }),
        ...(specialization === undefined ? {} : { specialization }),
      }, cost);
    }
    return next;
  }

  /**
   * Sostituisce un edificio con la sua versione di livello superiore.
   *
   * Stesso seed e stesso ancoraggio, quindi la torre nuova si riconosce come la
   * vecchia cresciuta. L'impronta si allarga solo se il registry conferma che
   * l'anello aggiuntivo e' libero; altrimenti il livello nuovo viene rigenerato
   * con l'impronta vecchia come tetto, e cresce solo in altezza.
   */
  private upgrade(
    record: BuildingRecord,
    nextLevel: number,
    profile: LocalUrbanProfile,
    state: SimState,
  ): BuildingRecord | null {
    const { world, terrain, streets, registry, growth, surface } = this.ctx;
    // Salendo di livello la colonna puo' meritare una tipologia diversa: una
    // casa-bottega che diventa podio commerciale e' proprio il racconto che
    // questa fase deve rendere visibile. La scelta e' un upgrade, quindi passa
    // la tipologia corrente: una nuova forma viene adottata solo se la sua
    // linea evolutiva la dichiara, altrimenti resta questa.
    const nextTypology = selectTypology({
      use: record.class,
      mixed: record.mixed,
      level: nextLevel,
      profile,
      coastal: isCoastal(terrain, record.x, record.y),
      // Il ruolo del lotto va ripassato, o promuovendo un angolo smetterebbe di
      // essere un angolo: la torre perderebbe lanterna e smusso al primo livello
      // in piu', che e' l'opposto di cio' che deve succedere crescendo. E' una
      // funzione pura della maglia stradale, quindi si ricalcola invece di stare
      // nel record — la rete non cambia.
      lotRole: lotRoleOf(
        this.ctx.streets.blockRect(this.ctx.streets.blockAt(record.x, record.y)),
        record.x,
        record.y,
        record.footprint,
      ),
      from: record.typology,
    });

    // La forma resta quella con cui l'edificio e' nato, come lo stile e la fila:
    // ricalcolarla a ogni promozione cambierebbe `shrinkBias` e la sagoma dei
    // piani bassi, che e' esattamente l'identita' che un upgrade deve conservare.
    const nextForm = record.form ?? formOf(profile);

    // Lo stamp da cancellare e' quello **registrato**, e la ragione per cui non
    // si rigenera qui sta in `recordStamp.ts`: la stessa domanda se la fa anche
    // lo sventramento, e scritta due volte divergerebbe.
    const old = recordStamp(record);

    // L'allargamento ha due tetti: lo spazio fisico dell'isolato e lo stesso
    // gate gerarchico della nascita. Senza il secondo, un edificio ordinario
    // poteva diventare un assemblaggio in un isolato non eletto al primo
    // upgrade, aggirando interamente `Builder.findLot`.
    // Un edificio gia' accostato al fronte ha stanza zero e cresce solo in
    // altezza — che e' anche il motivo per cui i lotti d'angolo diventano le
    // torri dell'isolato invece di allargarsi sulla strada.
    // La regola vive in `blockForm.ts` da quando la leggono in due: qui per
    // decidere se allargare, alla nascita per scegliere la tipologia d'angolo.
    const rect = this.ctx.streets.blockRect(this.ctx.streets.blockAt(record.x, record.y));
    const blockCap = riseOf(this.ctx, record) > 0
      ? MAX_FOOTPRINT
      : urbanFootprintCap(
        rect,
        (centerX, centerY) => allowedLevel(this.ctx, centerX, centerY, state),
        // Il livello a cui l'edificio sta salendo: i gradini d'impronta lo
        // guardano, perche' ci si allarga **salendo** e non appena l'isolato
        // diventerebbe idoneo. Vedi `urbanFootprintCap`.
        nextLevel,
      );
    // Un assemblaggio gia' nato non si restringe se il quartiere cambia: il
    // gate autorizza l'espansione, non riscrive la storia del record.
    const grown = Math.max(record.footprint, Math.min(blockCap, blockRoom(
      rect,
      record.x,
      record.y,
      record.footprint,
    )));
    // **Chi ha gettato un arco sale ma non si allarga**, ed e' il guinzaglio
    // piu' leggero della famiglia. Un braccio nasce da una parete a una quota
    // concordata con il dirimpettaio: allargando l'impronta quella parete si
    // sposta, il braccio resterebbe attaccato al vuoto e la meta' di fronte
    // continuerebbe a puntare dove non c'e' piu' niente. In altezza invece non
    // cambia niente — le fasce basse sono identiche a ogni livello — quindi la
    // rinuncia e' esattamente quella che serve e non una di piu'.
    const room = record.arch === undefined ? grown : record.footprint;
    // Lo stile e' quello con cui l'edificio e' nato, non quello dell'isolato di
    // adesso: un edificio che promuove resta lo stesso edificio, come restano la
    // sua quota e il suo zoccolo. E' anche cio' che tiene `old` e `stamp`
    // confrontabili — cancellare con un tessuto e riscrivere con un altro
    // lascerebbe voxel orfani.
    const style = styleOf(record.style);
    // **Lo sbalzo si decide alla nascita e non si rinegozia.** Vale la stessa
    // regola della fila e del corso di base, e la ragione e' piu' forte: un
    // edificio che mettesse fuori un balcone promuovendo dovrebbe riverificare
    // l'inviluppo, e fallendo cambierebbe sagoma sotto a chi ci si e' appoggiato.
    // La tipologia nuova puo' chiederne uno diverso; il record non gliene da'.
    const over = record.overhang ?? 0;
    let stamp = buildStamp({
      class: record.class,
      level: nextLevel,
      seed: record.seed,
      footprintCap: room,
      footprintFloor: record.footprint,
      form: nextForm,
      profile: styledProfile(typologyProfile(nextTypology), style),
      shape: { ...nextTypology.shape, overhang: over },
      mixed: record.mixed,
      facing: record.facing,
      baseBandHeight: record.baseBand,
    }, room);
    // Un assemblaggio riempie il lotto e non aggetta: lo sbalzo del record vale
    // solo su un singolo modulo. Il generatore forza `overhang` a zero sui
    // sotto-volumi, e chi misura l'impronta di suolo deve fare lo stesso —
    // altrimenti `groundSideOf` sottrae una striscia che lo stamp non ha e il
    // record diverge dalla sagoma scritta.
    let overhang = room > MAX_FOOTPRINT ? 0 : over;
    let side = groundSideOf(stamp, overhang, record.facing);
    // Il confronto e' fra **impronte**, non fra inviluppi: lo sbalzo non e' un
    // allargamento del lotto, e leggerlo come tale farebbe credere che ogni
    // edificio sporgente stia crescendo in pianta a ogni promozione.
    if (side > record.footprint && !this.fitsWider(record, side, stamp.sizeZ)) {
      stamp = buildStamp({
        class: record.class,
        level: nextLevel,
        seed: record.seed,
        footprintCap: record.footprint,
        footprintFloor: record.footprint,
        form: nextForm,
        profile: styledProfile(typologyProfile(nextTypology), style),
        shape: { ...nextTypology.shape, overhang: over },
        mixed: record.mixed,
        facing: record.facing,
        baseBandHeight: record.baseBand,
      }, record.footprint);
      overhang = record.footprint > MAX_FOOTPRINT ? 0 : over;
      side = groundSideOf(stamp, overhang, record.facing);
    }

    // **Il braccio si riscrive con il corpo, e non e' un di piu'.** `old` e' la
    // sagoma registrata, che l'arco ce l'ha: accodare un volume nuovo senza
    // braccio farebbe cancellare l'arco alla passata di erosione, che toglie
    // dalla sagoma vecchia tutto cio' che la nuova non copre.
    const written = record.arch === undefined
      ? stamp
      : withArch(stamp, record, record.arch);

    // L'impronta di suolo della sagoma nuova: e' quella che va nel record, e da
    // cui l'inviluppo si ricava.
    const env = envelopeOf({
      x: record.x, y: record.y, footprint: side, overhang, facing: record.facing,
      arch: record.arch,
    });

    // Un assemblaggio supera `segmentSide` in pianta e compare a ritagli: il tetto
    // di chunk va verificato per ritaglio, come alla nascita. Un singolo modulo
    // resta sul conto intero di sempre.
    const overBudget = side > MAX_FOOTPRINT
      ? this.stampExceedsBudget(record, written)
      : dirtyChunkCount(env.x, env.y, env.sizeX, record.baseZ, record.baseZ + written.sizeZ,
        env.sizeY) > BUILDER.maxDirtyChunksPerBuilding;
    if (overBudget) return null;

    // **Chi regge cresce, se la parete regge ancora.** La domanda che stava a
    // monte della passata — «questo edificio porta qualcosa?» — si poteva fare
    // senza leggere niente, ed e' per questo che stava li'; ma rispondeva di no
    // anche a una torre che sarebbe salita benissimo, perche' i piani bassi sono
    // identici a ogni livello e il muro a cui l'impalcato e' appeso e' quasi
    // sempre ancora li'. La domanda giusta e' geometrica, quindi si puo' porre
    // soltanto qui, dove la sagoma nuova esiste: costa un `buildStamp` speso per
    // un rifiuto, e lo spende soltanto chi porta qualcosa.
    //
    // E' anche l'ultimo punto in cui questa promozione puo' ancora rinunciare:
    // `reseat` **scrive** — le mensole che la sagoma nuova non regge piu' cadono
    // qui — quindi tutto cio' che sa dire di no senza leggere sta sopra.
    const anchor = anchorOf(record);
    if (!this.aerial.reseat(record.id, anchor, old, written)) return null;

    // La sagoma su cui le sue campate poggiavano sta per cambiare: cadono con
    // lei, e la passata successiva le ripropone alla quota nuova. E' il vincolo
    // della 4.5 — «segue o sparisce, mai resta a mezz'aria» — e va fatto **prima**
    // di `replace`, perche' dopo il record vecchio non c'e' piu'.
    this.spans.dropSupportedBy(record.id);
    // E quelle di altri che il volume nuovo attraverserebbe: un edificio che
    // cresce in altezza vince su un ponte che gli passa davanti.
    this.spans.dropIntersecting(
      env.x, env.y, env.sizeX, env.sizeY,
      record.baseZ, record.baseZ + written.sizeZ,
    );

    // Il decoro si bonifica sotto l'**impronta**: sotto lo sbalzo non c'e' niente
    // da liberare, perche' li' l'edificio non poggia.
    if (side > record.footprint) {
      surface.clearExpandedSiteDecor(record, side);
    }

    const replaced = registry.replace(record.id, {
      x: record.x,
      y: record.y,
      baseZ: record.baseZ,
      footprint: side,
      height: stamp.sizeZ,
      class: record.class,
      mixed: record.mixed,
      level: nextLevel,
      seed: record.seed,
      form: nextForm,
      typology: nextTypology.id,
      style: record.style,
      overhang: overhang > 0 ? overhang : undefined,
      // Il braccio viaggia con il record come la fila e il corso di base: e' un
      // patto con il dirimpettaio, e una promozione non lo rinegozia.
      arch: record.arch,
      district: profile.district,
      specialization: profile.specialization,
      facing: record.facing,
      // La fila non si rinegozia a ogni livello: un membro che promuove resta lo
      // stesso membro, con la stessa quota e lo stesso zoccolo. Ricalcolarli qui
      // spezzerebbe la continuita' della fila proprio mentre cresce.
      cluster: record.cluster,
      baseBand: record.baseBand,
    });
    if (replaced === null) return null;

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
    if (side > MAX_FOOTPRINT) {
      // Un assemblaggio compare a ritagli; la sagoma vecchia e' tutta coperta
      // dalla nuova (stesso seme, stessa impronta, piu' alta), quindi non c'e'
      // niente da cancellare oltre ai ritagli che si scrivono.
      //
      // **E il braccio non si riscrive**, per la stessa ragione: senza
      // cancellazione i suoi voxel restano quelli che sono, e il ritaglio non
      // deve nemmeno portarseli dietro. E' anche il ramo in cui non potrebbe:
      // `enqueueSegments` ancora i ritagli all'angolo del record, e un braccio
      // sulle facce 1 o 3 sposta l'ancora della sagoma.
      growth.enqueueSegments(replaced, stamp);
    } else {
      growth.enqueue(replaced.id, anchorOf(replaced), written, old);
    }
    this.upgraded++;
    return replaced;
  }

  /**
   * true se uno dei ritagli di un assemblaggio sfora il tetto di chunk sporchi.
   *
   * E' la meta' del controllo di `fitsChunkBudget` che riguarda la sagoma: la
   * fondazione qui non si riscrive (stessa impronta), quindi basta verificare che
   * ogni ritaglio — che compare da solo — stia dentro il budget.
   */
  private stampExceedsBudget(record: BuildingRecord, stamp: VoxelStamp): boolean {
    for (const slice of sliceStamps(stamp, BUILDER.segmentSide)) {
      const count = dirtyChunkCount(
        record.x + slice.offsetX,
        record.y + slice.offsetY,
        slice.stamp.sizeX,
        record.baseZ,
        record.baseZ + slice.stamp.sizeZ,
        slice.stamp.sizeY,
      );
      if (count > BUILDER.maxDirtyChunksPerBuilding) return true;
    }
    return false;
  }

  /**
   * true se l'impronta allargata non tocca nessun altro edificio.
   *
   * **Il terreno si sonda sull'impronta, i vicini sull'inviluppo**, e le due cose
   * vanno tenute separate: sondare il terreno sotto lo sbalzo chiederebbe una
   * fondazione per dell'aria sopra il marciapiede, mentre cercare i vicini sulla
   * sola impronta lascerebbe fuori le colonne in cui lo sbalzo **si sposta**
   * crescendo. E' quest'ultimo il caso che si e' visto: l'aggetto non si allarga
   * mai, ma se il nucleo cresce di due la striscia trasla di due, e va a finire
   * su colonne che nessuno aveva guardato.
   */
  private fitsWider(record: BuildingRecord, side: number, height: number): boolean {
    const widened = surveyGrade(this.ctx.terrain, record.x, record.y, side);
    if (widened === null) return false;
    if (widened.padZ > record.baseZ) return false;

    const env = envelopeOf({
      x: record.x,
      y: record.y,
      footprint: side,
      overhang: record.overhang,
      facing: record.facing,
    });
    for (let dy = 0; dy < env.sizeY; dy++) {
      for (let dx = 0; dx < env.sizeX; dx++) {
        for (const other of this.ctx.registry.at(env.x + dx, env.y + dy)) {
          if (other.id === record.id) continue;
          if (other.baseZ < record.baseZ + height &&
            record.baseZ < other.baseZ + other.height) {
            return false;
          }
        }
      }
    }
    return true;
  }

}

function nextTypologySpecialization(record: BuildingRecord) {
  return record.typology === undefined ? undefined : typologyById(record.typology)?.specialization;
}
