import { describe, expect, it } from 'vitest';
import { INSPECT, INSPECT_MODE, inspectUniforms, type InspectState } from './inspect';
import { XRAY, lensChord, lensHit, xrayDensity } from './xray';

/** Sguardo isometrico canonico: yaw 45 gradi, in discesa verso l'origine. */
const VIEW: readonly [number, number, number] = [-0.577, -0.577, -0.577];

/** Un soggetto di taglia media, con la sua colonna d'aria davanti. */
const SUBJECT = { x0: 100, y0: 100, z0: 20, x1: 108, y1: 108, z1: 60 };
const CENTRE = { x: 104, y: 104, z: 40 };

function xrayState(patch: Partial<InspectState> = {}): InspectState {
  return {
    mode: INSPECT_MODE.xray,
    sliceZ: INSPECT.defaultSliceZ,
    focus: null,
    view: VIEW,
    block: null,
    subject: SUBJECT,
    landmark: null,
    section: null,
    locked: false,
    ...patch,
  };
}

const LENS = inspectUniforms(xrayState());

/** Il punto che, guardando da `VIEW`, sta `distance` voxel davanti al centro. */
function inFront(distance: number, aside = 0): readonly [number, number, number] {
  return [
    CENTRE.x - VIEW[0] * distance + aside,
    CENTRE.y - VIEW[1] * distance,
    CENTRE.z - VIEW[2] * distance,
  ];
}

function densityAt(point: readonly [number, number, number]): number {
  return xrayDensity(LENS, VIEW, point[0], point[1], point[2]);
}

describe('la lente dei raggi X', () => {
  it('scioglie di piu’ cio’ che e’ piu’ vicino a chi guarda', () => {
    // E' il termine che mancava del tutto, ed e' quello che rende la vista
    // utilizzabile invece che soltanto accesa: senza, ogni parete davanti al
    // soggetto aveva la stessa densita', e con una soglia ordinata questo vuol
    // dire che sopravvivevano tutte **sugli stessi pixel**. Cinque muri in fila
    // si vedevano come uno solo, cioe' non si vedeva attraverso niente.
    // Venti voxel bastano a uscire dal soggetto: piu' vicino di cosi' si e'
    // ancora **dentro** la lente, e li' non si vela per costruzione.
    const close = densityAt(inFront(60));
    const far = densityAt(inFront(20));

    expect(close).toBeGreaterThan(far);
    // La direzione conta piu' del valore: chi sta davanti deve avere densita'
    // **maggiore**, o le soglie annidate non lascerebbero spuntare chi sta dietro.
    expect(far).toBeGreaterThanOrEqual(XRAY.veil);
    expect(close).toBeLessThanOrEqual(XRAY.deep);
  });

  it('vela sempre, non taglia mai', () => {
    // Il velo e il taglio sono la stessa manopola, e la lente non deve mai
    // arrivare in fondo: un occlusore tolto del tutto lascia il soggetto sospeso
    // in aria e si perde proprio il confronto fra davanti e dietro.
    expect(XRAY.veil).toBeLessThan(XRAY.deep);
    expect(XRAY.deep).toBeLessThan(INSPECT.cut);
    for (const distance of [1, 10, 40, 100, 1000]) {
      expect(densityAt(inFront(distance)), `a ${distance}`).toBeLessThan(INSPECT.cut);
    }
  });

  it('il filo del voxel resiste piu’ della faccia, ma non diventa muro', () => {
    // La gabbia e' cio' che tiene la sagoma quando la faccia si e' sciolta. Se
    // il filo non cedesse affatto l'occlusore resterebbe opaco sui suoi spigoli;
    // se cedesse quanto la faccia non resterebbe niente da leggere.
    expect(XRAY.lattice).toBeGreaterThan(0);
    expect(XRAY.lattice).toBeLessThan(1);
    // Anche sul filo, alla massima profondita', resta densita': il reticolo non
    // torna a essere una parete piena.
    expect(XRAY.deep * XRAY.lattice).toBeGreaterThan(0.25);
  });

  it('sfuma sul contorno della sagoma invece di tagliarsi su una riga di voxel', () => {
    // Camminando di lato si esce dalla sagoma. La densita' deve arrivare a zero
    // passando per i valori in mezzo: se saltasse, il bordo della lente
    // leggerebbe come un ritaglio con la forma di un voxel invece che come una
    // lente, ed e' il primo motivo per cui i raggi X sembravano un riquadro.
    const walk: number[] = [];
    for (let aside = 0; aside <= 40; aside += 0.25) walk.push(densityAt(inFront(30, aside)));

    expect(walk[0]).toBeGreaterThan(XRAY.veil);
    expect(walk[walk.length - 1]).toBe(0);
    // Esiste una fascia in cui il velo ha gia' ceduto ma non e' ancora sparito,
    // ed e' larga piu' di un campione: quella e' la sfumatura.
    expect(walk.filter((d) => d > 0 && d < XRAY.veil * 0.5).length).toBeGreaterThan(2);
  });

  it('non vela niente dietro il soggetto, dentro di lui o sotto il suo pavimento', () => {
    expect(densityAt(inFront(-30))).toBe(0);
    expect(densityAt([CENTRE.x, CENTRE.y, CENTRE.z])).toBe(0);
    // Il pavimento e' la base vera del soggetto: sotto c'e' terra, e dietro la
    // terra non c'e' una citta' da mostrare ma una macchia di cielo.
    expect(densityAt([104 + 9, 104 + 9, SUBJECT.z0 - 1])).toBe(0);
  });

  it('la corda e la distanza escono dallo stesso conto', () => {
    // `lensChord` e' rimasto il nome con cui il resto del codice fa la domanda
    // «questo frammento e' nascosto?», e deve restare esattamente la corda di
    // `lensHit`: due conti separati sono due conti che divergono.
    const point = inFront(30);
    const hit = lensHit(LENS, VIEW, point[0], point[1], point[2]);

    expect(lensChord(LENS, VIEW, point[0], point[1], point[2])).toBe(hit.chord);
    expect(hit.enter).toBeGreaterThan(0);
    // `enter` e' una distanza e non un fattore: arretrando di trenta voxel lungo
    // lo sguardo, il cammino fino al soggetto cresce esattamente di trenta.
    const further = lensHit(LENS, VIEW, ...inFront(60));
    expect(further.enter).toBeCloseTo(hit.enter + 30, 6);
    // E la corda non cambia: si guarda lo stesso volume dallo stesso raggio.
    expect(further.chord).toBeCloseTo(hit.chord, 6);
  });

  it('sul suolo nudo la lente si dimensiona da sola', () => {
    // Senza un edificio sotto il cursore il soggetto e' una colonna, e una
    // colonna non ha una sagoma da scoprire: il respiro le da' la taglia di una
    // casa bassa invece di lasciare una lente schiacciata al suolo.
    expect(XRAY.bare).toBeGreaterThan(XRAY.margin);
    const bare = inspectUniforms(xrayState({ subject: null, focus: { x: 100, y: 100, z: 20 } }));
    expect(bare.lensMax[0] - bare.lensMin[0]).toBeGreaterThan(XRAY.bare);
    expect(bare.veil).toBe(XRAY.veil);
  });

  it('la ricerca del landmark ha una portata e non cattura la citta’ intera', () => {
    // Una portata infinita aggancerebbe ogni colonna al monumento piu' vicino,
    // e la lente smetterebbe di rispondere a cio' che si sta guardando davvero.
    expect(XRAY.landmarkReach).toBeGreaterThan(0);
    expect(XRAY.landmarkReach).toBeLessThan(XRAY.depth);
  });

  it('l’accensione tigne senza accendere a giorno il landmark', () => {
    // `tint` e `boost` sono due manopole distinte e devono restare nel loro
    // intervallo: la prima spiega quale cosa e' un landmark, la seconda la fa
    // leggere sotto il velo — nessuna delle due deve diventare un faro.
    for (const value of [XRAY.glow.tint, XRAY.glow.boost]) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });
});
