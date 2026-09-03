import { BALANCE } from './balance';
import type { BuildingClass } from './classes';
import { coverageAt } from './coverage';
import type { SimState } from './SimState';

/**
 * Un edificio che il posto non regge piu'.
 *
 * Non porta un motivo perche' ce n'e' uno solo: la copertura sotto
 * `decay.distressCoverage`. Un campo `reason` con un valore unico sarebbe un
 * posto in cui guardare che non dice niente; quando i motivi saranno due, il
 * secondo se lo aggiunge chi lo introduce.
 *
 * Non e' un ordine di demolizione: e' l'**avviso**. Chi lo consuma decide se
 * agire, e per la maggior parte del tempo nessuno agisce — la lista esiste
 * perche' la vista di copertura e la voce dell'HUD possano mostrarla mentre non
 * e' ancora successo niente.
 */
export interface DecaySite {
  readonly x: number;
  readonly y: number;
  readonly class: BuildingClass;
  /** Quanto e' servita la colonna, in [0, 1]. Piu' bassa, prima se ne va. */
  readonly coverage: number;
  /** Desiderabilita' della colonna per l'uso dell'edificio, 0..255. */
  readonly desirability: number;
}

/** L'esito di una passata: cosa e' in difficolta', e da dove riprendere. */
export interface DecayScan {
  readonly sites: readonly DecaySite[];
  readonly cursor: number;
}

const EMPTY_SCAN: DecayScan = { sites: [], cursor: 0 };

/**
 * Gli edifici in difficolta' fra i prossimi `scan`, dal peggiore.
 *
 * **Cammina a cursore, e non scandisce il campo.** E' lo speculare della
 * promozione (`UpgradeDriver`), non della fondazione: `nextBuildSites` deve
 * guardare tutto il campo allocato perche' cerca celle *vuote*, e paga sedici
 * millisecondi per farlo; qui gli edifici sono gia' un elenco, e leggerne un
 * pezzo per passata costa `scan` letture O(1) qualunque sia la citta'.
 *
 * L'ordine e' quello della finestra esaminata, non un ordine globale — anche
 * questo come la promozione, che nemmeno lei classifica l'intera citta' a ogni
 * giro. Su piu' passate il cursore copre tutti, e chi sta peggio ricompare
 * finche' resta scoperto.
 *
 * **Ordine totale** a parita' di copertura: `x`, poi `y`, poi l'uso. Senza,
 * l'esito dipenderebbe dall'ordine in cui la citta' e' stata costruita, ed e'
 * proprio la cosa che due partite dallo stesso seed devono avere identica.
 *
 * **Non sa cosa sia un landmark, ne' un'arcologia** (contratto 7): risponde su
 * tutto quello che ha in lista, e a filtrare cio' che non si abbandona e' chi
 * ha il registro del mondo in mano.
 */
export function nextDecaySites(state: SimState, scan: number, cursor: number): DecayScan {
  const buildings = state.buildings;
  if (buildings.length === 0 || scan <= 0) return EMPTY_SCAN;

  const threshold = BALANCE.decay.distressCoverage;
  const steps = Math.min(scan, buildings.length);
  const sites: DecaySite[] = [];

  let at = cursor;
  for (let i = 0; i < steps; i++) {
    const building = buildings[at % buildings.length];
    at++;
    const coverage = coverageAt(state.field, state.coverageReport, building.x, building.y);
    if (coverage >= threshold) continue;
    sites.push({
      x: building.x,
      y: building.y,
      class: building.class,
      coverage,
      desirability: state.field.valueAt(building.x, building.y, building.class),
    });
  }

  sites.sort(compareSites);
  return { sites, cursor: at % buildings.length };
}

/**
 * Il fronte del declino, avanzato di un tick.
 *
 * Sale sotto `strainCoverage`, scende sopra `recoveryCoverage`, e **fra le due
 * non si muove**. La banda morta e' il fronte: con una soglia sola, una citta'
 * che oscilla intorno al pareggio — e ogni citta' che cresce ci oscilla, perche'
 * la domanda sale con la popolazione e la popolazione sale da sola — accenderebbe
 * e spegnerebbe l'allarme a ogni edificio nuovo.
 *
 * Il rientro e' tre volte piu' rapido della salita: chi ha posato il servizio
 * giusto deve vederlo subito, o il gesto che risolve non si distingue da quello
 * che non serve a niente.
 */
export function nextDecayPressure(pressure: number, coverage: number): number {
  if (coverage < BALANCE.decay.strainCoverage) {
    return clamp01(pressure + BALANCE.decay.pressureRise);
  }
  if (coverage >= BALANCE.decay.recoveryCoverage) {
    return clamp01(pressure - BALANCE.decay.pressureRelief);
  }
  return clamp01(pressure);
}

/**
 * Se il fronte e' armato, cioe' se la citta' ha smesso di poter crescere e
 * comincia a perdere quello che ha.
 *
 * E' una domanda e non un campo dello stato: due numeri che si ricavano l'uno
 * dall'altro divergono al primo refactor.
 */
export function isDecayArmed(state: SimState): boolean {
  return state.decayPressure >= 1;
}

function compareSites(a: DecaySite, b: DecaySite): number {
  if (a.coverage !== b.coverage) return a.coverage - b.coverage;
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  return a.class - b.class;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
