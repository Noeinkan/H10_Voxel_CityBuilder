import type { SimStateData } from '../../sim';
import type { BuildingRecord } from '../../world/buildings/BuildingRegistry';

/**
 * Il formato di salvataggio, e le sue due regole.
 *
 * **Si salva cio' che non si sa ricostruire.** Il terreno e' funzione pura di
 * `(seed, shape)`, la rete stradale e' funzione pura del seed, il campo di
 * desiderabilita' e' funzione pura di catalizzatori, edifici e policy: niente di
 * tutto questo entra nel file, perche' rimetterlo dentro significherebbe
 * scrivere megabyte di buffer che il caricamento sa rifare identici. Entra il
 * seed, entra lo stato della simulazione, entrano i record del registro — cio'
 * che *e' stato deciso*, non cio' che ne consegue.
 *
 * **Un salvataggio vecchio si apre.** La regola e' quella di `reviveSimState`,
 * copiata parola per parola perche' e' gia' stata pagata una volta: un campo che
 * non c'era torna al proprio valore di partenza e il primo tick lo riscrive, e
 * un file di versione superiore viene rifiutato invece di essere interpretato a
 * meta'. Non c'e' un percorso di migrazione con passi: c'e' un default per
 * campo, che e' la stessa cosa scritta dove serve.
 */

/**
 * Versione del formato.
 *
 * Sale quando un salvataggio scritto da qui non e' piu' leggibile da una
 * versione precedente. Aggiungere un campo con un default non la fa salire —
 * quello e' esattamente il caso che i default coprono.
 */
export const SAVE_VERSION = 1;

/** Cio' che la scena tiene fuori dalla simulazione e non e' derivabile. */
export interface SaveScene {
  readonly paused: boolean;
  readonly speed: number;
  /** Orologio del traffico, in secondi di gioco. */
  readonly clock: number;
  /** Tick consecutivi in autosufficienza: e' meta' della condizione di vittoria. */
  readonly healthyTicks: number;
}

export interface SaveGame {
  readonly version: number;
  /** Millisecondi epoch, per l'elenco degli slot. Non entra in nessun calcolo. */
  readonly savedAt: number;
  readonly seed: number;
  readonly sim: SimStateData;
  /**
   * I record del registro, in ordine di id crescente.
   *
   * L'ordine non e' cosmetico: `supports` cita gli id, e adottare un record
   * prima di cio' su cui poggia lascerebbe l'indice dei portanti a meta'.
   */
  readonly records: readonly BuildingRecord[];
  /**
   * I settori costieri comprati, **in ordine di acquisto**.
   *
   * L'ordine e' il formato: ogni acquisto estende la sagoma dell'isola e la
   * generazione successiva legge quella estesa. Rigenerarli in un altro ordine
   * darebbe una costa diversa da quella su cui la citta' e' stata costruita.
   */
  readonly sectors: readonly string[];
  readonly scene: SaveScene;
}

const DEFAULT_SCENE: SaveScene = {
  paused: false,
  speed: 1,
  clock: 0,
  healthyTicks: 0,
};

/**
 * Legge un salvataggio da un valore qualunque — `JSON.parse` di un file che
 * l'utente ha scelto, o di una chiave di `localStorage` che qualcuno ha toccato.
 *
 * Torna `null` invece di lanciare: un file illeggibile e' un caso previsto — e'
 * il gesto «importa» andato storto — e chi chiama deve poterlo dire in una riga
 * invece di intercettare un'eccezione.
 */
export function readSave(value: unknown): SaveGame | null {
  if (!isRecord(value)) return null;

  const version = numberOf(value.version, -1);
  // Un file **piu' nuovo** non si apre: interpretarlo con le regole di oggi
  // vorrebbe dire far sparire in silenzio cio' che questa versione non conosce,
  // e il giocatore se ne accorgerebbe solo dalla citta' tornata sbagliata.
  if (!Number.isInteger(version) || version < 1 || version > SAVE_VERSION) return null;

  const seed = numberOf(value.seed, 0);
  if (!Number.isFinite(seed) || seed === 0) return null;

  if (!isRecord(value.sim)) return null;
  // La simulazione non si valida campo per campo qui: `reviveSimState` ha gia'
  // un default per ognuno dei suoi, ed e' l'unico posto in cui quella tabella
  // deve esistere. Qui basta che ci siano le due liste da cui il campo rinasce.
  if (!Array.isArray(value.sim.catalysts) || !Array.isArray(value.sim.buildings)) return null;

  const records = Array.isArray(value.records) ? value.records.filter(isBuildingRecord) : [];

  return {
    version,
    savedAt: numberOf(value.savedAt, 0),
    seed,
    sim: value.sim as unknown as SimStateData,
    // In ordine di id anche se il file non ce li ha dati cosi': `adopt` conta
    // sull'ordine, e fidarsi di un file che l'utente puo' aver riscritto a mano
    // sarebbe l'unico modo di rompere l'indice dei portanti dall'esterno.
    records: [...records].sort((a, b) => a.id - b.id),
    sectors: Array.isArray(value.sectors) ? value.sectors.filter(isSectorId) : [],
    scene: readScene(value.scene),
  };
}

function readScene(value: unknown): SaveScene {
  if (!isRecord(value)) return DEFAULT_SCENE;
  return {
    // Una partita si riapre **in pausa se lo era**: e' lo stato in cui il
    // giocatore l'ha lasciata, e ripartire da soli mentre si guarda la citta'
    // tornare sarebbe la prima cosa che non ha chiesto.
    paused: value.paused === true,
    speed: clamp(numberOf(value.speed, 1), 1, 8),
    clock: Math.max(0, numberOf(value.clock, 0)),
    healthyTicks: Math.max(0, Math.floor(numberOf(value.healthyTicks, 0))),
  };
}

/**
 * Il minimo che rende adottabile un record.
 *
 * Non e' una validazione del tipo intero, ed e' voluto: i campi facoltativi sono
 * una trentina e viaggiano verso generatori che hanno gia' un default per
 * ciascuno. Qui si controlla cio' senza cui il record non ha nemmeno un posto
 * nel mondo — l'id, l'angolo, l'ingombro — perche' un `undefined` in una di
 * queste sei voci diventerebbe un `NaN` dentro gli indici del registry.
 */
function isBuildingRecord(value: unknown): value is BuildingRecord {
  if (!isRecord(value)) return false;
  for (const key of ['id', 'x', 'y', 'baseZ', 'footprint', 'height'] as const) {
    if (!Number.isFinite(value[key])) return false;
  }
  return Number.isInteger(value.id) && (value.id as number) >= 0;
}

/** Un id di settore e' `<lato>-<indice>`: e' la chiave con cui si rigenera. */
function isSectorId(value: unknown): value is string {
  return typeof value === 'string' && /^(north|east|south|west)-\d+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
