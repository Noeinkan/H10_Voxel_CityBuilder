import { OrthographicCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { VoxelWorld } from '../world/VoxelWorld';
import { IsoCameraController, isPanButton } from './IsoCameraController';

const WIDTH = 800;
const HEIGHT = 600;

describe('isPanButton', () => {
  it.each([0, 1, 2])('accetta il pulsante pointer %i', (button) => {
    expect(isPanButton(button)).toBe(true);
  });

  it('rifiuta i pulsanti laterali', () => {
    expect(isPanButton(3)).toBe(false);
    expect(isPanButton(4)).toBe(false);
  });
});

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

function withFakeWindow(): void {
  const globals = globalThis as Record<string, unknown>;
  globals.window ??= { addEventListener() {}, removeEventListener() {} };
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
});
