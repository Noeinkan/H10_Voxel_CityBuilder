import { BALANCE } from './balance';
import type { BuildingClass } from './classes';
import { coverageAt, type CoverageReport } from './coverage';
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
 * **Tre andature e non due**, perche' un accumulatore che smette di perdere non
 * e' un fronte, e' un fermo. Sale sotto `strainCoverage`, rientra in fretta sopra
 * `recoveryCoverage`, e nella banda in mezzo rientra piano: la banda **rallenta**
 * il rientro, non lo vieta.
 *
 * Prima lo vietava, ed e' il difetto che si vedeva giocando: una citta' risalita
 * al 105% restava armata per sempre, perche' il 110% era l'unica uscita, niente
 * glielo diceva, e nel frattempo `buildPass` non fondava piu' niente. La banda
 * morta doveva impedire a una citta' che oscilla intorno al pareggio di accendere
 * e spegnere l'allarme a ogni edificio nuovo; a impedirlo bastava — e basta — la
 * lentezza dell'accumulo, tre minuti da un capo all'altro.
 *
 * **L'isteresi vera sta altrove**, ed e' `pressureCeiling`: la pressione continua
 * a salire oltre il punto in cui il fronte si arma, e quell'eccesso e' il debito
 * da restituire prima che l'allarme si spenga. E' la stessa forma di un trigger
 * di Schmitt — due livelli sull'**uscita**, non una zona morta sull'ingresso — e
 * a differenza della banda congelata non ha uno stato da cui non si esce.
 *
 * Il rientro pieno e' tre volte piu' rapido di quello della banda: chi ha posato
 * il servizio giusto deve vederlo subito, o il gesto che risolve non si distingue
 * da quello che si limita a tenere la linea.
 */
export function nextDecayPressure(pressure: number, coverage: number): number {
  if (coverage < BALANCE.decay.strainCoverage) {
    return clamp(pressure + BALANCE.decay.pressureRise);
  }
  if (coverage >= BALANCE.decay.recoveryCoverage) {
    return clamp(pressure - BALANCE.decay.pressureRelief);
  }
  return clamp(pressure - BALANCE.decay.pressureEase);
}

/**
 * Se il fronte e' armato, cioe' se la citta' ha smesso di poter crescere e
 * comincia a perdere quello che ha.
 *
 * E' una domanda e non un campo dello stato: due numeri che si ricavano l'uno
 * dall'altro divergono al primo refactor. Uno e' la soglia di armamento, non il
 * tetto della pressione — sopra ci sta `pressureCeiling`, ed e' li' che vive
 * l'isteresi che tiene l'allarme fermo mentre la copertura balla.
 */
export function isDecayArmed(state: SimState): boolean {
  return state.decayPressure >= 1;
}

/**
 * Se il fronte, armato, puo' davvero portare via qualcosa.
 *
 * **Quasi sempre non puo', ed e' aritmetica e non taratura.** La quota cittadina
 * e' il pavimento di ogni colonna — `coverageAt` non scende mai sotto
 * `report.base` — quindi finche' il pavimento sta sopra `distressCoverage`
 * nessun edificio e' in difficolta', dovunque si trovi. Sotto quel punto il
 * fronte armato ferma la crescita e basta, che e' una conseguenza vera ma non
 * quella che l'avviso raccontava.
 *
 * Serve a chi parla al giocatore, ed e' l'unica ragione per cui esiste: dire
 * «gli isolati si stanno svuotando» a una citta' in cui non se ne sta svuotando
 * nessuno costa piu' di un numero sbagliato, perche' a quella frase si crede.
 */
export function isDistressPossible(report: CoverageReport): boolean {
  return report.base < BALANCE.decay.distressCoverage;
}

function compareSites(a: DecaySite, b: DecaySite): number {
  if (a.coverage !== b.coverage) return a.coverage - b.coverage;
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  return a.class - b.class;
}

/** In [0, `pressureCeiling`]: il tetto sta sopra l'armamento, non su di esso. */
function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  const ceiling = BALANCE.decay.pressureCeiling;
  return value > ceiling ? ceiling : value;
}
