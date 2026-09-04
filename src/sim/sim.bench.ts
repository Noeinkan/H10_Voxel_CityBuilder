import { bench, describe } from 'vitest';
import { CATALYSTS as ROLES } from './catalysts';
import { BUILDING_CLASS, CLASS_COUNT, type BuildingClass } from './classes';
import { FARM_KIND } from './farms';
import { nextBuildSites } from './nextBuildSites';
import {
  addBuilding,
  addCatalyst,
  addFarm,
  createSimState,
  rebuildField,
  setCatalystStrength,
  setPolicyActive,
  type SimState,
} from './SimState';
import { testTerrain } from './testTerrain';
import { tick } from './tick';

/**
 * Costo delle tre operazioni che hanno un criterio.
 *
 * `npm run bench`
 *
 * Il tick e' il solo che gira a ogni frame e ha il budget piu' stretto (3 ms).
 * Gli altri due sono azioni del giocatore o passi di debug: si misurano per
 * sapere che il percorso incrementale funziona, non perche' stiano su un budget
 * di frame.
 */

const CATALYSTS = 50;
const BUILDINGS = 400;

/** Isola 256x256, cinquanta catalizzatori, quattrocento edifici. */
function cityOf256(): SimState {
  let state = createSimState();

  for (let i = 0; i < CATALYSTS; i++) {
    // A giro sui sette ruoli: ognuno porta il proprio vettore di influenza, e
    // la misura include quindi il costo di scrivere piu' usi per cella.
    const role = ROLES[i % ROLES.length];
    state = addCatalyst(state, {
      x: (i * 37) % 250,
      y: (i * 61) % 250,
      kind: role.id,
      class: role.class,
      strength: 120 + ((i * 13) % 130),
      radius: 12 + (i % 9),
    });
  }
  for (let i = 0; i < BUILDINGS; i++) {
    state = addBuilding(state, {
      x: (i * 7) % 250,
      y: (i * 11) % 250,
      class: (i % CLASS_COUNT) as BuildingClass,
    });
  }

  return state;
}

const terrainMap = testTerrain({ chunksX: 8, chunksY: 8 });
const city = cityOf256();

/**
 * La stessa citta' con la campagna che la nutre.
 *
 * **Serve perche' `cityOf256` non ha lotti agricoli**, quindi il tick nudo
 * attraversa i cicli del raccolto su contatori a zero e non misura niente di
 * cio' che la 3.1 ha aggiunto. Il numero di lotti e' quello che sfama la
 * popolazione di una citta' da quattrocento edifici: cento residenziali pieni
 * vogliono cinquanta campi.
 */
function fedCityOf256(): SimState {
  let state = cityOf256();
  for (let i = 0; i < 50; i++) state = addFarm(state, FARM_KIND.field);
  for (let i = 0; i < 12; i++) state = addFarm(state, FARM_KIND.orchard);
  return state;
}

const fedCity = fedCityOf256();

describe('simulazione, mappa 256x256', () => {
  let ticking = city;
  bench('tick', () => {
    ticking = tick(ticking, terrainMap);
  });

  // Il confronto che dice quanto costa la campagna: stessa citta', stessi
  // edifici, piu' sessantadue lotti agricoli da sommare a ogni tick.
  let feeding = fedCity;
  bench('tick con 62 lotti agricoli', () => {
    feeding = tick(feeding, terrainMap);
  });

  // Modificare invece di aggiungere: la lista dei catalizzatori resta lunga 51 a
  // ogni giro, altrimenti la misura peggiorerebbe da sola man mano che il bench
  // impila catalizzatori sulla stessa cella.
  let editing = addCatalyst(city, {
    x: 128,
    y: 128,
    class: BUILDING_CLASS.residential,
    strength: 200,
    radius: 20,
  });
  const editIndex = editing.catalysts.length - 1;
  let strength = 200;
  bench('modifica di un catalizzatore di raggio 20 (1681 celle)', () => {
    strength = strength === 200 ? 180 : 200;
    editing = setCatalystStrength(editing, editIndex, strength);
  });

  bench('nextBuildSites, primi 10 su tutto il campo', () => {
    nextBuildSites(city, terrainMap, 10);
  });

  let toggling = city;
  bench('setPolicyActive su un peso di desiderabilita (ricostruisce una classe)', () => {
    toggling = setPolicyActive(toggling, 'greenBelt', toggling.policies.length === 0);
  });

  // **Il prezzo di uno scaglione della 8.3.** Quando il carico costruito cambia,
  // il costo di attraversamento cambia sotto ogni portata gia' calcolata e non
  // c'e' percorso incrementale: si butta la cache geodetica e si rilegge tutto.
  // E' il motivo per cui `GrowthScene` lo chiama ogni sessantaquattro edifici e
  // non a ogni comparsa, e il termine di riferimento e' la riga qui sopra.
  bench('rebuildField (il costo di uno scaglione di congestione)', () => {
    rebuildField(city);
  });
});
