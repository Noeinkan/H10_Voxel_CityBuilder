/**
 * Quanto stretto deve stare il rail sinistro perche' ci stia davvero.
 *
 * Il rail e' una colonna alta quanto lo schermo, e il suo vincolo e' la quota.
 * Fin qui a deciderlo erano tre `@media (max-height: ...)` con soglie scritte a
 * mano — 1200, 700, 600 — e la ragione per cui non funzionavano non e' che
 * fossero *quasi* giuste: e' che una soglia in pixel presume di sapere quanto
 * chieda il contenuto, e il contenuto cambia. Cambia con le tessere sbloccate,
 * con la targa della vista che si accende, con lo zoom di pagina, con i font di
 * sistema — e soprattutto con il **pavimento** di `--hud-unit`, che sotto i
 * 918px di viewport smette di far rimpicciolire il rail mentre la prima soglia
 * utile aspettava i 700. Nell'intervallo fra le due la riga delle porte finiva
 * sotto il bordo dello schermo, ed e' l'intervallo dove stanno i portatili.
 *
 * Qui la soglia non c'e'. C'e' una misura — quanto chiede il contenuto contro
 * quanto il rail ha — e un gradino che scende finche' non entra. I gradini sono
 * gli stessi di prima e stanno in `hud.css`; questo file decide solo **quale**.
 *
 * Il ciclo converge perche' nessuno dei due movimenti puo' ripetersi:
 *
 * - si stringe solo quando il contenuto sborda, e si annota la quota in cui il
 *   gradino piu' largo non e' entrato (`relaxFloor`). Si riprova ad allargare
 *   solo sopra quella quota, quindi un gradino gia' bocciato non torna;
 * - la stretta finale e' **calcolata**, non cercata: si ricava dalla misura
 *   quanto chiederebbe il contenuto se la stretta non ci fosse, cosi' applicarla
 *   non cambia il risultato del giro dopo.
 */

/** Il gradino piu' largo: tre colonne e la targa per intero. */
export const RAIL_DENSITY_MIN = 0;

/** Il gradino normale, quello scritto sul `:root` nudo di `hud.css`. */
export const RAIL_DENSITY_DEFAULT = 1;

/** Il gradino piu' stretto: oltre non e' rimasto niente da togliere. */
export const RAIL_DENSITY_MAX = 4;

/**
 * Sotto questo fattore la tessera smette di essere un bersaglio.
 *
 * La stretta e' l'ultima risorsa e non deve poter arrivare a zero: meglio un
 * rail che sborda di pochi pixel su una finestra assurda che una fila di
 * tessere alte quanto una riga di testo.
 */
export const RAIL_SQUEEZE_MIN = 0.62;

/** Cosa il rail chiede e cosa il rail ha, nello stesso istante. */
export interface RailFit {
  /** Quota occupata dal contenuto: dal bordo alto del rail all'ultimo figlio. */
  readonly need: number;
  /** Quota disponibile fra i due margini del rail. */
  readonly avail: number;
  /**
   * Quota complessiva delle righe di tessere.
   *
   * E' la sola parte del rail che si possa stringere di un fattore continuo: la
   * barra risorse e' testo, e le porte in fondo sono bersagli.
   */
  readonly tiles: number;
}

/** Il gradino in vigore, piu' quel tanto di memoria che evita l'oscillazione. */
export interface RailDensity {
  readonly step: number;
  readonly squeeze: number;
  /** L'ultima quota in cui il gradino subito piu' largo non e' entrato. */
  readonly relaxFloor: number;
}

export const RAIL_DENSITY_START: RailDensity = {
  step: RAIL_DENSITY_DEFAULT,
  squeeze: 1,
  relaxFloor: 0,
};

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * Il gradino successivo, data una misura.
 *
 * Pura di proposito: e' la parte che si sbaglia — la convergenza, l'isteresi, il
 * conto della stretta — e vale la pena poterla provare senza un DOM.
 */
export function nextRailDensity(current: RailDensity, fit: RailFit): RailDensity {
  // Prima di decidere si toglie di mezzo la stretta gia' in vigore, o si
  // giudicherebbe da sola: una tessera assottigliata fa entrare il contenuto, e
  // dalla misura risulterebbe che non serviva stringere.
  const rawTiles = current.squeeze > 0 ? fit.tiles / current.squeeze : fit.tiles;
  const rawNeed = fit.need + rawTiles - fit.tiles;

  if (rawNeed > fit.avail) {
    if (current.step < RAIL_DENSITY_MAX) {
      // Si annota qui la quota che ha bocciato questo gradino: e' l'unica cosa
      // che impedisce di riprovarlo al giro dopo, a parita' di finestra.
      return { step: current.step + 1, squeeze: 1, relaxFloor: fit.avail };
    }
    const excess = rawNeed - fit.avail;
    const squeeze = rawTiles > 0 ? clamp((rawTiles - excess) / rawTiles, RAIL_SQUEEZE_MIN, 1) : 1;
    return { step: current.step, squeeze, relaxFloor: current.relaxFloor };
  }

  // Entra: se la finestra e' cresciuta oltre la quota che aveva bocciato il
  // gradino piu' largo, vale la pena riprovarlo. Se sbaglia, il ramo qui sopra
  // lo rimette a posto e rialza la soglia — e allora si e' fermi per davvero.
  if (current.step > RAIL_DENSITY_MIN && fit.avail > current.relaxFloor) {
    return { step: current.step - 1, squeeze: 1, relaxFloor: current.relaxFloor };
  }

  return { step: current.step, squeeze: 1, relaxFloor: current.relaxFloor };
}

/**
 * Quante passate si concedono a un assestamento.
 *
 * Il ciclo converge da solo — `nextRailDensity` finisce sempre per restituire lo
 * stesso stato, e li' si ferma — quindi questo non e' il freno che lo fa
 * terminare: e' la rete perche' una misura sballata non possa bloccare il
 * fotogramma. Cinque gradini piu' la stretta stanno in otto passate abbondanti.
 */
const MAX_SETTLE_PASSES = 8;

/**
 * Misura il rail a ogni cambio e gli tiene addosso il gradino che ci sta.
 *
 * Osserva anche i **figli** del rail e non solo il rail: il rail e' ancorato ai
 * due bordi, quindi la sua altezza cambia con la finestra e basta, mentre cio'
 * che serve sapere e' quando cambia il contenuto — una tessera che si sblocca,
 * la targa della vista che si accende. Torna la funzione che smette.
 */
export function watchRailDensity(
  rail: HTMLElement,
  root: HTMLElement = document.documentElement,
): () => void {
  let state = RAIL_DENSITY_START;
  let queued = false;

  const apply = (next: RailDensity): void => {
    root.dataset.hudDensity = String(next.step);
    root.style.setProperty('--rail-squeeze', String(next.squeeze));
  };

  const measure = (): RailFit => {
    const box = rail.getBoundingClientRect();
    // Il fondo dell'ultimo figlio che occupa spazio, non la somma delle altezze:
    // i figli nascosti valgono zero da soli, e i gap non vanno contati a mano.
    let bottom = box.top;
    for (const child of Array.from(rail.children)) {
      const rect = child.getBoundingClientRect();
      if (rect.height > 0) bottom = Math.max(bottom, rect.bottom);
    }
    let tiles = 0;
    for (const row of Array.from(rail.querySelectorAll('.dock-group-row'))) {
      tiles += row.getBoundingClientRect().height;
    }
    return { need: bottom - box.top, avail: rail.clientHeight, tiles };
  };

  /**
   * L'assestamento sta **tutto in un fotogramma**, e non e' un dettaglio.
   *
   * La versione ovvia — un gradino per fotogramma, chiedendone un altro alla
   * fine — e' corretta e si vede: passare da tre a quattro colonne e poi
   * spegnere il prezzo sono due ridisegni distinti, e su una macchina lenta o
   * con la finestra trascinata a mano diventano un lampeggio. Qui invece ogni
   * `measure()` forza il layout subito dopo l'`apply()` precedente, quindi la
   * catena si esaurisce prima che qualcosa arrivi a schermo. Sono al massimo
   * cinque layout sincroni di fila, e solo quando il rail cambia davvero misura.
   */
  const settle = (): void => {
    queued = false;
    for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
      const fit = measure();
      // Un rail senza quota e' un rail non ancora impaginato: misurarlo direbbe
      // che niente ci sta, e si arriverebbe al gradino piu' stretto per nulla.
      if (fit.avail <= 0) return;
      const next = nextRailDensity(state, fit);
      if (next.step === state.step && next.squeeze === state.squeeze) return;
      state = next;
      apply(state);
    }
  };

  // Il lavoro va in un fotogramma suo e non nella callback dell'osservatore:
  // scrivere il layout mentre lo si sta osservando e' esattamente cio' che fa
  // scattare l'avviso di ciclo del `ResizeObserver`.
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(settle);
  };

  const observer = new ResizeObserver(schedule);
  observer.observe(rail);
  for (const child of Array.from(rail.children)) observer.observe(child);

  apply(state);
  schedule();

  return () => observer.disconnect();
}
