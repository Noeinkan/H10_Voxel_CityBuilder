import type { BuildingClass, LocalUrbanProfile, UrbanMetric } from '../../sim';
import {
  TYPOLOGIES,
  typologyById,
  type ClassProfile,
  type LotRole,
  type TypologyDefinition,
  type TypologyShape,
} from './config';
import { CLASS_PROFILE } from './config';

/**
 * Scelta della tipologia edilizia.
 *
 * **Non contiene numeri e non contiene forme.** Il catalogo sta in `config.ts`,
 * la grammatica che disegna i voxel sta in `generate.ts`: qui c'e' solo la
 * regola che mette in relazione un luogo e una riga del catalogo. Aggiungere
 * una tipologia e' quindi aggiungere una riga, non modificare questa funzione.
 *
 * **Deterministico e senza PRNG.** A parita' di uso, profilo locale, livello e
 * costa la risposta e' sempre la stessa: la tipologia e' cio' che rende
 * leggibile il rapporto fra luogo e forma, e un tiro di dado lo cancellerebbe.
 * La varieta' resta dove stava — nella grammatica delle fasce, che e' seminata
 * dalla colonna.
 *
 * **Trova sempre una risposta.** Ogni uso chiude il catalogo con una riga senza
 * condizioni e a priorita' zero, quindi la ricerca non puo' fallire e nessun
 * chiamante ha un ramo "nessuna tipologia" da gestire.
 */

export interface TypologyQuery {
  readonly use: BuildingClass;
  /** Secondo uso ospitato, se l'edificio e' misto. */
  readonly mixed?: BuildingClass;
  readonly level: number;
  readonly profile: LocalUrbanProfile | null;
  /** true se la colonna affaccia sul mare entro `BUILDER.coastalRadius`. */
  readonly coastal: boolean;
  /**
   * Dove il lotto cade dentro il proprio isolato, quando un lotto c'e'.
   *
   * Assente per chi chiede una forma senza un posto — una scena di prova, la
   * rigenerazione di ripiego — e in quel caso le righe che lo dichiarano non
   * qualificano. Non e' una condizione «sul luogo» nel senso di `demandsPlace`:
   * quello parla del profilo della simulazione, che puo' mancare, mentre la
   * maglia stradale c'e' sempre.
   */
  readonly lotRole?: LotRole;
}

/** Tipologia piu' specifica fra quelle che il luogo accetta. */
export function selectTypology(query: TypologyQuery): TypologyDefinition {
  let best: TypologyDefinition | null = null;

  for (const candidate of TYPOLOGIES) {
    if (!accepts(candidate, query)) continue;
    // A parita' di priorita' vince la prima del catalogo: l'ordine di lettura e'
    // parte del contratto, come per le policy.
    if (best !== null && candidate.priority <= best.priority) continue;
    best = candidate;
  }

  if (best === null) {
    // Il catalogo garantisce un fallback per uso; se manca e' il catalogo a
    // essere rotto, e va detto qui invece di produrre un edificio senza forma.
    throw new Error(`no fallback typology for use ${query.use}`);
  }
  return best;
}

/**
 * Se una riga di catalogo qualifica qui.
 *
 * Esportata per una ragione sola: e' il termine di paragone di `typologyGapsOf`,
 * e senza poterla interrogare direttamente il test di equivalenza potrebbe
 * confrontare solo il vincitore — lasciando passare una riga di priorita' bassa
 * dichiarata idonea per sbaglio, che e' esattamente il caso in cui
 * `bestProspectOf` smetterebbe di nominarla.
 */
export function typologyAccepts(candidate: TypologyDefinition, query: TypologyQuery): boolean {
  return accepts(candidate, query);
}

function accepts(candidate: TypologyDefinition, query: TypologyQuery): boolean {
  if (candidate.use !== query.use) return false;
  if (candidate.mixed !== undefined && candidate.mixed !== query.mixed) return false;
  if (candidate.minLevel !== undefined && query.level < candidate.minLevel) return false;
  if (candidate.coastal === true && !query.coastal) return false;
  if (candidate.lotRole !== undefined && candidate.lotRole !== query.lotRole) return false;

  const profile = query.profile;
  if (profile === null) {
    // Senza profilo locale restano ammesse solo le tipologie che non chiedono
    // niente al luogo: e' il caso del piazzamento fuori simulazione, dove
    // inventare un profilo darebbe forme che nessun catalizzatore giustifica.
    return !demandsPlace(candidate);
  }

  if (candidate.specialization !== undefined && profile.specialization !== candidate.specialization) {
    return false;
  }
  if (candidate.roles !== undefined && !candidate.roles.some((role) => profile.roles.includes(role))) {
    return false;
  }
  // Il mandato si legge dal profilo, non dallo stato: una tipologia concessa da
  // una decisione compare dove quella decisione si sente, non su tutta l'isola.
  if (candidate.charter !== undefined && !candidate.charter.some(
    (id) => profile.charters.includes(id),
  )) {
    return false;
  }
  if (candidate.districts !== undefined && !candidate.districts.includes(profile.district)) {
    return false;
  }
  if (candidate.minDensity !== undefined && profile.density < candidate.minDensity) return false;
  if (candidate.maxDensity !== undefined && profile.density > candidate.maxDensity) return false;
  if (candidate.minWealth !== undefined && profile.wealth < candidate.minWealth) return false;
  if (candidate.minAccessibility !== undefined && profile.accessibility < candidate.minAccessibility) {
    return false;
  }
  if (candidate.minSatisfaction !== undefined && profile.satisfaction < candidate.minSatisfaction) {
    return false;
  }
  if (candidate.minIndustry !== undefined && profile.industry < candidate.minIndustry) return false;
  return true;
}

/**
 * Perche' una tipologia non puo' comparire qui.
 *
 * `accepts` risponde *se*, questa *perche' no* — ed e' la meta' che mancava:
 * fino a ora il gioco sapeva rifiutare una forma senza avere nessun modo di dire
 * cosa le mancasse, quindi il giocatore vedeva l'esito e mai la condizione.
 *
 * **Le due traversate restano due, e non e' una svista.** `accepts` sta nel
 * percorso caldo — `selectTypology` scorre l'intero catalogo per ogni edificio
 * posato — e restituire un vettore li' allocherebbe a ogni posa. A tenerle
 * d'accordo e' il test di equivalenza su tutto il catalogo, non la disciplina di
 * chi le modifica: e' il primo posto in cui guardare se una delle due cambia.
 *
 * L'ordine dei gap e' quello in cui `accepts` li incontra, cioe' dal cancello
 * piu' grossolano al piu' fine. Chi ne mostra uno solo mostra percio' il piu'
 * generale, che e' anche quello da risolvere per primo.
 */
export type TypologyGapKind =
  | 'use'
  | 'mixed'
  | 'level'
  | 'coastal'
  | 'lotRole'
  | 'place'
  | 'specialization'
  | 'roles'
  | 'charter'
  | 'district'
  | 'metric';

export interface TypologyGap {
  readonly kind: TypologyGapKind;
  /** La metrica del profilo, sui soli gap di soglia. */
  readonly metric?: UrbanMetric;
  /** Quanto ce n'e' e quanto ne vuole la riga: soglie e livello. */
  readonly have?: number;
  readonly need?: number;
  /** `max` dove la soglia e' un tetto invece che un minimo. */
  readonly bound?: 'min' | 'max';
  /** Cio' che la riga pretende, dove e' un nome e non un numero. */
  readonly wants?: readonly string[];
}

/**
 * Le soglie numeriche di una riga di catalogo, per chi le deve **spiegare**.
 *
 * E' l'unico punto di questo file che ripete la forma di `accepts` invece di
 * derivarla, e la ragione e' la stessa per cui `accepts` non e' stata riscritta:
 * quella funzione confronta campi inlineati perche' e' calda. La ripetizione la
 * copre il test di equivalenza, che percorre ogni riga del catalogo.
 */
const METRIC_LIMITS: readonly {
  readonly field: keyof TypologyDefinition;
  readonly metric: UrbanMetric;
  readonly bound: 'min' | 'max';
}[] = [
  { field: 'minDensity', metric: 'density', bound: 'min' },
  { field: 'maxDensity', metric: 'density', bound: 'max' },
  { field: 'minWealth', metric: 'wealth', bound: 'min' },
  { field: 'minAccessibility', metric: 'accessibility', bound: 'min' },
  { field: 'minSatisfaction', metric: 'satisfaction', bound: 'min' },
  { field: 'minIndustry', metric: 'industry', bound: 'min' },
];

/** Cosa manca a questo luogo perche' la riga qualifichi. Vuoto se qualifica. */
export function typologyGapsOf(
  candidate: TypologyDefinition,
  query: TypologyQuery,
): readonly TypologyGap[] {
  const gaps: TypologyGap[] = [];

  if (candidate.use !== query.use) gaps.push({ kind: 'use' });
  if (candidate.mixed !== undefined && candidate.mixed !== query.mixed) gaps.push({ kind: 'mixed' });
  if (candidate.minLevel !== undefined && query.level < candidate.minLevel) {
    gaps.push({ kind: 'level', have: query.level, need: candidate.minLevel, bound: 'min' });
  }
  if (candidate.coastal === true && !query.coastal) gaps.push({ kind: 'coastal' });
  if (candidate.lotRole !== undefined && candidate.lotRole !== query.lotRole) {
    gaps.push({ kind: 'lotRole' });
  }

  const profile = query.profile;
  if (profile === null) {
    // Senza profilo non si puo' dire *quale* condizione cade, solo che ce ne
    // sono: e' il piazzamento fuori simulazione, e inventare un requisito
    // preciso sarebbe peggio del dire che il luogo non si conosce.
    if (demandsPlace(candidate)) gaps.push({ kind: 'place' });
    return gaps;
  }

  if (candidate.specialization !== undefined && profile.specialization !== candidate.specialization) {
    gaps.push({ kind: 'specialization', wants: [candidate.specialization] });
  }
  if (candidate.roles !== undefined && !candidate.roles.some((role) => profile.roles.includes(role))) {
    gaps.push({ kind: 'roles', wants: candidate.roles });
  }
  if (candidate.charter !== undefined && !candidate.charter.some(
    (id) => profile.charters.includes(id),
  )) {
    gaps.push({ kind: 'charter', wants: candidate.charter });
  }
  if (candidate.districts !== undefined && !candidate.districts.includes(profile.district)) {
    gaps.push({ kind: 'district', wants: candidate.districts });
  }

  for (const limit of METRIC_LIMITS) {
    const need = candidate[limit.field];
    if (typeof need !== 'number') continue;
    const have = profile[limit.metric];
    if (limit.bound === 'min' ? have >= need : have <= need) continue;
    gaps.push({ kind: 'metric', metric: limit.metric, have, need, bound: limit.bound });
  }

  return gaps;
}

/** Una tipologia che il luogo non raggiunge, e cosa le manca. */
export interface TypologyProspect {
  readonly definition: TypologyDefinition;
  readonly gaps: readonly TypologyGap[];
}

/**
 * La tipologia piu' specifica che questo luogo **non** raggiunge, con cosa le manca.
 *
 * E' `selectTypology` allo specchio: quella cerca il massimo di priorita' fra
 * chi qualifica, questa fra chi no. Insieme rispondono alle due meta' della
 * domanda che il giocatore si fa davanti a un isolato — cosa c'e', e cosa
 * potrebbe esserci.
 *
 * **Cio' che non e' un gesto non entra.** Che una forma voglia un angolo
 * dell'isolato, o un secondo uso ospitato, non e' qualcosa su cui il giocatore
 * possa agire: nominarlo lo manderebbe a cercare una mossa che non esiste, ed e'
 * il difetto opposto a quello che questa superficie corregge.
 */
const UNREACHABLE: readonly TypologyGapKind[] = ['lotRole', 'mixed'];

export function bestProspectOf(query: TypologyQuery): TypologyProspect | null {
  let best: TypologyProspect | null = null;

  for (const candidate of TYPOLOGIES) {
    if (candidate.use !== query.use) continue;
    // A parita' di priorita' vince la prima del catalogo, come in `selectTypology`.
    if (best !== null && candidate.priority <= best.definition.priority) continue;

    const gaps = typologyGapsOf(candidate, query);
    if (gaps.length === 0) continue;
    if (gaps.some((gap) => UNREACHABLE.includes(gap.kind))) continue;
    best = { definition: candidate, gaps };
  }

  return best;
}

/** true se la tipologia pone almeno una condizione sul luogo. */
function demandsPlace(candidate: TypologyDefinition): boolean {
  return candidate.specialization !== undefined ||
    candidate.roles !== undefined ||
    candidate.charter !== undefined ||
    candidate.districts !== undefined ||
    candidate.minDensity !== undefined ||
    candidate.maxDensity !== undefined ||
    candidate.minWealth !== undefined ||
    candidate.minAccessibility !== undefined ||
    candidate.minSatisfaction !== undefined ||
    candidate.minIndustry !== undefined;
}

/**
 * Profilo di disegno di una tipologia: quello del suo uso, con sopra cio' che
 * la tipologia sovrascrive.
 *
 * La fusione avviene qui e non in `generate.ts` perche' il generatore non deve
 * sapere che le tipologie esistono: riceve un profilo completo e disegna.
 */
export function typologyProfile(definition: TypologyDefinition): ClassProfile {
  return { ...CLASS_PROFILE[definition.use], ...definition.profile };
}

/** Forma strutturale della tipologia indicata, o null se l'id non e' nel catalogo. */
export function typologyShape(id: string): TypologyShape | null {
  return typologyById(id)?.shape ?? null;
}

/**
 * Tipologie che un ruolo puo' far nascere **dal solo uso**, per il tooltip.
 *
 * Risponde alla domanda che il giocatore si fa prima del click — «cosa vedro'
 * comparire qui» — con i nomi del catalogo, non con una spiegazione a parole.
 *
 * **Chi dipende da una specializzazione non e' piu' qui.** Era la meta' che
 * rendeva questo elenco una promessa invece di una previsione: una torre
 * idroponica compariva accanto a ogni ruolo che favorisse l'industria, mentre
 * per vederla servono anche un quartiere agricolo e il livello cinque. Quelle
 * righe ora passano da `unlocksFor`, che le nomina **con la loro condizione**;
 * qui resta cio' che il solo uso basta a spiegare, e l'elenco e' finalmente
 * vero senza note a pie' di pagina.
 */
export function typologiesForUses(uses: readonly BuildingClass[]): readonly string[] {
  const out: string[] = [];
  for (const use of uses) {
    for (const candidate of TYPOLOGIES) {
      if (candidate.use !== use || candidate.priority === 0) continue;
      if (candidate.specialization !== undefined) continue;
      if (out.includes(candidate.label)) continue;
      out.push(candidate.label);
    }
  }
  return out;
}
