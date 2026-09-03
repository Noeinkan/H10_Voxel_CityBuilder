import { describe, expect, it } from 'vitest';
import {
  isPlainBuilding,
  STRUCTURE_KIND,
  STRUCTURE_TRAITS,
  structureKindOf,
  traitsOf,
  type StructureKind,
} from './structureKind';

describe('structureKindOf', () => {
  it('un record senza marker e\' un edificio ordinario', () => {
    expect(structureKindOf({})).toBe(STRUCTURE_KIND.plain);
    expect(isPlainBuilding({})).toBe(true);
  });

  it('riconosce ogni marker', () => {
    expect(structureKindOf({ landmark: 'tower' })).toBe(STRUCTURE_KIND.landmark);
    expect(structureKindOf({ span: 0 })).toBe(STRUCTURE_KIND.span);
    expect(structureKindOf({ aerial: 0 })).toBe(STRUCTURE_KIND.aerial);
    expect(structureKindOf({ arcology: 'slab' })).toBe(STRUCTURE_KIND.arcology);
    expect(structureKindOf({ ropeway: 'station' })).toBe(STRUCTURE_KIND.ropeway);
  });

  it('distingue il monumento sul tetto da quello fondato a terra', () => {
    expect(structureKindOf({ landmark: 'tower' })).toBe(STRUCTURE_KIND.landmark);
    expect(structureKindOf({ landmark: 'tower', aloft: true })).toBe(
      STRUCTURE_KIND.rooftopLandmark,
    );
    // `aloft: false` non e' un terzo caso: e' il landmark a terra.
    expect(structureKindOf({ landmark: 'tower', aloft: false })).toBe(STRUCTURE_KIND.landmark);
  });

  it('il marker con valore zero conta come presente', () => {
    // `SPAN_KIND.bridge` e `AERIAL_PART.terrace` valgono 0: un controllo scritto
    // come verita' invece che come `!== undefined` li perderebbe entrambi, ed e'
    // esattamente l'errore che questo modulo esiste per non far ripetere.
    expect(structureKindOf({ span: 0 })).toBe(STRUCTURE_KIND.span);
    expect(structureKindOf({ aerial: 0 })).toBe(STRUCTURE_KIND.aerial);
    expect(isPlainBuilding({ aerial: 0 })).toBe(false);
  });
});

describe('STRUCTURE_TRAITS', () => {
  const kinds = Object.values(STRUCTURE_KIND) as StructureKind[];

  it('ha una riga per ogni tipo', () => {
    for (const kind of kinds) expect(STRUCTURE_TRAITS[kind]).toBeDefined();
    expect(Object.keys(STRUCTURE_TRAITS)).toHaveLength(kinds.length);
  });

  it('solo un edificio ordinario promuove, salvo la funivia', () => {
    expect(traitsOf({}).promotes).toBe(true);
    for (const marker of [{ landmark: 'x' }, { span: 0 }, { aerial: 0 }, { arcology: 'x' }]) {
      expect(traitsOf(marker).promotes).toBe(false);
    }
    // Preservato dal comportamento di oggi e quasi certamente sbagliato: vedi il
    // commento sulla riga `ropeway` della tabella. Il giorno che si corregge,
    // questa riga cade con lui — ed e' il punto: la correzione deve passare di
    // qui invece di succedere per caso.
    expect(traitsOf({ ropeway: 'station' }).promotes).toBe(true);
  });

  it('solo un edificio ordinario puo\' fare da torre a un ponte fra settori', () => {
    expect(traitsOf({}).hostsCrossing).toBe(true);
    for (const kind of kinds) {
      if (kind === STRUCTURE_KIND.plain) continue;
      expect(STRUCTURE_TRAITS[kind].hostsCrossing).toBe(false);
    }
  });

  it('porta un uso urbano cio\' che la scheda conta fra gli edifici', () => {
    expect(traitsOf({}).hasUrbanUse).toBe(true);
    // Un'arcologia ci sta pur avendo piu' usi, e una torre di funivia pur non
    // essendo un edificio per nessun'altra riga della tabella: sono i due punti
    // in cui questa colonna diverge da `capturedAsBuilding` e da cio' che
    // `BuildingRegistry.tally` conta, ed e' il motivo per cui e' una colonna sua.
    expect(traitsOf({ arcology: 'slab' }).hasUrbanUse).toBe(true);
    expect(traitsOf({ ropeway: 'station' }).hasUrbanUse).toBe(true);
    for (const marker of [{ landmark: 'x' }, { landmark: 'x', aloft: true }, { span: 0 }, { aerial: 0 }]) {
      expect(traitsOf(marker).hasUrbanUse).toBe(false);
    }
  });

  it('la cattura restituisce come edificio solo cio\' che la simulazione conta a colonna', () => {
    expect(traitsOf({}).capturedAsBuilding).toBe(true);
    // L'arcologia e' l'eccezione che il commento della tabella spiega: contata
    // dalla simulazione, ma non scrivibile come una riga sola.
    expect(traitsOf({ arcology: 'slab' }).capturedAsBuilding).toBe(false);
  });

  it('e\' potato dal salvataggio cio\' che `recordStamp` non sa ridisegnare', () => {
    // Le tre strutture senza ramo in `recordStamp`.
    expect(traitsOf({ span: 0 }).rebuildableFromRecord).toBe(false);
    expect(traitsOf({ aerial: 0 }).rebuildableFromRecord).toBe(false);
    expect(traitsOf({ ropeway: 'station' }).rebuildableFromRecord).toBe(false);
    // Le quattro che ce l'hanno.
    expect(traitsOf({}).rebuildableFromRecord).toBe(true);
    expect(traitsOf({ landmark: 'x' }).rebuildableFromRecord).toBe(true);
    expect(traitsOf({ landmark: 'x', aloft: true }).rebuildableFromRecord).toBe(true);
    expect(traitsOf({ arcology: 'slab' }).rebuildableFromRecord).toBe(true);
  });
});
