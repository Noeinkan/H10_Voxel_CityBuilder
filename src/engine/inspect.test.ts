import { describe, expect, it } from 'vitest';
import {
  INSPECT,
  INSPECT_MODE,
  INSPECT_MODES,
  clampSliceZ,
  cycleInspectMode,
  inspectGuide,
  inspectUniforms,
  isBoundedRect,
  isCut,
  isOpenPlane,
  modeCuts,
  modeHasLevel,
  needsCap,
  parseInspectMode,
  sectionAxis,
  type InspectMode,
  type InspectState,
  type InspectUniforms,
} from './inspect';
import { XRAY, lensChord } from './xray';

/** Sguardo isometrico canonico: yaw 45 gradi, in discesa verso l'origine. */
const VIEW: readonly [number, number, number] = [-0.577, -0.577, -0.577];

function stateOf(patch: Partial<InspectState>): InspectState {
  return {
    mode: INSPECT_MODE.off,
    sliceZ: INSPECT.defaultSliceZ,
    focus: null,
    view: VIEW,
    block: null,
    subject: null,
    landmark: null,
    section: null,
    locked: false,
    ...patch,
  };
}

/** Il primo predicato del fragment: il frammento sta oltre il piano. */
function beyondPlane(u: InspectUniforms, x: number, y: number, z: number): boolean {
  return u.plane[0] * x + u.plane[1] * y + u.plane[2] * z > u.plane[3];
}

/** Il secondo: sta dentro il rettangolo. */
function insideRect(u: InspectUniforms, x: number, y: number): boolean {
  return x >= u.rect[0] && y >= u.rect[1] && x <= u.rect[2] && y <= u.rect[3];
}

/** Il terzo: la lente e' accesa e il raggio di vista la incontra piu' avanti. */
function insideLens(
  u: InspectUniforms,
  view: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): boolean {
  if (u.lensMax[0] <= u.lensMin[0]) return true;
  return lensChord(u, view, x, y, z) > 0;
}

/**
 * La stessa condizione che il fragment valuta, riscritta qui una volta sola.
 *
 * E' l'unica copia del predicato oltre a quella GLSL, e questi test sono cio'
 * che tiene allineate le due — come `lighting.test.ts` per il modello di luce.
 * La sfumatura resta fuori: ammorbidisce il bordo, non sposta la decisione.
 */
function hidden(
  u: InspectUniforms,
  x: number,
  y: number,
  z: number,
  view: readonly [number, number, number] = VIEW,
): boolean {
  if (u.veil <= 0) return false;
  const rectSide = u.inside > 0 ? insideRect(u, x, y) : !insideRect(u, x, y);
  return beyondPlane(u, x, y, z) && rectSide && insideLens(u, view, x, y, z);
}

describe('inspectUniforms', () => {
  it('a vista spenta non si nasconde niente, in nessun punto del mondo', () => {
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.off }));

    expect(u.veil).toBe(0);
    for (const p of [[0, 0, 0], [1e6, -1e6, 200], [-40, 90, 0]] as const) {
      expect(hidden(u, p[0], p[1], p[2])).toBe(false);
    }
  });

  it('i raggi X nascondono cio’ che copre il soggetto, non cio’ che gli sta dietro', () => {
    const subject = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
    const centre = { x: 104, y: 104, z: 40 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, subject }));

    // Sulla stessa retta di vista: davanti e' nascosto, dietro no. Sono la
    // stessa colonna dello schermo, e senza il verso sarebbero indistinguibili.
    const step = (distance: number) => ({
      x: centre.x - VIEW[0] * distance,
      y: centre.y - VIEW[1] * distance,
      z: centre.z - VIEW[2] * distance,
    });
    const near = step(30);
    const behind = step(-30);

    expect(hidden(u, near.x, near.y, near.z)).toBe(true);
    expect(hidden(u, behind.x, behind.y, behind.z)).toBe(false);
    // Il soggetto non si vela da solo: il raggio, per lui, e' gia' cominciato.
    expect(hidden(u, centre.x, centre.y, centre.z)).toBe(false);

    // Vela, non taglia: la sagoma davanti resta leggibile.
    expect(u.veil).toBe(XRAY.veil);
    expect(isCut(u)).toBe(false);
  });

  it('i raggi X aprono una finestra, non dissolvono mezza citta’', () => {
    const subject = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, subject }));

    // Stessa profondita' del punto nascosto qui sopra, ma di fianco: e' quello
    // che il semipiano da solo velava, e con lui l'intero primo piano.
    const near = { x: 104 - VIEW[0] * 30, y: 104 - VIEW[1] * 30, z: 40 - VIEW[2] * 30 };
    for (const aside of [40, -40]) {
      expect(hidden(u, near.x + aside, near.y, near.z)).toBe(false);
      expect(hidden(u, near.x, near.y + aside, near.z)).toBe(false);
    }
  });

  it('sul suolo nudo la lente si apre lo stesso, attorno al punto', () => {
    // Puntare la terra e' una domanda legittima — «cosa mi nasconde quel pezzo
    // di isola» — e un soggetto alto zero darebbe una lente schiacciata al suolo.
    const focus = { x: 100, y: 100, z: 20 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, focus }));

    const near = { x: focus.x - VIEW[0] * 30, y: focus.y - VIEW[1] * 30, z: focus.z - VIEW[2] * 30 };
    expect(hidden(u, near.x, near.y, near.z)).toBe(true);
    expect(hidden(u, near.x + XRAY.bare * 4, near.y, near.z)).toBe(false);
    // Il pavimento e' la quota del terreno che si sta guardando.
    expect(u.lensMin[3]).toBe(focus.z);
  });

  it('la finestra e’ il soggetto, non un numero deciso una volta per tutte', () => {
    // Due soggetti nello stesso punto: una casa bassa e una torre. Cio' che si
    // apre e' diverso, ed e' tutta la differenza fra una lente e un riquadro
    // fisso — quello di prima era largo uguale per entrambi.
    const hut = inspectUniforms(stateOf({
      mode: INSPECT_MODE.xray,
      subject: { x0: 100, y0: 100, z0: 20, x1: 104, y1: 104, z1: 26 },
    }));
    const tower = inspectUniforms(stateOf({
      mode: INSPECT_MODE.xray,
      subject: { x0: 100, y0: 100, z0: 20, x1: 104, y1: 104, z1: 90 },
    }));

    // Un occlusore in alto, davanti a dove sale solo la torre: la casa non ha
    // niente da scoprire lassu' e non deve toglierlo.
    const high = { x: 102 - VIEW[0] * 30, y: 102 - VIEW[1] * 30, z: 80 - VIEW[2] * 30 };
    expect(hidden(tower, high.x, high.y, high.z)).toBe(true);
    expect(hidden(hut, high.x, high.y, high.z)).toBe(false);

    // Il respiro attorno al soggetto non e' zero, o il retino finirebbe sul suo
    // bordo e la finestra leggerebbe come un ritaglio invece che come una lente.
    expect(hut.lensMin[0]).toBeLessThan(100);
    expect(hut.lensMax[0]).toBeGreaterThan(104);
    // Il pavimento resta la base **vera**, non quella allargata.
    expect(hut.lensMin[3]).toBe(20);
  });

  it('cio’ che copre il soggetto sta nella lente da qualunque angolo', () => {
    // E' la proprieta' che un riquadro di **mondo** non puo' avere. Un occlusore
    // non sta sopra a cio' che copre: sta davanti, e la sua colonna e' spostata
    // di quanto e' alto. Girando la camera si sposta dall'altra parte, e una
    // finestra allineata agli assi lo perde o si allarga fino a mezzo schermo.
    const subject = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
    const centre = { x: 104, y: 104, z: 40 };

    for (const view of [
      [-0.577, -0.577, -0.577],
      [0.577, -0.577, -0.577],
      [0.707, 0.5, -0.5],
      [0, -0.866, -0.5],
    ] as const) {
      const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, subject, view }));
      for (const distance of [20, 60]) {
        const p = {
          x: centre.x - view[0] * distance,
          y: centre.y - view[1] * distance,
          z: centre.z - view[2] * distance,
        };
        expect(hidden(u, p.x, p.y, p.z, view), `vista ${view} a ${distance}`).toBe(true);
      }
    }
  });

  it('i raggi X non bucano mai il suolo sotto il soggetto', () => {
    // Il difetto piu' visibile di tutti: il terreno davanti al soggetto lo copre
    // come lo copre un muro, e dietro al terreno non c'e' niente. La citta' si
    // apriva su una macchia di cielo, e non c'era modo di capire cosa fosse.
    const subject = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, subject }));

    // Fuori dall'impronta del soggetto, ma davanti a lui sullo schermo: e'
    // esattamente il terreno che si vedeva sparire.
    for (const aside of [8, 9]) {
      const x = 104 + aside;
      const y = 104 + aside;
      expect(hidden(u, x, y, 20), `suolo a ${aside}`).toBe(false);
      expect(hidden(u, x, y, 19), `sottosuolo a ${aside}`).toBe(false);
      // Un voxel sopra il pavimento invece si vela: li' c'e' un muro, non terra.
      expect(hidden(u, x, y, 21), `muro a ${aside}`).toBe(true);
    }
  });

  it('il soggetto non vela mai se stesso, in nessuno dei suoi spigoli', () => {
    const subject = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, subject }));

    // Non serve nessun piano ancorato da qualche parte: chi sta dentro il volume
    // ha il raggio gia' cominciato, e `enter` negativo lo esclude da solo. Con un
    // piano per il centro sparirebbe la meta' anteriore di cio' che si guarda,
    // cioe' proprio la faccia che si voleva vedere.
    for (const x of [subject.x0, subject.x1]) {
      for (const y of [subject.y0, subject.y1]) {
        for (const z of [subject.z0, subject.z1]) {
          expect(hidden(u, x, y, z), `spigolo ${x},${y},${z}`).toBe(false);
        }
      }
    }
  });

  it('i raggi X accendono il landmark sotto il cursore, con il suo volume esatto', () => {
    const subject = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
    const landmark = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, subject, landmark }));

    // L'accensione non prende il respiro del velo: e' il landmark, non l'alone,
    // e deve fermarsi esattamente sul suo bordo per non tignere i vicini.
    expect(u.glowMin).toEqual([100, 100, 20]);
    expect(u.glowMax).toEqual([108, 108, 60]);
    // La lente resta quella di prima, allargata del respiro: accendere e'
    // un'azione in piu', non un velo piu' largo.
    expect(u.lensMin[0]).toBeLessThan(100);
    expect(u.veil).toBe(XRAY.veil);
  });

  it('senza landmark sotto il cursore la lente vela ma non accende niente', () => {
    const u = inspectUniforms(stateOf({
      mode: INSPECT_MODE.xray,
      subject: { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 },
    }));

    expect(u.glowMax[0]).toBeLessThanOrEqual(u.glowMin[0]);
  });

  it('nessun modo oltre ai raggi X accende un landmark', () => {
    const landmark = { x0: 0, y0: 0, z0: 0, x1: 4, y1: 4, z1: 8 };
    for (const mode of [INSPECT_MODE.off, INSPECT_MODE.slice, INSPECT_MODE.section, INSPECT_MODE.block]) {
      const u = inspectUniforms(stateOf({
        mode,
        focus: { x: 10, y: 10, z: 10 },
        block: { x0: 0, y0: 0, x1: 8, y1: 8 },
        section: { axis: 1, at: 64 },
        landmark,
      }));
      expect(u.glowMax[0]).toBeLessThanOrEqual(u.glowMin[0]);
    }
  });

  it('la corda della lente misura la distanza dal bordo della sagoma', () => {
    // E' cio' che sfuma il bordo, e non e' un secondo conto: la corda va a zero
    // sul contorno della sagoma e cresce verso il centro, quindi il retino si
    // spegne dove la lente finisce invece di tagliarsi su una riga di voxel.
    const subject = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.xray, subject }));
    const near = (aside: number) => lensChord(
      u,
      VIEW,
      104 - VIEW[0] * 30 + aside,
      104 - VIEW[1] * 30,
      40 - VIEW[2] * 30,
    );

    expect(near(0)).toBeGreaterThan(near(6));
    expect(near(6)).toBeGreaterThan(0);
    expect(near(40)).toBe(0);
    // Dietro al soggetto la corda e' zero anche dove la sagoma ci sarebbe: non
    // e' una regione, e' un verso.
    expect(lensChord(u, VIEW, 104 + VIEW[0] * 30, 104 + VIEW[1] * 30, 40 + VIEW[2] * 30)).toBe(0);
  });

  it('senza colonna a fuoco i raggi X e l’isolato restano inerti', () => {
    expect(inspectUniforms(stateOf({ mode: INSPECT_MODE.xray })).veil).toBe(0);
    expect(inspectUniforms(stateOf({ mode: INSPECT_MODE.block })).veil).toBe(0);
    expect(inspectUniforms(stateOf({ mode: INSPECT_MODE.section })).veil).toBe(0);
  });

  it('la fetta taglia sopra la quota e lascia intatto cio’ che sta sotto', () => {
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.slice, sliceZ: 30 }));

    expect(hidden(u, 0, 0, 31)).toBe(true);
    expect(hidden(u, 0, 0, 30)).toBe(false);
    // Vale su tutta la mappa: la fetta non ha una finestra, e' orizzontale.
    expect(hidden(u, 999, -999, 29)).toBe(false);
    expect(hidden(u, 999, -999, 80)).toBe(true);
    // Il taglio e' la stessa manopola del velo portata al massimo.
    expect(isCut(u)).toBe(true);
    expect(u.veil).toBe(1);
  });

  it('la sezione sceglie l’asse piu’ parallelo alla vista', () => {
    expect(sectionAxis([-0.9, -0.1, -0.4])).toBe(0);
    expect(sectionAxis([-0.1, 0.9, -0.4])).toBe(1);
    // A parita' esatta si sceglie x: serve una risposta, non un caso.
    expect(sectionAxis([0.5, -0.5, 0])).toBe(0);
  });

  it('la sezione toglie il lato della camera, su entrambi i versi di sguardo', () => {
    const section = { axis: 0, at: 120 } as const;

    // Camera a est: guarda verso -x, quindi la meta' a est del piano se ne va.
    const west = inspectUniforms(stateOf({ mode: INSPECT_MODE.section, section, view: [-1, 0, 0] }));
    expect(hidden(west, 130, 0, 0)).toBe(true);
    expect(hidden(west, 110, 0, 0)).toBe(false);

    // Camera a ovest: si specchia tutto, e la faccia di sezione guarda ancora
    // la camera invece di finire di spalle.
    const east = inspectUniforms(stateOf({ mode: INSPECT_MODE.section, section, view: [1, 0, 0] }));
    expect(hidden(east, 110, 0, 0)).toBe(true);
    expect(hidden(east, 130, 0, 0)).toBe(false);

    expect(isCut(west)).toBe(true);
  });

  it('l’isolato vela il fuori e tiene dentro la sua ultima colonna', () => {
    const block = { x0: 24, y0: 48, x1: 40, y1: 66 };
    const u = inspectUniforms(stateOf({ mode: INSPECT_MODE.block, block }));

    // Gli estremi sono colonne incluse, e la colonna 40 occupa [40, 41): senza
    // il +1 l'ultima fila di ogni lato si velerebbe come se fosse fuori.
    expect(hidden(u, 40.5, 66.5, 20)).toBe(false);
    expect(hidden(u, 24.0, 48.0, 20)).toBe(false);
    expect(hidden(u, 41.5, 60, 20)).toBe(true);
    expect(hidden(u, 30, 47, 20)).toBe(true);
    // A qualunque quota: l'isolato si isola per intero, non solo al suolo.
    expect(hidden(u, 30, 47, 120)).toBe(true);
    expect(hidden(u, 30, 55, 120)).toBe(false);

    // Vela e non taglia: l'isolato resta nel suo contesto.
    expect(isCut(u)).toBe(false);
    expect(u.veil).toBe(INSPECT.veil);
    expect(u.inside).toBeLessThan(0);
  });

  it('l’isolato scelto taglia invece di velare, e nasconde lo stesso fuori', () => {
    const block = { x0: 24, y0: 48, x1: 40, y1: 66 };
    const veiled = inspectUniforms(stateOf({ mode: INSPECT_MODE.block, block }));
    const cut = inspectUniforms(stateOf({ mode: INSPECT_MODE.block, block, locked: true }));

    // Cambia una cosa sola: la densita'. La geometria che decide cosa sparisce e'
    // la stessa, ed e' il motivo per cui il blocco non e' un modo in piu'.
    expect(cut.rect).toEqual(veiled.rect);
    expect(cut.plane).toEqual(veiled.plane);
    expect(cut.inside).toBe(veiled.inside);

    expect(isCut(cut)).toBe(true);
    expect(cut.veil).toBe(INSPECT.cut);
    expect(hidden(cut, 41.5, 60, 20)).toBe(true);
    expect(hidden(cut, 30, 55, 120)).toBe(false);
  });

  it('un taglio di solo rettangolo non ha una sezione da tappare', () => {
    const locked = inspectUniforms(stateOf({
      mode: INSPECT_MODE.block,
      block: { x0: 0, y0: 0, x1: 8, y1: 8 },
      locked: true,
    }));
    const slice = inspectUniforms(stateOf({ mode: INSPECT_MODE.slice }));
    const section = inspectUniforms(stateOf({
      mode: INSPECT_MODE.section,
      focus: { x: 10, y: 10, z: 10 },
      section: { axis: 1, at: 64 },
    }));

    // Tagliano tutti e tre, ma solo i due che attraversano i volumi lasciano
    // scoperto un interno: l'isolato scelto toglie cio' che sta fuori per intero
    // e la geometria che resta e' quella di prima, chiusa.
    for (const u of [locked, slice, section]) expect(isCut(u)).toBe(true);
    expect(needsCap(locked)).toBe(false);
    expect(needsCap(slice)).toBe(true);
    expect(needsCap(section)).toBe(true);
    expect(isOpenPlane(locked)).toBe(true);
    expect(isOpenPlane(slice)).toBe(false);
  });

  it('velare non chiede mai un tappo, qualunque sia il modo', () => {
    for (const mode of [INSPECT_MODE.off, INSPECT_MODE.xray, INSPECT_MODE.block]) {
      const u = inspectUniforms(stateOf({
        mode,
        focus: { x: 10, y: 10, z: 10 },
        block: { x0: 0, y0: 0, x1: 8, y1: 8 },
      }));
      expect(needsCap(u)).toBe(false);
    }
  });

  it('ogni densita’ sta in 0..1 e solo il taglio arriva a 1', () => {
    for (const mode of [INSPECT_MODE.xray, INSPECT_MODE.slice, INSPECT_MODE.section, INSPECT_MODE.block]) {
      const u = inspectUniforms(stateOf({
        mode,
        focus: { x: 10, y: 10, z: 10 },
        block: { x0: 0, y0: 0, x1: 8, y1: 8 },
        section: { axis: 1, at: 64 },
      }));
      expect(u.veil).toBeGreaterThan(0);
      expect(u.veil).toBeLessThanOrEqual(1);
    }
    expect(INSPECT.veil).toBeLessThan(INSPECT.cut);
  });
});

describe('modi e quota', () => {
  it('il ciclo passa da tutti i modi e torna a spento', () => {
    let mode: InspectMode = INSPECT_MODE.off;
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) {
      seen.add(mode);
      mode = cycleInspectMode(mode);
    }
    expect(seen.size).toBe(5);
    expect(mode).toBe(INSPECT_MODE.off);
  });

  it('il parametro URL accetta i nomi e ignora il resto', () => {
    expect(parseInspectMode('xray')).toBe(INSPECT_MODE.xray);
    expect(parseInspectMode('slice')).toBe(INSPECT_MODE.slice);
    expect(parseInspectMode('section')).toBe(INSPECT_MODE.section);
    expect(parseInspectMode('block')).toBe(INSPECT_MODE.block);
    expect(parseInspectMode('nope')).toBe(INSPECT_MODE.off);
    expect(parseInspectMode(null)).toBe(INSPECT_MODE.off);
  });

  it('la quota resta dentro gli estremi e non diventa mai NaN', () => {
    expect(clampSliceZ(-40)).toBe(INSPECT.minSliceZ);
    expect(clampSliceZ(1e6)).toBe(INSPECT.maxSliceZ);
    expect(clampSliceZ(31.6)).toBe(32);
    expect(clampSliceZ(Number.NaN)).toBe(INSPECT.defaultSliceZ);
  });

  it('solo la fetta e la sezione tagliano', () => {
    expect(modeCuts(INSPECT_MODE.slice)).toBe(true);
    expect(modeCuts(INSPECT_MODE.section)).toBe(true);
    expect(modeCuts(INSPECT_MODE.off)).toBe(false);
    expect(modeCuts(INSPECT_MODE.xray)).toBe(false);
    expect(modeCuts(INSPECT_MODE.block)).toBe(false);
  });

  it('il predicato sul modo dice sempre la stessa cosa di quello sulle uniform', () => {
    // Due strade allo stesso fatto: `modeCuts` decide prima, con il modo in
    // mano, `isCut` dopo, sul payload composto. Divergerebbero in silenzio — la
    // regola che chiude un taglio quando si prende uno strumento smetterebbe di
    // valere — e questo e' l'unico posto che se ne accorge.
    for (const mode of INSPECT_MODES) {
      const u = inspectUniforms(stateOf({
        mode,
        focus: { x: 10, y: 10, z: 10 },
        block: { x0: 0, y0: 0, x1: 8, y1: 8 },
        section: { axis: 1, at: 64 },
      }));
      expect(modeCuts(mode)).toBe(isCut(u));
    }
  });

  it('solo la fetta ha una quota, e non e’ la stessa domanda di «taglia»', () => {
    expect(modeHasLevel(INSPECT_MODE.slice)).toBe(true);
    // Il punto della distinzione: la sezione taglia ma non guarda `sliceZ`, e
    // finche' le due domande erano una sola la barra dei livelli compariva in
    // Cutaway e si trascinava senza muovere niente.
    expect(modeCuts(INSPECT_MODE.section)).toBe(true);
    expect(modeHasLevel(INSPECT_MODE.section)).toBe(false);
    for (const mode of [INSPECT_MODE.off, INSPECT_MODE.xray, INSPECT_MODE.block]) {
      expect(modeHasLevel(mode)).toBe(false);
    }
  });

  it('la quota non entra nelle uniform di nessun modo che non sia la fetta', () => {
    // La prova che `modeHasLevel` dice il vero: cambiando `sliceZ` da sotto,
    // solo la fetta produce un payload diverso.
    for (const mode of INSPECT_MODES) {
      const patch = {
        mode,
        focus: { x: 10, y: 10, z: 10 },
        block: { x0: 0, y0: 0, x1: 8, y1: 8 },
        section: { axis: 1, at: 64 },
      } as const;
      const low = inspectUniforms(stateOf({ ...patch, sliceZ: 12 }));
      const high = inspectUniforms(stateOf({ ...patch, sliceZ: 96 }));
      expect(low.plane.join() !== high.plane.join()).toBe(modeHasLevel(mode));
    }
  });
});

describe('inspectGuide', () => {
  function guideOf(patch: Partial<InspectState>) {
    const state = stateOf(patch);
    return inspectGuide(state, inspectUniforms(state));
  }

  it('a vista spenta non c’e’ niente da disegnare', () => {
    expect(guideOf({})).toEqual({ rect: null, line: null, focus: null });
  });

  it('i raggi X contornano il soggetto, che e’ cio’ che si sta guardando', () => {
    const focus = { x: 100, y: 60, z: 40 };
    const subject = { x0: 98, y0: 58, z0: 40, x1: 106, y1: 66, z1: 88 };
    const guide = guideOf({ mode: INSPECT_MODE.xray, focus, subject });

    expect(guide.focus).toEqual(focus);
    expect(guide.line).toBeNull();
    // L'impronta senza il respiro: la linea dice «questo», non «fin qui arriva
    // il retino» — e sono la stessa fonte, quindi non possono divergere.
    expect(guide.rect).toEqual([98, 58, 106, 66]);
  });

  it('sul suolo nudo i raggi X non contornano niente, e c’e’ gia’ il mirino', () => {
    const guide = guideOf({ mode: INSPECT_MODE.xray, focus: { x: 100, y: 60, z: 40 } });

    expect(guide.rect).toBeNull();
    expect(guide.focus).not.toBeNull();
  });

  it('l’isolato mostra il proprio riquadro, estremi inclusi come nel retino', () => {
    const guide = guideOf({
      mode: INSPECT_MODE.block,
      focus: { x: 12, y: 22, z: 40 },
      block: { x0: 10, y0: 20, x1: 30, y1: 40 },
    });

    expect(guide.rect).toEqual([10, 20, 31, 41]);
    expect(guide.focus).not.toBeNull();
  });

  it('la sezione mostra la carreggiata, e non un riquadro che non esiste', () => {
    const guide = guideOf({
      mode: INSPECT_MODE.section,
      focus: { x: 12, y: 22, z: 40 },
      section: { axis: 1, at: 64 },
    });

    expect(guide.line).toEqual({ axis: 1, at: 64 });
    // `OPEN_RECT` non e' un bordo: disegnarlo metterebbe un contorno a mille
    // chilometri dalla citta'.
    expect(guide.rect).toBeNull();
  });

  it('la fetta non si aggancia a niente e non marca nessuna colonna', () => {
    const guide = guideOf({ mode: INSPECT_MODE.slice, focus: { x: 12, y: 22, z: 40 } });

    expect(guide).toEqual({ rect: null, line: null, focus: null });
  });

  it('senza colonna a fuoco non compare nessuna guida', () => {
    for (const mode of [INSPECT_MODE.xray, INSPECT_MODE.block]) {
      expect(guideOf({ mode, focus: null })).toEqual({ rect: null, line: null, focus: null });
    }
  });
});

describe('isBoundedRect', () => {
  it('distingue un riquadro vero dal rettangolo aperto', () => {
    const windowed = inspectUniforms(stateOf({
      mode: INSPECT_MODE.block,
      block: { x0: 10, y0: 20, x1: 30, y1: 40 },
    }));
    const open = inspectUniforms(stateOf({ mode: INSPECT_MODE.slice }));
    // I raggi X non hanno piu' un riquadro di mondo: la loro finestra e' la
    // lente, e chiederglielo qui darebbe la risposta giusta per il motivo
    // sbagliato — `OPEN_RECT` vuol dire «nessun secondo predicato».
    const xray = inspectUniforms(stateOf({
      mode: INSPECT_MODE.xray,
      focus: { x: 10, y: 10, z: 10 },
    }));

    expect(isBoundedRect(windowed)).toBe(true);
    expect(isBoundedRect(open)).toBe(false);
    expect(isBoundedRect(xray)).toBe(false);
  });
});

describe('sfumatura del bordo', () => {
  it('la rampa e’ larga meno della finestra piu’ stretta che deve ammorbidire', () => {
    // Una sfumatura piu' larga della meta' della finestra non lascerebbe nessun
    // punto a piena densita': i raggi X non aprirebbero piu' niente. La finestra
    // piu' stretta e' quella del suolo nudo, che non ha un edificio a darle
    // misura.
    expect(XRAY.feather).toBeGreaterThan(0);
    expect(XRAY.feather).toBeLessThan(XRAY.bare);
  });
});
