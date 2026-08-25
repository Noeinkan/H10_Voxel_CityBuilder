import { rectAround, type Catalyst, type CellRect } from '../../sim';

/**
 * Di chi e' il turno di crescere.
 *
 * **Il difetto che questo file chiude.** `nextBuildSites` ordina i candidati per
 * desiderabilita' assoluta e ne restituisce i primi venti, su tutta la mappa. Il
 * punteggio pero' non dice «quanto questo posto vuole crescere» ma «quanto vale
 * in assoluto», e le due cose divergono appena la citta' ha piu' di un polo: un
 * mercato appena piazzato vale al massimo la propria intensita' — duecentodieci —
 * mentre nel nucleo maturo due o tre campi sovrapposti tengono migliaia di celle
 * libere sopra duecentoquaranta. I venti posti finivano tutti li'.
 *
 * Misurato su una citta' di seicento edifici: un mercato piazzato **accanto**
 * all'edificato portava centosettantanove case in centoventi secondi di gioco,
 * lo stesso mercato piazzato lontano ne portava **zero**. Non lentezza: zero, per
 * sempre. E' la stessa ragione per cui su un'isola staccata non cresceva niente
 * nemmeno con il suo bel monumento sopra — un'isola e' per definizione un polo
 * che non tocca il nucleo.
 *
 * **La rotazione, e non un peso.** Riscalare i punteggi per far competere i poli
 * fra loro sarebbe una taratura da rifare a ogni catalizzatore aggiunto al
 * catalogo; dare un turno a testa non ha numeri da tarare e dice esattamente la
 * regola di gioco che il giocatore si aspetta — **ogni polo che hai piantato
 * cresce**. E' anche il modo in cui `UpgradeDriver` scorre i suoi record: un
 * cursore che riparte da dove si era fermato, non una scansione da capo.
 *
 * **Puro e senza stato.** Il cursore lo tiene chi fa le infornate, come per la
 * passata di upgrade: qui c'e' solo la traduzione da «giro numero n» a «questo
 * riquadro», che e' cio' che un test puo' verificare senza far crescere una
 * citta'.
 */

/**
 * Il riquadro del polo di turno, o null se non c'e' nessun catalizzatore.
 *
 * Il riquadro e' quello dell'influenza — centro e raggio del catalizzatore — e
 * non l'isolato attorno: e' esattamente il pezzo di mappa che quel polo ha
 * acceso, quindi l'unico dentro cui i suoi candidati esistono.
 *
 * `turn` cresce senza limite e si avvolge qui dentro: e' un contatore di
 * infornate, e chi lo tiene non deve sapere quanti poli ci siano oggi.
 */
export function poleRectAt(catalysts: readonly Catalyst[], turn: number): CellRect | null {
  if (catalysts.length === 0) return null;

  // `%` su un intero che cresce sempre: niente resto negativo da maneggiare, e
  // un polo aggiunto o tolto sposta il giro invece di romperlo.
  const catalyst = catalysts[turn % catalysts.length];
  return rectAround(catalyst.x, catalyst.y, catalyst.radius);
}
