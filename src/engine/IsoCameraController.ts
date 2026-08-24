import { MathUtils, OrthographicCamera, Vector3 } from 'three';
import type { VoxelWorld } from '../world/VoxelWorld';
import { CameraInput, type CameraCommands } from './CameraInput';
import { panOrbitPivot, readPanAxes, scaleOrbitBounds, type OrbitBounds, type PanAxes } from './orbitPan';

/**
 * Camera ortografica isometrica per il mondo Z-up.
 *
 * Rotazione a scatti di 90 gradi (con tween breve), zoom continuo, pan sul piano
 * di terra vincolato all'AABB dei chunk esistenti. I limiti si ricalcolano quando
 * il mondo cresce, guardando `world.version`.
 *
 * L'**orbita** — yaw continuo e inclinazione che si muove — non e' un secondo
 * controller ma una manovra che vale ovunque: sulla citta' la chiede il tasto
 * centrale, e nello studio di un soggetto la prende qualunque tasto perche' li'
 * non c'e' un pan da cui distinguerla. Quello che il modo `orbiting` cambia sono
 * altre cose, elencate su di lui.
 *
 * Quale gesto chieda cosa sta in `CameraInput`; qui c'e' solo come la camera si
 * muove di conseguenza.
 */

/** Un quarto di giro: l'unita' degli scatti. */
const QUARTER = Math.PI / 2;

/** Lo yaw dello scatto zero, la diagonale isometrica. */
const YAW_BASE = MathUtils.degToRad(45);

/**
 * Inclinazione isometrica vera: atan(1 / sqrt(2)).
 *
 * E' l'inclinazione **di riposo**, non l'unica: da qui si parte, e qui
 * `levelToRest` riporta dopo un'orbita. E' quello che tiene la citta' sulla sua
 * griglia, e il motivo per cui l'angolo libero ha una via di ritorno esplicita
 * invece di essere solo uno stato in cui si finisce.
 */
const REST_PITCH = Math.atan(1 / Math.SQRT2);

/**
 * Estremi dell'inclinazione.
 *
 * In basso non e' un gusto: la correzione azimut→schermo vale `1 / sin(pitch)` e
 * verso lo zero esplode, portandosi dietro il pan e l'inversione schermo→terra.
 * In alto `lookAt` degenera, perche' la direzione di vista diventa parallela a
 * `up` — lo stesso scoglio che `SunShadow` aggira con un `up` di ripiego.
 */
const MIN_PITCH = MathUtils.degToRad(12);
const MAX_PITCH = MathUtils.degToRad(82);

/** Durata del tween di rotazione, in secondi. */
const SNAP_DURATION = 0.25;

const MIN_ZOOM = 0.15;

/**
 * Quanto si puo' arrivare vicini.
 *
 * L'inquadratura da gioco parte da `viewHeight` ~640 voxel: a otto ne restavano
 * ottanta in altezza, cioe' una decina di pixel per voxel su uno schermo da
 * 1080 — abbastanza per leggere la skyline, non per leggere una parete. Da
 * quando la facciata ha una campata (`ClassProfile.bayPeriod`, due-quattro
 * voxel) c'e' qualcosa da guardare a quella scala, e a ventiquattro il campo
 * scende sotto i trenta voxel: un piano con le sue aperture riempie lo schermo.
 * Non costa niente in resa — l'ortografica non muove la camera, quindi near,
 * far e il numero di chunk nel frustum restano quelli di prima o meno.
 */
const MAX_ZOOM = 24;

const ZOOM_STEP = 1.12;

/** Margine di pan oltre l'AABB, in voxel: lascia respiro ai bordi della citta'. */
const PAN_MARGIN = 24;

/** Frazione dell'inquadratura percorsa in un secondo di pan da tastiera. */
const PAN_SPEED = 1.1;

export interface IsoCameraOptions {
  readonly voxelSize?: number;
  /** Altezza di riferimento del target sul piano di terra, in voxel. */
  readonly targetHeight?: number;
}

/**
 * L'inquadratura per intero, abbastanza da riprodurla identica.
 *
 * Serve a una cosa sola: entrare in orbita su un soggetto e poi **restituire** la
 * citta' com'era. Senza, uscire da uno studio lascerebbe la camera a un angolo
 * qualunque e a un'altezza qualunque, e il giocatore dovrebbe rimettersi a posto
 * da solo una vista che non aveva chiesto di muovere.
 */
export interface IsoCameraState {
  readonly yaw: number;
  readonly pitch: number;
  readonly target: readonly [number, number, number];
  readonly viewHeight: number;
  readonly zoom: number;
}

export class IsoCameraController implements CameraCommands {
  readonly camera: OrthographicCamera;

  private readonly world: VoxelWorld;
  private readonly voxelSize: number;
  private readonly targetHeight: number;
  private readonly input = new CameraInput(this);

  /** Centro dell'inquadratura sul piano di terra, in coordinate di mondo. */
  private readonly target = new Vector3();
  private readonly offset = new Vector3();

  private yaw = YAW_BASE;
  private yawFrom = this.yaw;
  private yawTo = this.yaw;
  private yawTween = 1;

  /**
   * Inclinazione corrente. La muove solo l'orbita, e `levelToRest` la riporta a
   * `REST_PITCH`.
   */
  private pitch = REST_PITCH;

  /**
   * true mentre si studia un soggetto invece della citta'.
   *
   * Non e' «si sta orbitando»: l'orbita e' un gesto e vale anche sulla citta'.
   * Questo e' il modo, e cambia quattro cose e nessun'altra: **ogni** tasto del
   * mouse gira invece di panare, il target non viene riportato a terra da
   * `clampTarget`, gli scatti di `Q`/`E` diventano passi continui, e i tasti di
   * pan muovono il perno dentro `orbitBounds` invece che sul piano di terra.
   * Tutto il resto — proiezione, zoom, near e far — e' lo stesso codice, ed e' il
   * motivo per cui non e' un secondo controller.
   */
  private orbiting = false;

  /**
   * La scatola dentro cui il perno puo' muoversi in orbita, quando c'e'.
   *
   * Finche' e' null i tasti di pan restano spenti come sono sempre stati in
   * questo modo: senza sapere **cosa** non si deve perdere, muovere il perno e'
   * solo un modo lento di lasciarsi indietro il soggetto.
   */
  private orbitBounds: OrbitBounds | null = null;

  private viewHeight: number;
  private aspect = 1;
  private viewportHeight = 1;
  private boundsVersion = -1;
  private radius = 1;

  /**
   * Pivot di rotazione sul piano di terra: il punto sotto al cursore al momento
   * dello scatto, con l'offset che il target aveva rispetto a lui.
   */
  private readonly pivot = new Vector3();
  private readonly pivotOffset = new Vector3();
  private pivotActive = false;

  private element: HTMLElement | null = null;
  private hoverX = 0;
  private hoverY = 0;
  private hovering = false;

  private readonly panAxes: PanAxes = { x: 0, y: 0 };

  constructor(world: VoxelWorld, viewportWidth: number, viewportHeight: number, options: IsoCameraOptions = {}) {
    this.world = world;
    this.voxelSize = options.voxelSize ?? 1;
    this.targetHeight = (options.targetHeight ?? 0) * this.voxelSize;

    this.aspect = viewportWidth / Math.max(1, viewportHeight);
    this.viewportHeight = Math.max(1, viewportHeight);
    this.viewHeight = 64 * this.voxelSize;

    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.up.set(0, 0, 1); // mondo Z-up
    this.camera.matrixAutoUpdate = true;

    this.refreshBounds(true);
    this.updateProjection();
    this.applyTransform();
  }

  /** Collega gli input alla canvas. */
  attach(element: HTMLElement): void {
    this.element = element;
    this.input.attach(element);
  }

  detach(element: HTMLElement): void {
    this.input.detach(element);
    this.element = null;
  }

  setViewport(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.viewportHeight = Math.max(1, height);
    this.updateProjection();
  }

  /**
   * Inquadra una regione data, in voxel. Non dipende dall'AABB corrente, quindi
   * si puo' chiamare prima che la scena sia generata.
   */
  frameRegion(centreX: number, centreY: number, spanX: number, spanY: number, spanZ: number): void {
    // In orbita la quota del perno l'ha gia' scelta chi ha chiamato `setTarget`:
    // riportarla a terra qui inquadrerebbe la base di una torre invece della torre.
    const z = this.orbiting ? this.target.z : this.targetHeight;
    this.target.set(centreX * this.voxelSize, centreY * this.voxelSize, z);

    // Estensione a schermo della proiezione: le due direzioni di terra
    // contribuiscono in diagonale, l'altezza per cos(pitch). Segue l'inclinazione
    // corrente, altrimenti abbassandosi il soggetto uscirebbe dall'inquadratura.
    const projectedWidth = ((spanX + spanY) * this.voxelSize) / Math.SQRT2;
    const projectedHeight =
      projectedWidth * Math.sin(this.pitch) + spanZ * this.voxelSize * Math.cos(this.pitch);

    this.viewHeight = Math.max(projectedHeight, projectedWidth / this.aspect) * 1.06;
    this.camera.zoom = 1;
    this.updateProjection();
    this.applyTransform();
  }

  /**
   * Centra la camera sull'AABB corrente.
   *
   * `coverage` e' la frazione di lato da inquadrare: 1 mostra tutto, 0.5 e'
   * l'inquadratura da gioco. La differenza conta perche' le draw call seguono
   * direttamente da quanti chunk entrano nel frustum: inquadrare per intero una
   * citta' 512x512x64 ci mette dentro tutti i suoi ~450 chunk.
   */
  frameWorld(coverage = 1): void {
    this.refreshBounds(true);
    const b = this.world.bounds;
    if (b.empty) return;

    this.frameRegion(
      (b.minX + b.maxX) * 0.5,
      (b.minY + b.maxY) * 0.5,
      (b.maxX - b.minX) * coverage,
      (b.maxY - b.minY) * coverage,
      b.maxZ - b.minZ,
    );
  }

  /**
   * Il tasto che rimette a posto la vista: assetto e inquadratura insieme.
   *
   * Sono la stessa domanda — «fammi rivedere la mia citta'» — e chi la fa dopo
   * aver orbitato non vuole ritrovarsi tutto quanto, ma storto.
   */
  frameAll(): void {
    // Inquadrare il mondo intero mentre si studia un isolato vorrebbe dire
    // uscire dallo studio per una via che non lo dichiara: chi guarda si
    // ritroverebbe la citta' addosso senza aver chiuso niente.
    if (this.orbiting) return;
    this.levelToRest();
    this.frameWorld();
  }

  /**
   * Rimette l'assetto isometrico: inclinazione di riposo, yaw sullo scatto piu'
   * vicino.
   *
   * L'orbita sulla citta' lascia l'angolo dove il giocatore l'ha messo — e' il
   * punto, ci si costruisce da li' — quindi il ritorno alla griglia dev'essere
   * un gesto suo. Senza, l'unico modo di ritrovarla sarebbe ricaricare la
   * pagina.
   */
  levelToRest(): void {
    this.pitch = REST_PITCH;
    this.snapYawTo(this.nearestYawStep());
    this.pivotActive = false;
    this.applyTransform();
  }

  /** Avanza il tween di rotazione e applica il pan da tastiera. */
  update(dt: number): void {
    if (this.world.version !== this.boundsVersion) this.refreshBounds(false);

    let changed = false;

    if (this.yawTween < 1) {
      this.yawTween = Math.min(1, this.yawTween + dt / SNAP_DURATION);
      this.yaw = MathUtils.lerp(this.yawFrom, this.yawTo, easeInOut(this.yawTween));
      if (this.pivotActive) {
        this.orbitAroundPivot();
        if (this.yawTween >= 1) this.pivotActive = false;
      }
      changed = true;
    }

    if (readPanAxes(this.input.keys, this.panAxes)) {
      // Velocita' proporzionale all'inquadratura: il pan "sembra" costante a ogni zoom.
      const speed = (this.viewHeight / this.camera.zoom) * PAN_SPEED * dt;
      const dx = this.panAxes.x * speed;
      const dy = this.panAxes.y * speed;
      if (!this.orbiting) {
        this.panScreen(dx, dy);
        changed = true;
      } else if (this.orbitBounds !== null) {
        // In orbita gli stessi tasti muovono il perno **dentro** il soggetto:
        // di traverso sull'impronta, in su e in giu' lungo l'altezza. E' l'unico
        // modo di leggere il decimo piano di una torre, che lo zoom da solo non
        // da': avvicina, ma resta puntato a mezza altezza.
        panOrbitPivot(this.target, this.yaw, dx, dy, this.orbitBounds);
        changed = true;
      }
    }

    if (changed) this.applyTransform();
  }

  /**
   * Ruota di un quarto di giro: +1 orario, -1 antiorario.
   *
   * Se il cursore e' sulla canvas, il perno e' il punto di terra che sta sotto
   * di lui invece del centro dell'inquadratura: si gira attorno a quello che si
   * sta guardando, non attorno a dove capita che sia il target.
   *
   * L'inclinazione non la tocca: dopo un'orbita questi tasti riagganciano la
   * griglia degli scatti tenendo l'angolo scelto, e a raddrizzare c'e' `F`.
   */
  rotate(direction: number): void {
    // In orbita non ci sono scatti a cui agganciarsi: `Q` ed `E` restano utili
    // come passo di rotazione da tastiera, ma girano il soggetto e basta.
    if (this.orbiting) {
      this.orbitBy((direction > 0 ? 1 : -1) * (Math.PI / 8), 0);
      return;
    }

    this.snapYawTo(this.nearestYawStep() + (direction > 0 ? 1 : -1));
    this.pivotActive = this.groundUnderPointer(this.pivot);
    if (this.pivotActive) this.pivotOffset.subVectors(this.target, this.pivot);
  }

  zoomBy(steps: number): void {
    const factor = Math.pow(ZOOM_STEP, steps);
    this.camera.zoom = MathUtils.clamp(this.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.updateProjection();
  }

  /**
   * Entra o esce dal modo studio.
   *
   * Uscendo l'inclinazione torna a riposo, ma e' solo il ripiego: chi ha aperto
   * lo studio ha catturato l'inquadratura di prima e la rimette subito dopo,
   * angolo di citta' compreso — anche quando quell'angolo era gia' storto perche'
   * il giocatore aveva orbitato per conto suo. Serve a non lasciare la camera
   * puntata sul soggetto di uno strumento che si e' chiuso.
   */
  setOrbitMode(on: boolean): void {
    if (this.orbiting === on) return;
    this.orbiting = on;
    if (!on) {
      this.pitch = REST_PITCH;
      this.pivotActive = false;
      this.orbitBounds = null;
      this.clampTarget();
    }
    this.applyTransform();
  }

  /**
   * Dichiara il volume del soggetto, in voxel: e' quello che apre il pan da
   * tastiera in orbita.
   *
   * Il vincolo arriva da fuori perche' qui dentro non c'e' niente che sappia
   * cos'e' un isolato — la camera vede un target e una scatola. Il respiro
   * attorno lo aggiunge `scaleOrbitBounds`, che e' anche l'unico posto in cui la
   * scala del voxel entra nel conto.
   */
  setOrbitBounds(box: OrbitBounds | null): void {
    this.orbitBounds = box === null ? null : scaleOrbitBounds(box, this.voxelSize);
  }

  get orbitMode(): boolean {
    return this.orbiting;
  }

  /**
   * Gira attorno al target: yaw continuo, inclinazione clampata.
   *
   * Il target non si muove — e' il perno — quindi non c'e' nessun offset da far
   * ruotare come in `orbitAroundPivot`: li' il punto fermo era sotto al cursore e
   * il target ci girava attorno, qui il punto fermo **e'** il target.
   */
  orbitBy(dYaw: number, dPitch: number): void {
    // Un tween di scatto in corso combatterebbe con il trascinamento, riportando
    // lo yaw al suo bersaglio un frame dopo l'altro.
    this.yawTween = 1;
    this.pivotActive = false;

    this.yaw += dYaw;
    this.pitch = MathUtils.clamp(this.pitch + dPitch, MIN_PITCH, MAX_PITCH);
    this.applyTransform();
  }

  /**
   * Trascinamento: da pixel a unita' di mondo, con l'altezza del frustum che
   * copre l'altezza della canvas.
   */
  panByPixels(dxPixels: number, dyPixels: number): void {
    const scale = this.viewHeight / this.camera.zoom / this.viewportHeight;
    this.panScreen(-dxPixels * scale, dyPixels * scale);
    this.applyTransform();
  }

  setHover(clientX: number, clientY: number): void {
    this.hoverX = clientX;
    this.hoverY = clientY;
    this.hovering = true;
  }

  clearHover(): void {
    this.hovering = false;
  }

  /**
   * Sposta il perno, quota compresa.
   *
   * E' l'unico modo per alzarlo: `targetHeight` si legge una volta sola nel
   * costruttore e `clampTarget` ci riporta la z a ogni pan. Serve per mettere il
   * perno a mezza altezza di cio' che si studia, altrimenti girare attorno a una
   * torre la farebbe oscillare attorno alla propria base.
   */
  setTarget(x: number, y: number, z: number): void {
    this.target.set(x * this.voxelSize, y * this.voxelSize, z * this.voxelSize);
    this.applyTransform();
  }

  /** L'inquadratura corrente, per poterla rimettere identica. */
  captureState(): IsoCameraState {
    return {
      yaw: this.yaw,
      pitch: this.pitch,
      target: [this.target.x, this.target.y, this.target.z],
      viewHeight: this.viewHeight,
      zoom: this.camera.zoom,
    };
  }

  /** Rimette un'inquadratura catturata prima, senza tween. */
  restoreState(state: IsoCameraState): void {
    this.yaw = state.yaw;
    this.pitch = state.pitch;
    this.target.set(state.target[0], state.target[1], state.target[2]);
    this.viewHeight = state.viewHeight;
    this.camera.zoom = state.zoom;

    // Un tween in corso al momento del ripristino riporterebbe lo yaw al bersaglio
    // che aveva prima, cancellando quello appena rimesso.
    this.yawFrom = this.yaw;
    this.yawTo = this.yaw;
    this.yawTween = 1;
    this.pivotActive = false;

    this.updateProjection();
    this.applyTransform();
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  get yawDegrees(): number {
    return MathUtils.radToDeg(this.yaw);
  }

  get pitchDegrees(): number {
    return MathUtils.radToDeg(this.pitch);
  }

  get targetPosition(): Vector3 {
    return this.target;
  }

  /**
   * Lo scatto piu' vicino allo yaw **vero**, non un contatore tenuto da parte.
   *
   * Dopo un'orbita la citta' e' ferma a un angolo qualunque: un indice
   * incrementato manderebbe il tween verso uno scatto anche mezzo giro lontano,
   * e premendo `E` la citta' partirebbe dalla parte sbagliata. Ricavandolo, il
   * bersaglio resta entro tre quarti d'angolo retto e la via e' breve per
   * costruzione — che e' anche perche' qui non serve piu' normalizzare a +-180.
   */
  private nearestYawStep(): number {
    return Math.round((this.yaw - YAW_BASE) / QUARTER);
  }

  private snapYawTo(step: number): void {
    this.yawFrom = this.yaw;
    this.yawTo = YAW_BASE + QUARTER * step;
    this.yawTween = 0;
  }

  /**
   * Un movimento sul piano di terra lungo l'azimut si proietta a schermo per
   * sin(pitch): compensarlo fa seguire il cursore durante il trascinamento.
   *
   * Era una costante finche' l'inclinazione era una sola. Ora segue `pitch`, ed
   * e' il motivo per cui `MIN_PITCH` non puo' avvicinarsi a zero.
   */
  private get azimuthToScreen(): number {
    return 1 / Math.sin(this.pitch);
  }

  /**
   * Sposta il target lungo gli assi schermo proiettati sul piano di terra, cosi'
   * il trascinamento segue il cursore a qualunque rotazione.
   *
   * La destra schermo e' perpendicolare all'azimut e si proietta 1:1; il "su
   * schermo" e' l'opposto dell'azimut e va corretto per l'inclinazione.
   */
  private panScreen(dxScreen: number, dyScreen: number): void {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const lift = this.azimuthToScreen;
    const dx = dxScreen * -sin + dyScreen * -cos * lift;
    const dy = dxScreen * cos + dyScreen * -sin * lift;
    this.target.x += dx;
    this.target.y += dy;
    // Panare durante il tween trascina anche il perno: la rotazione continua
    // attorno allo stesso punto di citta', spostato insieme all'inquadratura.
    if (this.pivotActive) {
      this.pivot.x += dx;
      this.pivot.y += dy;
    }
    this.clampTarget();
  }

  /**
   * Punto del piano di terra sotto al cursore, in coordinate di mondo.
   *
   * Inverte la stessa proiezione di `panScreen`: dal pixel si passa alle unita'
   * di mondo a schermo, poi alla base (destra schermo, azimut) del piano. E' la
   * quota `targetHeight` che conta, non l'altezza vera del terreno: la camera
   * pana gia' su quel piano, e restare coerenti evita che rotazione e
   * trascinamento litighino su dove sia "sotto al mouse".
   */
  private groundUnderPointer(out: Vector3): boolean {
    const element = this.element;
    if (!element || !this.hovering) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const scale = this.viewHeight / this.camera.zoom / this.viewportHeight;
    const dxScreen = (this.hoverX - (rect.left + rect.width * 0.5)) * scale;
    const dyScreen = (rect.top + rect.height * 0.5 - this.hoverY) * scale;

    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    out.set(
      this.target.x + dxScreen * -sin + dyScreen * -cos * this.azimuthToScreen,
      this.target.y + dxScreen * cos + dyScreen * -sin * this.azimuthToScreen,
      this.targetHeight,
    );
    return true;
  }

  /**
   * Rimette il target dove il perno resta fermo a schermo.
   *
   * In ortografica basta far girare l'offset target-perno dello stesso angolo
   * del tween: le sue componenti nella base che ruota con la camera non
   * cambiano, quindi il punto sotto al mouse si proietta sempre nello stesso
   * pixel. Si ricalcola dall'offset iniziale a ogni frame invece di accumulare,
   * cosi' un eventuale clamp ai bordi non lascia deriva.
   */
  private orbitAroundPivot(): void {
    const delta = this.yaw - this.yawFrom;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const dx = this.pivotOffset.x;
    const dy = this.pivotOffset.y;
    this.target.set(this.pivot.x + dx * cos - dy * sin, this.pivot.y + dx * sin + dy * cos, this.targetHeight);
    this.clampTarget();
  }

  private clampTarget(): void {
    // In orbita il perno e' il centro del soggetto, che sta dentro l'AABB per
    // costruzione: qui non c'e' niente da vincolare, e la z andrebbe riportata a
    // terra proprio mentre serve alzata.
    if (this.orbiting) return;
    const b = this.world.bounds;
    if (b.empty) return;
    const margin = PAN_MARGIN * this.voxelSize;
    this.target.x = MathUtils.clamp(this.target.x, b.minX * this.voxelSize - margin, b.maxX * this.voxelSize + margin);
    this.target.y = MathUtils.clamp(this.target.y, b.minY * this.voxelSize - margin, b.maxY * this.voxelSize + margin);
    this.target.z = this.targetHeight;
  }

  /** Ricalcola raggio del mondo, piani near/far e limiti di pan. */
  private refreshBounds(initial: boolean): void {
    this.boundsVersion = this.world.version;
    const b = this.world.bounds;
    if (b.empty) {
      this.radius = 64 * this.voxelSize;
    } else {
      const dx = (b.maxX - b.minX) * this.voxelSize;
      const dy = (b.maxY - b.minY) * this.voxelSize;
      const dz = (b.maxZ - b.minZ) * this.voxelSize;
      this.radius = Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5;
    }

    // Ortografica: near/far generosi non costano precisione visibile ed evitano
    // qualunque clipping quando il mondo si estende a runtime.
    this.camera.near = 0.1;
    this.camera.far = this.radius * 6 + 1000;

    // Il target non viene ricentrato qui di proposito: l'AABB puo' essere ancora
    // piccola mentre la scena si genera, e strattonare l'inquadratura a ogni
    // chunk nuovo sarebbe peggio. Il vincolo si applica quando l'utente fa pan,
    // e siccome l'AABB solo cresce, un target valido resta valido.
    if (!initial) {
      this.updateProjection();
      this.applyTransform();
    }
  }

  private updateProjection(): void {
    const halfH = this.viewHeight * 0.5;
    const halfW = halfH * this.aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  private applyTransform(): void {
    const distance = this.radius * 3 + 100 * this.voxelSize;
    const cosPitch = Math.cos(this.pitch);
    this.offset.set(
      Math.cos(this.yaw) * cosPitch,
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
    );
    this.camera.position.copy(this.target).addScaledVector(this.offset, distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
