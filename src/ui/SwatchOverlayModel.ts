import { SWATCH_FOCUS, type SwatchFocus, type SwatchSubject } from '../world/scenes/swatchCatalog';
import type { SwatchDetail } from '../world/scenes/swatchProbe';
import { PALETTE_SLOT_NAMES } from '../engine/paletteSlots';
import { SURFACE_KIND_NAMES } from '../world/visualBlock';

/**
 * La scheda del campionario, senza DOM.
 *
 * **Sta separata dalla vista per la stessa ragione di `GameHudModel`**: qui i
 * test girano in Node, e la scheda e' l'unica parte del pannello che decide
 * qualcosa — quali righe compaiono, in che ordine, cosa si legge quando il
 * cursore non tocca niente. `SwatchOverlay` da lei prende solo elementi da
 * appendere.
 *
 * **Perche' non e' piu' un blocco di testo.** Il referto era un `<pre>` con le
 * etichette allineate a mano: reggeva finche' le righe erano quattro, ma la
 * scheda di un edificio adesso ne porta dieci e mezze sono frasi — condizioni,
 * linea di crescita, forma. Allineate a colpi di `padEnd` andavano a capo dove
 * capitava e l'etichetta si perdeva. Una griglia di due colonne le tiene
 * insieme, e il valore lungo va a capo sotto se stesso invece che sotto la
 * colonna delle etichette.
 */

/** Il voxel colpito dal raggio, con il suo referto di palette e superficie. */
export interface SwatchVoxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Slot di palette del voxel. */
  readonly palette: number;
  /** Indice del linguaggio di superficie del voxel. */
  readonly surface: number;
}

export interface SwatchOverlayFrame {
  /** Fascia inquadrata dai pulsanti. */
  readonly focus: SwatchFocus;
  /** Soggetto sotto il cursore, o la scelta persistente quando il cursore e' fuori. */
  readonly subject: SwatchSubject | null;
  /** Scelta persistente: sopravvive alla navigazione fra le fasce. */
  readonly selection: SwatchSubject | null;
  /** Il voxel davvero colpito, o null se il cursore non tocca nulla. */
  readonly voxel: SwatchVoxel | null;
  /** Prismi e quad della cella di matrice, o null fuori dalla matrice. */
  readonly detail: SwatchDetail | null;
}

export interface SwatchCardRow {
  readonly label: string;
  readonly value: string;
}

export interface SwatchCard {
  /** Fascia inquadrata, per il titolo del pannello. */
  readonly focusLabel: string;
  readonly title: string;
  /** Genere del soggetto, o null quando non c'e' niente sotto il cursore. */
  readonly kind: string | null;
  readonly note: string | null;
  readonly rows: readonly SwatchCardRow[];
  /** Riga della scelta persistente, o null quando non c'e' una scelta. */
  readonly pinned: string | null;
  readonly voxelRows: readonly SwatchCardRow[];
  readonly hints: readonly string[];
}

export const SWATCH_FOCUS_LABELS: Readonly<Record<SwatchFocus, string>> = {
  [SWATCH_FOCUS.matrix]: 'Matrix',
  [SWATCH_FOCUS.scale]: 'Scale',
  [SWATCH_FOCUS.buildings]: 'Buildings',
  [SWATCH_FOCUS.landmarks]: 'Landmarks',
  [SWATCH_FOCUS.arcologies]: 'Arcologies',
  [SWATCH_FOCUS.all]: 'All',
};

const KIND_LABELS: Readonly<Record<SwatchSubject['kind'], string>> = {
  matrix: 'matrix cell',
  strata: 'strata',
  scale: 'scale reference',
  building: 'building',
  landmark: 'landmark',
  arcology: 'arcology',
};

/** Cosa si legge quando il cursore non tocca nessun soggetto. */
const EMPTY_TITLE = 'Nothing under the cursor';

/**
 * L'unica istruzione d'uso che il campionario ha.
 *
 * Il doppio clic che inquadra un soggetto non si indovina, e senza di lui una
 * megastruttura alta settecento voxel si guarda soltanto insieme alle altre
 * quattordici.
 */
const HINTS: readonly string[] = [
  'Click to pin · Double click to frame · Esc to drop',
  '1..9 theme · L day/night · H ±1h · F3 technical overlays',
];

/** La scheda che il pannello scrive per il fotogramma corrente. */
export function swatchCard(frame: SwatchOverlayFrame): SwatchCard {
  const subject = frame.subject;
  return {
    focusLabel: SWATCH_FOCUS_LABELS[frame.focus],
    title: subject?.label ?? EMPTY_TITLE,
    kind: subject === null ? null : KIND_LABELS[subject.kind],
    note: subject?.note ?? null,
    rows: subject === null ? [] : subjectRows(subject, frame.detail),
    pinned: pinnedLine(frame),
    voxelRows: voxelRows(frame.voxel),
    hints: HINTS,
  };
}

/**
 * Le righe del soggetto: prima cio' che il catalogo dichiara, poi la misura.
 *
 * Ingombro e altezza chiudono la scheda perche' sono l'unica coppia che si
 * legge anche a occhio: stanno vicino al soggetto a schermo, non alle sue
 * condizioni.
 */
function subjectRows(
  subject: SwatchSubject,
  detail: SwatchDetail | null,
): readonly SwatchCardRow[] {
  const rows: SwatchCardRow[] = [...subject.info];
  rows.push({
    label: 'Footprint',
    value: `${subject.rect.x1 - subject.rect.x0} × ${subject.rect.y1 - subject.rect.y0} voxel`,
  });
  rows.push({ label: 'Height', value: `${subject.z1 - subject.z0} voxel` });
  if (detail !== null) {
    rows.push({ label: 'Detail', value: `${detail.prisms} prisms · ${detail.quads} quads` });
  }
  return rows;
}

/** La scelta persistente, e come lasciarla andare quando non e' quella indicata. */
function pinnedLine(frame: SwatchOverlayFrame): string | null {
  if (frame.selection === null) return null;
  return frame.selection === frame.subject
    ? frame.selection.label
    : `${frame.selection.label} · Esc to drop`;
}

/**
 * Il referto del voxel colpito, spezzato in tre righe.
 *
 * Su una riga sola slot e superficie finivano oltre il bordo del pannello, ed
 * erano proprio i due numeri per cui il campionario esiste.
 */
function voxelRows(voxel: SwatchVoxel | null): readonly SwatchCardRow[] {
  if (voxel === null) return [{ label: 'Voxel', value: '—' }];
  return [
    { label: 'Voxel', value: `${voxel.x}, ${voxel.y}, ${voxel.z}` },
    { label: 'Palette', value: `${PALETTE_SLOT_NAMES[voxel.palette]} (slot ${voxel.palette})` },
    { label: 'Surface', value: `${SURFACE_KIND_NAMES[voxel.surface]} (${voxel.surface})` },
  ];
}
