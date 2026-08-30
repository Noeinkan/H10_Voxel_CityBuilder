/**
 * Dagli eventi del browser ai comandi della camera.
 *
 * Sta fuori da `IsoCameraController` perche' sono due lavori distinti: qui si
 * decide *quale gesto chiede cosa* — quale tasto del mouse gira e quale
 * trascina — e li' come la camera si muove di conseguenza. La mappa dei gesti
 * cambia molto piu' spesso della trigonometria che la serve, e tenerle separate
 * vuol dire poterla riscrivere senza rileggere l'altra.
 *
 * Cosa **significhino** i tasti premuti non si decide qui: l'insieme resta
 * leggibile e lo interpreta `orbitPan.ts`, che sa gia' che gli stessi tasti
 * spostano l'inquadratura sulla citta' e il perno dentro uno studio.
 */

/**
 * Cio' che l'input sa chiedere. Il controller la implementa per intero: e' la
 * sua superficie vista da qui, non un'astrazione in piu'.
 */
export interface CameraCommands {
  /** In studio gira **qualunque** tasto: li' non c'e' un pan da cui distinguerlo. */
  readonly orbitMode: boolean;

  panByPixels(dxPixels: number, dyPixels: number): void;
  orbitBy(dYaw: number, dPitch: number): void;
  rotate(direction: number): void;
  zoomBy(steps: number): void;

  /** `F`: rimette l'assetto e inquadra la citta'. */
  frameAll(): void;

  setHover(clientX: number, clientY: number): void;
  clearHover(): void;
}

/** Radianti di orbita per pixel trascinato. */
const ORBIT_SPEED = 0.006;

export class CameraInput {
  private readonly commands: CameraCommands;

  private readonly pressed = new Set<string>();
  private dragging = false;

  /**
   * Deciso all'inizio del gesto e non a ogni movimento: entrare in studio con il
   * tasto gia' premuto non deve trasformare a meta' un pan in una rotazione.
   */
  private dragOrbits = false;

  private pointerId: number | null = null;
  private pointerX = 0;
  private pointerY = 0;

  constructor(commands: CameraCommands) {
    this.commands = commands;
  }

  attach(element: HTMLElement): void {
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('mousedown', this.onMouseDown);
    element.addEventListener('contextmenu', preventDefault);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(element: HTMLElement): void {
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointermove', this.onPointerMove);
    element.removeEventListener('pointerup', this.onPointerUp);
    element.removeEventListener('pointercancel', this.onPointerUp);
    element.removeEventListener('pointerleave', this.onPointerLeave);
    element.removeEventListener('wheel', this.onWheel);
    element.removeEventListener('mousedown', this.onMouseDown);
    element.removeEventListener('contextmenu', preventDefault);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.pressed.clear();
    this.dragging = false;
    this.commands.clearHover();
  }

  /** I tasti giu' adesso. Li legge il ciclo di frame, attraverso `readPanAxes`. */
  get keys(): ReadonlySet<string> {
    return this.pressed;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.commands.setHover(event.clientX, event.clientY);
    const orbits = this.commands.orbitMode || isOrbitButton(event.button);
    if (!orbits && !isPanButton(event.button)) return;
    this.dragOrbits = orbits;
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.commands.setHover(event.clientX, event.clientY);
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.pointerX;
    const dy = event.clientY - this.pointerY;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    if (this.dragOrbits) {
      // Trascinare in orizzontale gira attorno a cio' che si guarda, in verticale
      // lo alza e lo abbassa. Il segno dell'inclinazione e' invertito rispetto ai
      // pixel perche' tirando **verso il basso** ci si aspetta di salire sopra la
      // cosa.
      this.commands.orbitBy(-dx * ORBIT_SPEED, dy * ORBIT_SPEED);
    } else {
      this.commands.panByPixels(dx, dy);
    }
    event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
  };

  private readonly onPointerLeave = (): void => {
    // Fuori dalla canvas non c'e' un punto sotto al mouse: la rotazione torna a
    // girare sul centro dell'inquadratura.
    this.commands.clearHover();
  };

  /**
   * Il tasto centrale apre l'autoscroll di Chrome, e lo apre da `mousedown`: il
   * `preventDefault` sul pointer non lo ferma, e chi orbita si ritroverebbe la
   * rosetta di scorrimento incollata in mezzo allo schermo.
   */
  private readonly onMouseDown = (event: MouseEvent): void => {
    if (isOrbitButton(event.button)) event.preventDefault();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.commands.zoomBy(-Math.sign(event.deltaY));
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    if (event.code === 'KeyQ') {
      this.commands.rotate(-1);
      return;
    }
    if (event.code === 'KeyE') {
      this.commands.rotate(1);
      return;
    }
    if (event.code === 'KeyF') {
      this.commands.frameAll();
      return;
    }
    this.pressed.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };
}

function preventDefault(event: Event): void {
  event.preventDefault();
}

/**
 * Un campo a fuoco si prende i tasti, e la camera non li vede.
 *
 * I listener stanno su `window` e finora prendevano **ogni** `event.code`:
 * scrivere un seed nel menu avrebbe panoramizzato la citta' con `WASD` e la
 * avrebbe girata con `Q` ed `E`. Vale anche per la barra dei livelli, che e' un
 * `<input type=range>`: le frecce muovevano il cursore **e** l'inquadratura.
 *
 * Niente `instanceof HTMLInputElement`: questo file gira anche in `node`, dove
 * quel nome non esiste e il confronto sarebbe un `ReferenceError` invece di un
 * no. Si guarda la forma, che e' l'unica cosa che c'e' da entrambe le parti.
 */
export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  if (target === null || target === undefined) return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (element.isContentEditable === true) return true;
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Il pan resta sul tasto sinistro e sul destro.
 *
 * Il destro conta piu' di quanto sembri: con uno strumento in mano il sinistro
 * se lo prende il piazzamento, e senza il destro l'unico pan col mouse
 * sparirebbe proprio mentre si costruisce.
 */
export function isPanButton(button: number): boolean {
  return button === 0 || button === 2;
}

/**
 * L'orbita e' sul tasto centrale.
 *
 * E' l'unico dei tre che non serviva a nient'altro: il sinistro piazza e sceglie
 * un isolato, il destro pana. Il prezzo dichiarato e' che il centrale non pana
 * piu', ed e' il gesto che meno persone usavano per farlo.
 */
export function isOrbitButton(button: number): boolean {
  return button === 1;
}
