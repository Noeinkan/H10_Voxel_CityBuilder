import type { BuildingClass, LocalUrbanProfile } from '../../sim';
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
 * Tipologie che un ruolo puo' far nascere, per il tooltip di piazzamento.
 *
 * Risponde alla domanda che il giocatore si fa prima del click — "cosa vedro'
 * comparire qui" — con i nomi del catalogo, non con una spiegazione a parole.
 * E' un'approssimazione onesta: elenca le tipologie degli usi che il ruolo
 * favorisce, non quelle che le soglie locali confermeranno.
 */
export function typologiesForUses(uses: readonly BuildingClass[]): readonly string[] {
  const out: string[] = [];
  for (const use of uses) {
    for (const candidate of TYPOLOGIES) {
      if (candidate.use !== use || candidate.priority === 0) continue;
      if (out.includes(candidate.label)) continue;
      out.push(candidate.label);
    }
  }
  return out;
}
