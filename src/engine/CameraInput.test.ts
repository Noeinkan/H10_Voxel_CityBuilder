import { afterEach, describe, expect, it } from 'vitest';
import { CameraInput, isOrbitButton, isPanButton, type CameraCommands } from './CameraInput';

describe('tasti del mouse', () => {
  it('pana con sinistro e destro', () => {
    expect(isPanButton(0)).toBe(true);
    expect(isPanButton(2)).toBe(true);
  });

  it('orbita col centrale, e solo con quello', () => {
    expect(isOrbitButton(1)).toBe(true);
    expect(isPanButton(1)).toBe(false);
    expect(isOrbitButton(0)).toBe(false);
    expect(isOrbitButton(2)).toBe(false);
  });

  it('ignora i pulsanti laterali', () => {
    expect(isPanButton(3)).toBe(false);
    expect(isOrbitButton(4)).toBe(false);
  });
});

/** Registra cosa e' stato chiesto, senza nessuna camera dietro. */
function fakeCommands() {
  const calls: string[] = [];
  const commands = {
    orbitMode: false,
    panByPixels(dx: number, dy: number) {
      calls.push(`pan ${dx} ${dy}`);
    },
    orbitBy(dYaw: number, dPitch: number) {
      calls.push(`orbit ${dYaw.toFixed(3)} ${dPitch.toFixed(3)}`);
    },
    rotate(direction: number) {
      calls.push(`rotate ${direction}`);
    },
    zoomBy(steps: number) {
      calls.push(`zoom ${steps}`);
    },
    frameAll() {
      calls.push('frameAll');
    },
    setHover() {},
    clearHover() {
      calls.push('clearHover');
    },
  };
  return { commands: commands as CameraCommands & { orbitMode: boolean }, calls };
}

/**
 * L'ambiente di test e' node: niente DOM. Serve solo la superficie che l'input
 * tocca davvero — listener e cattura del pointer — quindi la si finge invece di
 * tirare dentro jsdom.
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
  };
  const dispatch = (type: string, event: Record<string, unknown> = {}): void => {
    const full = { preventDefault() {}, currentTarget: element, ...event };
    for (const handler of listeners.get(type) ?? []) handler(full);
  };
  return { element: element as unknown as HTMLElement, dispatch };
}

/** I tasti li ascolta `window`, non la canvas: serve anche quello, finto. */
function withFakeWindow(): (type: string, event: Record<string, unknown>) => void {
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
  return (type: string, event: Record<string, unknown>): void => {
    for (const handler of listeners.get(type) ?? []) handler(event);
  };
}

function attached() {
  const dispatchKey = withFakeWindow();
  const { commands, calls } = fakeCommands();
  const { element, dispatch } = fakeElement();
  const input = new CameraInput(commands);
  input.attach(element);
  return { input, commands, calls, dispatch, dispatchKey };
}

describe('gesti di trascinamento', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('il tasto centrale orbita, il sinistro pana', () => {
    const { calls, dispatch } = attached();

    dispatch('pointerdown', { pointerId: 1, button: 1, clientX: 100, clientY: 100 });
    dispatch('pointermove', { pointerId: 1, clientX: 140, clientY: 110 });
    expect(calls.at(-1)).toBe('orbit -0.240 0.060');

    dispatch('pointerup', { pointerId: 1 });
    dispatch('pointerdown', { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    dispatch('pointermove', { pointerId: 2, clientX: 140, clientY: 110 });
    expect(calls.at(-1)).toBe('pan 40 10');
  });

  it('in studio gira anche il sinistro', () => {
    // Li' non c'e' un pan da cui distinguerlo: il perno e' il soggetto e
    // spostarlo col trascinamento vorrebbe dire perderlo.
    const { commands, calls, dispatch } = attached();
    commands.orbitMode = true;

    dispatch('pointerdown', { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    dispatch('pointermove', { pointerId: 1, clientX: 130, clientY: 100 });

    expect(calls.at(-1)).toBe('orbit -0.180 0.000');
  });

  it('un gesto non cambia strada a meta’', () => {
    // Entrare in studio con il tasto gia' premuto trasformerebbe il pan in corso
    // in una rotazione, e la citta' partirebbe per la tangente sotto la mano.
    const { commands, calls, dispatch } = attached();

    dispatch('pointerdown', { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    commands.orbitMode = true;
    dispatch('pointermove', { pointerId: 1, clientX: 130, clientY: 100 });

    expect(calls.at(-1)).toBe('pan 30 0');
  });

  it('ferma l’autoscroll del tasto centrale', () => {
    // Chrome lo apre da `mousedown`, e il `preventDefault` sul pointer non basta.
    const { dispatch } = attached();
    let prevented = 0;
    dispatch('mousedown', { button: 1, preventDefault: () => { prevented += 1; } });
    dispatch('mousedown', { button: 0, preventDefault: () => { prevented += 1; } });
    expect(prevented).toBe(1);
  });
});

describe('tastiera', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('Q ed E ruotano, F rimette a posto la vista', () => {
    const { calls, dispatchKey } = attached();

    dispatchKey('keydown', { code: 'KeyQ' });
    dispatchKey('keydown', { code: 'KeyE' });
    dispatchKey('keydown', { code: 'KeyF' });

    expect(calls).toEqual(['rotate -1', 'rotate 1', 'frameAll']);
  });

  it('gli altri tasti restano un insieme da leggere, non un comando', () => {
    // Cosa **significhino** lo decide `orbitPan`, che sa gia' che gli stessi
    // tasti muovono l'inquadratura sulla citta' e il perno dentro uno studio.
    const { input, calls, dispatchKey } = attached();

    dispatchKey('keydown', { code: 'KeyW' });
    dispatchKey('keydown', { code: 'ArrowLeft' });
    expect([...input.keys]).toEqual(['KeyW', 'ArrowLeft']);
    expect(calls).toEqual([]);

    dispatchKey('keyup', { code: 'KeyW' });
    expect([...input.keys]).toEqual(['ArrowLeft']);
  });

  it('i comandi di rotazione non restano premuti', () => {
    // `Q` in mezzo a `WASD` sull'insieme dei tasti sarebbe un pan che non
    // finisce piu': chi lo preme non lo rilascia dentro il gesto di rotazione.
    const { input, dispatchKey } = attached();
    dispatchKey('keydown', { code: 'KeyQ' });
    expect(input.keys.size).toBe(0);
  });
});
