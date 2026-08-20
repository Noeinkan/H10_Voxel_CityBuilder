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
