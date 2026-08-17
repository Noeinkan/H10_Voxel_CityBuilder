import { MathUtils, OrthographicCamera, Vector3 } from 'three';
import type { VoxelWorld } from '../world/VoxelWorld';

/**
 * Camera ortografica isometrica per il mondo Z-up.
 *
 * Rotazione a scatti di 90 gradi (con tween breve), zoom continuo, pan sul piano
 * di terra vincolato all'AABB dei chunk esistenti. I limiti si ricalcolano quando
 * il mondo cresce, guardando `world.version`.
 */

/** Inclinazione isometrica vera: atan(1 / sqrt(2)). */
const PITCH = Math.atan(1 / Math.SQRT2);

/** Durata del tween di rotazione, in secondi. */
const SNAP_DURATION = 0.25;

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.12;

/** Margine di pan oltre l'AABB, in voxel: lascia respiro ai bordi della citta'. */
const PAN_MARGIN = 24;

/** Frazione dell'inquadratura percorsa in un secondo di pan da tastiera. */
const PAN_SPEED = 0.6;

/**
 * Un movimento sul piano di terra lungo l'azimut si proiettta a schermo per
 * sin(PITCH): compensarlo fa seguire il cursore durante il trascinamento.
 */
const AZIMUTH_TO_SCREEN = 1 / Math.sin(PITCH);

export interface IsoCameraOptions {
  readonly voxelSize?: number;
  /** Altezza di riferimento del target sul piano di terra, in voxel. */
  readonly targetHeight?: number;
}

export class IsoCameraController {
  readonly camera: OrthographicCamera;

  private readonly world: VoxelWorld;
  private readonly voxelSize: number;
  private readonly targetHeight: number;

  /** Centro dell'inquadratura sul piano di terra, in coordinate di mondo. */
  private readonly target = new Vector3();
  private readonly offset = new Vector3();

  /** Indice dello scatto corrente, 0..3. Yaw = 45 + 90 * step gradi. */
  private yawStep = 0;
  private yaw = MathUtils.degToRad(45);
  private yawFrom = this.yaw;
  private yawTo = this.yaw;
  private yawTween = 1;

  private viewHeight: number;
  private aspect = 1;
  private viewportHeight = 1;
  private boundsVersion = -1;
  private radius = 1;

  private readonly keys = new Set<string>();
  private panX = 0;
  private panY = 0;
  private panning = false;
  private pointerId: number | null = null;

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
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', preventDefault);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(element: HTMLElement): void {
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointermove', this.onPointerMove);
    element.removeEventListener('pointerup', this.onPointerUp);
    element.removeEventListener('pointercancel', this.onPointerUp);
    element.removeEventListener('wheel', this.onWheel);
    element.removeEventListener('contextmenu', preventDefault);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
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
    this.target.set(centreX * this.voxelSize, centreY * this.voxelSize, this.targetHeight);

    // Estensione a schermo della proiezione isometrica: le due direzioni di terra
    // contribuiscono in diagonale, l'altezza per cos(PITCH).
    const projectedWidth = ((spanX + spanY) * this.voxelSize) / Math.SQRT2;
    const projectedHeight = projectedWidth * Math.sin(PITCH) + spanZ * this.voxelSize * Math.cos(PITCH);

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

  /** Avanza il tween di rotazione e applica il pan da tastiera. */
  update(dt: number): void {
    if (this.world.version !== this.boundsVersion) this.refreshBounds(false);

    let changed = false;

    if (this.yawTween < 1) {
      this.yawTween = Math.min(1, this.yawTween + dt / SNAP_DURATION);
      this.yaw = MathUtils.lerp(this.yawFrom, this.yawTo, easeInOut(this.yawTween));
      changed = true;
    }

    if (this.readKeyboardPan()) {
      // Velocita' proporzionale all'inquadratura: il pan "sembra" costante a ogni zoom.
      const speed = (this.viewHeight / this.camera.zoom) * PAN_SPEED * dt;
      this.panScreen(this.panX * speed, this.panY * speed);
      changed = true;
    }

    if (changed) this.applyTransform();
  }

  /** Ruota di un quarto di giro: +1 orario, -1 antiorario. */
  rotate(direction: number): void {
    this.yawStep = (this.yawStep + (direction > 0 ? 1 : -1)) & 3;
    this.yawFrom = this.yaw;
    this.yawTo = MathUtils.degToRad(45) + (Math.PI / 2) * this.yawStep;
    // Il tween prende sempre la via breve, anche passando per 315 -> 45 gradi.
    while (this.yawTo - this.yawFrom > Math.PI) this.yawTo -= Math.PI * 2;
    while (this.yawTo - this.yawFrom < -Math.PI) this.yawTo += Math.PI * 2;
    this.yawTween = 0;
  }

  zoomBy(steps: number): void {
    const factor = Math.pow(ZOOM_STEP, steps);
    this.camera.zoom = MathUtils.clamp(this.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.updateProjection();
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  get yawDegrees(): number {
    return MathUtils.radToDeg(this.yaw);
  }

  get targetPosition(): Vector3 {
    return this.target;
  }

  private readKeyboardPan(): boolean {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    this.panX = x;
    this.panY = y;
    return x !== 0 || y !== 0;
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
    this.target.x += dxScreen * -sin + dyScreen * -cos * AZIMUTH_TO_SCREEN;
    this.target.y += dxScreen * cos + dyScreen * -sin * AZIMUTH_TO_SCREEN;
    this.clampTarget();
  }

  private clampTarget(): void {
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
    const cosPitch = Math.cos(PITCH);
    this.offset.set(
      Math.cos(this.yaw) * cosPitch,
      Math.sin(this.yaw) * cosPitch,
      Math.sin(PITCH),
    );
    this.camera.position.copy(this.target).addScaledVector(this.offset, distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    // Tasto destro o centrale: pan. Il sinistro resta libero per il gameplay.
    if (event.button !== 1 && event.button !== 2) return;
    this.panning = true;
    this.pointerId = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.panning || event.pointerId !== this.pointerId) return;
    // Da pixel a unita' di mondo: l'altezza del frustum copre l'altezza in pixel.
    const scale = this.viewHeight / this.camera.zoom / this.viewportHeight;
    this.panScreen(-event.movementX * scale, event.movementY * scale);
    this.applyTransform();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.panning = false;
    this.pointerId = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoomBy(-Math.sign(event.deltaY));
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyQ') {
      this.rotate(-1);
      return;
    }
    if (event.code === 'KeyE') {
      this.rotate(1);
      return;
    }
    if (event.code === 'KeyF') {
      this.frameWorld();
      return;
    }
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function preventDefault(event: Event): void {
  event.preventDefault();
}
