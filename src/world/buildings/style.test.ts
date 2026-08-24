import { describe, expect, it } from 'vitest';
import { PALETTE_SIZE, PALETTE_SLOT_NAMES } from '../../engine/paletteSlots';
import { blockAt } from '../streets/streetGrid';
import { CLASS_PROFILE, STYLE, STYLES, type StyleDefinition } from './config';
import { styleAt, styledProfile, styleOf } from './style';

const SEED = 1337;

/** Gli slot che uno stile puo' toccare, e nessun altro. */
const FABRIC = ['body', 'bodyAlt', 'plinth', 'crown'] as const;

/** Cio' che resta all'edificio: il tessuto e' del quartiere, l'accento no. */
const OWNED_BY_TYPOLOGY = ['accent', 'terrace', 'garden', 'roofProp', 'roofPropHeight'] as const;

describe('catalogo degli stili', () => {
  it('ogni riga usa soltanto slot di palette esistenti', () => {
    // E' il test che `landmarks/generate.test.ts` fa gia' sulle ricette, e serve
    // alla stessa cosa: il tipo dice `number`, quindi un letterale sbagliato — o
    // uno slot tolto dalla palette — passerebbe la compilazione e comparirebbe a
    // schermo come il colore di qualcun altro.
    for (const style of STYLES) {
      for (const [slot, index] of Object.entries(style.palette)) {
        expect(index, `${style.id}.${slot}`).toBeGreaterThanOrEqual(0);
        expect(index, `${style.id}.${slot}`).toBeLessThan(PALETTE_SIZE);
        expect(PALETTE_SLOT_NAMES[index as number], `${style.id}.${slot}`).not.toBe('');
      }
    }
  });

  it('ridipinge il tessuto e mai l accento', () => {
    // La regola della fase, resa verificabile: se un giorno qualcuno aggiunge
    // `accent` a una riga di stile, un mercato del porto smette di avere le
    // insegne d'ottone in mezzo isolato e nessuno se ne accorge finche' non lo
    // guarda.
    for (const style of STYLES) {
      for (const slot of Object.keys(style.palette)) {
        expect(FABRIC as readonly string[], `${style.id}.${slot}`).toContain(slot);
      }
    }
  });

  it('id e etichette sono univoci', () => {
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    expect(new Set(STYLES.map((s) => s.label)).size).toBe(STYLES.length);
  });

  it('il ripiego neutro e la prima riga e non dipinge niente', () => {
    // Senza una riga che tace, ogni isolato dell'isola sarebbe caratterizzato e
    // il tessuto non farebbe risaltare piu' niente.
    expect(Object.keys(STYLES[0].palette)).toHaveLength(0);
  });
});

describe('styledProfile', () => {
  it('lo stile vince sul profilo per i soli slot che dichiara', () => {
    const base = CLASS_PROFILE[0];
    const style = STYLES.find((s) => s.id === 'brickTown') as StyleDefinition;
    const styled = styledProfile(base, style);

    expect(styled.body).toBe(style.palette.body);
    expect(styled.bodyAlt).toBe(style.palette.bodyAlt);
    expect(styled.plinth).toBe(style.palette.plinth);
    expect(styled.crown).toBe(style.palette.crown);
  });

  it('non tocca cio che appartiene alla tipologia', () => {
    const base = CLASS_PROFILE[0];
    for (const style of STYLES) {
      const styled = styledProfile(base, style);
      for (const slot of OWNED_BY_TYPOLOGY) {
        expect(styled[slot], `${style.id}.${slot}`).toBe(base[slot]);
      }
      // Nemmeno la grammatica: uno stile e' materia, non forma. La sagoma la
      // decidono il repertorio e la tipologia, e uno stile che la spostasse
      // cambierebbe la sequenza del PRNG — cioe' renderebbe due edifici dello
      // stesso seme non piu' confrontabili.
      expect(styled.shrinkOps, style.id).toBe(base.shrinkOps);
      expect(styled.growOps, style.id).toBe(base.growOps);
      expect(styled.bandHeight, style.id).toBe(base.bandHeight);
      expect(styled.bayPeriod, style.id).toBe(base.bayPeriod);
    }
  });

  it('il ripiego neutro lascia il profilo esattamente com era', () => {
    const base = CLASS_PROFILE[2];
    expect(styledProfile(base, STYLES[0])).toEqual(base);
  });
});

describe('styleAt', () => {
  it('e deterministico', () => {
    for (let k = -8; k <= 8; k++) {
      const block = { kx: k, ky: k * 3 };
      expect(styleAt(SEED, block).id).toBe(styleAt(SEED, block).id);
    }
  });

  it('e costante dentro un quartiere, isolato per isolato', () => {
    // E' la proprieta' per cui la fase esiste: due edifici che vedono lo stesso
    // quartiere devono ricevere la stessa materia senza che nessuno la ricordi.
    for (let qx = -4; qx <= 4; qx++) {
      for (let qy = -4; qy <= 4; qy++) {
        const first = styleAt(SEED, {
          kx: qx * STYLE.blocksPerQuarter,
          ky: qy * STYLE.blocksPerQuarter,
        }).id;
        for (let dx = 0; dx < STYLE.blocksPerQuarter; dx++) {
          for (let dy = 0; dy < STYLE.blocksPerQuarter; dy++) {
            const block = {
              kx: qx * STYLE.blocksPerQuarter + dx,
              ky: qy * STYLE.blocksPerQuarter + dy,
            };
            expect(styleAt(SEED, block).id, `${block.kx},${block.ky}`).toBe(first);
          }
        }
      }
    }
  });

  it('due colonne dello stesso isolato ricevono lo stesso stile', () => {
    // La stessa proprieta' vista dal capo da cui la usa il Builder: non un
    // indice di isolato, ma punti del mondo. Si raccoglie uno stile per isolato
    // e si pretende che ogni colonna di quell'isolato confermi il primo.
    const seen = new Map<string, string>();
    for (let x = -240; x <= 240; x += 3) {
      for (let y = -240; y <= 240; y += 3) {
        const block = blockAt(SEED, x, y);
        const key = `${block.kx},${block.ky}`;
        const id = styleAt(SEED, block).id;
        const first = seen.get(key);
        if (first === undefined) seen.set(key, id);
        else expect(id, `${key} da (${x},${y})`).toBe(first);
      }
    }
    // E la scansione deve aver toccato abbastanza isolati da valere qualcosa.
    expect(seen.size).toBeGreaterThan(100);
  });

  it('il quartiere a cavallo dell origine e largo quanto gli altri', () => {
    // `Math.floor` e non uno shift: su un indice negativo `>> 1` arrotonda dalla
    // parte sbagliata, e il quartiere che contiene l'origine verrebbe largo il
    // doppio — cioe' l'unico posto in cui la citta' comincia sarebbe anche
    // l'unico con un difetto di scala.
    //
    // Si misura sulla proprieta' che lo definisce invece che sulle corse di
    // colore, che due righe uguali di fila renderebbero ambigue: due isolati
    // stanno nello stesso quartiere **se e solo se** hanno lo stesso indice di
    // quartiere, origine compresa.
    const quarter = (k: number): number => Math.floor(k / STYLE.blocksPerQuarter);
    for (let kx = -9; kx < 9; kx++) {
      for (let jx = -9; jx < 9; jx++) {
        if (quarter(kx) !== quarter(jx)) continue;
        expect(styleAt(SEED, { kx, ky: 0 }).id, `${kx} vs ${jx}`)
          .toBe(styleAt(SEED, { kx: jx, ky: 0 }).id);
      }
    }
    // E il quartiere dell'origine contiene esattamente `blocksPerQuarter`
    // isolati, non il doppio.
    const sameAsZero = [];
    for (let kx = -9; kx < 9; kx++) if (quarter(kx) === quarter(0)) sameAsZero.push(kx);
    expect(sameAsZero).toHaveLength(STYLE.blocksPerQuarter);
  });

  it('usa tutto il catalogo, e non ne predilige nessuna riga', () => {
    // Una tabella di cui la citta' pesca sempre le stesse due righe e' una
    // tabella piu' corta di quella che dichiara.
    const counts = new Map<string, number>();
    for (let kx = -30; kx < 30; kx++) {
      for (let ky = -30; ky < 30; ky++) {
        const id = styleAt(SEED, { kx, ky }).id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(STYLES.length);

    const expected = (60 * 60) / STYLES.length;
    for (const [id, count] of counts) {
      expect(count, id).toBeGreaterThan(expected * 0.4);
      expect(count, id).toBeLessThan(expected * 1.9);
    }
  });

  it('due mondi diversi vestono lo stesso isolato in modo diverso', () => {
    // Senza il seme del mondo nell'hash, tutte le isole avrebbero gli stessi
    // quartieri negli stessi posti.
    let different = 0;
    const total = 200;
    for (let k = 0; k < total; k++) {
      const block = { kx: k % 20, ky: Math.floor(k / 20) };
      if (styleAt(SEED, block).id !== styleAt(SEED + 1, block).id) different++;
    }
    expect(different).toBeGreaterThan(total * 0.6);
  });
});

describe('styleOf', () => {
  it('un record senza stile ripiega sul neutro', () => {
    // I record scritti prima che gli stili esistessero non hanno il campo, e
    // devono continuare a rigenerarsi identici a com erano.
    expect(styleOf(undefined).id).toBe(STYLES[0].id);
    expect(styleOf('nessuno-stile-con-questo-id').id).toBe(STYLES[0].id);
  });

  it('ritrova la riga registrata', () => {
    for (const style of STYLES) {
      expect(styleOf(style.id).id).toBe(style.id);
    }
  });
});
