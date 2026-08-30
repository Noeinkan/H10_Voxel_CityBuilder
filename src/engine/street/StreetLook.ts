import { LOOK_SPEED } from './streetEye';

/**
 * Lo sguardo a terra: il mouse gira la testa senza premere niente.
 *
 * **Non riusa `CameraInput`, e prima lo faceva.** Quel file mappa *gesti* —
 * quale tasto trascina, quale gira — e dichiarando `orbitMode` la camera a terra
 * ne otteneva gratis il drag-per-guardare. Ma tenere premuto per guardarsi
 * attorno e' il gesto di chi rigira un modellino, non di chi sta in piedi in una
 * strada: li' la testa si muove e basta. Cambiato il gesto, l'ereditarieta' non
 * aveva piu' niente da dare.
 *
 * Il muoversi-e-basta ha pero' un prezzo che una pagina web non puo' ignorare: il
 * puntatore arriva al bordo dello schermo e la rotazione si ferma a meta' giro.
 * La risposta e' il **pointer lock**, che e' anche l'unica che toglie di mezzo il
 * cursore: sparisce, e con lui la possibilita' di cliccare per sbaglio su
 * qualcosa mentre si guarda. Il lock si puo' chiedere solo dentro un gesto
 * dell'utente, ed e' il motivo per cui `attach` va chiamata dal gestore del clic
 * che posa l'occhio e non da un momento qualsiasi.
 *
 * **Perdere il lock non fa uscire dalla vista.** `Esc` lo rilascia — lo fa il
 * browser, e non c'e' modo di intercettarlo prima — e cosi' fa un cambio di
 * finestra. Uscire li' vorrebbe dire buttare fuori chi ha solo alt-tabbato. La
 * vista resta, la testa si ferma, e un clic riprende: e' anche il secondo
 * gradino della catena di `Esc` che il gioco usa gia' altrove, dove il primo
 * molla qualcosa e il secondo chiude.
 */

export interface StreetLookCommands {
  look(dYaw: number, dPitch: number): void;
  zoomFov(steps: number): void;
  levelHorizon(): void;
}

export class StreetLook {
  private readonly commands: StreetLookCommands;
  private readonly onLockChange: (locked: boolean) => void;
  private element: HTMLElement | null = null;

  constructor(commands: StreetLookCommands, onLockChange: (locked: boolean) => void) {
    this.commands = commands;
    this.onLockChange = onLockChange;
  }

  get locked(): boolean {
    return this.element !== null && document.pointerLockElement === this.element;
  }

  /** Va chiamata **dentro** un gesto dell'utente, o il browser rifiuta il lock. */
  attach(element: HTMLElement): void {
    this.element = element;
    element.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('contextmenu', preventDefault);
    document.addEventListener('pointerlockchange', this.onLockEvent);
    window.addEventListener('keydown', this.onKeyDown);
    this.requestLock();
  }

  detach(element: HTMLElement): void {
    element.removeEventListener('mousemove', this.onMouseMove);
    element.removeEventListener('wheel', this.onWheel);
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('contextmenu', preventDefault);
    document.removeEventListener('pointerlockchange', this.onLockEvent);
    window.removeEventListener('keydown', this.onKeyDown);
    if (document.pointerLockElement === element) document.exitPointerLock();
    this.element = null;
  }

  /**
   * Richiede il lock, e ingoia il rifiuto.
   *
   * Un browser puo' dire di no per ragioni sue — richiesta fuori da un gesto,
   * un lock appena rilasciato, il documento senza fuoco — e nessuna di quelle e'
   * un errore da propagare: la vista resta, semplicemente non si guarda finche'
   * non si clicca di nuovo. Nei browser recenti e' una promessa, in quelli vecchi
   * non restituisce niente, e il `?.` copre entrambi.
   */
  private requestLock(): void {
    const element = this.element;
    if (element === null || this.locked) return;
    (element.requestPointerLock() as unknown as Promise<void> | undefined)?.catch(() => {});
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    // `movementX/Y` e non la posizione: sotto lock il puntatore non ha un posto
    // dove stare, e questi sono l'unico dato che continua ad avere senso.
    // Trascinando a destra si guarda a destra e in basso si guarda in basso, che
    // e' il verso giusto per una testa — il perche' sta su `look`.
    this.commands.look(-event.movementX * LOOK_SPEED, event.movementY * LOOK_SPEED);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.commands.zoomFov(-Math.sign(event.deltaY));
  };

  /** Un clic riprende lo sguardo dopo un `Esc` o un cambio di finestra. */
  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.requestLock();
  };

  private readonly onLockEvent = (): void => {
    this.onLockChange(this.locked);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Solo `F`, e non l'intera tastiera di `CameraInput`: `Q`/`E` erano un passo
    // di rotazione da tastiera, e con la testa libera non hanno piu' un mestiere.
    // Raddrizzare l'orizzonte invece serve, perche' guardando in giro ci si
    // ritrova storti e non c'e' una griglia a cui riagganciarsi.
    if (event.code === 'KeyF') this.commands.levelHorizon();
  };
}

function preventDefault(event: Event): void {
  event.preventDefault();
}
