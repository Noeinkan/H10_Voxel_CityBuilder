import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, createSimState, toSimStateData } from '../../sim';
import { readSave, SAVE_VERSION, type SaveGame } from './format';

function save(overrides: Partial<SaveGame> = {}): SaveGame {
  return {
    version: SAVE_VERSION,
    savedAt: 1_700_000_000_000,
    seed: 4242,
    sim: toSimStateData(createSimState()),
    records: [],
    sectors: [],
    scene: { paused: false, speed: 1, clock: 0, healthyTicks: 0 },
    ...overrides,
  };
}

/** Il giro vero: cio' che finisce su disco e' testo, non un oggetto. */
function roundTrip(value: SaveGame): SaveGame | null {
  return readSave(JSON.parse(JSON.stringify(value)));
}

const HOUSE = {
  id: 7,
  x: 10,
  y: 20,
  baseZ: 3,
  footprint: 2,
  height: 8,
  class: BUILDING_CLASS.residential,
  level: 1,
  seed: 99,
};

describe('formato di salvataggio', () => {
  it('sopravvive al giro in JSON senza perdere niente', () => {
    const original = save({ records: [HOUSE], sectors: ['north-0', 'east-1'] });
    expect(roundTrip(original)).toEqual(original);
  });

  it('rifiuta un file scritto da una versione futura', () => {
    // Interpretarlo con le regole di oggi farebbe sparire in silenzio cio' che
    // questa versione non conosce, e il giocatore lo scoprirebbe dalla citta'.
    expect(roundTrip(save({ version: SAVE_VERSION + 1 }))).toBeNull();
  });

  it('rifiuta un file senza seed, che non avrebbe un isola da rigenerare', () => {
    expect(roundTrip(save({ seed: 0 }))).toBeNull();
    expect(readSave({ ...save(), seed: 'quarantadue' })).toBeNull();
  });

  it('rifiuta cio che non e un salvataggio', () => {
    expect(readSave(null)).toBeNull();
    expect(readSave('{}')).toBeNull();
    expect(readSave({ version: 1, seed: 1 })).toBeNull();
  });

  it('apre un file a cui manca la scena, con i valori di partenza', () => {
    const { scene: _dropped, ...legacy } = save();
    const read = readSave(JSON.parse(JSON.stringify(legacy)));
    expect(read?.scene).toEqual({ paused: false, speed: 1, clock: 0, healthyTicks: 0 });
  });

  it('rimette i record in ordine di id anche se il file non li aveva', () => {
    // `adopt` conta sull'ordine per ritrovare gli appoggi gia' dentro: fidarsi
    // di un file riscritto a mano sarebbe l'unico modo di romperlo da fuori.
    const read = roundTrip(save({
      records: [{ ...HOUSE, id: 9 }, { ...HOUSE, id: 2 }, { ...HOUSE, id: 5 }],
    }));
    expect(read?.records.map((r) => r.id)).toEqual([2, 5, 9]);
  });

  it('lascia cadere record e settori malformati invece di aprirli a meta', () => {
    const read = roundTrip(save({
      records: [HOUSE, { id: 3, x: 1 } as typeof HOUSE],
      sectors: ['north-0', 'up-2', 'north'],
    }));
    expect(read?.records).toEqual([HOUSE]);
    expect(read?.sectors).toEqual(['north-0']);
  });

  it('riporta la velocita dentro il dominio dei comandi', () => {
    expect(roundTrip(save({ scene: { paused: true, speed: 999, clock: 5, healthyTicks: 3 } }))?.scene)
      .toEqual({ paused: true, speed: 8, clock: 5, healthyTicks: 3 });
  });
});
