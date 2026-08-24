import { describe, expect, it } from 'vitest';
import { BIOME } from '../terrain/config';
import { COVER } from '../terrain/groundcover';
import { STAMP_EMPTY } from '../buildings/stamp';
import { FARMS, FARM_PLOT_ALIGNED } from './config';
import { clearPlot, paintPlot } from './generate';
import { planPlot, plotRowCount, plotRows, type FarmPlotQuery } from './plotPlan';

/** Terra buona ovunque, nulla costruito: il caso da cui partono tutti gli altri. */
function fertile(overrides: Partial<FarmPlotQuery> = {}): FarmPlotQuery {
  return {
    x: 0,
    y: 0,
    seed: 1337,
    biomeAt: () => BIOME.plain,
    slopeAt: () => 0,
    occupied: () => false,
    builtNear: () => 0,
    ...overrides,
  };
}

function accepted(query: FarmPlotQuery) {
  const plan = planPlot(query);
  if (!plan.ok) throw new Error(`atteso un lotto, rifiutato per ${plan.reason}`);
  return plan.plot;
}

describe('planPlot — quando un lotto ci sta', () => {
  it('accetta terra fertile, piana e libera', () => {
    const plot = accepted(fertile());
    expect(plot.side).toBe(FARMS.plotSide);
    expect(plot.x).toBe(0);
    expect(plot.y).toBe(0);
  });

  it('accetta tutti e tre i biomi con l’erba, e nessun altro', () => {
    for (const biome of [BIOME.plain, BIOME.forest, BIOME.hill]) {
      expect(planPlot(fertile({ biomeAt: () => biome })).ok, `bioma ${biome}`).toBe(true);
    }
    for (const biome of [BIOME.ocean, BIOME.beach, BIOME.rock]) {
      expect(planPlot(fertile({ biomeAt: () => biome })).ok, `bioma ${biome}`).toBe(false);
    }
  });

  it('il lato e’ un multiplo del cubo di terreno', () => {
    // Un bordo a meta' cubo troverebbe sotto la propria impronta due quote
    // diverse dove il terreno e' piatto.
    expect(FARM_PLOT_ALIGNED).toBe(true);
  });
});

describe('planPlot — quando non ci sta', () => {
  it('rifiuta il quadrato intero per una sola colonna occupata', () => {
    // Il rifiuto e' del riquadro, come per un landmark: un campo bucato non e'
    // un campo.
    const plan = planPlot(fertile({
      occupied: (x, y) => x === 5 && y === 7,
    }));
    expect(plan).toEqual({ ok: false, reason: 'occupied' });
  });

  it('rifiuta per una sola colonna sterile', () => {
    const plan = planPlot(fertile({
      biomeAt: (x, y) => (x === 11 && y === 11 ? BIOME.rock : BIOME.plain),
    }));
    expect(plan).toEqual({ ok: false, reason: 'infertile' });
  });

  it('rifiuta la pendenza con lo stesso limite che rifiuta un edificio', () => {
    expect(planPlot(fertile({ slopeAt: () => FARMS.maxSlope })).ok).toBe(false);
    expect(planPlot(fertile({ slopeAt: () => FARMS.maxSlope - 0.001 })).ok).toBe(true);
  });

  it('rifiuta dove e’ gia’ citta’, e lo fa prima di scandire le colonne', () => {
    let scanned = 0;
    const plan = planPlot(fertile({
      builtNear: () => FARMS.edgeMaxNeighbours + 1,
      biomeAt: () => {
        scanned++;
        return BIOME.plain;
      },
    }));

    expect(plan).toEqual({ ok: false, reason: 'urban' });
    // 144 colonne risparmiate per ogni candidato dentro la citta', che sono la
    // stragrande maggioranza a partita avviata.
    expect(scanned).toBe(0);
  });

  it('un vicinato ancora rado va bene: un campo confina con la citta’', () => {
    expect(planPlot(fertile({ builtNear: () => FARMS.edgeMaxNeighbours })).ok).toBe(true);
  });
});

describe('planPlot — determinismo', () => {
  it('stesso angolo e stesso seme danno sempre lo stesso verso', () => {
    const first = accepted(fertile({ x: 24, y: 36 }));
    const second = accepted(fertile({ x: 24, y: 36 }));
    expect(first.alongY).toBe(second.alongY);
  });

  it('il verso non e’ costante: i lotti vicini formano una trapunta', () => {
    const versi = new Set<boolean>();
    for (let i = 0; i < 24; i++) {
      versi.add(accepted(fertile({ x: i * FARMS.lattice, y: 0 })).alongY);
    }
    expect(versi.size).toBe(2);
  });
});

describe('plotRows — le colonne che portano un solco', () => {
  it('il passo corre ortogonale al verso dei solchi', () => {
    // Una fila lunga lungo x si ripete salendo lungo y: distanziarle lungo x
    // spezzerebbe le file invece di separarle.
    const alongX = { ...accepted(fertile()), alongY: false };
    const rows = [...plotRows(alongX)];

    // Ogni y ammessa porta la riga intera.
    const perRow = new Map<number, number>();
    for (const cell of rows) perRow.set(cell.y, (perRow.get(cell.y) ?? 0) + 1);
    for (const [, count] of perRow) expect(count).toBe(FARMS.plotSide);
    expect(perRow.size).toBe(Math.ceil(FARMS.plotSide / FARMS.rowPitch));
  });

  it('e nell’altro verso e’ esattamente lo specchio', () => {
    const alongY = { ...accepted(fertile()), alongY: true };
    const perColumn = new Map<number, number>();
    for (const cell of plotRows(alongY)) {
      perColumn.set(cell.x, (perColumn.get(cell.x) ?? 0) + 1);
    }
    for (const [, count] of perColumn) expect(count).toBe(FARMS.plotSide);
    expect(perColumn.size).toBe(Math.ceil(FARMS.plotSide / FARMS.rowPitch));
  });

  it('il passo si ancora all’angolo del lotto, non al mondo', () => {
    // Ancorato al mondo, due lotti adiacenti potrebbero cadere in controfase e
    // mostrare una fila doppia sulla cucitura.
    const here = { ...accepted(fertile({ x: 0, y: 0 })), alongY: false };
    const there = { ...accepted(fertile({ x: 0, y: FARMS.lattice })), alongY: false, y: FARMS.lattice };

    const first = [...plotRows(here)][0];
    const second = [...plotRows(there)][0];
    expect(first.y - here.y).toBe(second.y - there.y);
  });

  it('plotRowCount coincide con quante ne produce davvero', () => {
    expect([...plotRows(accepted(fertile()))]).toHaveLength(plotRowCount(FARMS.plotSide));
  });
});

describe('generate — le colonne da dipingere', () => {
  it('non ripavimenta il terreno: solo il solco', () => {
    const paints = paintPlot({ ...accepted(fertile()), alongY: false });

    expect(paints).toHaveLength(plotRowCount(FARMS.plotSide));
    for (const paint of paints) {
      // Palette 0 e' «lascia il suolo dov'e'»: non esiste uno slot di terra
      // arata, e non se ne aggiunge uno.
      expect(paint.palette).toBe(STAMP_EMPTY);
      expect(paint.cover).toBe(COVER.cropX);
      // Nessun piano da reggere, quindi nessun salto da costruire.
      expect(paint.deck).toBeUndefined();
      expect(paint.wall).toBeUndefined();
    }
  });

  it('il verso del lotto finisce nel marcatore', () => {
    const plot = accepted(fertile());
    expect(paintPlot({ ...plot, alongY: true })[0].cover).toBe(COVER.cropY);
    expect(paintPlot({ ...plot, alongY: false })[0].cover).toBe(COVER.cropX);
  });

  it('ritirarsi chiede di togliere il marcatore, non di demolire', () => {
    const plot = accepted(fertile());
    const paints = clearPlot(plot);

    expect(paints).toHaveLength(paintPlot(plot).length);
    // Zero e' una richiesta esplicita — «togli» — e non un'assenza.
    for (const paint of paints) expect(paint.cover).toBe(0);
  });

  it('un campo non contende il suolo a nessuno: e’ l’ultima priorita’', () => {
    // Sotto la carreggiata secondaria, che vale 1: dove una strada e un campo
    // rivendicano la stessa colonna vince sempre la strada.
    for (const paint of paintPlot(accepted(fertile()))) {
      expect(paint.priority).toBe(0);
    }
  });
});
