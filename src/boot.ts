import { installAuthGate } from './auth/install';
import {
  lookUrl,
  newGameUrl,
  opensEntryMenu,
  resolveLaunchMode,
  resolveLook,
  rollSeed,
  type LookChoice,
} from './game/launchMode';
import {
  AUTO_SLOT,
  PENDING_SLOT,
  browserStorage,
  deleteSlot,
  listSlots,
  readSlot,
  writeSlot,
} from './game/save/storage';
import { whenWorldReady } from './game/worldReady';
import { TitleScreen } from './ui/TitleScreen';

/**
 * L'ingresso della pagina, e l'unica cosa che decide **quando** nasce il mondo.
 *
 * **`main.ts` non si carica piu' da solo.** Quel modulo e' un effetto: importarlo
 * costruisce renderer, worker e streamer, e la prima passata del generatore parte
 * dentro il suo corpo. Finche' era lui l'entry point del bundle, l'isola cresceva
 * mentre il giocatore stava ancora leggendo il menu — la scelta arrivava dopo il
 * lavoro invece che prima. Qui si carica con un import dinamico, e quel `import`
 * sta dentro il gesto che dice «vai».
 *
 * **E prima ancora c'e' la porta d'accesso.** Nessuno dei due `import('./main')`
 * qui sotto e' raggiungibile senza essere passato da `allowEntry()`, che e' anche
 * il momento in cui la prova di 45 minuti si accende. La porta vive in
 * `src/auth/` e non sa niente del mondo; questo file non sa niente di come si
 * entra, e si limita a chiedere.
 *
 * Il resto e' invariato: il seed sta nell'indirizzo, i salvataggi passano dallo
 * slot di transito, e la radice resta l'unica a conoscere l'engine. Questo file
 * legge lo storage, riscrive l'URL e non sa nient'altro.
 */

const params = new URLSearchParams(window.location.search);
const mode = resolveLaunchMode(params);
const storage = mode.growEnabled ? browserStorage() : null;

/**
 * Lo slot di transito si **guarda**, non si consuma: a consumarlo e' la radice,
 * e leggerlo qui per decidere basta. Vale come risposta gia' data solo se e'
 * dell'isola richiesta — un `?seed=` diverso e' una domanda nuova.
 */
const pending = readSlot(storage, PENDING_SLOT);
const restored = pending !== null
  && (!params.has('seed') || params.get('seed') === String(pending.seed));

/**
 * Quanto si aspetta l'isola prima di entrare comunque.
 *
 * Non e' il tempo che ci vuole: e' il tetto oltre il quale una schermata ferma
 * diventa un guasto. La generazione normale lo sfiora appena, e chi ci arriva
 * vede comunque il mondo comparire sotto i suoi occhi invece di una pagina morta.
 */
const READY_TIMEOUT_MS = 12_000;

/**
 * Come nascera' il mondo: parte da cio' che l'indirizzo dichiara, e le
 * impostazioni del titolo lo riscrivono li' invece di tenerlo in un posto loro.
 */
let look: LookChoice = resolveLook(params);

/**
 * La porta d'accesso si monta per prima, e da lei passa tutto il resto.
 *
 * `revealMenu` e' una richiamata e non un valore di ritorno perche' puo' essere
 * chiamata **dopo**: chi arriva sulla pagina senza sessione vede il modulo,
 * entra, e solo allora il menu ha qualcosa da mostrare. Nello stesso istante,
 * chi ha gia' una sessione valida la vede partire dentro `begin()`.
 */
const gateReady = installAuthGate(revealMenu);

/** Il momento in cui il menu puo' esistere: prima non c'e' nessuno a cui mostrarlo. */
function revealMenu(): void {
  if (opensEntryMenu(params, mode, restored)) openTitle();
  else void resumeDirectly();
}

/**
 * Il caso `?play=1`: nessun menu, il mondo nasce subito.
 *
 * Passa dalla porta come tutto il resto — e' anzi il momento in cui la prova si
 * accende per chi arriva da un collegamento gia' pronto.
 */
async function resumeDirectly(): Promise<void> {
  if (!(await allowEntry())) return;
  await import('./main');
}

/**
 * L'ultima parola prima che il mondo nasca.
 *
 * `false` vuol dire che la schermata d'accesso e' gia' ricomparsa sopra a tutto:
 * la prova e' finita, il cronometro e' arrivato a zero, e non c'e' niente da
 * caricare. Si aspetta `gateReady` invece di leggere un valore appena scritto
 * perche' questo e' anche il percorso di chi preme «Play» sulla schermata del
 * titolo, che il gate l'ha gia' in mano da un pezzo: una promessa gia' risolta
 * non costa niente.
 */
async function allowEntry(): Promise<boolean> {
  const gate = await gateReady;
  return gate.canEnterWorld();
}

/** La schermata del titolo, con dentro le citta' che ci sono davvero. */
function openTitle(): void {
  const slots = listSlots(storage);
  const autosave = slots.find((slot) => slot.slot === AUTO_SLOT) ?? null;
  const screen: TitleScreen = new TitleScreen({
    // «Continue» non copia niente: `?play=1` e' gia' la frase «riprendi come
    // stavi», e la radice riapre l'autosalvataggio da se'.
    onContinue: () => {
      if (autosave === null) return;
      void enter(screen, autosave.seed, 'Loading your city…');
    },
    // L'autosalvataggio va cancellato, non scavalcato: con lo stesso seed la
    // radice lo riaprirebbe, e la citta' vecchia comparirebbe su un'isola che
    // sembra nuova. Gli slot a mano restano, ed e' cio' che la riga promette.
    onCreate: (seed) => {
      deleteSlot(storage, PENDING_SLOT);
      deleteSlot(storage, AUTO_SLOT);
      void enter(screen, seed);
    },
    onLoad: (slot) => {
      const save = readSlot(storage, slot);
      if (save === null) {
        screen.setLoadNote('That slot is empty.');
        return;
      }
      const written = writeSlot(storage, PENDING_SLOT, save);
      if (!written.ok) {
        screen.setLoadNote('Could not open that city: browser storage is full.');
        return;
      }
      void enter(screen, save.seed, 'Loading your city…');
    },
    onRoll: rollSeed,
    // Il look va nell'indirizzo subito, non solo entrando: cosi' sopravvive a un
    // ricaricamento anche a chi ha cambiato cielo e poi ci ha ripensato.
    onLook: (next) => {
      look = next;
      window.history.replaceState(window.history.state, '', lookUrl(window.location.search, next));
    },
  }, { autosave, slots, look });
  document.body.appendChild(screen.root);
  screen.focus();
}

/**
 * Si entra: si dichiara l'isola nell'indirizzo, poi si carica il mondo.
 *
 * L'ordine conta due volte. Il seed va scritto **prima** dell'import perche' e'
 * li' che la radice lo cerca, e `play=1` dice che la domanda del titolo ha gia'
 * avuto risposta. La schermata invece se ne va **dopo** il segnale del mondo:
 * toglierla al primo frame scoprirebbe un mare vuoto con i chunk ancora in coda.
 */
async function enter(screen: TitleScreen, seed: number, message?: string): Promise<void> {
  screen.startLoading(message);
  // L'attesa si mostra **prima** di chiedere, non dopo: la prima pressione di
  // «Play» e' anche quella che accende la prova, quindi c'e' una scrittura vera
  // da fare, e un bottone immobile durante una chiamata di rete sembra rotto.
  // Se la risposta e' no, la schermata d'accesso ricompare sopra a tutto.
  if (!(await allowEntry())) return;
  window.history.replaceState(
    window.history.state,
    '',
    newGameUrl(window.location.search, seed, look),
  );
  await import('./main');
  await whenWorldReady(READY_TIMEOUT_MS);
  await screen.fadeOut();
}
