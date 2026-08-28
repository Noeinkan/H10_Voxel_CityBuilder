import { describe, expect, it } from 'vitest';
import { AERIAL_FACE } from '../world/aerial/terracePlan';
import { pickFacade, type FacadeBox } from './facadePick';

// Una torre 4x6, dalla quota 5 alla 35: estremi scelti perche' i numeri
// delle distanze restino leggibili a occhio.
const BOX: FacadeBox = { x: 10, y: 20, sizeX: 4, sizeY: 6, baseZ: 5, height: 30 };

describe('pickFacade', () => {
  it('trova la parete est entrando da est', () => {
    expect(pickFacade({ origin: [20, 23, 20], direction: [-1, 0, 0] }, BOX))
      .toBe(AERIAL_FACE.east);
  });

  it('trova la parete ovest entrando da ovest', () => {
    expect(pickFacade({ origin: [5, 23, 20], direction: [1, 0, 0] }, BOX))
      .toBe(AERIAL_FACE.west);
  });

  it('trova la parete nord entrando da nord', () => {
    expect(pickFacade({ origin: [12, 30, 20], direction: [0, -1, 0] }, BOX))
      .toBe(AERIAL_FACE.north);
  });

  it('trova la parete sud entrando da sud', () => {
    expect(pickFacade({ origin: [12, 15, 20], direction: [0, 1, 0] }, BOX))
      .toBe(AERIAL_FACE.south);
  });

  it('dal tetto sceglie lo spigolo piu\' vicino', () => {
    expect(pickFacade({ origin: [13.5, 23, 40], direction: [0, 0, -1] }, BOX))
      .toBe(AERIAL_FACE.east);
    expect(pickFacade({ origin: [12, 25.5, 40], direction: [0, 0, -1] }, BOX))
      .toBe(AERIAL_FACE.north);
  });

  it('dal tetto, in mezzo a due pareti, non sceglie', () => {
    expect(pickFacade({ origin: [12, 23, 40], direction: [0, 0, -1] }, BOX))
      .toBeNull();
  });

  it('un raggio obliquo che scende sul tetto sceglie lo spigolo vicino', () => {
    expect(pickFacade({ origin: [12, 23, 40], direction: [0.3, 0.4, -1] }, BOX))
      .toBe(AERIAL_FACE.east);
  });

  it('un raggio che manca la scatola non sceglie niente', () => {
    expect(pickFacade({ origin: [0, 0, 40], direction: [0, 0, -1] }, BOX)).toBeNull();
    expect(pickFacade({ origin: [12, 23, 40], direction: [1, 0, 0] }, BOX)).toBeNull();
  });

  it('un raggio parallelo fuori dallo spessore non incontra la scatola', () => {
    expect(pickFacade({ origin: [12, 15, 20], direction: [0, 1, 0] }, BOX))
      .toBe(AERIAL_FACE.south);
    expect(pickFacade({ origin: [12, 23, 40], direction: [0, 1, 0] }, BOX)).toBeNull();
    expect(pickFacade({ origin: [12, 23, 20], direction: [0, 1, 0] }, BOX)).toBeNull();
  });
});
