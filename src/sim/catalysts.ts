import { BALANCE } from './balance';
import { ALL_CLASSES, BUILDING_CLASS, CLASS_COUNT, CLASS_NAMES, type BuildingClass } from './classes';

/** I sette modi in cui il giocatore puo' orientare la crescita. */
export type CatalystId = keyof typeof BALANCE.gameplay.catalyst.roles;

/**
 * Funzione del catalizzatore nella toolbar.
 *
 * Non e' una categoria estetica: risponde alla domanda "cosa sto per fare",
 * che e' l'unica cosa che il giocatore sa prima di aver imparato i sette nomi.
 * Crescita fa nascere isolati, connessioni collegano la citta' al resto del
 * mondo e fra i suoi poli, identita' le da' un carattere che resta.
 */
export type CatalystGroup = 'growth' | 'connections' | 'identity';

export interface CatalystEffects {
  readonly density: number;
  readonly wealth: number;
  readonly accessibility: number;
  readonly satisfaction: number;
  readonly industry: number;
}

export interface CatalystDefinition {
  readonly id: CatalystId;
  readonly label: string;
  readonly group: CatalystGroup;
  /** Uso urbano che il ruolo porta a pieno per primo, in ordine di `BUILDING_CLASS`. */
  readonly class: BuildingClass;
  readonly cost: number;
  readonly strength: number;
  readonly radius: number;
  /** Moltiplicatore di `strength` per uso urbano, indicizzato come `BUILDING_CLASS`. */
  readonly influence: readonly number[];
  /** Usi favoriti, dal contributo maggiore al minore. Solo influenze positive. */
  readonly favours: readonly BuildingClass[];
  /** Usi penalizzati, dal contributo piu' negativo al meno. */
  readonly penalises: readonly BuildingClass[];
  readonly effects: CatalystEffects;
  readonly description: string;
}

/**
 * Catalogo in ordine di toolbar: prima la crescita, poi le connessioni, infine
 * l'identita'. Mercato, fabbrica e parco restano i tre passi iniziali del
 * tutorial e per questo aprono la lista.
 */
export const CATALYSTS: readonly CatalystDefinition[] = [
  catalyst('market', 'Market', 'growth', 'Draws in shops and homes together: the seed of a mixed-use block.'),
  catalyst('factory', 'Factory', 'growth', 'Boosts industry and jobs, and pushes housing away from its fumes.'),
  catalyst('park', 'Park', 'growth', 'Creates greener, happier, less industrial neighborhoods.'),
  catalyst('port', 'Port', 'connections', 'Unlocks external trade and concentrates industry and trade on the coast.'),
  catalyst('transport', 'Transit', 'connections', 'Connects hubs and lifts housing, shops and logistics alike.'),
  catalyst('university', 'University', 'identity', 'Builds a civic district around research and knowledge.'),
  catalyst('monument', 'Monument', 'identity', 'A landmark that attracts visitors, shops and civic pride.'),
];

/** Gruppi in ordine di toolbar, con l'etichetta della sezione. */
export const CATALYST_GROUPS: readonly { readonly id: CatalystGroup; readonly label: string }[] = [
  { id: 'growth', label: 'Growth' },
  { id: 'connections', label: 'Connections' },
  { id: 'identity', label: 'Identity' },
];

const BY_ID = new Map<CatalystId, CatalystDefinition>(CATALYSTS.map((entry) => [entry.id, entry]));

export function catalystById(id: CatalystId): CatalystDefinition {
  const found = BY_ID.get(id);
  if (found === undefined) throw new Error(`unknown catalyst: ${id}`);
  return found;
}

export function isCatalystId(value: string): value is CatalystId {
  return BY_ID.has(value as CatalystId);
}

/**
 * Ruolo di un catalizzatore che porta soltanto l'uso primario.
 *
 * Copre gli ingressi che non dichiarano un ruolo — la fixture della scena di
 * debug e i salvataggi dell'MVP. Ogni riga sceglie un ruolo la cui influenza su
 * quell'uso vale esattamente 1: e' cio' che fa sopravvivere l'invariante del
 * campo a un catalizzatore senza `kind`.
 */
export function defaultCatalystOfClass(cls: BuildingClass): CatalystId {
  if (cls === BUILDING_CLASS.industrial) return 'factory';
  if (cls === BUILDING_CLASS.civic) return 'park';
  return 'market';
}

/** Ruolo effettivo di un catalizzatore, con o senza `kind` dichiarato. */
export function catalystRoleOf(source: { readonly kind?: CatalystId; readonly class: BuildingClass }): CatalystId {
  return source.kind ?? defaultCatalystOfClass(source.class);
}

/**
 * Vettore di influenza di un ruolo, indicizzato come `BUILDING_CLASS`.
 *
 * E' un array condiviso e non va mutato: il campo di desiderabilita' lo legge
 * una volta per catalizzatore rilevante e poi cicla su decine di migliaia di
 * celle, quindi una copia per chiamata si sentirebbe.
 */
export function catalystInfluence(id: CatalystId): readonly number[] {
  return catalystById(id).influence;
}

function catalyst(
  id: CatalystId,
  label: string,
  group: CatalystGroup,
  description: string,
): CatalystDefinition {
  const values = BALANCE.gameplay.catalyst.roles[id];
  const effects = BALANCE.districts.catalystEffects[id];
  const table = BALANCE.gameplay.catalyst.influence[id] as Readonly<Record<string, number>>;

  const influence: number[] = new Array<number>(CLASS_COUNT).fill(0);
  for (const cls of ALL_CLASSES) influence[cls] = table[CLASS_NAMES[cls]] ?? 0;

  const byStrength = [...ALL_CLASSES].sort((a, b) => influence[b] - influence[a] || a - b);
  return {
    id,
    label,
    group,
    // Il primo uso portato a pieno, non il piu' forte in assoluto: a parita' di
    // influenza vince l'indice minore, cosi' il ruolo ha sempre un uso primario
    // stabile e indipendente dall'ordine di lettura della tabella.
    class: byStrength[0],
    ...values,
    influence,
    favours: byStrength.filter((cls) => influence[cls] > 0),
    penalises: [...byStrength].reverse().filter((cls) => influence[cls] < 0),
    effects,
    description,
  };
}
