import { ROCK } from './config';

/**
 * I grigi della roccia: quale **strato** tocca a una quota, e che tinte porta.
 *
 * **La roccia e' l'unico bioma che si guarda di taglio.** Sopra la fascia della
 * collina l'alzata vale otto voxel, quindi di una cella si vede piu' parete che
 * pianta, e la parete e' fatta di un grigio per la superficie e uno per il
 * sottosuolo: quattro cubi di campitura piatta, che alla scala della montagna e'
 * lo stesso difetto che le erbette tolgono al prato.
 *
 * **La tinta viene dalla quota e da nient'altro, ed e' la sola cosa che la
 * rende leggibile.** Il primo tentativo la spezzava anche in pianta, con delle
 * vene di rumore: colore che non raccontava niente, perche' su una roccia due
 * grigi diversi affiancati *significano* due strati diversi, e li' non c'erano.
 * Uno strato e' orizzontale, si vede dove il terreno lo taglia, e il terreno lo
 * taglia dove si terrazza — quindi il disegno che ne esce e' quello dei gradoni,
 * ed e' la stessa quota a dettare la forma e il colore.
 *
 * Ne segue che un pianoro e' di un grigio solo: e' cio' che *deve* essere. A
 * romperlo, se serve, ci sono i sassi della copertura e il disturbo di
 * `TERRACE.jitter`, che al gradone toglie la faccia di curva di livello.
 *
 * **Non e' un dato del blocco.** Come la copertura, la tinta si decide da una
 * quota: nessun record, nessun byte in piu' da trasferire fra worker e main,
 * nessun PRNG. Non porta nemmeno il seme del mondo — la banda viene dalla quota,
 * e la quota il seme ce l'ha gia' dentro.
 */

/**
 * Strato di roccia di una colonna alta `z`.
 *
 * Puo' uscire negativo — `rampIndex` lo accetta — e non c'e' motivo di
 * impedirlo: sotto il livello del mare la roccia esiste lo stesso, ed e' un
 * fondale che nessuno guarda.
 */
export function rockBandAt(z: number): number {
  return Math.floor(z / ROCK.bandHeight);
}

/** Tinta della superficie di uno strato: la fascia alta una cella che lo incorona. */
export function rockSurface(band: number): number {
  return ROCK.tones[rampIndex(band)];
}

/**
 * Tinta del sottosuolo: la successiva della rampa, cioe' un grigio piu' scuro.
 *
 * Non e' una tinta scelta a parte. Prendendone una indipendente, uno strato
 * chiaro sopra un sottosuolo chiaro avrebbe cancellato il bordo della parete —
 * ed e' quel bordo, non la tinta, a dire dove finisce un gradone.
 */
export function rockSubsoil(band: number): number {
  return ROCK.tones[rampIndex(band) + 1];
}

/**
 * Indice sulla rampa che va e torna invece di ricominciare da capo.
 *
 * Ricominciando, fra l'ultimo strato e il primo ci sarebbe il salto dal grigio
 * piu' scuro al piu' chiaro: sul fianco della montagna e' una cucitura, e si
 * vede come tale. Andando e tornando, due strati contigui sono sempre due tinte
 * contigue.
 */
function rampIndex(band: number): number {
  const span = ROCK.surfaceTones;
  if (span <= 1) return 0;
  const period = 2 * span - 2;
  const step = ((band % period) + period) % period;
  return step < span ? step : period - step;
}
