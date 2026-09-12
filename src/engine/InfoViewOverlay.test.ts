import { describe, expect, it } from 'vitest';
import type { BufferAttribute, Mesh } from 'three';
import type { InfoSampler, InfoViewKind } from '../sim';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { InfoViewOverlay } from './InfoViewOverlay';

/**
 * La heatmap dal lato della costruzione a scaglioni.
 *
 * **Il difetto che questo file esiste per prendere non e' geometrico: e' una
 * corsa.** La heatmap si costruisce in molti fotogrammi dentro un budget, e la
 * versione del campo si muove ogni volta che nasce un edificio o si ara un
 * lotto — cioe' piu' volte al secondo in una citta' viva. Finche' ogni versione
 * nuova faceva ripartire la costruzione **e** svuotava la geometria, a schermo
 * non arrivava mai niente: legenda accesa, dock che diceva «Reading: Food», e
 * la citta' nuda sotto. Nessun tipo lo dice, e in un `node` senza GPU si vede
 * lo stesso — la geometria si conta.
 */

const map = { heightAt: () => 4 } as unknown as TerrainMap;

/** Piccola di proposito: 32x32 sta sotto il tetto dei quad, quindi passo 1. */
const REGION = { minX: 0, minY: 0, sizeX: 32, sizeY: 32 };
const CELLS = REGION.sizeX * REGION.sizeY;

function samplerOf(
  kind: InfoViewKind,
  sample: (x: number, y: number) => number,
  { normalized = true, categorical = false } = {},
): InfoSampler {
  return {
    kind,
    mode: categorical ? 'categorical' : 'continuous',
    normalized,
    sparse: false,
    categories: categorical ? ['a', 'b'] : [],
    sample,
  };
}

function drawnVertices(overlay: InfoViewOverlay): number {
  const fill = overlay.group.children[0] as Mesh;
  const position = fill.geometry.getAttribute('position') as BufferAttribute | undefined;
  return position?.count ?? 0;
}

function fillColors(overlay: InfoViewOverlay): BufferAttribute {
  const fill = overlay.group.children[0] as Mesh;
  const color = fill.geometry.getAttribute('color') as BufferAttribute | undefined;
  if (color === undefined) throw new Error('la heatmap non ha colori: non e` stata consegnata');
  return color;
}

/**
 * Fa girare la costruzione a budget finche' la heatmap non viene consegnata.
 *
 * Il segnale della consegna e' la **geometria nuova**: `commitBuild` ne appende
 * una diversa, ed e' l'unica cosa che si possa guardare da fuori senza chiedere
 * all'overlay in che fase sia. `ready` non servirebbe — e' vero solo dopo la
 * pausa fra due rifacimenti, che qui sarebbe mezzo secondo di attesa a vuoto.
 */
function build(overlay: InfoViewOverlay, budgetMs = 5, frames = 4000): void {
  const fill = overlay.group.children[0] as Mesh;
  const before = fill.geometry;
  for (let frame = 0; frame < frames; frame++) {
    overlay.update(budgetMs);
    if (fill.geometry !== before) return;
  }
  throw new Error('la heatmap non e` mai arrivata in fondo');
}

describe('InfoViewOverlay', () => {
  it('consegna la heatmap: un quad per cella con un valore', () => {
    const overlay = new InfoViewOverlay(map, REGION);
    overlay.setVisible(true);
    overlay.setView(samplerOf('happiness', () => 0.5), 'happiness|1');
    build(overlay);

    // Sei vertici per quad, e tutte le celle hanno un valore diverso da zero.
    expect(drawnVertices(overlay)).toBe(CELLS * 6);
    expect(overlay.group.visible).toBe(true);
  });

  it('un campo che si muove non svuota la heatmap gia` a schermo', () => {
    const overlay = new InfoViewOverlay(map, REGION);
    overlay.setVisible(true);
    overlay.setView(samplerOf('happiness', () => 0.5), 'happiness|1');
    build(overlay);
    const drawn = drawnVertices(overlay);

    // La stessa vista su un campo piu' nuovo: la citta' e' cambiata sotto.
    overlay.setView(samplerOf('happiness', () => 0.7), 'happiness|2');
    // A meta' costruzione la heatmap di prima e' ancora quella che si guarda.
    overlay.update(0);
    expect(drawnVertices(overlay)).toBe(drawn);

    build(overlay);
    expect(drawnVertices(overlay)).toBe(drawn);
  });

  it('cambiare dato invece svuota subito: la tinta di prima direbbe un`altra cosa', () => {
    const overlay = new InfoViewOverlay(map, REGION);
    overlay.setVisible(true);
    overlay.setView(samplerOf('happiness', () => 0.5), 'happiness|1');
    build(overlay);
    expect(drawnVertices(overlay)).toBeGreaterThan(0);

    overlay.setView(samplerOf('materials', () => 3, { normalized: false }), 'materials|1');
    expect(drawnVertices(overlay)).toBe(0);
  });

  it('non si prende una versione nuova mentre ne sta costruendo una, e poi si`', async () => {
    const overlay = new InfoViewOverlay(map, REGION);
    overlay.setVisible(true);
    overlay.setView(samplerOf('happiness', () => 0.5), 'happiness|1');

    // E' il gate che `infoViewScene` interroga prima di costruire un
    // campionatore: senza, una citta' viva riporterebbe la costruzione a zero a
    // ogni edificio e la heatmap non finirebbe mai.
    expect(overlay.ready).toBe(false);
    overlay.update(0);
    expect(overlay.ready).toBe(false);

    build(overlay);
    // E dall'altra parte: finita la pausa il gate si riapre, o la heatmap
    // resterebbe per sempre quella del primo momento in cui e' stata accesa.
    // Mezzo secondo di attesa vera: e' l'unico orologio che l'overlay guarda.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(overlay.ready).toBe(true);
  });

  it('una heatmap che non ha piu` niente da dire toglie quella di prima', () => {
    const overlay = new InfoViewOverlay(map, REGION);
    overlay.setVisible(true);
    overlay.setView(samplerOf('food', (x) => (x < 10 ? 0 : -1), { categorical: true }), 'food|1');
    build(overlay);
    expect(drawnVertices(overlay)).toBeGreaterThan(0);

    // L'ultimo campo arato: la vista resta accesa e non deve mostrare il
    // raccolto di prima, che non c'e' piu'.
    overlay.setView(samplerOf('food', () => -1, { categorical: true }), 'food|2');
    build(overlay);
    expect(drawnVertices(overlay)).toBe(0);
  });

  it('il massimo sopravvive al budget: una vista non normalizzata non si dipinge tutta al colmo', () => {
    const overlay = new InfoViewOverlay(map, REGION);
    overlay.setVisible(true);
    // Il picco sta nella **prima** cella, e il campionamento durera' molti
    // fotogrammi: tenuto in una locale, a fine giro non ne resterebbe traccia e
    // ogni cella finirebbe a `valore / 0`, cioe' in cima alla rampa.
    overlay.setView(
      samplerOf('materials', (x, y) => (x === 0 && y === 0 ? 4 : 1), { normalized: false }),
      'materials|1',
    );
    build(overlay, 0, 4000);

    const colors = fillColors(overlay);
    const peak = [colors.getX(0), colors.getY(0), colors.getZ(0)];
    const plain = [colors.getX(colors.count - 1), colors.getY(colors.count - 1), colors.getZ(colors.count - 1)];
    expect(peak).not.toEqual(plain);
    // Un quarto del picco sta nella meta' fredda della rampa: il rosso resta basso.
    expect(plain[0]).toBeLessThan(0.2);
  });
});
