import { BALANCE } from './balance';
import { catalystById, catalystRoleOf, type CatalystId } from './catalysts';
import { ALL_CLASSES, BUILDING_CLASS, CLASS_COUNT, type BuildingClass } from './classes';
import { charterById, type CharterId } from './charters';
import type { Catalyst } from './DesirabilityField';
import type { PolicyId } from './policies';
import { reachAt, type ReachCache } from './reach';

export type DistrictId =
  | 'outskirts'
  | 'harbor'
  | 'market'
  | 'industrial'
  | 'transit'
  | 'garden'
  | 'campus'
  | 'monumental'
  | 'mixed';

/**
 * Le sei **specializzazioni**.
 *
 * Non sono usi urbani e non entrano nel campo: sono aggettivi che si posano su
 * un uso gia' deciso, e servono a scegliere la tipologia edilizia. Un edificio
 * commerciale in un distretto ricco e accessibile diventa un ufficio; lo stesso
 * uso commerciale accanto a un monumento diventa un hotel. L'uso non e'
 * cambiato: e' cambiato cosa ci si fa dentro.
 *
 * **`farming` e' l'unica che cambia anche il bilancio**, ed e' una deroga
 * dichiarata invece di una svista: un edificio industriale che la porta e' una
 * torre idroponica, quindi produce cibo invece di materiali. Le altre cinque
 * restano quello che sono sempre state — un fatto sulla forma, non sul tick —
 * e chi legge `farming` in `tick.ts` la legge da `farmCounts`, non da qui.
 */
export type Specialization =
  | 'office'
  | 'tourism'
  | 'research'
  | 'logistics'
  | 'entertainment'
  | 'farming';

export interface LocalUrbanProfile {
  readonly district: DistrictId;
  readonly density: number;
  readonly wealth: number;
  readonly accessibility: number;
  readonly satisfaction: number;
  readonly industry: number;
  /** Ruoli sovrapposti sopra soglia, dal contributo maggiore al minore. */
  readonly roles: readonly CatalystId[];
  /**
   * Mandati che si sentono **qui**, cioe' quelli il cui portante supera la
   * stessa soglia dei ruoli.
   *
   * Nello stato i mandati sono una lista globale; nel profilo diventano un
   * fatto locale, e la tipologia legge questo campo e non lo stato. Un mandato
   * sui commerci non deve cambiare la forma di un quartiere che di commercio
   * non ne ha.
   */
  readonly charters: readonly CharterId[];
  /** Quanto ciascun uso urbano e' favorito qui, in 0..1 e per indice di uso. */
  readonly uses: readonly number[];
  /** Specializzazione emergente, o null se il luogo non ne esprime nessuna. */
  readonly specialization: Specialization | null;
}

/**
 * Cio' da cui un profilo locale dipende: catalizzatori, policy e mandati.
 *
 * E' un sottoinsieme strutturale di `SimState`, quindi chi ha lo stato lo passa
 * intero senza elencarne i campi, e chi scrive un test costruisce l'oggetto
 * minimo. Non e' un import di `SimState`: `districts.ts` non deve dipendere
 * dallo stato per calcolare una proprieta' di una colonna.
 */
export interface UrbanSources {
  readonly catalysts: readonly Catalyst[];
  readonly policies: readonly PolicyId[];
  readonly charters: readonly CharterId[];
  /**
   * Le portate dei catalizzatori, le stesse che alimentano la heatmap.
   *
   * E' obbligatoria di proposito. Con un default silenzioso alla distanza in
   * linea retta, un chiamante che se la dimenticasse otterrebbe un profilo
   * plausibile e sbagliato — cioe' esattamente il disallineamento fra distretti
   * e desiderabilita' che questo campo esiste per rendere impossibile.
   */
  readonly reach: ReachCache;
}

/**
 * Profilo locale derivato, mai serializzato. I distretti emergono quando due o
 * piu' campi di ruolo si sovrappongono; nessuna cella riceve zoning manuale.
 */
export function urbanProfileAt(
  sources: UrbanSources,
  x: number,
  y: number,
): LocalUrbanProfile {
  const { catalysts, policies, charters, reach } = sources;
  const byRole = new Map<CatalystId, number>();
  const uses = new Array<number>(CLASS_COUNT).fill(0);
  let density = 0;
  let wealth = 0;
  let accessibility = 0;
  let satisfaction = 0;
  let industry = 0;

  for (const source of catalysts) {
    if (source.radius <= 0) continue;
    // La stessa portata geodetica che scrive la heatmap, letta dalla stessa
    // cache: il profilo locale e il campo non possono piu' divergere, perche'
    // non c'e' piu' una seconda formula da tenere allineata a mano.
    const influence = reachAt(reach.get(source.x, source.y, source.radius), x, y);
    if (influence <= 0) continue;
    const id = catalystRoleOf(source);
    const definition = catalystById(id);
    byRole.set(id, (byRole.get(id) ?? 0) + influence);
    density += definition.effects.density * influence;
    wealth += definition.effects.wealth * influence;
    accessibility += definition.effects.accessibility * influence;
    satisfaction += definition.effects.satisfaction * influence;
    industry += definition.effects.industry * influence;
    // Lo stesso vettore che alimenta il campo di desiderabilita': il profilo
    // locale e la heatmap non possono raccontare due storie diverse su chi
    // favorisce cosa.
    for (const cls of ALL_CLASSES) uses[cls] += definition.influence[cls] * influence;
  }

  for (const id of policies) {
    const effect = BALANCE.districts.spatialPolicy[id];
    const carrier = policyCarrier(id, uses, byRole);
    density += ('density' in effect ? effect.density : 0) * carrier;
    wealth += ('wealth' in effect ? effect.wealth : 0) * carrier;
    accessibility += ('accessibility' in effect ? effect.accessibility : 0) * carrier;
    satisfaction += ('satisfaction' in effect ? effect.satisfaction : 0) * carrier;
    industry += ('industry' in effect ? effect.industry : 0) * carrier;
  }

  // I mandati arrivano dopo le policy e sulla stessa scala: sono lo stesso
  // genere di fatto, con la differenza che ne esiste al massimo uno per
  // famiglia e che a concederli e' stata una decisione, non un interruttore.
  const felt: CharterId[] = [];
  for (const id of charters) {
    const charter = charterById(id);
    const carrier = uses[charter.carrier];
    if (carrier >= BALANCE.districts.overlapThreshold) felt.push(id);

    const effect = BALANCE.districts.spatialCharter[id];
    density += ('density' in effect ? effect.density : 0) * carrier;
    wealth += ('wealth' in effect ? effect.wealth : 0) * carrier;
    accessibility += ('accessibility' in effect ? effect.accessibility : 0) * carrier;
    satisfaction += ('satisfaction' in effect ? effect.satisfaction : 0) * carrier;
    industry += ('industry' in effect ? effect.industry : 0) * carrier;
  }

  const roles = [...byRole.entries()]
    .filter(([, influence]) => influence >= BALANCE.districts.overlapThreshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
  const scale = BALANCE.districts.metricScale;
  const profile = {
    district: districtOf(roles),
    density: clamp01(density / scale),
    wealth: clamp01(wealth / scale),
    accessibility: clamp01(accessibility / scale),
    satisfaction: clamp01(0.5 + satisfaction / scale),
    industry: clamp01(industry / scale),
    roles,
    charters: felt,
    uses: uses.map((value) => clamp01(value)),
  };
  return { ...profile, specialization: specializationOf(profile) };
}

/**
 * Ruoli che devono essere presenti perche' una specializzazione abbia senso.
 *
 * Il catalogo sta qui e le soglie stanno in `balance.ts`, come per le policy:
 * *quali* ruoli e' una regola di gioco, *quanto in alto* e' calibrazione. Basta
 * un ruolo della lista, non tutti: un hotel nasce accanto a un monumento tanto
 * quanto accanto a un parco.
 */
const SPECIALIZATION_ROLES: Readonly<Record<Specialization, readonly CatalystId[]>> = {
  office: ['market', 'transport'],
  tourism: ['monument', 'park', 'port'],
  research: ['university'],
  logistics: ['port', 'transport', 'airport'],
  entertainment: ['monument', 'market', 'park'],
  // La torre idroponica e' industria convertita, quindi nasce dove l'industria
  // c'e' gia'. L'universita' e' l'altra meta': coltivare in verticale e' una
  // tecnica prima che un mestiere, e un campus accanto e' cio' che la spiega
  // senza aggiungere un albero tecnologico che questo gioco non ha.
  farming: ['factory', 'university'],
};

/**
 * Le specializzazioni in ordine di catalogo, per chi deve percorrerle tutte.
 *
 * **Derivata e non riscritta**, come `SURFACE_KIND_NAMES` e `PALETTE_SLOT_NAMES`:
 * un elenco a mano divergerebbe dalla tabella alla prima aggiunta, ed e'
 * esattamente cosi' che `farming` ha fatto cadere il test di copertura del
 * catalogo delle tipologie invece di esserci semplicemente dentro.
 */
export const ALL_SPECIALIZATIONS: readonly Specialization[] =
  Object.keys(SPECIALIZATION_ROLES) as Specialization[];

/**
 * Specializzazione espressa da un luogo, o null.
 *
 * Si valutano in ordine fisso e vince la prima che passa: e' un ordine di
 * specificita', dalla piu' rara alla piu' comune, non una priorita' arbitraria.
 * Senza ordine fisso lo stesso profilo darebbe tipologie diverse a seconda di
 * come e' stato iterato l'oggetto, e il determinismo cadrebbe.
 */
export function specializationOf(profile: {
  readonly wealth: number;
  readonly accessibility: number;
  readonly density: number;
  readonly satisfaction: number;
  readonly industry: number;
  readonly roles: readonly CatalystId[];
}): Specialization | null {
  const limits = BALANCE.districts.specialization;
  const near = (id: Specialization): boolean =>
    SPECIALIZATION_ROLES[id].some((role) => profile.roles.includes(role));

  // Per prima perche' e' la piu' rara: chiede la densita' piu' alta del gruppo,
  // quindi passa solo dove il suolo e' davvero finito. Messa piu' in basso,
  // `logistics` se la porterebbe via ogni volta — le sue soglie sono un terzo
  // piu' basse e i due ruoli si sovrappongono attorno a una fabbrica.
  if (near('farming') &&
    profile.density >= limits.farming.density &&
    profile.industry >= limits.farming.industry) return 'farming';

  if (near('research') &&
    profile.wealth >= limits.research.wealth &&
    profile.satisfaction >= limits.research.satisfaction) return 'research';

  if (near('logistics') &&
    profile.accessibility >= limits.logistics.accessibility &&
    profile.industry >= limits.logistics.industry) return 'logistics';

  if (near('tourism') &&
    profile.wealth >= limits.tourism.wealth &&
    profile.satisfaction >= limits.tourism.satisfaction) return 'tourism';

  if (near('entertainment') &&
    profile.density >= limits.entertainment.density &&
    profile.satisfaction >= limits.entertainment.satisfaction) return 'entertainment';

  if (near('office') &&
    profile.wealth >= limits.office.wealth &&
    profile.accessibility >= limits.office.accessibility &&
    profile.density >= limits.office.density) return 'office';

  return null;
}

/** I ruoli che aprono una specializzazione. La tabella resta privata. */
export function rolesForSpecialization(id: Specialization): readonly CatalystId[] {
  return SPECIALIZATION_ROLES[id];
}

/**
 * Le cinque metriche su cui una specializzazione pone soglie.
 *
 * Sono i nomi dei campi di `LocalUrbanProfile`, e non e' una coincidenza da
 * documentare ma la ragione per cui il referto qui sotto si **deriva** invece di
 * ricopiare `balance.ts`: la chiave della soglia e' gia' il campo da leggere.
 */
export type UrbanMetric = 'density' | 'wealth' | 'accessibility' | 'satisfaction' | 'industry';

/**
 * Cosa manca a un luogo perche' esprima una specializzazione.
 *
 * Uno per specializzazione, e **quello vincolante**: fra due soglie mancanti si
 * riporta la piu' lontana. Dire «manca la densita'» dove manca anche l'industria
 * non e' meno vero, ed e' la sola su cui agire per prima — la stessa scelta che
 * il dock fa da quando i bottoni bloccati mostrano un requisito solo.
 */
export interface SpecializationGap {
  readonly id: Specialization;
  /** La metrica corta, oppure `null` quando a mancare e' il ruolo. */
  readonly metric: UrbanMetric | null;
  /** Quanto ce n'e' e quanto ne servirebbe. Con `metric` a `null` valgono 0 e 1. */
  readonly have: number;
  readonly need: number;
  /** I ruoli che sbloccherebbero. Serve a leggere il gap di ruolo, e c'e' sempre. */
  readonly roles: readonly CatalystId[];
}

/**
 * Specializzazioni che questo luogo **non** esprime, dalla piu' vicina alla piu'
 * lontana, ognuna con la sua condizione vincolante.
 *
 * E' `specializationOf` letta all'indietro. Quella risponde *cos'e' questo
 * posto*; questa *cosa gli manca per diventare altro*, che e' la domanda che il
 * giocatore si fa davvero e che finora non aveva nessuna superficie a reggerla:
 * le diciotto soglie del gruppo non comparivano da nessuna parte, nemmeno in
 * debug.
 *
 * **Chi passa gia' tutte le soglie non compare.** Succede: l'ordine di
 * specificita' fa vincere la piu' rara, quindi un profilo che qualificherebbe
 * per `office` puo' ricevere `farming`. Riportarlo con zero gap direbbe «non
 * manca niente» di qualcosa che non accadra' comunque, ed e' peggio del silenzio.
 *
 * **L'ordinamento sta qui e non in chi disegna.** Pannello e tessera devono
 * indicare la stessa soglia vincolante, e con due ordinamenti sarebbero due.
 */
export function specializationGapsOf(profile: LocalUrbanProfile): readonly SpecializationGap[] {
  const gaps: SpecializationGap[] = [];
  for (const id of ALL_SPECIALIZATIONS) {
    if (id === profile.specialization) continue;
    const gap = bindingGapOf(profile, id);
    if (gap !== null) gaps.push(gap);
  }

  // Rapporto decrescente: chi e' quasi arrivato per primo. La parita' si rompe
  // sull'ordine di catalogo — che **non** e' quello di valutazione di
  // `specializationOf`, e qui non deve esserlo: li' l'ordine sceglie un
  // vincitore fra chi qualifica, qui serve solo perche' due luoghi identici non
  // ricevano due risposte diverse.
  return gaps.sort((a, b) => gapRatio(b) - gapRatio(a) ||
    ALL_SPECIALIZATIONS.indexOf(a.id) - ALL_SPECIALIZATIONS.indexOf(b.id));
}

/** La condizione piu' lontana fra quelle che una specializzazione chiede, o null. */
function bindingGapOf(profile: LocalUrbanProfile, id: Specialization): SpecializationGap | null {
  const roles = SPECIALIZATION_ROLES[id];

  // Il ruolo **prima** delle soglie, e non la piu' lontana fra tutte: senza un
  // ruolo in raggio le soglie non contano comunque, e mandare ad aspettare che
  // la densita' salga sarebbe mandare ad aspettare per sempre.
  if (!roles.some((role) => profile.roles.includes(role))) {
    return { id, metric: null, have: 0, need: 1, roles };
  }

  let worst: SpecializationGap | null = null;
  for (const [metric, need] of Object.entries(BALANCE.districts.specialization[id])) {
    const have = profile[metric as UrbanMetric];
    if (have >= need) continue;
    const gap: SpecializationGap = { id, metric: metric as UrbanMetric, have, need, roles };
    if (worst === null || gapRatio(gap) < gapRatio(worst)) worst = gap;
  }
  return worst;
}

/** Quanto di un requisito c'e' gia', in [0, 1]. Zero dove manca il ruolo. */
function gapRatio(gap: SpecializationGap): number {
  if (gap.need <= 0) return 1;
  return Math.min(1, Math.max(0, gap.have / gap.need));
}

/**
 * Quanto una policy si fa sentire qui.
 *
 * Ogni policy viaggia sul campo che la riguarda: la densita' abitativa si sente
 * dove ci sono case, il sussidio industriale dove ci sono fabbriche e porti. E'
 * cio' che rende una policy un fatto spaziale e non un moltiplicatore globale.
 */
function policyCarrier(
  id: PolicyId,
  uses: readonly number[],
  roles: ReadonlyMap<CatalystId, number>,
): number {
  if (id === 'denseHousing') return uses[BUILDING_CLASS.residential];
  if (id === 'industrialSubsidy') return (roles.get('factory') ?? 0) + (roles.get('port') ?? 0);
  if (id === 'austerity' || id === 'civicPride') return uses[BUILDING_CLASS.civic];
  if (id === 'greenBelt') return (roles.get('park') ?? 0) + uses[BUILDING_CLASS.residential];
  if (id === 'marketCharter') return uses[BUILDING_CLASS.commercial];
  return uses[BUILDING_CLASS.industrial];
}

/** Uso urbano piu' favorito dal profilo, con l'indice minore a rompere la parita'. */
export function dominantUse(profile: LocalUrbanProfile): BuildingClass {
  let best: BuildingClass = BUILDING_CLASS.residential;
  for (const cls of ALL_CLASSES) {
    if (profile.uses[cls] > profile.uses[best]) best = cls;
  }
  return best;
}

function districtOf(roles: readonly CatalystId[]): DistrictId {
  if (roles.length < 2) return 'outskirts';
  if (has(roles, 'port') && (has(roles, 'market') || has(roles, 'factory'))) return 'harbor';
  if (has(roles, 'university') && (has(roles, 'transport') || has(roles, 'park'))) return 'campus';
  if (has(roles, 'park') && (has(roles, 'market') || has(roles, 'monument'))) return 'garden';
  if (has(roles, 'monument') && (has(roles, 'market') || has(roles, 'transport'))) return 'monumental';
  if (has(roles, 'factory')) return 'industrial';
  if (has(roles, 'transport')) return 'transit';
  if (has(roles, 'market')) return 'market';
  return 'mixed';
}

function has(roles: readonly CatalystId[], id: CatalystId): boolean {
  return roles.includes(id);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
