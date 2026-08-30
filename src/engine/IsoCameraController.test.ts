import { MathUtils, OrthographicCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { VoxelWorld } from '../world/VoxelWorld';
import { IsoCameraController } from './IsoCameraController';
import { scaleOrbitBounds } from './orbitPan';

const WIDTH = 800;
const HEIGHT = 600;

/** Un isolato di venti colonne con sopra una torre alta duecento. */
const BLOCK = { x0: 40, y0: 40, z0: 0, x1: 60, y1: 60, z1: 200 };

/**
 * L'ambiente di test e' node: niente DOM. Serve solo la superficie che il
 * controller tocca davvero — listener, rettangolo della canvas — quindi la si
 * finge invece di tirare dentro jsdom.
 */
function fakeElement() {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const element = {
    style: {} as CSSStyleDeclaration,
    addEventListener(type: string, handler: (event: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }),
  };
  const dispatch = (type: string, event: unknown = {}): void => {
    for (const handler of listeners.get(type) ?? []) handler(event);
  };
  return { element: element as unknown as HTMLElement, dispatch };
}

/**
 * `attach` mette i tasti su `window`, non sulla canvas: senza un `window` che li
 * tenga, il pan da tastiera non si potrebbe provare affatto. Restituisce il
 * dispatch per chi ha bisogno di premerne uno.
 */
function withFakeWindow(): (type: string, event: unknown) => void {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const globals = globalThis as Record<string, unknown>;
  globals.window = {
    addEventListener(type: string, handler: (event: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener() {},
  };
  return (type: string, event: unknown): void => {
    for (const handler of listeners.get(type) ?? []) handler(event);
  };
}

/**
 * Unproiezione indipendente da quella del controller: raggio dal near plane
 * lungo l'asse di vista, intersecato col piano di terra.
 */
function groundAtPixel(camera: OrthographicCamera, px: number, py: number): Vector3 {
  const point = new Vector3((px / WIDTH) * 2 - 1, -(py / HEIGHT) * 2 + 1, -1).unproject(camera);
  const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return point.addScaledVector(forward, -point.z / forward.z);
}

function pixelOf(camera: OrthographicCamera, point: Vector3): { x: number; y: number } {
  const ndc = point.clone().project(camera);
  return { x: (ndc.x * 0.5 + 0.5) * WIDTH, y: (-ndc.y * 0.5 + 0.5) * HEIGHT };
}

function settleRotation(controller: IsoCameraController): void {
  for (let i = 0; i < 12; i++) controller.update(1 / 30);
}

describe('rotazione centrata sul cursore', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('lascia fermo sotto al mouse il punto di terra puntato', () => {
    withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    const { element, dispatch } = fakeElement();
    controller.attach(element);
    dispatch('pointermove', { pointerId: 1, clientX: 200, clientY: 150 });

    const pivot = groundAtPixel(controller.camera, 200, 150);
    expect(pivot.distanceTo(controller.targetPosition)).toBeGreaterThan(1);

    controller.rotate(1);
    settleRotation(controller);

    expect(controller.yawDegrees).toBeCloseTo(135, 6);
    const after = pixelOf(controller.camera, pivot);
    expect(after.x).toBeCloseTo(200, 6);
    expect(after.y).toBeCloseTo(150, 6);
  });

  it('torna a girare sul centro quando il cursore esce dalla canvas', () => {
    withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    const { element, dispatch } = fakeElement();
    controller.attach(element);
    dispatch('pointermove', { pointerId: 1, clientX: 200, clientY: 150 });
    dispatch('pointerleave', {});

    const before = controller.targetPosition.clone();
    controller.rotate(-1);
    settleRotation(controller);

    expect(controller.targetPosition.distanceTo(before)).toBeCloseTo(0, 9);
    expect(controller.yawDegrees).toBeCloseTo(-45, 6);
  });
});

describe('orbita sulla citta’', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  function onTheCity() {
    const dispatchKey = withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    const { element, dispatch } = fakeElement();
    controller.attach(element);
    const drag = (button: number, toX: number, toY: number): void => {
      dispatch('pointerdown', { pointerId: 1, button, clientX: 400, clientY: 300, currentTarget: element, preventDefault() {} });
      dispatch('pointermove', { pointerId: 1, clientX: toX, clientY: toY, preventDefault() {} });
      dispatch('pointerup', { pointerId: 1 });
    };
    return { controller, dispatchKey, drag };
  }

  it('il tasto centrale gira e inclina senza spostare l’inquadratura', () => {
    const { controller, drag } = onTheCity();
    const rest = controller.captureState().pitch;
    const target = controller.targetPosition.clone();

    drag(1, 460, 260);

    expect(controller.yawDegrees).not.toBeCloseTo(45, 3);
    // Tirando verso l'alto ci si abbassa sul soggetto, come nello studio.
    expect(controller.captureState().pitch).toBeLessThan(rest);
    // Il perno resta il centro dell'inquadratura: girare non e' spostarsi.
    expect(controller.targetPosition.distanceTo(target)).toBeCloseTo(0, 9);
  });

  it('il sinistro continua a panare', () => {
    // L'orbita non ha preso il posto di niente: il tasto con cui si gira e'
    // l'unico dei tre che non serviva gia' a qualcos'altro.
    const { controller, drag } = onTheCity();
    const target = controller.targetPosition.clone();

    drag(0, 460, 260);

    expect(controller.targetPosition.distanceTo(target)).toBeGreaterThan(1);
    expect(controller.yawDegrees).toBeCloseTo(45, 6);
  });

  it('Q ed E riagganciano la griglia dallo scatto piu’ vicino', () => {
    const { controller } = onTheCity();
    controller.orbitBy(MathUtils.degToRad(100), 0.3);
    const pitch = controller.captureState().pitch;

    controller.rotate(1);
    controller.update(1 / 60);
    // Con un contatore di scatti al posto dello yaw vero, `E` avrebbe puntato
    // 135 gradi: la citta' sarebbe partita **all'indietro** di dieci gradi.
    expect(controller.yawDegrees).toBeGreaterThan(145);
    settleRotation(controller);
    expect(controller.yawDegrees).toBeCloseTo(225, 6);

    // L'angolo scelto si tiene: raddrizzare e' un altro gesto.
    expect(controller.captureState().pitch).toBeCloseTo(pitch, 9);
  });

  it('F rimette l’assetto isometrico', () => {
    const { controller, dispatchKey } = onTheCity();
    const rest = controller.captureState().pitch;
    controller.orbitBy(MathUtils.degToRad(100), 0.3);

    dispatchKey('keydown', { code: 'KeyF' });
    settleRotation(controller);

    expect(controller.captureState().pitch).toBeCloseTo(rest, 9);
    expect(controller.yawDegrees).toBeCloseTo(135, 6);
  });
});

describe('inquadratura di un soggetto alto', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  /** Una megastruttura del campionario: settecento voxel su un'impronta di quaranta. */
  const TOWER = { span: 40, height: 700 };
  const TIP = new Vector3(0, 0, TOWER.height);

  function onTheTower(): IsoCameraController {
    withFakeWindow();
    const world = new VoxelWorld();
    // Un mondo non vuoto: senza AABB `clampTarget` esce subito e il pan non
    // proverebbe proprio la cosa che qui interessa.
    world.setBlock(0, 0, 0, 1);
    world.setBlock(TOWER.span, TOWER.span, TOWER.height, 1);
    return new IsoCameraController(world, WIDTH, HEIGHT, { targetHeight: 6 });
  }

  it('senza un centro dichiarato la punta resta fuori dallo schermo', () => {
    // Il difetto che il centro verticale risolve: l'altezza dichiarata era gia'
    // quella giusta, ma meta' inquadratura finiva sotto il basamento.
    const controller = onTheTower();
    controller.frameRegion(0, 0, TOWER.span, TOWER.span, TOWER.height);

    expect(pixelOf(controller.camera, TIP).y).toBeLessThan(0);
  });

  it('con il centro a meta’ altezza la punta e la base stanno insieme', () => {
    const controller = onTheTower();
    controller.frameRegion(0, 0, TOWER.span, TOWER.span, TOWER.height, TOWER.height / 2);

    const tip = pixelOf(controller.camera, TIP);
    const foot = pixelOf(controller.camera, new Vector3(0, 0, 0));
    expect(tip.y).toBeGreaterThan(0);
    expect(foot.y).toBeLessThan(HEIGHT);
  });

  it('il pan non riporta l’inquadratura sul piano di terra', () => {
    // Il perno alzato deve sopravvivere al primo tasto premuto: rimetterlo a
    // terra vorrebbe dire riperdere la punta un istante dopo averla trovata.
    const controller = onTheTower();
    controller.frameRegion(0, 0, TOWER.span, TOWER.span, TOWER.height, TOWER.height / 2);
    const z = controller.targetPosition.z;

    controller.panByPixels(30, 0);

    expect(controller.targetPosition.z).toBeCloseTo(z, 9);
    expect(pixelOf(controller.camera, TIP).y).toBeGreaterThan(0);
  });
});

describe('orbita attorno a un soggetto', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('gira attorno al target senza spostarlo', () => {
    withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    controller.setOrbitMode(true);
    controller.setTarget(100, 60, 40);

    const target = controller.targetPosition.clone();
    const before = controller.camera.position.clone();
    controller.orbitBy(0.7, 0.2);

    // Il perno e' il target, quindi e' l'unica cosa che non si muove: senza
    // questo, girare farebbe scivolare via il soggetto che si stava guardando.
    expect(controller.targetPosition.distanceTo(target)).toBeCloseTo(0, 9);
    expect(controller.camera.position.distanceTo(before)).toBeGreaterThan(1);
  });

  it('l’inclinazione resta dentro i limiti anche insistendo', () => {
    withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    controller.setOrbitMode(true);
    controller.setTarget(0, 0, 20);

    // Verso l'alto: oltre il limite `lookAt` degenererebbe, con `up` parallelo
    // alla direzione di vista.
    for (let i = 0; i < 60; i++) controller.orbitBy(0, 0.2);
    expect(Number.isFinite(controller.camera.position.z)).toBe(true);
    const up = controller.camera.position.clone().sub(controller.targetPosition).normalize();
    expect(up.z).toBeLessThan(0.995);

    // Verso il basso: la correzione azimut→schermo vale 1/sin(pitch) ed esplode
    // avvicinandosi a zero.
    for (let i = 0; i < 120; i++) controller.orbitBy(0, -0.2);
    const low = controller.camera.position.clone().sub(controller.targetPosition).normalize();
    expect(low.z).toBeGreaterThan(0.1);
  });

  it('lo stato catturato rimette l’inquadratura identica', () => {
    withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    controller.frameRegion(40, 40, 200, 200, 64);
    const before = controller.captureState();
    const position = controller.camera.position.clone();
    const target = controller.targetPosition.clone();

    controller.setOrbitMode(true);
    controller.setTarget(300, 120, 90);
    controller.orbitBy(1.4, 0.3);
    controller.zoomBy(3);

    controller.setOrbitMode(false);
    controller.restoreState(before);

    expect(controller.targetPosition.distanceTo(target)).toBeCloseTo(0, 6);
    expect(controller.camera.position.distanceTo(position)).toBeCloseTo(0, 6);
    expect(controller.zoom).toBeCloseTo(before.zoom, 9);
    expect(controller.yawDegrees).toBeCloseTo(45, 6);
  });

  it('uscire dall’orbita riporta la citta’ sull’inclinazione isometrica', () => {
    withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    const rest = controller.captureState().pitch;

    controller.setOrbitMode(true);
    controller.orbitBy(0, 0.4);
    expect(controller.captureState().pitch).not.toBeCloseTo(rest, 6);

    controller.setOrbitMode(false);
    expect(controller.captureState().pitch).toBeCloseTo(rest, 9);
  });

  it('in orbita il trascinamento gira invece di spostare la citta’', () => {
    withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    const { element, dispatch } = fakeElement();
    controller.attach(element);
    controller.setOrbitMode(true);
    controller.setTarget(50, 50, 30);

    const target = controller.targetPosition.clone();
    const yaw = controller.yawDegrees;
    dispatch('pointerdown', { pointerId: 1, button: 0, clientX: 400, clientY: 300, currentTarget: element, preventDefault() {} });
    dispatch('pointermove', { pointerId: 1, clientX: 460, clientY: 300, preventDefault() {} });

    expect(controller.yawDegrees).not.toBeCloseTo(yaw, 3);
    expect(controller.targetPosition.distanceTo(target)).toBeCloseTo(0, 9);
  });

  it('i tasti salgono lungo il soggetto e si fermano al suo bordo', () => {
    const dispatchKey = withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    const { element } = fakeElement();
    controller.attach(element);
    controller.setOrbitMode(true);
    controller.setOrbitBounds(BLOCK);
    controller.setTarget(50, 50, 100);

    dispatchKey('keydown', { code: 'KeyW' });
    for (let i = 0; i < 240; i++) controller.update(1 / 60);

    // Salire lungo la torre e' il movimento che mancava: lo zoom avvicina, ma
    // resta puntato a mezza altezza, e i piani alti non si raggiungevano.
    expect(controller.targetPosition.z).toBeGreaterThan(100);
    expect(controller.targetPosition.z).toBeCloseTo(scaleOrbitBounds(BLOCK, 1).z1, 6);
  });

  it('senza un soggetto in mano i tasti in orbita non muovono il perno', () => {
    const dispatchKey = withFakeWindow();
    const controller = new IsoCameraController(new VoxelWorld(), WIDTH, HEIGHT);
    const { element } = fakeElement();
    controller.attach(element);

    // Studiare un isolato e poi mollarlo: la scatola del primo non deve
    // sopravvivergli, o il pan del prossimo studio si vincolerebbe a un volume
    // che sta da un'altra parte della citta'.
    controller.setOrbitMode(true);
    controller.setOrbitBounds(BLOCK);
    controller.setOrbitMode(false);
    controller.setOrbitMode(true);
    controller.setTarget(50, 50, 100);

    const target = controller.targetPosition.clone();
    dispatchKey('keydown', { code: 'KeyD' });
    for (let i = 0; i < 60; i++) controller.update(1 / 60);

    expect(controller.targetPosition.distanceTo(target)).toBeCloseTo(0, 9);
  });
});
