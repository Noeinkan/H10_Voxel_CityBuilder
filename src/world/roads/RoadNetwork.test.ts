import { describe, expect, it } from 'vitest';
import { testTerrain } from '../../sim/testTerrain';
import { BIOME } from '../terrain/config';
import { ROADS } from './config';
import { RoadNetwork } from './RoadNetwork';

/**
 * La rete sul terreno vero, cioe' l'unico posto dove il **viadotto** si vede.
 *
 * I quattro moduli puri di questa cartella hanno i loro test, e `viaduct.ts` sa
 * gia' promuovere una corsa in campata: quello che nessuno verificava e' se una
 * corsa del genere **capiti mai**, perche' a deciderlo sono i costi del terreno
 * e non la geometria. Con una fixture piatta e senz'acqua — l'unica che i test
 * del `Builder` avessero — la risposta era no, e l'intero ramo era codice non
 * percorso: le campate erano zero in ogni misura, comprese quelle su un'isola
 * generata davvero.
 *
 * La fixture qui sotto e' un canale con le rive in pendenza, e i biomi li
 * classifica `testTerrain` con le stesse funzioni del generatore: chiedere una
 * quota sotto il livello del mare da' oceano vero, non un'etichetta scritta a
 * mano.
 */

const SEED = 1337;
/** Meta' larghezza del canale, in colonne. */
const HALF = 6;

/**
 * Quota di una colonna a distanza `d` dall'asse del canale.
 *
 * La riva sale di un voxel per colonna e non di piu': `maxRise` vieta un passo
 * che salga oltre un cubo di terreno, quindi una sponda a picco renderebbe
 * l'acqua irraggiungibile e non ci sarebbe niente da scavalcare. E' anche il
 * motivo per cui su un'isola vera i ponti nascono nelle insenature e non sotto
 * le falesie.
 */
function shoreHeight(d: number): number {
  if (d <= HALF) return 10;
  return Math.min(30, 16 + (d - HALF));
}

/** Un canale verticale che taglia la mappa da parte a parte. */
function channelTerrain(closedBelow = Number.POSITIVE_INFINITY) {
  return testTerrain({
    chunksX: 3,
    chunksY: 3,
    heightAt: (x, y) => (y >= closedBelow ? 30 : shoreHeight(Math.abs(x - 48))),
    slopeAt: () => 0.1,
  });
}

describe('RoadNetwork sul terreno', () => {
  it('scavalca un canale che non si puo aggirare, e l impalcato e piano', () => {
    const map = channelTerrain();
    const roads = new RoadNetwork(map, () => false, SEED);
    roads.update([
      { x: 8, y: 48, strength: 100 },
      { x: 88, y: 48, strength: 60 },
    ]);

    expect(roads.orphans).toHaveLength(0);
    expect(roads.viaducts.length).toBeGreaterThan(0);

    // Un impalcato e' piano per definizione: se le quote fossero piu' d'una
    // sarebbe un terrapieno che segue il fondale, che e' l'errore da cui
    // `planViaducts` esiste per scappare.
    const levels = new Set(roads.viaducts.map((cell) => cell.level));
    expect(levels.size).toBe(1);

    // Il franco si pretende sopra l'acqua, non sopra le spalle: li' l'impalcato
    // tocca terra apposta, ed e' il senso di una spalla.
    const deck = roads.viaducts[0].level;
    let overWater = 0;
    for (const cell of roads.viaducts) {
      if (map.biomeAt(cell.x, cell.y) !== BIOME.ocean) continue;
      overWater++;
      const under = Math.max(map.waterTopAt(cell.x, cell.y), map.heightAt(cell.x, cell.y));
      expect(deck - under).toBeGreaterThanOrEqual(ROADS.viaductClearance);
    }
    expect(overWater).toBeGreaterThan(ROADS.viaductMinRun);

    // E le pile sono poche: una campata che poggiasse su ogni colonna sarebbe un
    // muro con un buco sotto, non un ponte.
    const piers = roads.viaducts.filter((cell) => cell.pier).length;
    expect(piers).toBeGreaterThan(0);
    expect(piers).toBeLessThan(roads.viaducts.length / 2);
  });

  it('costeggia invece di scavalcare quando il giro costa meno del ponte', () => {
    // Lo stesso canale, ma chiuso da un istmo in fondo alla mappa: attraversare
    // costa `larghezza x waterCost`, girare costa `giro x landCost`, e a questa
    // larghezza vince il giro. E' la stessa aritmetica che tiene una strada
    // attorno a una baia larga e le fa scavalcare solo le strozzature.
    const map = channelTerrain(34);
    const roads = new RoadNetwork(map, () => false, SEED);
    roads.update([
      { x: 8, y: 24, strength: 100 },
      { x: 88, y: 24, strength: 60 },
    ]);

    expect(roads.orphans).toHaveLength(0);
    expect(roads.viaducts).toHaveLength(0);
    // La prova che ha girato davvero: la carreggiata scende fino all'istmo.
    expect(Math.max(...roads.surface.map((cell) => cell.y))).toBeGreaterThanOrEqual(34);
  });

  it('la fascia di fronte strada risponde vicino e tace lontano', () => {
    const map = testTerrain({ chunksX: 3, chunksY: 3, height: 30 });
    const roads = new RoadNetwork(map, () => false, SEED);
    roads.update([
      { x: 16, y: 48, strength: 100 },
      { x: 80, y: 48, strength: 60 },
    ]);

    const on = roads.surface[0];
    expect(roads.touchesRoad(on.x, on.y, 1)).toBe(true);

    // Un punto oltre il raggio da **ogni** colonna di carreggiata.
    let far: { x: number; y: number } | null = null;
    for (let y = 0; y < 96 && far === null; y++) {
      for (let x = 0; x < 96; x++) {
        if (roads.distanceToRoad(x, y, ROADS.frontageReach) > ROADS.frontageReach) {
          far = { x, y };
          break;
        }
      }
    }
    expect(far).not.toBeNull();
    expect(roads.touchesRoad(far!.x, far!.y, 1)).toBe(false);
  });

  it('il capillare e un passo carraio: oltre laneReach non si tira', () => {
    const map = testTerrain({ chunksX: 3, chunksY: 3, height: 30 });
    const roads = new RoadNetwork(map, () => false, SEED);
    roads.update([
      { x: 16, y: 16, strength: 100 },
      { x: 40, y: 16, strength: 60 },
    ]);
    const paved = roads.surface.length;

    // Un lotto appena fuori dalla fascia se lo tira dietro. Il margine tiene
    // conto della **larghezza** del tratto: la fascia si misura dal bordo della
    // carreggiata, e un tronco da sei voxel ne occupa gia' tre per lato.
    const near = roads.connect(16, 16 + ROADS.frontageReach + ROADS.rankWidth[3] + 2);
    expect(near.length).toBeGreaterThan(0);

    // Uno dall'altra parte della mappa no: non e' periferia, e' un altro posto.
    const away = roads.connect(90, 90);
    expect(away).toHaveLength(0);
    expect(roads.surface.length).toBe(paved + near.length);
  });
});
