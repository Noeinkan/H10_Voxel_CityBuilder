import { resolveDaylightMode, type DaylightMode } from '../engine/daylight';
import { resolveTheme } from '../engine/themes';

export interface LaunchMode {
  debugEnabled: boolean;
  perfEnabled: boolean;
  growEnabled: boolean;
  simEnabled: boolean;
}

/**
 * La radice e' l'esperienza completa mostrata all'avvio. I parametri di scena
 * restano espliciti perche' servono come harness isolati nelle verifiche.
 *
 * `perf` sta fuori dal gate del debug come le viste: misurare la partita vera
 * — quella che parte dalla radice — e' il suo scopo, e attivarla non deve
 * cambiare cio' che si misura.
 */
export function resolveLaunchMode(params: URLSearchParams): LaunchMode {
  const hasExplicitScene = ['scene', 'terrain', 'sim', 'grow'].some((key) => params.has(key));
  const defaultExperience = !hasExplicitScene;
  const debugEnabled = params.has('debug')
    ? params.get('debug') === '1'
    : false;

  return {
    debugEnabled,
    perfEnabled: params.get('perf') === '1',
    growEnabled: params.get('grow') === '1' || defaultExperience,
    simEnabled: debugEnabled && params.get('sim') === '1',
  };
}

/**
 * Cosa conta come seed, in un posto solo.
 *
 * La stessa domanda arriva da due parti — l'indirizzo all'avvio e il campo di
 * testo del menu — e due risposte scritte separatamente divergerebbero al primo
 * caso limite. Lo zero non e' valido (restava escluso anche dal vecchio default
 * con `||`), il vuoto e l'illeggibile valgono quanto un seed assente, e i
 * negativi passano: `-5` e' un mondo come un altro.
 */
export function parseSeedInput(raw: string): number | null {
  const parsed = parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

/**
 * L'unico tiro non deterministico di tutta la generazione.
 *
 * Da qui in poi tutto e' funzione pura del numero sorteggiato, ed e' per questo
 * che ne esiste **uno**: lo chiama il bootstrap quando nessuno ha dichiarato un
 * seed, lo chiama il titolo alla voce «Random», e lo chiama il menu di pausa.
 * Un secondo tiro scritto in una UI sarebbe una seconda definizione di «isola
 * nuova». Sta qui, accanto a chi legge e scrive i seed, e non nella radice:
 * `main.ts` e' l'unico modulo che non si puo' importare senza costruire un mondo.
 */
export function rollSeed(): number {
  const roll = new Uint32Array(1);
  crypto.getRandomValues(roll);
  return roll[0] >>> 0;
}

/**
 * Seed della partita: quello dichiarato da `?seed=`, altrimenti uno casuale.
 *
 * Il default non e' piu' un numero fisso: ogni partita nasce su un mondo
 * diverso, come in Minecraft. Il determinismo non e' perso — chi vuole
 * rivedere un'isola la dichiara nell'URL, e il seed sorteggiato viene
 * riscritto nella barra degli indirizzi da `main.ts`, quindi il ricaricamento
 * riporta lo stesso mondo.
 */
export function resolveSeed(params: URLSearchParams, randomUint32: () => number): number {
  const raw = params.get('seed');
  const declared = raw === null ? null : parseSeedInput(raw);
  return declared ?? randomUint32() >>> 0;
}

/**
 * `?play=1`: la scelta e' gia' fatta, si entra in partita senza passare dal menu.
 *
 * Il menu d'ingresso si apre a **ogni** caricamento, ed e' il punto: nessuna
 * citta' riparte da sola. Ma i ricaricamenti che il gioco fa da se' — aprire uno
 * slot, iniziare una partita nuova, accendere la misura con `F2` — nascono da
 * una scelta appena presa, e rimostrare il menu sopra il risultato sarebbe
 * chiedere due volte la stessa cosa.
 *
 * Vale anche per l'altra meta': con `play=1` l'autosalvataggio si riapre, senza
 * no. Sono la stessa frase — «riprendi come stavi» — e separarle darebbe un
 * `F2` che misura un'isola vuota invece della citta' che si stava guardando.
 *
 * Si consuma all'avvio: `main.ts` lo toglie dalla barra degli indirizzi insieme
 * al seed che ci scrive, quindi un ricaricamento a mano riporta il menu.
 */
export const PLAY_PARAM = 'play';

/**
 * La schermata del titolo si apre, oppure no.
 *
 * La decide `boot.ts` **prima** di caricare il mondo: e' la stessa domanda di
 * prima — «questo avvio ha gia' una risposta?» — ma adesso conta anche quando,
 * perche' dal no dipende se l'isola nasce subito o dopo la scelta.
 *
 * Tre casi soli, e nessuno di essi guarda `?seed=`: quel parametro lo riscrive
 * il gioco a ogni avvio, quindi legarci la decisione avrebbe fatto comparire il
 * titolo solo la primissima volta.
 */
export function opensEntryMenu(
  params: URLSearchParams,
  mode: LaunchMode,
  restored: boolean,
): boolean {
  // Fuori dalla partita non c'e' menu da aprire: il campionario, il diorama e
  // l'isola nuda sono harness, e nessuno di loro ha un HUD.
  if (!mode.growEnabled) return false;
  if (params.get(PLAY_PARAM) === '1') return false;
  // Uno slot appena aperto e' gia' la risposta alla domanda che il menu farebbe.
  return !restored;
}

/**
 * L'indirizzo con cui si entra in partita su un'isola: stesso harness, seed
 * dichiarato, nessuna domanda da rifare.
 *
 * E' la porta che usano tutti e tre i modi di iniziare — riprendere, caricare,
 * generare — perche' dicono la stessa cosa all'avvio successivo: quale isola, e
 * che la scelta e' gia' stata fatta. Cio' che li distingue succede prima, negli
 * slot: chi ricomincia cancella l'autosalvataggio, chi carica scrive quello di
 * transito.
 *
 * Sta qui accanto a `perfToggleUrl` e `swatchUrl` perche' e' la stessa tabella
 * letta al contrario — da intenzione a parametri — e tre copie di quel giro
 * divergerebbero al primo parametro nuovo.
 *
 * **Il resto dell'indirizzo resta.** Chi sta misurando con `?perf=1`, o guarda
 * con un tema dichiarato, vuole una citta' nuova nelle stesse condizioni: e' la
 * scena a cambiare, non l'harness attorno.
 */
export function newGameUrl(search: string, seed: number, look?: LookChoice): string {
  const params = new URLSearchParams(search);
  params.set('seed', String(seed));
  params.set(PLAY_PARAM, '1');
  if (look !== undefined) applyLook(params, look);
  return `?${params.toString()}`;
}

/**
 * Come si guarda la citta': tema, cielo e nuvole.
 *
 * **Sono gia' tre parametri d'indirizzo** — `?theme=`, `?daylight=`, `?clouds=`
 * — che la radice legge da sempre all'avvio. La schermata del titolo non ha
 * quindi bisogno di uno storage suo per farli valere: li scrive nell'URL prima
 * di caricare il mondo, che nasce gia' con il cielo giusto invece di cambiarlo
 * al primo frame. E restando scritti, la scelta sopravvive al ricaricamento.
 */
export interface LookChoice {
  readonly theme: string;
  readonly daylight: DaylightMode;
  readonly clouds: boolean;
}

/** Scrive il look sui parametri, con `clouds` che sparisce invece di dire «no». */
export function applyLook(params: URLSearchParams, look: LookChoice): void {
  params.set('theme', look.theme);
  params.set('daylight', look.daylight);
  if (look.clouds) params.set('clouds', '1');
  else params.delete('clouds');
}

/** Il look dichiarato dall'indirizzo, con i default del gioco al posto dei buchi. */
export function resolveLook(params: URLSearchParams): LookChoice {
  return {
    theme: resolveTheme(params.get('theme')).id,
    daylight: resolveDaylightMode(params.get('daylight')),
    clouds: params.get('clouds') === '1',
  };
}

/**
 * Lo stesso indirizzo con il look aggiornato, per la partita gia' in corso.
 *
 * La radice lo riscrive quando il giocatore cambia tema o cielo dal menu di
 * pausa: e' lo stesso gesto con cui il seed finisce nella barra, e serve a che
 * il titolo, al ricaricamento, mostri il cielo con cui si stava giocando invece
 * di quello di tre partite fa.
 */
export function lookUrl(search: string, look: LookChoice): string {
  const params = new URLSearchParams(search);
  applyLook(params, look);
  return `?${params.toString()}`;
}

/**
 * La stessa partita, con la misura accesa o spenta.
 *
 * Accendere `?perf=1` **ricaricando** non e' un ripiego: pannello e referto
 * nascono con la pagina, e cio' che devono misurare e' una partita nata
 * misurata — innestare la misura a meta' corsa vorrebbe dire misurare anche
 * l'innesto. Il resto dell'indirizzo viaggia con noi, `seed` per primo (quello
 * che `main.ts` riscrive nella barra), quindi si torna sulla stessa isola; la
 * citta' che ci sta sopra la riporta l'autosalvataggio, che scatta su
 * `pagehide` prima che la pagina se ne vada.
 *
 * Porta `play=1` perche' non e' un avvio, e' un ritorno: il menu d'ingresso
 * davanti a una partita che si sta misurando fermerebbe proprio i tick che il
 * pannello deve contare, e l'autosalvataggio e' cio' che rimette la citta' dove
 * era. Senza, `F2` misurerebbe un'isola vuota.
 */
export function perfToggleUrl(search: string, enabled: boolean): string {
  const params = new URLSearchParams(search);
  if (enabled) params.set('perf', '1');
  else params.delete('perf');
  params.set(PLAY_PARAM, '1');
  return `?${params.toString()}`;
}

/**
 * L'indirizzo del campionario dei voxel, con addosso il look che si sta guardando.
 *
 * Sta accanto a `resolveLaunchMode` perche' e' la stessa corrispondenza letta al
 * contrario — da modalita' a parametri invece che da parametri a modalita' — e
 * due copie di quella tabella divergerebbero al primo parametro nuovo.
 *
 * **Tema e ora viaggiano insieme al link** perche' il campionario esiste per
 * confrontare: aprirlo a mezzogiorno mentre la citta' e' al neon di notte
 * mostrerebbe un vocabolario diverso da quello che ha fatto nascere la domanda.
 * Entrambi valgono anche senza `debug`, e l'ora **ferma** l'orologio — un
 * campione che cambia luce da solo mentre lo si giudica non e' un campione.
 *
 * Non porta `debug=1`: la partita resta viva nella scheda di sotto e questa e'
 * una scena da guardare, non una da misurare. Il referto del campionario si apre
 * da se' (e' la legenda dello strumento, non una metrica), gli overlay tecnici
 * restano dietro `F3`.
 */
export function swatchUrl(theme: string, hour: number): string {
  const params = new URLSearchParams({
    scene: 'swatch',
    theme,
    hour: hour.toFixed(2),
  });
  return `?${params.toString()}`;
}
