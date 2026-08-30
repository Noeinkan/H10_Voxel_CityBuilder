import { Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { StreetCameraController } from './StreetCameraController';
import { MAX_FOV, MAX_PITCH, MIN_FOV, MIN_PITCH, REST_FOV, STREET_NEAR } from './streetEye';

const WIDTH = 800;
const HEIGHT = 600;

/**
 * L'ambiente e' node: niente DOM. Come in `IsoCameraController.test.ts` si finge
 * la sola superficie che l'input tocca davvero, invece di tirare dentro jsdom.
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

/** `attach` mette i tasti su `window`, che in node non c'e'. */
function withFakeWindow(): (type: string, event: unknown) => void {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  (globalThis as Record<string, unknown>).window = {
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

function drag(
  target: { element: HTMLElement; dispatch: (type: string, event: unknown) => void },
  button: number,
  dx: number,
  dy: number,
): void {
  const { element, dispatch } = target;
  dispatch('pointerdown', { button, pointerId: 1, clientX: 400, clientY: 300, currentTarget: element, preventDefault() {} });
  dispatch('pointermove', { pointerId: 1, clientX: 400 + dx, clientY: 300 + dy, preventDefault() {} });
  dispatch('pointerup', { pointerId: 1 });
}

/** La direzione di sguardo, cioe' l'unica cosa che questa camera decide. */
function forwardOf(street: StreetCameraController): Vector3 {
  return street.camera.getWorldDirection(new Vector3());
}

describe('la camera a terra', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('si posa dove le si dice, guardando dove guardava l’isometrica', () => {
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.setEye(40, 60, 29, 0);
    expect(street.camera.position.toArray()).toEqual([40, 60, 29]);
    // yaw 0, pitch 0: si guarda lungo +x, e l'orizzonte e' piano.
    const forward = forwardOf(street);
    expect(forward.x).toBeCloseTo(1, 6);
    expect(forward.z).toBeCloseTo(0, 6);
  });

  it('il trascinamento gira la testa su qualunque tasto del mouse', () => {
    // E' il contratto con `CameraInput`, e l'unica riga che lo produce e'
    // `orbitMode: true`. Se un giorno tornasse false, il tasto sinistro
    // chiamerebbe `panByPixels` e la vista si bloccherebbe in silenzio.
    const dispatchWindow = withFakeWindow();
    void dispatchWindow;
    for (const button of [0, 1, 2]) {
      const target = fakeElement();
      const street = new StreetCameraController(WIDTH, HEIGHT);
      street.attach(target.element);
      street.setEye(0, 0, 30, 0);
      const before = forwardOf(street);
      drag(target, button, 120, 0);
      expect(forwardOf(street).angleTo(before)).toBeGreaterThan(0.05);
    }
  });

  it('l’occhio non si muove, per quanto si giri', () => {
    // «Camera fissa» e' la richiesta, ed e' l'invariante da cui dipende la
    // scatola dell'ombra: se l'occhio derivasse, l'ombra la seguirebbe.
    const dispatchWindow = withFakeWindow();
    void dispatchWindow;
    const target = fakeElement();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.attach(target.element);
    street.setEye(40, 60, 29, 0.7);

    for (let i = 0; i < 20; i++) {
      drag(target, 0, 37, -21);
      street.zoomBy(i % 2 === 0 ? 1 : -1);
    }
    expect(street.camera.position.toArray()).toEqual([40, 60, 29]);
    expect(street.eyePosition.toArray()).toEqual([40, 60, 29]);
  });

  it('l’inclinazione si ferma agli estremi e ci resta', () => {
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.setEye(0, 0, 30, 0);
    for (let i = 0; i < 200; i++) street.orbitBy(0, -0.1);
    expect(street.pitchDegrees).toBeCloseTo((MAX_PITCH * 180) / Math.PI, 6);
    for (let i = 0; i < 400; i++) street.orbitBy(0, 0.1);
    expect(street.pitchDegrees).toBeCloseTo((MIN_PITCH * 180) / Math.PI, 6);
  });

  it('trascinando in basso si guarda in basso, al contrario dell’orbita', () => {
    // `CameraInput` passa il segno dei pixel perche' girando attorno a un
    // soggetto si tira il soggetto: verso il basso vuol dire salirgli sopra. Una
    // testa non gira attorno a niente, e la stessa regola diventa il contrario
    // di quello che la mano si aspetta. Il test sta qui perche' e' l'unica cosa
    // che impedisce al segno di tornare indietro insieme all'orbita.
    const dispatchWindow = withFakeWindow();
    void dispatchWindow;
    const target = fakeElement();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.attach(target.element);
    street.setEye(0, 0, 30, 0);

    drag(target, 0, 0, 120); // il puntatore scende
    expect(forwardOf(street).z).toBeLessThan(0);

    street.frameAll();
    drag(target, 0, 0, -120); // il puntatore sale
    expect(forwardOf(street).z).toBeGreaterThan(0);
  });

  it('la rotella cambia il campo visivo, non la posizione', () => {
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.setEye(10, 10, 30, 0);
    expect(street.fov).toBeCloseTo(REST_FOV, 6);
    street.zoomBy(3);
    expect(street.fov).toBeLessThan(REST_FOV);
    expect(street.camera.position.toArray()).toEqual([10, 10, 30]);

    for (let i = 0; i < 100; i++) street.zoomBy(1);
    expect(street.fov).toBeCloseTo(MIN_FOV, 6);
    for (let i = 0; i < 200; i++) street.zoomBy(-1);
    expect(street.fov).toBeCloseTo(MAX_FOV, 6);
  });

  it('mirare col teleobiettivo non diventa impossibile', () => {
    // A campo stretto lo stesso angolo spazza piu' schermo: senza la correzione
    // sulla sensibilita', un pixel di trascinamento sposterebbe la scena di
    // molti pixel e non si riuscirebbe piu' a inquadrare niente.
    const wide = new StreetCameraController(WIDTH, HEIGHT);
    const tele = new StreetCameraController(WIDTH, HEIGHT);
    wide.setEye(0, 0, 30, 0);
    tele.setEye(0, 0, 30, 0);
    for (let i = 0; i < 100; i++) tele.zoomBy(1);

    const wideBefore = forwardOf(wide);
    const teleBefore = forwardOf(tele);
    wide.orbitBy(0.2, 0);
    tele.orbitBy(0.2, 0);
    expect(forwardOf(tele).angleTo(teleBefore)).toBeLessThan(forwardOf(wide).angleTo(wideBefore));
  });

  it('F raddrizza l’orizzonte senza buttare via il punto scelto', () => {
    // Uscire e' mestiere di `Esc`. Se `F` uscisse, chi ha solo storto il collo
    // perderebbe il posto in cui si era messo.
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.setEye(40, 60, 29, 1.2);
    street.orbitBy(0.4, -0.6);
    street.frameAll();
    expect(street.pitchDegrees).toBeCloseTo(0, 6);
    expect(street.camera.position.toArray()).toEqual([40, 60, 29]);
    // Lo yaw resta quello scelto: raddrizzare non e' rimettere a nord.
    expect(street.yawDegrees).toBeGreaterThan(0);
  });

  it('near e far restano un rapporto che il depth buffer regge', () => {
    // In prospettiva la profondita' e' iperbolica e paga `far / near`: e' la
    // ragione per cui non si possono tenere i piani generosi dell'ortografica.
    const street = new StreetCameraController(WIDTH, HEIGHT, { far: 1024 });
    expect(street.camera.near).toBeCloseTo(STREET_NEAR, 6);
    expect(street.camera.far / street.camera.near).toBeLessThan(1e4);
  });
});
