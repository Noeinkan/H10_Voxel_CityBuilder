import { Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { StreetCameraController } from './StreetCameraController';
import { MAX_FOV, MAX_PITCH, MIN_FOV, MIN_PITCH, REST_FOV, STREET_NEAR } from './streetEye';

const WIDTH = 800;
const HEIGHT = 600;

/**
 * L'ambiente e' node: niente DOM. Come in `IsoCameraController.test.ts` si finge
 * la sola superficie che l'input tocca davvero — qui anche `document`, perche' il
 * pointer lock vive li' e non sull'elemento.
 */
function fakeStage() {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const add = (type: string, handler: (event: unknown) => void): void => {
    const list = listeners.get(type) ?? [];
    list.push(handler);
    listeners.set(type, list);
  };

  const element = {
    style: {} as CSSStyleDeclaration,
    addEventListener: add,
    removeEventListener() {},
    requestPointerLock() {
      doc.pointerLockElement = element as unknown as Element;
      dispatch('pointerlockchange', {});
      return undefined;
    },
  };

  const doc = {
    pointerLockElement: null as Element | null,
    addEventListener: add,
    removeEventListener() {},
    exitPointerLock() {
      doc.pointerLockElement = null;
      dispatch('pointerlockchange', {});
    },
  };

  const dispatch = (type: string, event: unknown = {}): void => {
    for (const handler of [...(listeners.get(type) ?? [])]) handler(event);
  };

  const globals = globalThis as Record<string, unknown>;
  globals.document = doc;
  globals.window = { addEventListener: add, removeEventListener() {} };

  return { element: element as unknown as HTMLElement, doc, dispatch };
}

/** Il mouse si muove: sotto lock conta il delta, non dove sta il puntatore. */
function moveMouse(
  dispatch: (type: string, event: unknown) => void,
  movementX: number,
  movementY: number,
): void {
  dispatch('mousemove', { movementX, movementY });
}

/** La direzione di sguardo, cioe' l'unica cosa che questa camera decide. */
function forwardOf(street: StreetCameraController): Vector3 {
  return street.camera.getWorldDirection(new Vector3());
}

describe('la camera a terra', () => {
  afterEach(() => {
    const globals = globalThis as Record<string, unknown>;
    delete globals.document;
    delete globals.window;
  });

  it('si posa dove le si dice, guardando dove guardava l’isometrica', () => {
    fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.setEye(40, 60, 29, 0);
    expect(street.camera.position.toArray()).toEqual([40, 60, 29]);
    // yaw 0, pitch 0: si guarda lungo +x, e l'orizzonte e' piano.
    const forward = forwardOf(street);
    expect(forward.x).toBeCloseTo(1, 6);
    expect(forward.z).toBeCloseTo(0, 6);
  });

  it('il mouse gira la testa senza che si prema niente', () => {
    // E' la differenza fra guardarsi attorno e rigirare un modellino: qui non
    // c'e' nessun tasto da tenere premuto, e il lock e' cio' che lo rende
    // possibile senza finire contro il bordo dello schermo.
    const stage = fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.attach(stage.element);
    street.setEye(0, 0, 30, 0);
    expect(street.looking).toBe(true);

    const before = forwardOf(street);
    moveMouse(stage.dispatch, 200, 0);
    expect(forwardOf(street).angleTo(before)).toBeGreaterThan(0.05);
  });

  it('perso il puntatore la testa si ferma, e la vista non si chiude', () => {
    // `Esc` rilascia il lock — lo fa il browser — e cosi' un alt-tab. Uscire
    // dalla vista li' vorrebbe dire buttare fuori chi ha solo cambiato finestra.
    const stage = fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.attach(stage.element);
    street.setEye(0, 0, 30, 0);

    stage.doc.exitPointerLock();
    expect(street.looking).toBe(false);
    const parked = forwardOf(street);
    moveMouse(stage.dispatch, 200, 120);
    expect(forwardOf(street).angleTo(parked)).toBe(0);

    // Un clic riprende.
    stage.dispatch('pointerdown', { preventDefault() {} });
    expect(street.looking).toBe(true);
    moveMouse(stage.dispatch, 200, 0);
    expect(forwardOf(street).angleTo(parked)).toBeGreaterThan(0.05);
  });

  it('mouse in basso si guarda in basso, al contrario dell’orbita', () => {
    // `CameraInput` passa il verticale con il segno dei pixel perche' girando
    // attorno a un soggetto si tira il soggetto: verso il basso vuol dire
    // salirgli sopra. Una testa non gira attorno a niente, e la stessa regola
    // diventa il contrario di quello che la mano si aspetta. Il test sta qui
    // perche' e' l'unica cosa che impedisce al segno di tornare indietro.
    const stage = fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.attach(stage.element);
    street.setEye(0, 0, 30, 0);

    moveMouse(stage.dispatch, 0, 200);
    expect(forwardOf(street).z).toBeLessThan(0);

    street.levelHorizon();
    moveMouse(stage.dispatch, 0, -200);
    expect(forwardOf(street).z).toBeGreaterThan(0);
  });

  it('l’occhio non si muove, per quanto si giri', () => {
    // «Camera fissa» e' la richiesta, ed e' l'invariante da cui dipende la
    // scatola dell'ombra: se l'occhio derivasse, l'ombra lo seguirebbe.
    const stage = fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.attach(stage.element);
    street.setEye(40, 60, 29, 0.7);

    for (let i = 0; i < 20; i++) {
      moveMouse(stage.dispatch, 37, -21);
      street.zoomFov(i % 2 === 0 ? 1 : -1);
    }
    expect(street.camera.position.toArray()).toEqual([40, 60, 29]);
    expect(street.eyePosition.toArray()).toEqual([40, 60, 29]);
  });

  it('l’inclinazione si ferma agli estremi e ci resta', () => {
    fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.setEye(0, 0, 30, 0);
    for (let i = 0; i < 200; i++) street.look(0, -0.1);
    expect(street.pitchDegrees).toBeCloseTo((MAX_PITCH * 180) / Math.PI, 6);
    for (let i = 0; i < 400; i++) street.look(0, 0.1);
    expect(street.pitchDegrees).toBeCloseTo((MIN_PITCH * 180) / Math.PI, 6);
  });

  it('la rotella cambia il campo visivo, non la posizione', () => {
    fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.setEye(10, 10, 30, 0);
    expect(street.fov).toBeCloseTo(REST_FOV, 6);
    street.zoomFov(3);
    expect(street.fov).toBeLessThan(REST_FOV);
    expect(street.camera.position.toArray()).toEqual([10, 10, 30]);

    for (let i = 0; i < 100; i++) street.zoomFov(1);
    expect(street.fov).toBeCloseTo(MIN_FOV, 6);
    for (let i = 0; i < 200; i++) street.zoomFov(-1);
    expect(street.fov).toBeCloseTo(MAX_FOV, 6);
  });

  it('mirare col teleobiettivo non diventa impossibile', () => {
    // A campo stretto lo stesso angolo spazza piu' schermo: senza la correzione
    // sulla sensibilita', un pixel di movimento sposterebbe la scena di molti
    // pixel e non si riuscirebbe piu' a inquadrare niente.
    fakeStage();
    const wide = new StreetCameraController(WIDTH, HEIGHT);
    const tele = new StreetCameraController(WIDTH, HEIGHT);
    wide.setEye(0, 0, 30, 0);
    tele.setEye(0, 0, 30, 0);
    for (let i = 0; i < 100; i++) tele.zoomFov(1);

    const wideBefore = forwardOf(wide);
    const teleBefore = forwardOf(tele);
    wide.look(0.2, 0);
    tele.look(0.2, 0);
    expect(forwardOf(tele).angleTo(teleBefore)).toBeLessThan(forwardOf(wide).angleTo(wideBefore));
  });

  it('F raddrizza l’orizzonte senza buttare via il punto scelto', () => {
    // Uscire e' mestiere di `Esc`. Se `F` uscisse, chi ha solo storto il collo
    // perderebbe il posto in cui si era messo.
    fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT);
    street.setEye(40, 60, 29, 1.2);
    street.look(0.4, -0.6);
    street.levelHorizon();
    expect(street.pitchDegrees).toBeCloseTo(0, 6);
    expect(street.camera.position.toArray()).toEqual([40, 60, 29]);
    // Lo yaw resta quello scelto: raddrizzare non e' rimettere a nord.
    expect(street.yawDegrees).toBeGreaterThan(0);
  });

  it('near e far restano un rapporto che il depth buffer regge', () => {
    // In prospettiva la profondita' e' iperbolica e paga `far / near`: e' la
    // ragione per cui non si possono tenere i piani generosi dell'ortografica.
    fakeStage();
    const street = new StreetCameraController(WIDTH, HEIGHT, { far: 1024 });
    expect(street.camera.near).toBeCloseTo(STREET_NEAR, 6);
    expect(street.camera.far / street.camera.near).toBeLessThan(1e4);
  });
});
