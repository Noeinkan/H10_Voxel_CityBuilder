import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../terrain/config';
import { classifyBiome } from '../terrain/biomes';
import { HARBOR } from './config';
import { planFigure } from './figures';
import { HARBOR_FIGURE, NO_SHORE, surveyCoast, type CoastSite } from './site';
import type { HarborProbe } from './plan';

/**
 * Il vocabolario delle figure d'acqua, e la costa che lo declina.
 *
 * **Le fixture sono funzioni di quota di una riga.** Una costa qui e' «terra da
 * -2 a 19, mare oltre», ed e' esattamente cio' che permette di provare «questa
 * riva ammette il canale e non le darsene» senza generare un'isola: la
 * classificazione guarda tre numeri — quanta terra c'e' dietro, quanto e'
 * dritta la riva, quante righe una riva ce l'hanno — e sono tutti e tre
 * scrivibili a mano.
 */

const LAND = TERRAIN.beachMaxHeight + 6;
const SEA = TERRAIN.seaLevel - 4;
const SHORT = 12;

function probeOf(heights: (x: number, y: number) => number): HarborProbe {
  return {
    has: () => true,
    heightAt: heights,
    biomeAt: (x, y) => classifyBiome(heights(x, y), 0.1, TERRAIN.seaLevel),
  };
}

/** La costa misurata davanti a una struttura all'origine, fronte a est. */
function coastOf(heights: (x: number) => number): CoastSite {
  return surveyCoast(
    {
      fromRow: -HARBOR.figureReach,
      toRow: SHORT + HARBOR.figureReach,
      reach: HARBOR.figureReach,
      waterZ: TERRAIN.seaLevel,
    },
    probeOf((x) => heights(x)),
    (cx, cy) => ({ x: cx, y: cy }),
  );
}

/** Terra fra `from` incluso e `to` escluso, mare dappertutto altrove. */
function strip(from: number, to: number): (x: number) => number {
  return (x) => (x >= from && x < to ? LAND : SEA);
}

describe('la costa sceglie la figura', () => {
  it('riva profonda e dritta: le darsene a pettine', () => {
    // Le condizioni delle West India Docks — una lingua di terra in cui si puo'
    // scavare, e una riva abbastanza dritta perche' i bacini si aprano tutti
    // sullo stesso mare.
    const site = coastOf(strip(-HARBOR.figureReach, 40));
    expect(site.figure).toBe(HARBOR_FIGURE.docks);
    expect(site.shore.every((edge) => edge === 40)).toBe(true);
    expect(site.spread).toBe(0);
    expect(site.landDepth).toBeGreaterThanOrEqual(HARBOR.dockLand);
  });

  it('riva sottile: il canale che stacca un isola', () => {
    // Ventidue colonne di terra: troppe poche per un pettine — il bacino
    // uscirebbe dal fondo del proprio scavo — e abbastanza per un taglio
    // sottile con l'isola davanti.
    const site = coastOf(strip(-2, 20));
    expect(site.landDepth).toBe(22);
    expect(site.landDepth).toBeLessThan(HARBOR.dockLand);
    expect(site.figure).toBe(HARBOR_FIGURE.canal);
  });

  it('una lingua stretta: l argine, che non pretende niente', () => {
    // Dieci colonne di terra e mare da tutte e due le parti: non c'e' niente in
    // cui scavare, e la riva si mura invece di tagliarla.
    const site = coastOf(strip(0, 10));
    expect(site.landDepth).toBe(10);
    expect(site.figure).toBe(HARBOR_FIGURE.embankment);
  });

  it('una punta circondata d acqua: il porticciolo fra due moli', () => {
    // Meno di mezza fascia ha una riva davanti: le righe lontane sono terra
    // ferma fin dove la sonda arriva, quindi li' una costa non c'e'. L'unico
    // gesto disponibile e' aggiungere, non togliere.
    const site = surveyCoast(
      {
        fromRow: -HARBOR.figureReach,
        toRow: SHORT + HARBOR.figureReach,
        reach: HARBOR.figureReach,
        waterZ: TERRAIN.seaLevel,
      },
      probeOf((x, y) => (Math.abs(y - 6) < 10 && x >= 20 ? SEA : LAND)),
      (cx, cy) => ({ x: cx, y: cy }),
    );
    expect(site.figure).toBe(HARBOR_FIGURE.cove);
    expect(site.shore.filter((edge) => edge === NO_SHORE).length)
      .toBeGreaterThan(site.shore.length / 2);
  });

  it('la stessa costa girata da la stessa risposta', () => {
    // La rotazione la porta `column`, ed e' la sola: se la misura avesse un
    // segno suo, un porto rivolto a ovest sceglierebbe un'altra figura dello
    // stesso pezzo di costa.
    const query = {
      fromRow: -HARBOR.figureReach,
      toRow: SHORT + HARBOR.figureReach,
      reach: HARBOR.figureReach,
      waterZ: TERRAIN.seaLevel,
    };
    const coast = strip(-2, 20);
    const east = surveyCoast(query, probeOf((x) => coast(x)), (cx, cy) => ({ x: cx, y: cy }));
    const west = surveyCoast(query, probeOf((x) => coast(-x)), (cx, cy) => ({ x: -cx, y: cy }));
    expect(west).toEqual(east);
  });
});

describe('le figure d acqua', () => {
  it('il canale si richiude in mare ai due capi e stacca un isola', () => {
    const site = coastOf(strip(-2, 20));
    const shape = planFigure({ site, long: 16, short: SHORT });

    // La corsa lungo la costa piu' le due bocche che la riportano al mare.
    expect(shape.water).toHaveLength(3);
    const [run, ...mouths] = shape.water;
    expect(run.h).toBe(HARBOR.canalRun);
    expect(run.w).toBe(HARBOR.canalWidth);
    for (const mouth of mouths) {
      // **Una bocca deve arrivare in mare**, o il canale resta una vasca: parte
      // dalla sponda interna del canale e sborda oltre la riva.
      expect(mouth.x).toBe(run.x);
      expect(mouth.x + mouth.w).toBeGreaterThan(20);
      expect(mouth.h).toBe(HARBOR.canalWidth);
    }

    // L'isola: la striscia fra la sponda esterna del canale e la riva, fra le
    // due bocche. E' il lotto, ed e' la ragione della figura.
    expect(shape.quays).toHaveLength(1);
    const island = shape.quays[0];
    expect(island.x).toBe(run.x + HARBOR.canalWidth);
    expect(island.y).toBeGreaterThan(run.y);
    expect(island.y + island.h).toBeLessThan(run.y + run.h);
  });

  it('il porticciolo lascia la bocca fra i due bracci', () => {
    const site = surveyCoast(
      {
        fromRow: -HARBOR.figureReach,
        toRow: SHORT + HARBOR.figureReach,
        reach: HARBOR.figureReach,
        waterZ: TERRAIN.seaLevel,
      },
      probeOf((x, y) => (Math.abs(y - 6) < 10 && x >= 20 ? SEA : LAND)),
      (cx, cy) => ({ x: cx, y: cy }),
    );
    const shape = planFigure({ site, long: 16, short: SHORT });

    // Due bracci, ciascuno con la propria piega: quattro rettangoli, e niente
    // scavo — lo specchio dentro e' il mare che c'era.
    //
    // **Sono pontili, non colmate**, ed e' la correzione che il porticciolo
    // aspettava: un braccio portato al piano della citta' esce dal mare come un
    // muro alto sei voxel, che e' esattamente come si vedeva a schermo.
    expect(shape.water).toHaveLength(0);
    expect(shape.moles).toHaveLength(0);
    expect(shape.piers).toHaveLength(4);
    const turns = shape.piers.filter((rect) => rect.w === HARBOR.coveThickness);
    expect(turns).toHaveLength(2);

    // Fra le due pieghe resta la bocca, larga quanto dichiarato.
    const [a, b] = turns.sort((p, q) => p.y - q.y);
    expect(b.y - (a.y + a.h)).toBe(HARBOR.coveMouth);
    // E le due pieghe stanno alla stessa distanza dal largo: un porticciolo con
    // un braccio piu' corto dell'altro non chiude niente.
    expect(a.x).toBe(b.x);
  });

  it('l argine salta le righe della struttura', () => {
    // Li' il fronte d'acqua l'ha gia' costruito la ricetta, e una colmata sopra
    // il proprio molo ne sotterrerebbe gli ormeggi: la barca resterebbe
    // sull'asciutto, che e' il difetto da cui questa fase e' nata.
    const site = coastOf(strip(0, 10));
    const shape = planFigure({ site, long: 16, short: SHORT });

    expect(shape.moles.length).toBeGreaterThan(0);
    expect(shape.piers.length).toBe(shape.moles.length);
    for (const rect of [...shape.moles, ...shape.piers]) {
      const overlaps = rect.y < SHORT && rect.y + rect.h > 0;
      expect(overlaps, `${rect.y}..${rect.y + rect.h}`).toBe(false);
    }

    // Il bordo lungo la riva e' una colmata — ci si cammina e ci si costruisce
    // accanto; cio' che sporge sull'acqua e' un tavolato su pali, e sta piu' al
    // largo di quello che lo regge.
    for (let i = 0; i < shape.moles.length; i++) {
      expect(shape.piers[i].x).toBeGreaterThanOrEqual(shape.moles[i].x + shape.moles[i].w);
    }
  });

  it('le darsene alternano i due lati e restano dentro il tetto', () => {
    const site = coastOf(strip(-HARBOR.figureReach, 40));
    const shape = planFigure({ site, long: 16, short: SHORT });

    expect(shape.water).toHaveLength(HARBOR.dockCount);
    // Alternate: il primo bacino a nord della struttura, il secondo a sud.
    expect(shape.water[0].y).toBeGreaterThanOrEqual(SHORT);
    expect(shape.water[1].y + shape.water[1].h).toBeLessThanOrEqual(0);
    // Ogni bacino ha le sue due sponde e la testata, e una dita di banchina.
    expect(shape.banks).toHaveLength(HARBOR.dockCount * 3);
    expect(shape.quays).toHaveLength(HARBOR.dockCount);
    // Niente esce dal tetto della figura.
    for (const rect of [...shape.water, ...shape.banks, ...shape.quays]) {
      expect(Math.abs(rect.y)).toBeLessThanOrEqual(HARBOR.figureReach);
      expect(Math.abs(rect.x)).toBeLessThanOrEqual(HARBOR.figureReach);
    }
  });

  it('ogni darsena ha la sua gru, con lo sbraccio sopra il bacino', () => {
    // **A distanza isometrica un bacino senza niente sopra e' una vasca.** E'
    // lo sbraccio a dire che di li' si scarica qualcosa, e per dirlo deve
    // stare sopra l'acqua del **proprio** bacino: un braccio che sporge dalla
    // parte sbagliata pende sulla dita di banchina, cioe' sulle case.
    const site = coastOf(strip(-HARBOR.figureReach, 40));
    const shape = planFigure({ site, long: 16, short: SHORT });

    expect(shape.cranes).toHaveLength(shape.water.length);
    for (let i = 0; i < shape.cranes.length; i++) {
      const { mast, boom } = shape.cranes[i];
      const basin = shape.water[i];
      // Il montante poggia sulla banchina, il braccio no: si toccano su un
      // bordo e nient'altro.
      expect(boom.h).toBe(HARBOR.craneReach);
      expect(boom.x).toBe(mast.x);
      // Lo sbraccio sta sopra il proprio bacino, non oltre.
      expect(boom.y).toBeGreaterThanOrEqual(basin.y);
      expect(boom.y + boom.h).toBeLessThanOrEqual(basin.y + basin.h);
      // E arretrato dalla riva, o finirebbe in mare aperto invece che sopra
      // l'acqua che serve.
      expect(mast.x + mast.w).toBeLessThan(basin.x + basin.w);
    }
  });
});
