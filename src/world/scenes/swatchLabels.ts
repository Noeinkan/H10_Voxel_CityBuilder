import { CLASS_NAMES } from '../../sim/classes';
import {
  VISUAL_LEVELS,
  typologyById,
  type TypologyDefinition,
  type TypologyShape,
} from '../buildings/config';
import { ARCOLOGY_KIND, type ArcologyKind } from '../arcology/config';
import type { LandmarkFormId } from '../landmarks/config';
import { WATER_CLASS } from '../visualBlock';

/**
 * Le parole della scheda del campionario.
 *
 * **Sta fuori da `swatchCatalog.ts` perche' e' un'altra responsabilita'**: il
 * catalogo decide *quali* soggetti esistono e dove stanno, questo file decide
 * *come si leggono*. Tenerli insieme faceva crescere il catalogo su due assi
 * indipendenti, e il secondo — le condizioni di una tipologia — e' quello che
 * cambia ogni volta che qualcuno aggiunge un campo al requisito.
 *
 * **Perche' le condizioni si scrivono per intero.** La riga «Requires» prima
 * mostrava cinque campi su quindici: una tipologia concessa da un mandato o da
 * una soglia di ricchezza compariva nel campionario come se non chiedesse
 * niente, e il campionario e' proprio il posto in cui si va a chiedere *perche'*
 * quella forma non nasce mai in partita. Ogni campo del requisito ha qui la sua
 * parola.
 *
 * Tutte le stringhe sono in inglese: sono visibili a schermo.
 */

export const FORM_LABELS: Readonly<Record<LandmarkFormId, string>> = {
  skyport: 'Skyport',
  'sky-park': 'Sky Park',
  'sky-transit': 'Sky Transit',
  'port-bulk': 'Bulk',
  'port-shipyard': 'Shipyard',
  'port-passenger': 'Passenger',
  'marina-shallows': 'Boardwalk',
  'marina-open': 'Stonefront',
};

export const FORM_NOTES: Readonly<Record<LandmarkFormId, string>> = {
  skyport: 'Rooftop hub for airships, eVTOL and balloons.',
  'sky-park': 'A garden laid over a rooftop.',
  'sky-transit': 'A head station lifting the line onto a roof.',
  'port-bulk': 'Deep-water berth for bulk cargo.',
  'port-shipyard': 'Sheltered basin to launch hulls.',
  'port-passenger': 'Light marina for small craft.',
  'marina-shallows': 'Wooden piers where the water is shallow: a lake or a sheltered beach.',
  'marina-open': 'Stone quays where the water is deep and exposed.',
};

export const WATER_LABELS: Readonly<Record<number, string>> = {
  [WATER_CLASS.open]: 'open water',
  [WATER_CLASS.canal]: 'sheltered canal',
  [WATER_CLASS.shallow]: 'shallows',
};

export const ARCOLOGY_LABELS: Readonly<Record<ArcologyKind, string>> = {
  [ARCOLOGY_KIND.twinStem]: 'Twin Stem',
  [ARCOLOGY_KIND.branchingCore]: 'Branching Core',
  [ARCOLOGY_KIND.skyWeave]: 'Sky Weave',
  [ARCOLOGY_KIND.spireRing]: 'Spire Ring',
  [ARCOLOGY_KIND.doubleBar]: 'Double Bar',
  [ARCOLOGY_KIND.stackPair]: 'Stack Pair',
  [ARCOLOGY_KIND.quadCluster]: 'Quad Cluster',
  [ARCOLOGY_KIND.triSpan]: 'Tri Span',
  [ARCOLOGY_KIND.terracedTwin]: 'Terraced Twin',
  [ARCOLOGY_KIND.splitCrown]: 'Split Crown',
  [ARCOLOGY_KIND.steppedBar]: 'Stepped Bar',
  [ARCOLOGY_KIND.courtCascade]: 'Court Cascade',
  // Le interrate compaiono nel campionario come volumi pieni, senza il terreno
  // in cui vivono: e' il modo giusto per guardarne la sagoma — un imbuto a
  // terrazze — che in partita si vede solo per la bocca.
  [ARCOLOGY_KIND.invertedPyramid]: 'Inverted Pyramid',
  [ARCOLOGY_KIND.sunkenCourt]: 'Sunken Court',
  [ARCOLOGY_KIND.craterRing]: 'Crater Ring',
};

/** Le cinque soglie visuali dalla piu' alta, per nominare un livello. */
const LEVEL_STAGES: readonly (readonly [string, number])[] = Object.entries(VISUAL_LEVELS)
  .map(([name, level]) => [name, level] as const)
  .sort((a, b) => b[1] - a[1]);

/**
 * Il livello con la soglia visuale che ha raggiunto: `4 · mature`.
 *
 * Il numero da solo non dice niente a chi guarda due sagome affiancate — la
 * differenza fra loro e' che una ha passato la soglia della torre e l'altra no.
 */
export function levelLabel(level: number): string {
  const stage = LEVEL_STAGES.find(([, threshold]) => level >= threshold);
  return stage === undefined ? String(level) : `${level} · ${stage[0]}`;
}

/** Uso primario, e il secondo quando la tipologia e' mista. */
export function useLabel(definition: TypologyDefinition): string {
  const primary = CLASS_NAMES[definition.use];
  return definition.mixed === undefined
    ? primary
    : `${primary} + ${CLASS_NAMES[definition.mixed]}`;
}

/** Lato ammesso dell'impronta, come la tipologia lo vincola. */
export function footprintLabel(shape: TypologyShape): string {
  return shape.minFootprint === shape.maxFootprint
    ? `${shape.minFootprint} voxel`
    : `${shape.minFootprint}–${shape.maxFootprint} voxel`;
}

/** I tratti che la tipologia impone alla grammatica, in ordine di lettura. */
export function shapeLabel(shape: TypologyShape): string {
  const tags = [`${shape.crownKind} crown`];
  if (shape.podiumBands > 0) tags.push(`podium ${shape.podiumBands}`);
  if (shape.courtyard) tags.push('courtyard');
  if (shape.roofGarden) tags.push('roof garden');
  if (shape.arcade) tags.push('arcade');
  if (shape.chamfer > 0) tags.push(`chamfer ${shape.chamfer}`);
  if (shape.overhang > 0) tags.push(`overhang ${shape.overhang}`);
  return tags.join(' · ');
}

/**
 * Tutto cio' che la colonna deve offrire perche' questa riga sia scelta.
 *
 * L'ordine va dal luogo alla misura: prima cosa dev'esserci intorno, poi quanto
 * in alto devono stare i campi. E' l'ordine in cui la si legge quando si chiede
 * «perche' questa non compare».
 */
export function requirementLabel(definition: TypologyDefinition): string {
  const terms: string[] = [];
  if (definition.mixed !== undefined) terms.push(`mixed ${CLASS_NAMES[definition.mixed]}`);
  if (definition.specialization !== undefined) {
    terms.push(`specialization ${definition.specialization}`);
  }
  if (definition.roles !== undefined) terms.push(`role ${definition.roles.join(' or ')}`);
  if (definition.charter !== undefined) terms.push(`charter ${definition.charter.join(' or ')}`);
  if (definition.districts !== undefined) {
    terms.push(`district ${definition.districts.join(' or ')}`);
  }
  if (definition.lotRole !== undefined) terms.push(`${definition.lotRole} lot`);
  if (definition.coastal === true) terms.push('coastal');
  if (definition.minLevel !== undefined) terms.push(`level ≥ ${definition.minLevel}`);
  if (definition.minDensity !== undefined) terms.push(`density ≥ ${definition.minDensity}`);
  if (definition.maxDensity !== undefined) terms.push(`density ≤ ${definition.maxDensity}`);
  if (definition.minWealth !== undefined) terms.push(`wealth ≥ ${definition.minWealth}`);
  if (definition.minAccessibility !== undefined) {
    terms.push(`access ≥ ${definition.minAccessibility}`);
  }
  if (definition.minSatisfaction !== undefined) {
    terms.push(`satisfaction ≥ ${definition.minSatisfaction}`);
  }
  if (definition.minIndustry !== undefined) terms.push(`industry ≥ ${definition.minIndustry}`);
  return terms.length === 0 ? 'none · catalog fallback' : terms.join(' · ');
}

/**
 * Le tipologie da cui questa puo' nascere per upgrade.
 *
 * Nel campionario le sagome stanno una accanto all'altra senza dire da dove
 * vengono: questa riga e' l'unico punto in cui la galleria mostra che sono un
 * albero e non una collezione.
 */
export function evolutionLabel(definition: TypologyDefinition): string {
  if (definition.evolvesFrom === undefined || definition.evolvesFrom.length === 0) {
    return 'none · starting form';
  }
  return definition.evolvesFrom
    .map((id) => typologyById(id)?.label ?? id)
    .join(' · ');
}
