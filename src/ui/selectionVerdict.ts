import { ALL_CLASSES, BALANCE, catalystById, type CatalystId } from '../sim';
import { GROUND } from '../world/grading/grade';
import { breakdownOf, type Breakdown, type Contribution, type Verdict } from './meters';
import { classLabel, GROUND_LABELS } from './selectionLabels';
import { closestUse, siteAdvice, type SiteAdvice } from './siteAdvice';
import type { ColumnInfo, Selection, StructureInfo } from '../game/selection';

/**
 * La risposta corta, la barra che la giustifica e la mossa che la chiude.
 *
 * Prende il posto della carta «To grow», che era una `<dl>` come tutte le altre
 * e per questo si leggeva come le altre: tre righe di prosa in cima a venti
 * righe di prosa. Le stesse informazioni escono qui in tre forme diverse — un
 * verdetto con un tono, una barra composta, un elenco di consigli — perche' sono
 * tre domande diverse e mescolarle era il difetto.
 *
 * **La terza e' nuova.** `siteAdvice` risponde a «cosa piazzo qui attorno», che
 * la scheda non aveva mai risposto: diceva quanto mancava e da chi veniva cio'
 * che c'era, e li' si fermava.
 */
export interface GrowthPlan {
  readonly verdict: Verdict;
  /** `null` dove non c'e' una soglia da mostrare: chi non cresce non ne ha. */
  readonly breakdown: Breakdown | null;
  /** `null` dove nessun ruolo aiuterebbe, o dove non manca niente. */
  readonly advice: SiteAdvice | null;
}

const NOTHING: Omit<GrowthPlan, 'verdict'> = { breakdown: null, advice: null };

export function growthPlan(selection: Selection): GrowthPlan {
  const info = selection.structure;
  if (info === null) return groundPlan(selection.column);
  const landmark = info.record.landmark;
  if (landmark !== undefined) return landmarkPlan(info, landmark);
  if (info.record.span !== undefined) {
    return { verdict: still('Elevated link', 'A span carries the city across; it never grows.'), ...NOTHING };
  }
  if (info.record.aerial !== undefined) {
    return { verdict: still('Elevated part', 'A deck, a walk or a lift: it is built whole and stays as it is.'), ...NOTHING };
  }
  if (info.record.arcology !== undefined) {
    return { verdict: still('Arcology', 'A megastructure is already everything a quarter could become.'), ...NOTHING };
  }
  return buildingPlan(info, selection.column);
}

/**
 * Un edificio: quattro esiti, e solo uno di questi si puo' fare qualcosa.
 *
 * L'ordine dei rami e' quello con cui il driver decide davvero, e non e'
 * intercambiabile: chi regge qualcosa non promuove **anche se** ha
 * desiderabilita' e materiali da vendere, quindi la portanza va chiesta prima
 * della soglia o la scheda prometterebbe una crescita che non arrivera'.
 */
function buildingPlan(info: StructureInfo, column: ColumnInfo): GrowthPlan {
  const growth = info.growth;
  if (growth === undefined) {
    return { verdict: still('Does not grow', 'The simulation does not promote this structure.'), ...NOTHING };
  }
  if (info.carries) {
    return {
      verdict: {
        tone: 'bad',
        headline: 'Cannot grow',
        detail: 'It holds up elevated parts — while it does, it cannot grow.',
      },
      ...NOTHING,
    };
  }
  if (growth === null) {
    return {
      verdict: { tone: 'good', headline: 'Fully grown', detail: 'At the highest level this place allows.' },
      ...NOTHING,
    };
  }

  const met = growth.desirability >= growth.threshold;
  const breakdown = breakdownOf(
    'Desirability',
    growth.desirability,
    growth.threshold,
    // Con la soglia raggiunta le voci sparirebbero e la barra resterebbe sola:
    // la domanda «da dove viene» e' chiusa, e i pezzi tornerebbero rumore.
    met ? [] : sourceParts(growth),
  );

  if (!met) {
    return {
      verdict: {
        tone: 'watch',
        headline: 'Needs desirability',
        detail: `${growth.desirability} of the ${growth.threshold} that level `
          + `${growth.nextLevel} asks for ${classLabel(info.record.class)}${discount(growth)}.`,
      },
      breakdown,
      advice: siteAdvice({
        cls: info.record.class,
        missing: growth.threshold - growth.desirability,
        coastal: column.coastal,
        flat: column.ground === GROUND.flat,
        nearby: growth.sources.map((source) => source.label),
      }),
    };
  }

  if (growth.cost > growth.stock) {
    return {
      verdict: {
        tone: 'watch',
        headline: 'Waiting on materials',
        detail: `Level ${growth.nextLevel} costs ${growth.cost} materials, and the city holds ${growth.stock}.`,
      },
      breakdown,
      advice: null,
    };
  }

  return {
    verdict: {
      tone: 'good',
      headline: 'Ready to grow',
      detail: `Everything level ${growth.nextLevel} asks for is here.`,
    },
    breakdown,
    advice: null,
  };
}

/**
 * Un landmark avanza sugli edifici che ha attorno, non sulla desiderabilita'.
 *
 * Nessun consiglio, e non e' una dimenticanza: cio' che gli manca sono edifici,
 * e gli edifici non si piazzano. Suggerire un secondo catalizzatore accanto al
 * primo sarebbe il consiglio piu' costoso e meno efficace del gioco.
 */
function landmarkPlan(info: StructureInfo, landmark: CatalystId): GrowthPlan {
  const growth = info.landmark;
  const label = catalystById(landmark).label;
  if (growth === undefined || growth.nextAt === null) {
    return { verdict: still(`${label} · full stage`, 'It has reached everything its recipe allows.'), ...NOTHING };
  }
  return {
    verdict: {
      tone: 'watch',
      headline: `Stage ${growth.stage} of ${growth.maxStage}`,
      detail: `The next stage needs ${growth.nextAt} buildings within reach, `
        + `and buys ${BALANCE.gameplay.catalyst.stageBonus} more strength.`,
    },
    breakdown: breakdownOf('Buildings within reach', growth.nearby, growth.nextAt, []),
    advice: null,
  };
}

/**
 * Una colonna nuda: chi ci verrebbe, e cosa lo porterebbe.
 *
 * Il consiglio si calcola sull'uso che manca **di meno**, non su quello che il
 * giocatore preferirebbe: e' l'unico che un catalizzatore solo puo' portare
 * sopra soglia, e la regola vive in `closestUse` perche' e' la stessa che
 * serve ovunque si chieda «cosa ci starebbe».
 */
function groundPlan(column: ColumnInfo): GrowthPlan {
  if (!column.buildable) {
    return {
      verdict: { tone: 'bad', headline: 'Nothing can grow', detail: `${GROUND_LABELS[column.ground]} — the ground refuses every use.` },
      ...NOTHING,
    };
  }

  const thresholds = BALANCE.desirability.siteThreshold;
  const wanted = ALL_CLASSES.filter((cls) => (column.desirability[cls] ?? 0) > (thresholds[cls] ?? 0));
  if (wanted.length > 0) {
    return {
      verdict: {
        tone: 'good',
        headline: 'Ready to build',
        detail: `${wanted.map(classLabel).join(', ')} would take root here as the city reaches it.`,
      },
      ...NOTHING,
    };
  }

  const closest = closestUse(column.desirability, ALL_CLASSES);
  if (closest === null) return { verdict: still('Waiting its turn', 'A use already wants this column.'), ...NOTHING };

  return {
    verdict: {
      tone: 'watch',
      headline: 'No use wants this yet',
      detail: column.profile.roles.length === 0
        ? 'Nothing is within reach: desirability only comes from catalysts.'
        : `${classLabel(closest.cls)} is the closest, and still ${Math.round(closest.missing)} short.`,
    },
    breakdown: breakdownOf(
      'Desirability',
      column.desirability[closest.cls] ?? 0,
      thresholds[closest.cls] ?? 0,
      [],
    ),
    advice: siteAdvice({
      cls: closest.cls,
      missing: closest.missing,
      coastal: column.coastal,
      flat: column.ground === GROUND.flat,
      nearby: column.profile.roles.map((role) => catalystById(role).label),
    }),
  };
}

/**
 * Le voci della barra: chi versa, e i vicini che tolgono.
 *
 * La congestione entra con il segno che ha davvero — negativo — invece che come
 * riga a parte: sta nella stessa somma della soglia, e tenerla fuori dalla barra
 * era il motivo per cui i contributi non tornavano mai con il totale.
 */
function sourceParts(
  growth: NonNullable<NonNullable<StructureInfo['growth']>>,
): readonly Omit<Contribution, 'share' | 'negative'>[] {
  const parts: Omit<Contribution, 'share' | 'negative'>[] = growth.sources.map((source) => ({
    label: `${source.label} (${source.x}, ${source.y})`,
    icon: null,
    value: source.contribution,
  }));
  if (growth.congestion > 0) {
    const neighbours = Math.round(growth.congestion / BALANCE.desirability.congestionPerBuilding);
    parts.push({
      label: `${neighbours} building${neighbours === 1 ? '' : 's'} nearby`,
      icon: 'city',
      value: -growth.congestion,
    });
  }
  return parts;
}

/** « (base 120, local qualities -24)»: perche' la soglia cambia da luogo a luogo. */
function discount(growth: { readonly baseThreshold: number; readonly discount: number }): string {
  if (growth.discount === 0) return '';
  return ` (base ${growth.baseThreshold}, local qualities -${growth.discount})`;
}

function still(headline: string, detail: string): Verdict {
  return { tone: 'plain', headline, detail };
}
