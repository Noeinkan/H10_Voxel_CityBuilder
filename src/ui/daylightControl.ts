import { DAYLIGHT, DAYLIGHT_MODE, nextDaylightMode, type DaylightMode } from '../engine/daylight';

/**
 * Come si chiama il cielo, in un posto solo.
 *
 * Le stesse tre parole compaiono nella barra risorse, nel menu di pausa e nella
 * schermata del titolo: tre elenchi paralleli divergerebbero al primo cambio.
 *
 * **Sta in un file suo e non piu' dentro `GameHudControlsModel.ts`** perche' il
 * titolo lo importa prima che il mondo esista: quel modulo tira dentro `src/sim`
 * per i nomi delle classi di edificio, e il cielo non ha niente a che vedere con
 * la simulazione. Chi lo importava di li' continua a trovarlo: il modulo di
 * prima lo riespone.
 */

export interface HudDaylight {
  readonly mode: DaylightMode;
  readonly label: string;
  readonly tooltip: string;
  readonly next: DaylightMode;
  readonly frozen: boolean;
}

const DAYLIGHT_LABEL: Readonly<Record<DaylightMode, string>> = {
  [DAYLIGHT_MODE.cycle]: 'Auto',
  [DAYLIGHT_MODE.day]: 'Day',
  [DAYLIGHT_MODE.night]: 'Night',
};

const DAYLIGHT_NOTE: Readonly<Record<DaylightMode, string>> = {
  [DAYLIGHT_MODE.cycle]: `the clock runs, a full day takes ${Math.round(DAYLIGHT.daySeconds / 60)} minutes`,
  [DAYLIGHT_MODE.day]: 'the sun stays up',
  [DAYLIGHT_MODE.night]: 'the city stays lit',
};

/**
 * **Il tooltip descrive il proprio modo, non il prossimo clic.**
 *
 * Diceva «Click for Night» perche' le tre parole vivevano su un bottone solo
 * che ciclava, e l'unico modo di sapere cosa c'era dopo era leggerlo li'. Ora
 * ogni modo ha il suo bottone in ogni superficie: un'etichetta che annuncia il
 * prossimo mentirebbe su cosa fa quello che si sta per premere. Il giro resta
 * al tasto `L`, ed e' `next` a servirlo.
 */
export function daylightControl(mode: DaylightMode): HudDaylight {
  return {
    mode,
    label: DAYLIGHT_LABEL[mode],
    tooltip: `Daylight: ${DAYLIGHT_LABEL[mode]} — ${DAYLIGHT_NOTE[mode]}. Press L to cycle.`,
    next: nextDaylightMode(mode),
    frozen: mode !== DAYLIGHT_MODE.cycle,
  };
}
