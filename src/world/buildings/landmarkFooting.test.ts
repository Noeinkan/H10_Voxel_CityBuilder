import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { GRADING } from '../grading/config';
import { TERRACE, TERRAIN } from '../terrain/config';
import type { TerrainMap } from '../terrain/TerrainMap';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';

/**
 * Quello che il cursore promette in montagna.
 *
 * **Il difetto si vedeva come un'assenza, ed era il peggiore dei tre modi di non
 * comparire.** Su un fianco ripido `surveyGrade` rifiuta l'opera sotto un
 * riquadro largo dodici colonne, quindi la struttura non compare; la piazzola di
 * ripiego nemmeno, perche' `canPaint` scarta ogni colonna in parete. Il
 * catalizzatore si pagava, il campo funzionava, e sul terreno non compariva
 * **niente** — mentre il cursore aveva appena scritto «Valid position». Gli
 * altri due modi — il riquadro pieno di torri, la struttura che non si tocca —
 * il preventivo li diceva gia'.
 *
 * Il rilievo e' scritto a mano: in `testTerrain` la pendenza non si ricava dalle
 * quote, quindi «parete» qui e' parete davvero e non per dichiarazione.
 */

const PLATEAU = TERRAIN.beachMaxHeight + 8;

/** Colonna della cengia su cui il giocatore clicca. */
const SPOT = 40;
const ROW = 48;

/**
 * Una cengia alta `rows` righe, con la parete sopra e sotto.
 *
 * La colonna cliccata e' lavorabile — e' quello che `catalystFailure` controlla,
 * ed e' il motivo per cui il piazzamento passa — mentre il riquadro della
 * ricetta esce sulla parete, che nessuna opera raddrizza.
 */
function ledge(rows: number): TerrainMap {
  const half = rows >> 1;
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: () => PLATEAU,
    slopeAt: (_x, y) =>
      Math.abs(y - ROW) <= half ? 0.1 : GRADING.maxTerraceSlope + 0.2,
  });
}

/** Due pedate piane: cambia solo quanti gradoni il landmark prova a cucire. */
function terraces(drop: number): TerrainMap {
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: (_x, y) => y < ROW ? PLATEAU : PLATEAU + drop,
    // Le pedate sono lavorabili; e' il dislivello complessivo dell'impronta,
    // non una parete dichiarata, a dover fermare l'opera troppo alta.
    slopeAt: () => 0.1,
  });
}

/** Un piano con una sola parete a sud: sopra `edgeY` nessuna opera raddrizza. */
function cliff(edgeY: number): TerrainMap {
  return testTerrain({
    chunksX: 4,
    chunksY: 4,
    heightAt: () => PLATEAU,
    slopeAt: (_x, y) => (y <= edgeY ? 0.1 : GRADING.maxTerraceSlope + 0.2),
  });
}

function builderOn(map: TerrainMap): Builder {
  return new Builder(new VoxelWorld(), map, 4242);
}

function settle(builder: Builder): void {
  let guard = 0;
  while ((builder.stats.growing > 0 || builder.stats.surfaceQueued > 0) && guard++ < 5000) {
    builder.step();
  }
}

describe('un landmark su una cengia di montagna', () => {
  it('lo dice prima del click invece di non comparire', () => {
    // Il mercato e' profondo dodici colonne: su una cengia da sette non ci sta,
    // e nessun terrapieno lo fa stare.
    const builder = builderOn(ledge(6));
    expect(builder.landmarkClearance(SPOT, ROW, 'market').refusal).toBe('no-footing');
  });

  it('e il rifiuto e la stessa risposta che da il click', () => {
    // E' l'invariante del preventivo: cursore e click devono chiedere al terreno
    // la stessa cosa, o «Valid position» torna a essere un'opinione.
    const builder = builderOn(ledge(6));
    builder.placeLandmark(SPOT, ROW, 'market');
    settle(builder);

    expect([...builder.registry.all].some((record) => record.landmark !== undefined)).toBe(false);
  });

  it('non rifiuta dove la cengia regge davvero l ingombro', () => {
    // Il controllo nuovo non deve diventare un divieto sulla montagna in
    // generale: dove il ripiano e' largo abbastanza il mercato ci sta, e ci va.
    const builder = builderOn(ledge(30));
    expect(builder.landmarkClearance(SPOT, ROW, 'market').refusal).toBeNull();

    builder.placeLandmark(SPOT, ROW, 'market');
    settle(builder);
    expect([...builder.registry.all].some((record) => record.landmark === 'market')).toBe(true);
  });

  it('scavalca un ciglio naturale ma non cuce insieme mezzo versante', () => {
    const oneRiser = builderOn(terraces(TERRACE.maxStep));
    expect(oneRiser.landmarkClearance(SPOT, ROW, 'monument').refusal).toBeNull();

    const mountainside = builderOn(terraces(TERRACE.maxStep * 2));
    expect(mountainside.landmarkClearance(SPOT, ROW, 'monument').refusal).toBe('no-footing');
    mountainside.placeLandmark(SPOT, ROW, 'monument');
    settle(mountainside);
    expect([...mountainside.registry.all].some((record) => record.landmark === 'monument'))
      .toBe(false);
  });

  it('non apre un cantiere per una struttura che non puo comparire', () => {
    // Sgomberare e' definitivo, la struttura no: senza questo controllo il
    // riquadro si portava via le case e poi ripiegava comunque sulla piazzola.
    // Le case stanno sul piano, il riquadro del mercato le sormonta e il suo
    // bordo sud esce sulla parete: l'opera non regge, e le case restano.
    const builder = builderOn(cliff(ROW + 2));
    builder.materialize([
      { x: SPOT - 4, y: ROW - 10, class: BUILDING_CLASS.residential },
      { x: SPOT + 8, y: ROW - 10, class: BUILDING_CLASS.residential },
    ]);
    const before = builder.registry.count;
    expect(before).toBeGreaterThan(0);

    builder.placeLandmark(SPOT, ROW, 'market');
    settle(builder);

    expect(builder.stats.clearing).toBe(0);
    expect(builder.registry.count).toBe(before);
  });
});
