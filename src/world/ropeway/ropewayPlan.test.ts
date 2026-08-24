import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../terrain/config';
import { ROPEWAY } from './config';
import { chooseRopeway, type RopewayPlan, type RopewayProbe } from './ropewayPlan';

/**
 * Il luogo entra come predicato, quindi il luogo di un test e' una funzione di
 * quattro righe: uno stretto fra due isole, definito sulla sola `x`. E' cio' che
 * permette di misurare la regola senza mondo, senza terreno e senza GPU.
 */

const SHORE_TOP = 20;
const SEA_FLOOR = 8;

/** Terra ovunque tranne fra `from` e `to`, estremi inclusi, dove c'e' mare. */
function strait(from: number, to: number, top: (x: number) => number = () => SHORE_TOP): RopewayProbe {
  const wet = (x: number): boolean => x >= from && x <= to;
  return {
    top: (x) => (wet(x) ? SEA_FLOOR : top(x)),
    land: (x) => !wet(x),
    firm: () => true,
    free: () => true,
  };
}

/**
 * Lo stesso stretto con il lungomare costruito per `depth` colonne su ogni riva.
 *
 * E' il caso normale di una citta' cresciuta, non un caso limite: e' quello che
 * fa arretrare le stazioni e da' un mestiere ai piloni.
 */
function builtShore(from: number, to: number, depth: number): RopewayProbe {
  const base = strait(from, to);
  return {
    ...base,
    free: (x) => !((x < from && x >= from - depth) || (x > to && x <= to + depth)),
  };
}

function plan(result: ReturnType<typeof chooseRopeway>): RopewayPlan {
  if (!result.ok) throw new Error(`atteso un piano, rifiutato per ${result.refusal}`);
  return result.plan;
}

function refusalOf(result: ReturnType<typeof chooseRopeway>): string {
  if (result.ok) throw new Error('atteso un rifiuto, e invece la linea passa');
  return result.refusal;
}

/** Uno stretto largo 40 con il click dieci colonne dentro la riva di sinistra. */
const CLICK = { x: 20, y: 100 };
const WIDE = strait(30, 69);

describe('chooseRopeway — la linea', () => {
  it('un click sulla riva trova la sponda opposta da solo', () => {
    const built = plan(chooseRopeway({ ...WIDE, ...CLICK }));

    expect(built.axis).toBe(0);
    // Le due stazioni stanno **dentro** le rive: quella di qua finisce sull'ultima
    // colonna asciutta (29), quella di la' comincia dalla prima (70).
    const [a, b] = built.stations;
    expect(a.anchorX).toBe(29 - (ROPEWAY.stationSide - 1) / 2);
    expect(b.anchorX).toBe(70 + (ROPEWAY.stationSide - 1) / 2);
    expect(built.length).toBe(b.anchorX - a.anchorX);
  });

  it('la fune parte dal centro delle stazioni e arriva al centro dell altra', () => {
    const built = plan(chooseRopeway({ ...WIDE, ...CLICK }));
    const [a, b] = built.stations;

    const first = built.cable[0];
    const last = built.cable[built.cable.length - 1];
    expect([first.x, first.y]).toEqual([a.anchorX, a.anchorY]);
    expect([last.x, last.y]).toEqual([b.anchorX, b.anchorY]);
    // Agli ancoraggi la fune sta alla sua quota: e' in mezzo che pende.
    expect(first.z).toBe(built.cableZ);
    expect(last.z).toBe(built.cableZ);
  });

  it('la fune pende in mezzo alla campata, e mai piu di maxSag', () => {
    const built = plan(chooseRopeway({ ...WIDE, ...CLICK }));

    const lowest = Math.min(...built.cable.map((p) => p.z));
    expect(lowest).toBeLessThan(built.cableZ);
    expect(built.cableZ - lowest).toBeLessThanOrEqual(ROPEWAY.maxSag);
  });

  it('la cabina passa sopra il mare con il franco dichiarato', () => {
    const built = plan(chooseRopeway({ ...WIDE, ...CLICK }));

    // Il punto piu' basso della fune, meno l'attacco, e' la pancia della cabina:
    // sotto di lei devono passare i traghetti.
    const belly = Math.min(...built.cable.map((p) => p.z)) - ROPEWAY.cabinDrop;
    expect(belly - TERRAIN.seaLevel).toBeGreaterThanOrEqual(ROPEWAY.waterClearance);
  });

  it('le due torri arrivano alla fune e poggiano sul terreno', () => {
    const built = plan(chooseRopeway({ ...WIDE, ...CLICK }));

    for (const station of built.stations) {
      expect(station.baseZ).toBe(SHORE_TOP);
      expect(station.baseZ + station.height - 1).toBe(built.cableZ);
      expect(built.cableZ - station.baseZ).toBeGreaterThanOrEqual(ROPEWAY.minStationRise);
    }
  });

  it('la stazione arretra finche trova una piazzola libera', () => {
    // Il lungomare e' costruito per dieci colonne: la stazione non ci sta, e
    // arretra fino alla prima piazzola buona invece di rifiutare la linea.
    const built = plan(chooseRopeway({ ...builtShore(30, 69, 10), ...CLICK }));

    const [a, b] = built.stations;
    // La prima piazzola libera di qua ha il bordo su x = 19, quindi il centro
    // sta due colonne piu' dentro; simmetrico di la'.
    expect(a.anchorX).toBe(17);
    expect(b.anchorX).toBe(82);
  });

  it('la campata di mare non chiede appoggi, per quanto sia larga', () => {
    // Centoventi voxel d'acqua: nessun ponte li attraverserebbe — `maxLength` di
    // `crossings/` vale novantasei — e qui non c'e' una sola pila nel mezzo.
    const built = plan(chooseRopeway({ ...strait(40, 159), x: 30, y: 100 }));

    expect(built.length).toBeGreaterThan(120);
    // Fra le due torri la fune non tocca niente: ogni suo vertice sta sopra il
    // mare, e sopra il mare non si costruisce niente.
    const [a, b] = built.stations;
    for (const spot of built.cable) {
      if (spot.x <= a.anchorX || spot.x >= b.anchorX) continue;
      expect(spot.z).toBeGreaterThan(TERRAIN.seaLevel);
    }
  });

  it('la stessa domanda da sempre la stessa risposta', () => {
    const first = plan(chooseRopeway({ ...WIDE, ...CLICK }));
    const second = plan(chooseRopeway({ ...WIDE, ...CLICK }));
    expect(second).toEqual(first);
  });
});

describe('chooseRopeway — i rifiuti', () => {
  it('un click sull acqua non ha un capo da cui partire', () => {
    expect(refusalOf(chooseRopeway({ ...WIDE, x: 40, y: 100 }))).toBe('notAshore');
  });

  it('senza acqua da scavalcare non e questo lo strumento', () => {
    const dry: RopewayProbe = {
      top: () => SHORE_TOP,
      land: () => true,
      firm: () => true,
      free: () => true,
    };
    expect(refusalOf(chooseRopeway({ ...dry, ...CLICK }))).toBe('dryGap');
  });

  it('una pozza non e una traversata', () => {
    // Meno di `minWaterGap` colonne d'acqua: e' un fosso, e lo scavalca un ponte.
    const puddle = strait(30, 30 + ROPEWAY.minWaterGap - 2);
    expect(refusalOf(chooseRopeway({ ...puddle, ...CLICK }))).toBe('dryGap');
  });

  it('oltre il tetto di lunghezza la sponda opposta non conta piu', () => {
    const ocean = strait(30, 30 + ROPEWAY.maxLength + 20);
    expect(refusalOf(chooseRopeway({ ...ocean, ...CLICK }))).toBe('tooLong');
  });

  it('una piazzola su terreno che non regge non e una piazzola', () => {
    const soft: RopewayProbe = { ...WIDE, firm: () => false };
    expect(refusalOf(chooseRopeway({ ...soft, ...CLICK }))).toBe('noPad');
  });

  it('una piazzola occupata da un edificio non e una piazzola', () => {
    const busy: RopewayProbe = { ...WIDE, free: () => false };
    expect(refusalOf(chooseRopeway({ ...busy, ...CLICK }))).toBe('noPad');
  });

  it('per scavalcare una montagna servirebbe una torre fuori scala', () => {
    // Un picco in mezzo alla corsa, alto abbastanza da spingere la fune oltre
    // `maxStationRise` sopra le due rive: quel luogo vuole un altro strumento.
    const peak = strait(30, 69, (x) => (x >= 70 && x <= 78 ? SHORE_TOP + ROPEWAY.maxStationRise : SHORE_TOP));
    expect(refusalOf(chooseRopeway({ ...peak, x: 20, y: 100 }))).toBe('tooTall');
  });
});

describe('chooseRopeway — il rilievo', () => {
  it('la fune sale sopra la collina invece di attraversarla', () => {
    // Il lungomare costruito porta le stazioni un isolato dentro, e con loro la
    // corsa passa sopra la terra: e' li' che una collina conta.
    const hill = 12;
    const raise = (x: number): number => (x >= 74 && x <= 85 ? SHORE_TOP + hill : SHORE_TOP);
    const flat = plan(chooseRopeway({ ...builtShore(30, 69, 20), ...CLICK }));
    const bumpy = { ...builtShore(30, 69, 20), top: (x: number) => (x >= 30 && x <= 69 ? SEA_FLOOR : raise(x)) };
    const raised = plan(chooseRopeway({ ...bumpy, ...CLICK }));

    expect(raised.cableZ).toBeGreaterThan(flat.cableZ);
    // E il franco vale **su ogni colonna**, non solo alle torri: e' la ragione
    // per cui la freccia entra nel massimo invece di essere sommata alla fine.
    for (const spot of raised.cable) {
      if (spot.x >= 30 && spot.x <= 69) continue;
      expect(spot.z - ROPEWAY.cabinDrop - raise(spot.x)).toBeGreaterThanOrEqual(ROPEWAY.cabinClearance);
    }
  });

  it('sceglie la traversata piu corta fra le quattro direzioni', () => {
    // Acqua sia a est sia a nord, ma la sponda di la' e' piu' vicina a est.
    const probe: RopewayProbe = {
      top: (x, y) => (wet(x, y) ? SEA_FLOOR : SHORE_TOP),
      land: (x, y) => !wet(x, y),
      firm: () => true,
      free: () => true,
    };
    function wet(x: number, y: number): boolean {
      return (x >= 30 && x <= 69) || (y >= 110 && y <= 189);
    }

    const built = plan(chooseRopeway({ ...probe, ...CLICK }));
    expect(built.axis).toBe(0);
  });
});
