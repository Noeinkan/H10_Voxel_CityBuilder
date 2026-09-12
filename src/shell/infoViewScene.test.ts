import { describe, expect, it } from 'vitest';
import type { InfoViewOverlay } from '../engine/InfoViewOverlay';
import type { GrowthScene } from '../game/growthScene';
import type { InfoSampler } from '../sim';
import type { SimState } from '../sim/SimState';
import { createInfoViewScene } from './infoViewScene';

/**
 * Chi decide **quando** la heatmap si rifa'.
 *
 * La versione del campo si muove a ogni edificio, a ogni lotto, a ogni policy:
 * in una citta' viva sono piu' volte al secondo, mentre una heatmap intera si
 * costruisce in molti fotogrammi. Finche' ogni versione nuova la faceva
 * ripartire, non arrivava mai in fondo e a schermo non compariva niente — il
 * difetto che si vedeva come «le viste dati non fanno nulla». Qui si verifica
 * la regola che lo chiude: il campo aspetta il suo turno, il giocatore no.
 */

/** Uno stato minimo: di lui contano solo i campi che entrano nella versione. */
function mutableState(): SimState {
  return {
    catalysts: [],
    buildings: [],
    policies: [],
    farmCounts: [0, 0, 0],
    field: { totalRecomputedCells: 0 },
    coverageReport: { base: 0 },
  } as unknown as SimState;
}

interface FakeOverlay {
  /** Le chiavi passate a `setView`, in ordine: una per ricostruzione avviata. */
  readonly calls: string[];
  ready: boolean;
  readonly handle: InfoViewOverlay;
}

function fakeOverlay(): FakeOverlay {
  const calls: string[] = [];
  let activeKind: string | null = null;
  const fake = {
    calls,
    ready: true,
    handle: {
      get ready(): boolean {
        return fake.ready;
      },
      get activeKind(): string | null {
        return activeKind;
      },
      setView(sampler: InfoSampler, key: string): void {
        activeKind = sampler.kind;
        calls.push(key);
      },
      update(): void {},
      setVisible(): void {},
      clear(): void {
        activeKind = null;
      },
    } as unknown as InfoViewOverlay,
  };
  return fake;
}

function sceneOf(overlay: FakeOverlay, state: SimState) {
  return createInfoViewScene({
    overlay: overlay.handle,
    legend: null,
    hud: () => null,
    scene: () => ({ simState: state, farmPlots: [] }) as unknown as GrowthScene,
    budgetMs: 1,
  });
}

describe('infoViewScene', () => {
  it('un campo che si muove non fa ripartire la heatmap a ogni fotogramma', () => {
    const overlay = fakeOverlay();
    const state = mutableState();
    const views = sceneOf(overlay, state);

    views.setView('density');
    views.advance();
    expect(overlay.calls).toHaveLength(1);

    // Da qui in poi l'overlay sta costruendo, e la citta' continua a vivere:
    // cinquanta fotogrammi, cinquanta versioni nuove, nessuna ripartenza.
    overlay.ready = false;
    for (let frame = 0; frame < 50; frame++) {
      (state.field as { totalRecomputedCells: number }).totalRecomputedCells += 7;
      views.advance();
    }
    expect(overlay.calls).toHaveLength(1);

    // Finita quella, la piu' fresca entra: una sola, non cinquanta arretrate.
    overlay.ready = true;
    views.advance();
    expect(overlay.calls).toHaveLength(2);
    expect(overlay.calls[1]).toBe('density|0|0||0,0,0|350|0.00');
  });

  it('cambiare vista non aspetta nessuno: e` un gesto, non un aggiornamento', () => {
    const overlay = fakeOverlay();
    const state = mutableState();
    const views = sceneOf(overlay, state);

    views.setView('density');
    views.advance();
    overlay.ready = false;

    // La heatmap in corso riguarda un altro dato: aspettarla vorrebbe dire un
    // secondo di citta' nuda dopo un clic sul picker.
    views.setView('happiness');
    views.advance();
    expect(overlay.calls).toHaveLength(2);
    expect(overlay.calls[1].startsWith('happiness|')).toBe(true);
  });

  it('la citta` nuda spegne l`overlay e non ne chiede un`altra', () => {
    const overlay = fakeOverlay();
    const state = mutableState();
    const views = sceneOf(overlay, state);

    views.setView('density');
    views.advance();
    views.setView('off');
    views.advance();
    expect(overlay.calls).toHaveLength(1);
    expect(views.kind).toBe('off');
  });
});
