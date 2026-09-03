import { ALL_CLASSES, BALANCE, BUILDING_CLASS, CLASS_NAMES, type BuildingClass } from '../sim';
import {
  amount,
  CLASS_ICONS,
  meter,
  percent,
  toneForFill,
  toneForLoad,
  type Contribution,
  type Meter,
} from './meters';
import { classLabel } from './selectionLabels';
import type { BlockInfo, ColumnInfo, UseInfo } from '../game/selection';

/**
 * Cosa vuole questo posto, come barre invece che come frasi.
 *
 * Le stesse quantita' che la scheda gia' conosceva — occupazione delle case,
 * organico, negozi in uso, resa di cibo e materiali — dette nella forma in cui
 * si leggono senza finire la riga. Il testo non sparisce: diventa il `hint`,
 * cioe' il `title` del nodo, dove serve la prima volta e poi mai piu'.
 *
 * **Nessuna di queste cifre e' di questo esemplare**, ed e' il fatto che il file
 * esiste per non far dimenticare: la simulazione conta edifici per uso e
 * organico per citta', non per palazzo. Ogni `hint` che cita una quota dice
 * «citywide» per esteso, come faceva la riga che ha sostituito.
 */

/**
 * Le misure di un edificio: una per uso, piu' l'organico se qualcuno lo chiede.
 *
 * L'ordine e' quello degli usi, e l'organico chiude: e' l'ingresso condiviso, e
 * metterlo in mezzo lo farebbe leggere come proprieta' dell'uso che lo precede.
 */
export function useMeters(uses: readonly UseInfo[]): readonly Meter[] {
  const meters = uses.map((use) => USE_METER[use.cls](use));
  const staffed = uses.find((use) => NEEDS_STAFF.has(use.cls));
  if (staffed !== undefined) meters.push(staffMeter(staffed.staffing));
  return meters;
}

/** Gli usi che pescano dall'organico cittadino, condiviso con la campagna. */
const NEEDS_STAFF: ReadonlySet<BuildingClass> = new Set([
  BUILDING_CLASS.commercial,
  BUILDING_CLASS.industrial,
]);

const USE_METER: Readonly<Record<BuildingClass, (use: UseInfo) => Meter>> = {
  [BUILDING_CLASS.residential]: (use) => {
    const hint = `Room for ${amount(use.perBuilding)} residents · ${oneOf(use)}`;
    if (use.cityUse === null) {
      return meter({
        id: 'homes',
        icon: CLASS_ICONS[BUILDING_CLASS.residential],
        label: 'Homes',
        value: 'nobody yet',
        ratio: 0,
        tone: 'bad',
        hint: `${hint}. No resident has moved in.`,
      });
    }
    return meter({
      id: 'homes',
      icon: CLASS_ICONS[BUILDING_CLASS.residential],
      label: 'Homes',
      value: `${percent(use.cityUse)} occupied`,
      ratio: use.cityUse,
      // Oltre il pieno non e' un successo: sono residenti che non hanno una
      // casa, ed e' la penalita' di sovraffollamento della soddisfazione.
      tone: toneForLoad(use.cityUse),
      hint: `${hint}. ${occupancyHint(use.cityUse)}`,
    });
  },
  [BUILDING_CLASS.commercial]: (use) => {
    const hint = `Serves ${amount(use.perBuilding)} customers a tick · ${oneOf(use)}`;
    if (use.cityUse === null) {
      return meter({
        id: 'shops',
        icon: CLASS_ICONS[BUILDING_CLASS.commercial],
        label: 'Shops',
        value: 'no custom yet',
        ratio: 0,
        tone: 'bad',
        hint: `${hint}. No customer has come by.`,
      });
    }
    return meter({
      id: 'shops',
      icon: CLASS_ICONS[BUILDING_CLASS.commercial],
      label: 'Shops',
      value: `${percent(use.cityUse)} busy`,
      ratio: use.cityUse,
      // Un negozio vuoto e' capitale fermo, non una riserva: sotto la soglia il
      // tono e' lo stesso di una fabbrica senza braccia, perche' costa uguale.
      tone: toneForFill(use.cityUse, 0.7),
      hint: `${hint}. ${idleHint(use.cityUse)}`,
    });
  },
  [BUILDING_CLASS.industrial]: (use) => meter({
    id: 'workshops',
    icon: CLASS_ICONS[BUILDING_CLASS.industrial],
    label: 'Workshops',
    value: `${amount(use.perBuilding)} materials a tick`,
    ratio: use.staffing,
    tone: toneForFill(use.staffing, 0.99),
    hint: `${oneOf(use)}. The yield follows the city workforce, shared with shops and farms.`,
  }),
  [BUILDING_CLASS.civic]: (use) => meter({
    id: 'upkeep',
    icon: CLASS_ICONS[BUILDING_CLASS.civic],
    label: 'Upkeep',
    value: `${amount(use.perBuilding)} funds a tick`,
    tone: 'plain',
    hint: `${oneOf(use)}. Paid from the treasury each tick; unpaid services cost happiness.`,
  }),
};

function staffMeter(staffing: number): Meter {
  return meter({
    id: 'workers',
    icon: 'population',
    label: 'Workers',
    value: `${percent(staffing)} staffed`,
    ratio: staffing,
    tone: toneForFill(staffing, 0.99),
    hint: staffing >= 0.995
      ? 'The city workforce covers every shop, workshop and farm.'
      : 'Industry, shops and farms are sharing too few workers citywide.',
  });
}

/**
 * Il bilancio di un isolato come barre.
 *
 * Cibo e materiali hanno un tetto — la resa piena a organico completo — e sono
 * quindi le uniche due che una barra descrive davvero. Capienze e oneri restano
 * numeri senza barra: sono valori assoluti, e una barra li farebbe sembrare
 * confrontabili con qualcosa che non esiste.
 */
export function blockMeters(block: BlockInfo): readonly Meter[] {
  const { productivity } = block;
  const meters: Meter[] = [];

  if (productivity.housingCapacity > 0) {
    meters.push(meter({
      id: 'housing-capacity',
      icon: CLASS_ICONS[BUILDING_CLASS.residential],
      label: 'Housing',
      value: `${amount(productivity.housingCapacity)} residents`,
      tone: 'plain',
      hint: 'Room this block offers, if the city has the people to fill it.',
    }));
  }
  if (productivity.commerceCapacity > 0) {
    meters.push(meter({
      id: 'commerce-capacity',
      icon: CLASS_ICONS[BUILDING_CLASS.commercial],
      label: 'Commerce',
      value: `${amount(productivity.commerceCapacity)} customers a tick`,
      tone: 'plain',
      hint: 'Custom this block can serve at full staff.',
    }));
  }
  if (productivity.materialsCapacityPerTick > 0) {
    meters.push(flowMeter(
      'materials',
      'Materials',
      productivity.materialsPerTick,
      productivity.materialsCapacityPerTick,
      'Materials pay for every upgrade a building here wants.',
    ));
  }
  if (productivity.foodCapacityPerTick > 0) {
    meters.push(flowMeter(
      'food',
      'Food',
      productivity.foodPerTick,
      productivity.foodCapacityPerTick,
      'Food feeds the whole city, not only this block.',
    ));
  }
  if (productivity.civicUpkeepPerTick > 0) {
    meters.push(meter({
      id: 'civic-upkeep',
      icon: CLASS_ICONS[BUILDING_CLASS.civic],
      label: 'Upkeep',
      value: `${amount(productivity.civicUpkeepPerTick)} funds a tick`,
      tone: 'plain',
      hint: 'What the civic buildings here take from the treasury each tick.',
    }));
  }
  if (meters.length > 0 && productive(block)) meters.push(staffMeter(productivity.staffing));
  return meters;
}

/**
 * Di cosa e' fatto un isolato, come una barra sola divisa in usi.
 *
 * Prima era «23 housing», e con quattro usi diventava un elenco da rileggere per
 * capire quale prevalesse. Le quote si prendono sul **totale** e non sul massimo
 * — al contrario di `breakdownOf` — perche' qui i segmenti stanno affiancati
 * dentro una barra sola: e' una composizione, non un confronto.
 */
export function blockMix(block: BlockInfo): readonly Contribution[] {
  const total = block.byClass.reduce((sum, count) => sum + count, 0);
  if (total === 0) return [];
  return ALL_CLASSES
    .filter((cls) => block.byClass[cls] > 0)
    .map((cls) => ({
      label: classLabel(cls),
      icon: CLASS_ICONS[cls],
      key: CLASS_NAMES[cls],
      value: block.byClass[cls],
      share: block.byClass[cls] / total,
      negative: false,
    }));
}

/**
 * Cosa vuole crescere su questa colonna, uso per uso.
 *
 * Sostituisce la riga `Demand: Housing 180 · Commerce 90 · …`, che era la riga
 * piu' densa della scheda e l'unica che pretendeva di conoscere a memoria
 * quattro soglie diverse per essere letta. Con la barra la soglia e' il pieno, e
 * la domanda «chi ci verrebbe» si risolve guardando quali barre sono complete.
 */
export function demandMeters(column: ColumnInfo): readonly Meter[] {
  const thresholds = BALANCE.desirability.siteThreshold;
  return ALL_CLASSES.map((cls) => {
    const score = column.desirability[cls] ?? 0;
    const threshold = thresholds[cls] ?? 0;
    const passes = score > threshold;
    return meter({
      id: `demand-${cls}`,
      icon: CLASS_ICONS[cls],
      label: classLabel(cls),
      value: `${score} / ${threshold}`,
      ratio: threshold <= 0 ? 1 : score / threshold,
      tone: passes ? 'good' : 'watch',
      hint: passes
        ? `${classLabel(cls)} passes the ${threshold} it needs to take root here.`
        : `${classLabel(cls)} needs ${threshold - score} more desirability to take root here.`,
    });
  });
}

function flowMeter(id: string, label: string, current: number, capacity: number, hint: string): Meter {
  const ratio = capacity <= 0 ? 1 : current / capacity;
  return meter({
    id,
    icon: id === 'food' ? 'food' : 'materials',
    label,
    value: current === capacity
      ? `${amount(current)} a tick`
      : `${amount(current)} of ${amount(capacity)} a tick`,
    ratio,
    tone: toneForFill(ratio, 0.99),
    hint: current === capacity
      ? `${hint} At full yield.`
      : `${hint} Short of full yield: the city workforce is spread thin.`,
  });
}

/** L'isolato ha qualcosa che le braccia mandano avanti. */
function productive(block: BlockInfo): boolean {
  const { productivity } = block;
  return productivity.commerceCapacity > 0
    || productivity.materialsCapacityPerTick > 0
    || productivity.foodCapacityPerTick > 0;
}

/** «one of 1218 in the city» oppure «the only one in the city». */
function oneOf(use: UseInfo): string {
  return use.count === 1 ? 'the only one in the city' : `one of ${use.count} in the city`;
}

function occupancyHint(cityUse: number): string {
  const occupied = Math.round(cityUse * 100);
  if (occupied > 100) return `${occupied - 100}% more residents than the city has homes for.`;
  if (occupied >= 100) return 'Every home in the city is occupied.';
  return `${100 - occupied}% of homes in the city stand empty.`;
}

function idleHint(cityUse: number): string {
  const busy = Math.round(cityUse * 100);
  return busy >= 100
    ? 'Every shop in the city is busy.'
    : `${100 - busy}% of shops in the city stand idle.`;
}
