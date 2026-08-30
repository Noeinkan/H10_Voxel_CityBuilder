import type { BuildingClass } from '../../sim';
import {
  ARCOLOGY,
  ARCOLOGY_RECIPES,
  arcologyOf,
  type ArcologyKind,
} from './config';
import {
  arcologyQuota,
  type ArcologyQuery,
  type ArcologyRefusal,
  type SunkenQuery,
} from './siting';

/**
 * Quanto manca, invece del solo perche' no.
 *
 * **`siting.ts` risponde al driver, questo risponde al giocatore**, ed e' una
 * domanda diversa abbastanza da meritare un file. `arcologyReady` restituisce il
 * *primo* motivo e si ferma li': e' esattamente cio' che serve a una passata che
 * scarta un isolato e passa al successivo, e non serve a niente a chi vuole
 * sapere se la citta' si sta avvicinando. `notCapped` non distingue «uno su due»
 * da «zero su due», e sono due partite diverse.
 *
 * **Le soglie restano in `ARCOLOGY`.** Qui non si scrive un numero: si legge lo
 * stesso `ARCOLOGY.minBuilt` che il predicato legge, perche' due misure per la
 * stessa domanda divergono alla prima ritaratura — e' la lezione dei due raggi di
 * `isCoastal`, dove il cursore prometteva una forma che il Builder poi rifiutava.
 *
 * **Le lacune sono in ordine di predicato, e non e' un dettaglio.** La prima di
 * questo elenco e' sempre quella che `arcologyReady` restituirebbe, e un test lo
 * verifica in tutte e due le direzioni: e' cio' che permette a un pannello di
 * mostrare l'elenco intero senza che la sua testa dica una cosa diversa
 * dall'overlay di debug, che il rifiuto lo legge dal driver.
 */

/**
 * Una condizione non ancora soddisfatta.
 *
 * `have` e `need` sono opzionali per lo stesso motivo per cui lo sono su
 * `TypologyGap`: qualche domanda e' booleana — il contorno del pozzo e' asciutto
 * o non lo e' — e stampare `0/1` accanto a una di quelle insegnerebbe a saltare
 * la riga. Il numero c'e' dove misura qualcosa che il giocatore puo' vedere salire.
 */
export interface ArcologyGap {
  readonly refusal: ArcologyRefusal;
  readonly have?: number;
  readonly need?: number;
}

/**
 * Il miglior candidato che una passata ha visto, e quanto gli manca.
 *
 * Porta l'ancora perche' la voce possa **indicarlo** — l'anello di `place` su
 * `CoachSuggestion` — invece di dire «da qualche parte nel centro»: e' la stessa
 * differenza fra un consiglio e una diagnosi che il coach fa valere ovunque.
 */
export interface ArcologyProspect {
  /** Ancora dell'isolato: il centro, come la sceglie `arcologyAnchor`. */
  readonly x: number;
  readonly y: number;
  readonly kind: ArcologyKind;
  readonly gaps: readonly ArcologyGap[];
}

/**
 * Cosa la citta' ammette adesso, piu' il candidato se ce n'e' uno.
 *
 * **Le due meta' stanno separate perche' hanno vite diverse.** La quota e' vera
 * sempre e ovunque — si legge dagli edifici totali — mentre un candidato esiste
 * solo se la passata ne ha guardato uno, e a isola piena non ne guarda nessuno:
 * e' proprio il caso in cui il giocatore ha piu' bisogno di sapere quanto manca
 * alla prossima, e infilarlo dentro un `prospect` nullo lo avrebbe perso.
 */
export interface ArcologyStanding {
  /** Arcologie che la citta' ammette adesso, e quante ne ha in piedi. */
  readonly allowed: number;
  readonly existing: number;
  /** Edifici totali, e la soglia a cui la quota sale di uno. */
  readonly buildings: number;
  readonly nextQuotaAt: number;
  readonly prospect: ArcologyProspect | null;
}

/** Cosa la citta' ammette, dai suoi edifici e da quante ne ha gia'. */
export function arcologyStanding(
  buildings: number,
  existing: number,
  prospect: ArcologyProspect | null,
): ArcologyStanding {
  return {
    allowed: arcologyQuota(buildings),
    existing,
    buildings,
    nextQuotaAt: nextQuotaAt(existing),
    prospect,
  };
}

/**
 * Gli edifici a cui la citta' guadagna l'arcologia dopo quelle che ha.
 *
 * Derivato da `arcologyQuota` invertita, non riscritto: la quota e'
 * `max(2, ceil(edifici / buildingsPerArcology))`, quindi per ammetterne una in
 * piu' di quelle esistenti servono `existing * buildingsPerArcology + 1`
 * edifici. E' l'unico numero di questo dominio che dice al giocatore «continua
 * cosi'» invece di «non ancora», ed e' il motivo per cui `enough` ne porta uno.
 */
export function nextQuotaAt(existing: number): number {
  return existing * ARCOLOGY.buildingsPerArcology + 1;
}

/**
 * Gli usi che una ricetta ospita, in ordine di stadio e senza ripetizioni.
 *
 * **E' la ricompensa, e finora non era scritta da nessuna parte.** Il giocatore
 * poteva leggere che un'arcologia «non nasce ancora» senza sapere cosa
 * guadagnerebbe se nascesse — cioe' gli si chiedeva di lavorare per una cosa
 * senza dirgli quale. Si ricava dal catalogo e non da una frase: aggiungere una
 * fascia a una ricetta cambia la promessa da solo.
 */
export function arcologyUses(kind: ArcologyKind): readonly BuildingClass[] {
  const seen = new Set<BuildingClass>();
  const out: BuildingClass[] = [];
  for (const band of arcologyOf(kind).bands) {
    if (seen.has(band.use)) continue;
    seen.add(band.use);
    out.push(band.use);
  }
  return out;
}

/**
 * Cosa il catalogo sa promettere, per quando non c'e' ancora un candidato.
 *
 * La ricetta piu' ricca, non la media: e' la promessa, e una promessa si fa sul
 * meglio che puo' capitare. Deriva dalle ricette, quindi non puo' invecchiare.
 */
export const ARCOLOGY_PROMISE: {
  readonly uses: readonly BuildingClass[];
  readonly bands: number;
} = (() => {
  let best: ArcologyKind = ARCOLOGY_RECIPES[0].kind;
  for (const recipe of ARCOLOGY_RECIPES) {
    if (recipe.bands.length > arcologyOf(best).bands.length) best = recipe.kind;
  }
  return { uses: arcologyUses(best), bands: arcologyOf(best).bands.length };
})();

/** Le condizioni che la famiglia che sale non ha ancora soddisfatto. */
export function arcologyGaps(query: ArcologyQuery): readonly ArcologyGap[] {
  const out: ArcologyGap[] = [];
  pushQuota(out, query);
  pushCommon(out, query);
  return out;
}

/** Le condizioni che la famiglia che scava non ha ancora soddisfatto. */
export function sunkenGaps(query: SunkenQuery): readonly ArcologyGap[] {
  const out: ArcologyGap[] = [];
  pushQuota(out, query);
  if (!query.dryRim) {
    // **Senza il contorno asciutto la profondita' non e' la ragione**, e citarla
    // manderebbe a cercare roccia dove il problema e' l'acqua. Stesso rifiuto,
    // perche' il predicato ne ha uno solo, ma senza i due numeri.
    out.push({ refusal: 'tooShallow' });
  } else if (query.availableDepth < query.requiredDepth) {
    out.push({
      refusal: 'tooShallow',
      have: query.availableDepth,
      need: query.requiredDepth,
    });
  }
  pushCommon(out, query);
  return out;
}

/** La quota: l'unica domanda che le due famiglie fanno per prima, identica. */
function pushQuota(out: ArcologyGap[], query: ArcologyQuery): void {
  if (query.existing < arcologyQuota(query.buildings)) return;
  out.push({
    refusal: 'enough',
    have: query.buildings,
    need: nextQuotaAt(query.existing),
  });
}

/**
 * Le tre domande comuni, nell'ordine di `commonRefusal`.
 *
 * L'ingombro riporta il **solo asse che manca per primo**, come il predicato:
 * dire «largo 18 su 20» e «profondo 18 su 20» insieme sarebbe due righe per un
 * rifiuto che ne ha una, e non aggiungerebbe un gesto.
 */
function pushCommon(out: ArcologyGap[], query: ArcologyQuery): void {
  const { blockRect } = query;
  const width = blockRect.x1 - blockRect.x0 + 1;
  const depth = blockRect.y1 - blockRect.y0 + 1;
  if (width < query.spanX) {
    out.push({ refusal: 'blockTooSmall', have: width, need: query.spanX });
  } else if (depth < query.spanY) {
    out.push({ refusal: 'blockTooSmall', have: depth, need: query.spanY });
  }

  if (query.builtNeighbours < ARCOLOGY.minBuilt) {
    out.push({
      refusal: 'thin',
      have: query.builtNeighbours,
      need: ARCOLOGY.minBuilt,
    });
  }
  if (query.cappedNeighbours < ARCOLOGY.minCapped) {
    out.push({
      refusal: 'notCapped',
      have: query.cappedNeighbours,
      need: ARCOLOGY.minCapped,
    });
  }
}

/**
 * Negativo se `a` e' piu' vicino di `b` a diventare un'arcologia.
 *
 * **Prima quante ne mancano, poi quanto manca alla prima.** Un isolato a cui
 * resta la sola densita' e' piu' avanti di uno che deve ancora diventare centro,
 * quale che sia il conteggio; a parita' di lacune decide la piu' vicina, che e'
 * anche quella di cui la voce parlera'. Le domande booleane valgono zero: non si
 * avvicinano, cambiano.
 */
export function compareProspects(a: ArcologyProspect, b: ArcologyProspect): number {
  if (a.gaps.length !== b.gaps.length) return a.gaps.length - b.gaps.length;
  return shareOf(b.gaps[0]) - shareOf(a.gaps[0]);
}

/** Quanta parte della prima lacuna e' gia' colmata, in [0, 1]. */
export function prospectProgress(prospect: ArcologyProspect): number {
  return prospect.gaps.length === 0 ? 1 : shareOf(prospect.gaps[0]);
}

function shareOf(gap: ArcologyGap | undefined): number {
  if (gap === undefined) return 1;
  if (gap.have === undefined || gap.need === undefined || gap.need <= 0) return 0;
  return Math.min(1, Math.max(0, gap.have / gap.need));
}
