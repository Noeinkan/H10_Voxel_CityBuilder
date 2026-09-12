// Dal modulo e non dal barile di `src/sim`, per la stessa ragione di
// `daylightControl`: la schermata del titolo disegna questi bottoni prima che
// una simulazione esista, e `seasons.ts` non dipende che da `balance.ts`.
import { nextSeason, SEASON, SEASON_NAMES, type Season } from '../sim/seasons';

/**
 * Come si chiama la stagione, in un posto solo.
 *
 * Le stesse quattro parole compaiono nella barra risorse, nel menu di pausa e
 * nella schermata del titolo: e' il gemello di `daylightControl`, ed esiste per
 * la stessa ragione — quattro elenchi paralleli divergerebbero al primo cambio.
 *
 * **Il testo dice cosa fa il raccolto, non che colore avra' il prato.** Il prato
 * si vede da se' un secondo dopo aver premuto; quanto rendono i campi no, ed e'
 * l'unica meta' della stagione che il giocatore non puo' leggere guardando la
 * citta'. Sono i quattro estremi di `harvestFactorAt` raccontati a parole, non
 * quattro frasi d'atmosfera.
 */

export interface HudSeason {
  readonly season: Season;
  readonly label: string;
  /** Il testo in partita: premere sposta l'anno. */
  readonly tooltip: string;
  /**
   * Il testo sul titolo, dove non c'e' ancora un anno da spostare.
   *
   * Due frasi e non una perche' il gesto e' diverso — li' si sceglie **dove
   * nascere**, qui si sposta un calendario che sta gia' camminando — ma la
   * mezza frase sul raccolto e' la stessa, e sta scritta una volta sola.
   */
  readonly birthTooltip: string;
  /** La stagione dopo questa: la serve il tasto, non un bottone. */
  readonly next: Season;
}

const SEASON_NOTE: Readonly<Record<Season, string>> = {
  [SEASON.spring]: 'the fields start giving again',
  [SEASON.summer]: 'the harvest is at its best',
  [SEASON.autumn]: 'the yield falls away',
  [SEASON.winter]: 'the leanest months, live on the stores',
};

/**
 * **Il calendario va avanti, non si ferma.** Scegliere una stagione porta l'anno
 * al suo primo giorno e lo lascia camminare da li': non e' un fermo immagine, ed
 * e' la differenza con i due modi fissi del cielo, che invece l'orologio lo
 * fermano davvero.
 */
export function seasonControl(season: Season): HudSeason {
  const label = SEASON_NAMES[season] ?? '';
  return {
    season,
    label,
    tooltip: `Season: ${label} — ${SEASON_NOTE[season]}. Moves the year on to its first day; press K to step.`,
    birthTooltip: `The island is born in ${label.toLowerCase()}: ${SEASON_NOTE[season]}.`,
    next: nextSeason(season),
  };
}
