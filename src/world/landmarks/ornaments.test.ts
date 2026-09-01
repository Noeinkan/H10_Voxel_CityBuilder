import { describe, expect, it } from 'vitest';
import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { SURFACE_KIND } from '../visualBlock';
import { PART, createCanvas, drawPart, type Part, type PartKind } from './parts';

/**
 * Le cinque primitive ornate, misurate direttamente.
 *
 * **Il test che conta e' lo stesso per tutte e cinque**, ed e' l'ultimo di ogni
 * gruppo: scambiare `w` e `h` non cambia il numero di voxel. `orientPart` ruota
 * una parte scambiando i due lati senza ridisegnarla, quindi una maschera che
 * guardasse `lx` invece della distanza da un capo cambierebbe forma — e
 * conteggio — su due versi su quattro. E' lo stesso difetto che i pilastri del
 * colonnato avevano gia' avuto una volta, trovato dallo stesso confronto.
 *
 * Il resto misura cio' che distingue ciascuna primitiva da quella che le
 * somiglia: l'arco dal muro, la cupola dal gradone, il traforo dal traliccio.
 */

function part(kind: PartKind, w: number, h: number, height: number, extra: Partial<Part> = {}): Part {
  return {
    kind,
    x: 0,
    y: 0,
    w,
    h,
    z: 0,
    height,
    palette: PALETTE_SLOTS.stone,
    surface: SURFACE_KIND.civic,
    ...extra,
  };
}

function render(p: Part): Uint8Array {
  const canvas = createCanvas(p.w, p.h, p.z + p.height);
  drawPart(canvas, p);
  return canvas.voxels;
}

function solidCount(p: Part): number {
  return render(p).reduce((total, id) => total + (id === 0 ? 0 : 1), 0);
}

/** Quanti voxel pieni ha ogni quota, dal basso. */
function perLevel(p: Part): number[] {
  const voxels = render(p);
  const plan = p.w * p.h;
  const out: number[] = [];
  for (let z = 0; z < p.z + p.height; z++) {
    let count = 0;
    for (let i = 0; i < plan; i++) if (voxels[z * plan + i] !== 0) count++;
    out.push(count);
  }
  return out;
}

/** Vero se la colonna `(lx, ly)` e' vuota a questa quota. */
function empty(p: Part, lx: number, ly: number, z: number): boolean {
  return render(p)[lx + p.w * (ly + p.h * z)] === 0;
}

describe('arco', () => {
  it('apre un passaggio che attraversa tutto lo spessore', () => {
    // Cinque colonne di luce su nove, per tutte e tre le celle di spessore: e'
    // questo, e non la sagoma della testa, a fare la differenza fra un portale e
    // una finestra — sotto ci si passa.
    const arch = part(PART.arch, 9, 3, 6, { step: 2 });
    for (let ly = 0; ly < 3; ly++) {
      expect(empty(arch, 4, ly, 0)).toBe(true);
    }
  });

  it('la testa scende a gradoni verso i piedritti', () => {
    const arch = part(PART.arch, 9, 3, 6, { step: 2 });
    // In chiave il vuoto arriva piu' in alto che sul rene dell'arco: e' la sola
    // cosa che distingua un archivolto da un buco quadrato.
    expect(empty(arch, 4, 1, 4)).toBe(true);
    expect(empty(arch, 2, 1, 4)).toBe(false);
  });

  it('la quota di chiave resta piena: un arco senza concio e una breccia', () => {
    const arch = part(PART.arch, 9, 3, 6, { step: 2 });
    expect(empty(arch, 4, 1, 5)).toBe(false);
  });

  it('scambiare i due lati non cambia la quantita di muro', () => {
    expect(solidCount(part(PART.arch, 3, 9, 6, { step: 2 })))
      .toBe(solidCount(part(PART.arch, 9, 3, 6, { step: 2 })));
    expect(solidCount(part(PART.arch, 4, 11, 7, { step: 1 })))
      .toBe(solidCount(part(PART.arch, 11, 4, 7, { step: 1 })));
  });
});

describe('cupola', () => {
  it('il profilo e convesso, non rettilineo come un gradone', () => {
    // E' tutta la differenza con `steps`: a meta' altezza una calotta e' ancora
    // larga piu' della meta', un tronco di piramide no.
    const levels = perLevel(part(PART.dome, 9, 9, 5));
    const base = levels[0];
    const middle = levels[2];
    expect(middle / base).toBeGreaterThan(0.5);
    expect(levels[4]).toBeLessThan(middle);
  });

  it('si restringe a ogni quota e non risale mai', () => {
    const levels = perLevel(part(PART.dome, 11, 11, 6));
    for (let z = 1; z < levels.length; z++) {
      expect(levels[z]).toBeLessThanOrEqual(levels[z - 1]);
    }
  });

  it("l'oculo apre solo la sommita", () => {
    const closed = part(PART.dome, 11, 11, 6);
    const open = part(PART.dome, 11, 11, 6, { step: 1 });
    expect(solidCount(open)).toBeLessThan(solidCount(closed));
    // Sotto la cima il pieno e' lo stesso: un oculo che scendesse sarebbe un
    // pozzo dentro il volume, invisibile da fuori e pagato in voxel.
    expect(perLevel(open)[3]).toBe(perLevel(closed)[3]);
  });

  it('scambiare i due lati non cambia la quantita di cupola', () => {
    expect(solidCount(part(PART.dome, 7, 11, 6)))
      .toBe(solidCount(part(PART.dome, 11, 7, 6)));
  });
});

describe('contrafforte', () => {
  it('i piedritti sono due e salgono per intero', () => {
    const flying = part(PART.buttress, 13, 3, 8, { step: 1 });
    expect(empty(flying, 0, 1, 7)).toBe(false);
    expect(empty(flying, 12, 1, 7)).toBe(false);
  });

  it("il rampante sale dal piedritto verso il centro", () => {
    const flying = part(PART.buttress, 13, 3, 8, { step: 1 });
    const crestAt = (lx: number): number => {
      for (let z = 7; z >= 0; z--) if (!empty(flying, lx, 1, z)) return z;
      return -1;
    };
    // Vicino al piedritto l'arco e' basso, verso la navata e' alto: e' la
    // pendenza a dire «scarica il peso», dove una fascia orizzontale direbbe
    // solo «ballatoio».
    expect(crestAt(2)).toBeLessThan(crestAt(4));
    expect(crestAt(4)).toBeLessThan(crestAt(6));
    // Non scende mai. Due colonne vicine possono condividere la quota — su otto
    // quote il rampante ha tre gradini per sei colonne, e il pianerottolo e'
    // aritmetica, non un difetto — ma un avvallamento non sarebbe un arco.
    for (let lx = 2; lx < 6; lx++) {
      expect(crestAt(lx)).toBeLessThanOrEqual(crestAt(lx + 1));
    }
  });

  it('fra i due archi resta vuoto: non e un muro pieno', () => {
    const flying = part(PART.buttress, 13, 3, 8, { step: 1 });
    expect(solidCount(flying)).toBeLessThan(13 * 3 * 8 / 2);
  });

  it('scambiare i due lati non cambia la quantita di contrafforte', () => {
    expect(solidCount(part(PART.buttress, 3, 13, 8, { step: 1 })))
      .toBe(solidCount(part(PART.buttress, 13, 3, 8, { step: 1 })));
  });
});

describe('guglia', () => {
  it('rastrema fino alla punta invece che a due scalini', () => {
    const levels = perLevel(part(PART.spire, 9, 9, 12));
    expect(levels[0]).toBeGreaterThan(levels[6]);
    expect(levels[6]).toBeGreaterThan(levels[11]);
    expect(levels[11]).toBe(1);
  });

  it('la punta e un voxel, mai un buco', () => {
    for (const height of [4, 7, 13, 20]) {
      const levels = perLevel(part(PART.spire, 7, 7, height));
      for (const count of levels) expect(count).toBeGreaterThan(0);
    }
  });

  it('i collarini sporgono di un voxel per lato', () => {
    const plain = perLevel(part(PART.spire, 9, 9, 12));
    const ringed = perLevel(part(PART.spire, 9, 9, 12, { step: 3 }));
    expect(ringed.some((count, z) => count > plain[z])).toBe(true);
  });

  it('scambiare i due lati non cambia la quantita di guglia', () => {
    expect(solidCount(part(PART.spire, 5, 9, 12, { step: 3 })))
      .toBe(solidCount(part(PART.spire, 9, 5, 12, { step: 3 })));
  });
});

describe('traforo', () => {
  it('e una parete: il cuore della pianta resta vuoto', () => {
    const lace = part(PART.tracery, 9, 9, 9, { step: 2 });
    expect(empty(lace, 4, 4, 4)).toBe(true);
  });

  it('ha meno pieno di una scatola cava e piu di un traliccio', () => {
    const size = { w: 11, h: 11, height: 11 };
    const lace = solidCount(part(PART.tracery, size.w, size.h, size.height, { step: 3 }));
    const shell = solidCount(part(PART.shell, size.w, size.h, size.height));
    const truss = solidCount(part(PART.truss, size.w, size.h, size.height, { step: 3 }));
    expect(lace).toBeLessThan(shell);
    expect(lace).toBeGreaterThan(truss);
  });

  it('i montanti stanno su tutto il perimetro, non ai soli spigoli', () => {
    // E' la differenza dal traliccio: li' un lato lungo e' aria fra due
    // correnti, qui e' scandito.
    const lace = part(PART.tracery, 11, 11, 11, { step: 3 });
    expect(empty(lace, 3, 0, 5)).toBe(false);
  });

  it('scambiare i due lati non cambia la quantita di traforo', () => {
    expect(solidCount(part(PART.tracery, 7, 11, 9, { step: 3 })))
      .toBe(solidCount(part(PART.tracery, 11, 7, 9, { step: 3 })));
  });
});

describe('cornice', () => {
  it('la fascia e il riquadro dichiarato, e il corpo rientra', () => {
    const banded = part(PART.slab, 9, 9, 9, { cornice: { step: 4, depth: 1 } });
    const levels = perLevel(banded);
    expect(levels[0]).toBe(9 * 9);
    expect(levels[1]).toBe(7 * 7);
    expect(levels[4]).toBe(9 * 9);
    // In cima una fascia c'e' comunque: finire con il corpo rientrato leggerebbe
    // come un volume troncato invece che coronato.
    expect(levels[8]).toBe(9 * 9);
  });

  it('non sfora il riquadro: `partBounds` resta vero', () => {
    const banded = part(PART.slab, 9, 9, 9, { cornice: { step: 3, depth: 2 } });
    expect(solidCount(banded)).toBeLessThanOrEqual(9 * 9 * 9);
  });

  it('un aggetto piu profondo del volume non lo svuota', () => {
    // Il troncamento tiene il corpo largo almeno un voxel: senza, resterebbero
    // le sole cornici a mezz'aria.
    const levels = perLevel(part(PART.slab, 5, 5, 7, { cornice: { step: 3, depth: 9 } }));
    for (const count of levels) expect(count).toBeGreaterThan(0);
  });

  it('vale anche sulla scatola cava, e la lascia cava', () => {
    const banded = part(PART.shell, 9, 9, 9, { cornice: { step: 4, depth: 1 } });
    expect(empty(banded, 4, 4, 1)).toBe(true);
    expect(perLevel(banded)[1]).toBeLessThan(perLevel(banded)[0]);
  });

  it('scambiare i due lati non cambia la quantita di volume', () => {
    expect(solidCount(part(PART.mast, 5, 9, 12, { cornice: { step: 3, depth: 1 } })))
      .toBe(solidCount(part(PART.mast, 9, 5, 12, { cornice: { step: 3, depth: 1 } })));
  });
});
