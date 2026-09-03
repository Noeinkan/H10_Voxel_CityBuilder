import { BALANCE } from './balance';
import { catalystInfluence, catalystRoleOf, type CatalystId } from './catalysts';
import { BUILDING_CLASS, type BuildingClass } from './classes';
import type { DesirabilityField } from './DesirabilityField';

/**
 * Quanto una colonna e' **servita**, in due meta' che si sommano.
 *
 * E' la risposta alla domanda che il gioco non sapeva porre: i diciannove ruoli
 * erano tutti facoltativi — aggiungevano desiderabilita', e non averli
 * significava soltanto crescere piu' piano. Nessuno era **necessario**, quindi
 * la toolbar era un menu di acceleratori.
 *
 * **Le due meta' sono di natura diversa, ed e' deliberato.**
 *
 * - Una quota **cittadina**, che gli edifici civici cresciuti da soli danno
 *   ovunque allo stesso modo. E' il pavimento: impedisce che una colonna cada a
 *   zero solo perche' e' lontana, ed e' la ragione per cui qui non puo' esistere
 *   la spirale in cui un quartiere che peggiora peggiora anche i vicini.
 * - Una quota **locale**, che viene solo dai catalizzatori che il giocatore
 *   posa, letta dal piano civico del campo — quindi con decadimento sulla
 *   distanza **geodetica**, cioe' lungo le strade e non in linea d'aria.
 *
 * La prima non basta mai da sola (`coverage.cityShare` e' minore di uno): e' la
 * meta' che tiene in piedi la citta' mentre il giocatore non guarda, non quella
 * che la salva. La seconda e' la leva, ed e' l'unica che chiude il divario.
 *
 * **Non alloca un quinto piano al campo** (contratto 10): la quota locale e'
 * `values[civic]`, che esiste gia', e la quota cittadina e' un numero solo per
 * tutta la mappa. La copertura di una colonna costa una `valueAt` e due
 * moltiplicazioni.
 */
export interface CoverageReport {
  /** Servizi che la popolazione pretende: `population * demandPerResident`. */
  readonly demand: number;
  /**
   * Cio' che la citta' offre, dalle due sorgenti messe insieme.
   *
   * `servicesOf(catalysts) * perCatalyst + civic * funded`. La prima meta' e' il
   * gesto del giocatore, la seconda l'edificato che gli e' cresciuto attorno, e
   * la quota pagata conta solo sulla seconda: un municipio che il bilancio non
   * copre non serve nessuno, mentre un parco non ha una bolletta propria.
   *
   * **Perche' i catalizzatori pesano cosi' tanto, e non sono un dettaglio di
   * taratura.** Un catalizzatore civico e' *il* servizio — nel gioco che questo
   * modello imita e' l'edificio che il giocatore posa a coprire la citta' —
   * mentre gli edifici civici che crescono da soli sono il contorno. E'
   * misurato: sotto un catalizzatore residenziale forte gli edifici civici non
   * nascono affatto, perche' `nextBuildSites` da' la cella all'uso che ci prende
   * il punteggio piu' alto e il residenziale satura per primo. Una copertura che
   * dipendesse solo da loro sarebbe zero in ogni partita.
   */
  readonly supply: number;
  /** `supply / demand`, senza tetto: sopra uno la citta' ha margine. */
  readonly ratio: number;
  /**
   * La quota cittadina di copertura, in [0, `coverage.cityShare`].
   *
   * E' l'unico numero del referto che serve per colonna, ed e' per questo che
   * `coverageAt` prende il referto intero invece di ricalcolarlo: una heatmap
   * campiona migliaia di celle, e il rapporto e' lo stesso per tutte.
   */
  readonly base: number;
}

/** Il referto di una citta' che non e' ancora partita: nessuna domanda, nessun servizio. */
export const EMPTY_COVERAGE: CoverageReport = {
  demand: 0,
  supply: 0,
  ratio: 1,
  base: BALANCE.coverage.cityShare,
};

/** Gli ingressi del referto, tutti gia' calcolati dal bilancio del tick. */
export interface CoverageInputs {
  readonly population: number;
  /** Edifici civici efficaci, uso misto compreso. */
  readonly civic: number;
  /** Quota della manutenzione civica che i fondi hanno coperto, in [0, 1]. */
  readonly funded: number;
  /** Servizi posati, gia' pesati per influenza civica: `servicesOf(catalysts)`. */
  readonly services: number;
}

/**
 * Quanto servizio portano i catalizzatori posati.
 *
 * **Pesati per la loro influenza civica**, che e' la tabella che il campo usa
 * gia': un parco o una scuola valgono uno, un mercato o una serra un settimo —
 * un poco di vita civica la portano davvero — un porto e una centrale zero. Non
 * serve una seconda tabella di «quali ruoli sono servizi», e soprattutto non ne
 * serve una che possa divergere da quella con cui il campo dipinge.
 */
export function servicesOf(
  catalysts: readonly { readonly kind?: CatalystId; readonly class: BuildingClass }[],
): number {
  let sum = 0;
  for (const catalyst of catalysts) {
    sum += catalystInfluence(catalystRoleOf(catalyst))[BUILDING_CLASS.civic];
  }
  return sum;
}

/**
 * La quota cittadina, con la stessa aritmetica del bilancio.
 *
 * Gemello di `satisfactionReportOf`: il tick lo consuma, lo stato lo conserva, e
 * nessun altro punto del codice rifa' il conto. Una citta' senza abitanti e'
 * servita per definizione — non c'e' nessuno a cui manchi qualcosa — e non un
 * caso limite da tappare con uno zero.
 */
export function coverageReportOf(inputs: CoverageInputs): CoverageReport {
  const demand = inputs.population * BALANCE.coverage.demandPerResident;
  const supply = inputs.services * BALANCE.coverage.perService + inputs.civic * inputs.funded;
  const ratio = demand > 0 ? supply / demand : 1;
  return { demand, supply, ratio, base: clamp01(ratio) * BALANCE.coverage.cityShare };
}

/**
 * Quanto e' servita la colonna, in [0, 1].
 *
 * La quota locale colma il divario che resta, invece di sommarsi: con il
 * pavimento gia' a meta', un catalizzatore a piena influenza porta a uno e non a
 * uno e mezzo. E' anche il motivo per cui un servizio in piu' rende **di piu'**
 * dove la citta' e' scoperta che dove e' gia' servita.
 *
 * Prende il referto e non lo stato: il campionatore della heatmap lo legge una
 * volta e poi chiama questa per migliaia di celle.
 */
export function coverageAt(
  field: DesirabilityField,
  report: CoverageReport,
  x: number,
  y: number,
): number {
  const local = clamp01(
    field.valueAt(x, y, BUILDING_CLASS.civic) / BALANCE.coverage.localFull,
  );
  return report.base + (1 - report.base) * local;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
