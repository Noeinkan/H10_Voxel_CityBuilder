import { describe, expect, it } from 'vitest';
import {
  materialRate,
  ticksToAffordConstruction,
  ticksToEmpty,
  ticksToFillHousing,
  ticksToReach,
} from './forecast';
import { createSimState } from './SimState';
import type { SimState } from './SimState';

/** Uno stato con i soli campi che la previsione legge davvero. */
function stock(materials: number, delta: number, waitingCost = 0, construction = 0): SimState {
  const base = createSimState();
  return {
    ...base,
    materials: { stock: materials, delta },
    materialFlows: { ...base.materialFlows, waitingCost, construction },
  };
}

describe('ticksToReach', () => {
  it('arrotonda per eccesso: mezzo tick di attesa e comunque un tick', () => {
    expect(ticksToReach(10, 20, 4)).toBe(3);
  });

  it('dice zero quando la soglia e gia superata', () => {
    expect(ticksToReach(20, 20, -5)).toBe(0);
  });

  it('tace quando la scorta non cresce, invece di promettere un numero', () => {
    expect(ticksToReach(10, 20, 0)).toBeNull();
    expect(ticksToReach(10, 20, -1)).toBeNull();
  });

  it('non propaga NaN ne Infinity in una riga dell interfaccia', () => {
    expect(ticksToReach(Number.NaN, 20, 4)).toBeNull();
    expect(ticksToReach(10, 20, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('ticksToEmpty', () => {
  it('conta i tick che restano al saldo negativo', () => {
    expect(ticksToEmpty(100, -8)).toBe(13);
  });

  it('tace quando la cassa non cala: non c e nessuna scadenza da mostrare', () => {
    expect(ticksToEmpty(100, 0)).toBeNull();
    expect(ticksToEmpty(100, 3)).toBeNull();
  });

  it('dice zero a cassa gia vuota', () => {
    expect(ticksToEmpty(0, -8)).toBe(0);
  });
});

describe('materialRate', () => {
  it('toglie dal delta la spesa dei cantieri, che il tick non ha contato', () => {
    // Il bilancio ha aggiunto 5 e il Builder ne ha spesi 3 dopo il tick: la
    // scorta vera e cresciuta di 2.
    expect(materialRate(stock(50, 5, 0, 3))).toBe(2);
  });
});

describe('ticksToAffordConstruction', () => {
  it('conta i tick al cantiere in attesa piu economico', () => {
    expect(ticksToAffordConstruction(stock(20, 6, 50))).toBe(5);
  });

  it('tace quando nessun cantiere aspetta', () => {
    expect(ticksToAffordConstruction(stock(20, 6))).toBeNull();
  });

  it('tace quando la scorta e ferma: l attesa non finisce da sola', () => {
    expect(ticksToAffordConstruction(stock(20, 4, 50, 4))).toBeNull();
  });
});

describe('ticksToFillHousing', () => {
  it('segue la decadenza geometrica, non la divisione', () => {
    // 14 case libere e un residente per tick: la citta' riempie 1/15 dello
    // spazio che c'e'. Una stima lineare direbbe 14 tick, e sbaglierebbe di
    // quasi tre volte.
    expect(ticksToFillHousing(10, 24, 1)).toBe(39);
  });

  it('accelera quando la citta riempie una quota piu grande', () => {
    const slow = ticksToFillHousing(10, 24, 1);
    const fast = ticksToFillHousing(10, 24, 4);
    expect(fast).toBeLessThan(slow ?? 0);
  });

  it('dice zero quando resta meno di una casa', () => {
    expect(ticksToFillHousing(23.5, 24, 1)).toBe(0);
  });

  it('tace quando la popolazione non cresce o cala', () => {
    expect(ticksToFillHousing(10, 24, 0)).toBeNull();
    expect(ticksToFillHousing(10, 24, -2)).toBeNull();
  });

  it('resta sopra il tick anche a ritmo altissimo', () => {
    // La quota riempita non puo' raggiungere 1 — lo spazio di prima contiene
    // anche quello che resta — quindi il pieno non arriva mai in un tick solo.
    expect(ticksToFillHousing(10, 24, 14)).toBe(4);
  });
});
