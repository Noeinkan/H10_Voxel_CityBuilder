import { describe, expect, it } from 'vitest';
import {
  SWATCH_BUILDINGS,
  SWATCH_FOCUS,
  SWATCH_FOCUSES,
  SWATCH_SUBJECTS,
} from '../world/scenes/swatchCatalog';
import {
  SWATCH_FOCUS_LABELS,
  swatchCard,
  type SwatchOverlayFrame,
} from './SwatchOverlayModel';

const BUILDING = SWATCH_BUILDINGS[0];
const MATRIX = SWATCH_SUBJECTS.find((subject) => subject.kind === 'matrix')!;

describe('SwatchOverlayModel · scheda', () => {
  it('dice cosa fare quando il cursore non tocca niente', () => {
    const card = swatchCard(frame({}));
    expect(card.kind).toBeNull();
    expect(card.rows).toEqual([]);
    expect(card.pinned).toBeNull();
    // Il pannello resta utile a vuoto: il voxel e' dichiarato assente e le
    // istruzioni d'uso non spariscono con il soggetto.
    expect(card.voxelRows).toEqual([{ label: 'Voxel', value: '—' }]);
    expect(card.hints.length).toBeGreaterThan(0);
  });

  it('chiude la scheda di un soggetto con ingombro e altezza', () => {
    const card = swatchCard(frame({ subject: BUILDING }));
    expect(card.title).toBe(BUILDING.label);
    expect(card.kind).toBe('building');

    // Le righe del catalogo restano nell'ordine in cui il catalogo le scrive:
    // la misura si aggiunge in coda, non si mescola alle condizioni.
    expect(card.rows.slice(0, BUILDING.info.length)).toEqual([...BUILDING.info]);
    expect(value(card.rows, 'Footprint'))
      .toBe(`${BUILDING.rect.x1 - BUILDING.rect.x0} × ${BUILDING.rect.y1 - BUILDING.rect.y0} voxel`);
    expect(value(card.rows, 'Height')).toBe(`${BUILDING.z1 - BUILDING.z0} voxel`);
    // Il dettaglio e' solo della matrice: un edificio non lo porta.
    expect(value(card.rows, 'Detail')).toBeNull();
  });

  it('porta il conteggio dei prismi solo dove c\'e\'', () => {
    const card = swatchCard(frame({ subject: MATRIX, detail: { prisms: 12, quads: 34 } }));
    expect(value(card.rows, 'Detail')).toBe('12 prisms · 34 quads');
  });

  it('dice come mollare la scelta solo quando non e\' quella indicata', () => {
    const away = swatchCard(frame({ subject: MATRIX, selection: BUILDING }));
    expect(away.pinned).toBe(`${BUILDING.label} · Esc to drop`);

    // Sul soggetto indicato l'istruzione sarebbe rumore: si sta gia' guardando.
    const same = swatchCard(frame({ subject: BUILDING, selection: BUILDING }));
    expect(same.pinned).toBe(BUILDING.label);
  });

  it('spezza il referto del voxel in coordinate, palette e superficie', () => {
    const card = swatchCard(frame({ voxel: { x: 3, y: 4, z: 5, palette: 1, surface: 0 } }));
    expect(card.voxelRows.map((row) => row.label)).toEqual(['Voxel', 'Palette', 'Surface']);
    expect(card.voxelRows[0].value).toBe('3, 4, 5');
    expect(card.voxelRows[1].value).toContain('slot 1');
    expect(card.voxelRows[2].value).toContain('(0)');
  });

  it('nomina ogni fascia dei pulsanti', () => {
    for (const focus of SWATCH_FOCUSES) {
      expect(SWATCH_FOCUS_LABELS[focus], focus).toBeTruthy();
    }
    expect(swatchCard(frame({})).focusLabel).toBe(SWATCH_FOCUS_LABELS[SWATCH_FOCUS.all]);
  });
});

/** Fotogramma di prova: tutto assente, salvo quello che il caso dichiara. */
function frame(partial: Partial<SwatchOverlayFrame>): SwatchOverlayFrame {
  return {
    focus: SWATCH_FOCUS.all,
    subject: null,
    selection: null,
    voxel: null,
    detail: null,
    ...partial,
  };
}

function value(rows: readonly { label: string; value: string }[], label: string): string | null {
  return rows.find((row) => row.label === label)?.value ?? null;
}
