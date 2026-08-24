import { unitAt } from '../world/rng';

/**
 * La caduta con cui i pezzi della prima isola entrano in scena.
 *
 * **Cio' che cade e' il chunk, non il voxel, e non e' una scelta di gusto.** A
 * valle del greedy mesher il cubo singolo non esiste piu': una distesa di celle
 * identiche e' un quad solo, quindi un dislivello calcolato per vertice
 * *stirerebbe* quel quad invece di farlo scendere. Il chunk e' invece l'unita'
 * rigida che il renderer ha gia' in mano — una mesh, una matrice — e muoverne
 * l'origine porta giu' tutto il pezzo, ombra compresa: `SunShadow` ripete la
 * stessa trasformazione di vertice, quindi non c'e' una seconda copia da tenere
 * allineata. I cubetti veri sono un'altra cosa e stanno in `dropRain.ts`.
 *
 * Qui dentro non c'e' Three e non c'e' tempo di frame: entrano l'eta' di un
 * chunk in secondi e l'inquadratura, esce di quanto e' ancora sospeso. Si
 * verifica in `node`.
 */

/** **Ogni** numero della caduta d'ingresso. */
export const INTRO = {
  /**
   * Quanto sopra il bordo alto dell'inquadratura nasce un pezzo, in frazione
   * dell'altezza visibile.
   *
   * La quota di partenza **non e' una costante in voxel**: cadere dal cielo vuol
   * dire entrare da fuori schermo, e quanto sia lontano il bordo alto dipende da
   * zoom e inclinazione. Un numero fisso o non si vedeva — quarantotto voxel su
   * un'isola larga cinquecento sono un saltello — o buttava i pezzi a mezzo
   * mondo di distanza al primo zoom.
   */
  clearance: 0.12,
  /** Sotto questa quota la caduta non si legge, comunque sia inquadrata. */
  minFall: 96,
  /**
   * Tetto della quota di partenza.
   *
   * Guardando quasi a picco un dislivello non muove quasi niente sullo schermo,
   * quindi la formula divergerebbe: sopra questo valore la caduta smette di
   * essere piu' lunga e diventa solo piu' lenta da guardare.
   */
  maxFall: 1600,
  /** Coseno minimo dell'inclinazione ammesso nel conto, per la stessa ragione. */
  pitchFloor: 0.35,
  /** Durata della sola discesa, in secondi. */
  duration: 1,
  /**
   * Ritardo massimo estratto per chunk.
   *
   * Senza, i chunk che una stessa frazione di streaming consegna insieme
   * atterrano allo stesso istante e la caduta si legge come una sola tapparella
   * invece che come dei pezzi che arrivano.
   */
  jitter: 0.2,
  /** Ritardo per piano di chunk: il mondo si impila dal basso. */
  tierDelay: 0.12,
  /** Altezza del rimbalzo in **voxel**, non in frazione della caduta. */
  bounceLift: 1.5,
  /** Durata del rimbalzo, in secondi. */
  bounceDuration: 0.16,
  /** Seme del jitter: deterministico come tutto il resto della generazione. */
  seed: 0x1f0d,
} as const;

/** Quanto dura una caduta intera, ritardo escluso. */
export const DROP_SPAN = INTRO.duration + INTRO.bounceDuration;

/**
 * Da quanto in alto parte un pezzo, in voxel, perche' entri da fuori schermo.
 *
 * Un dislivello di `h` sposta un punto verso l'alto dello schermo di
 * `h * cos(inclinazione)`: la camera e' ortografica, quindi vale identico per
 * tutti i pezzi e non e' un'approssimazione. Ne serve **un'altezza visibile
 * intera** e non mezza, o il pezzo che riposa in fondo allo schermo partirebbe
 * ancora dentro l'inquadratura.
 */
export function fallHeightFor(visibleHeight: number, pitchDegrees: number): number {
  const cosPitch = Math.max(INTRO.pitchFloor, Math.cos((pitchDegrees * Math.PI) / 180));
  const wanted = (visibleHeight * (1 + INTRO.clearance)) / cosPitch;
  return Math.min(INTRO.maxFall, Math.max(INTRO.minFall, wanted));
}

/**
 * Ritardo di partenza di un chunk, in secondi.
 *
 * `cz` entra con il proprio termine e non nell'hash: la cima di una collina deve
 * atterrare **dopo** la base che la regge, non a caso rispetto a lei.
 */
export function dropDelay(cx: number, cy: number, cz: number): number {
  return unitAt(INTRO.seed, cx, cy) * INTRO.jitter + Math.max(0, cz) * INTRO.tierDelay;
}

/**
 * Quota residua sopra il posto, in voxel, per un chunk di eta' `age` secondi
 * partito da `fall`.
 *
 * Un'eta' negativa e' il chunk che aspetta il proprio ritardo: resta appeso alla
 * quota di partenza. Il profilo della discesa e' quello di un grave — fermo in
 * cima e veloce all'impatto — perche' l'ease-out fa galleggiare, e qualcosa che
 * galleggia non sta cadendo dal cielo. Da quota alta e' anche cio' che tiene
 * corta la parte **fuori** schermo: i primi due terzi del tempo coprono un
 * quarto della strada, e sono quelli che nessuno vede.
 */
export function dropLift(age: number, fall: number): number {
  if (age <= 0) return fall;
  // Il confronto e' quello di `hasLanded` e non uno suo gemello: con due soglie
  // scritte a mano l'ultimo frame di un rimbalzo lasciava il pezzo a qualche
  // decimillesimo di miliardesimo di voxel dal suo posto, per sempre.
  if (hasLanded(age)) return 0;
  if (age < INTRO.duration) {
    const u = age / INTRO.duration;
    return fall * (1 - u * u);
  }
  const bounceAge = age - INTRO.duration;
  if (bounceAge < INTRO.bounceDuration) {
    // Mezzo seno: parte da terra, ci torna, e nel mezzo alza il pezzo di poco.
    // In voxel e non in frazione della caduta, o da mille voxel di quota il
    // rimbalzo sarebbe una seconda caduta.
    return INTRO.bounceLift * Math.sin(Math.PI * (bounceAge / INTRO.bounceDuration));
  }
  return 0;
}

/** true quando il chunk e' a terra e non c'e' piu' niente da animare. */
export function hasLanded(age: number): boolean {
  return age >= DROP_SPAN;
}
