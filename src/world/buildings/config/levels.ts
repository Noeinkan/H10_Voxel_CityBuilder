import { BUILDER } from './builder';

/**
 * Come il livello si traduce in massa: tetti di impronta e di fasce, livello di
 * nascita, soglia di promozione.
 *
 * Il livello e' l'unica leva che fa crescere un edificio, e cresce solo per
 * desiderabilita'. Footprint e fasce salgono insieme perche' una torre stretta e
 * altissima su una base 1x1 si legge come un palo, non come un edificio.
 */

export interface LevelCaps {
  /** Lato minimo naturale; durante un upgrade bloccato puo' restare piu' stretto. */
  readonly minFootprint: number;
  /** Lato massimo dell'impronta, in voxel. */
  readonly maxFootprint: number;
  readonly minBands: number;
  readonly maxBands: number;
}

/**
 * Le impronte sono raddoppiate rispetto alla scala vecchia, le fasce **no**: un
 * livello 6 resta un edificio di otto piani, non di sedici. A raddoppiare e'
 * `bandHeight`, cioe' l'altezza del singolo piano — l'edificio resta alto
 * quanto prima e guadagna i voxel in mezzo, che e' esattamente il punto.
 *
 * **Le prime sette voci non si toccano**, e non per prudenza: sono la citta' che
 * gia' esiste, e cambiarle avrebbe rifatto la sagoma di ogni edificio basso —
 * cioe' della maggioranza — per una fase che parla dei pochi alti. Le sei nuove
 * raddoppiano le fasce, e un civico di livello massimo passa da una sessantina
 * di voxel a centocinquanta: la torre di punta **supera** il rilievo dell'isola
 * (`TERRAIN.maxHeight: 80`) invece di stargli sotto, che e' la differenza fra una
 * citta' sopra la collina e una citta' accanto.
 *
 * **L'impronta non cresce con loro, e questo rende la punta una matita.** A otto
 * voxel di lato e centocinquanta di altezza il rapporto e' circa venti a uno.
 * Non e' una svista ed e' l'unica forma disponibile: `MAX_FOOTPRINT` non puo'
 * salire senza `STREETS.pitch`, perche' un isolato stretto misura quattordici
 * colonne e un'impronta piu' larga non ci starebbe — cambiare la scala della
 * maglia stradale e' un'altra fase. Regge perche' i picchi sono **rari per
 * costruzione**: `skyline/` concede il livello massimo solo dove centro,
 * prossimita' al polo e isolato eletto coincidono, quindi sono guglie e non un
 * bosco di pali. A dare massa alle torri, qui e ora, e' l'aggregazione della
 * 4.4: una fila di livelli alti legge come un volume unico anche se ogni record
 * resta stretto.
 */
export const LEVEL_CAPS: readonly LevelCaps[] = [
  { minFootprint: 4, maxFootprint: 6, minBands: 1, maxBands: 2 },
  { minFootprint: 4, maxFootprint: 6, minBands: 2, maxBands: 3 },
  { minFootprint: 4, maxFootprint: 8, minBands: 3, maxBands: 4 },
  { minFootprint: 6, maxFootprint: 8, minBands: 4, maxBands: 5 },
  { minFootprint: 6, maxFootprint: 8, minBands: 5, maxBands: 6 },
  { minFootprint: 6, maxFootprint: 8, minBands: 6, maxBands: 7 },
  { minFootprint: 8, maxFootprint: 8, minBands: 7, maxBands: 8 },
  { minFootprint: 8, maxFootprint: 8, minBands: 8, maxBands: 9 },
  { minFootprint: 8, maxFootprint: 8, minBands: 9, maxBands: 10 },
  { minFootprint: 8, maxFootprint: 8, minBands: 10, maxBands: 11 },
  { minFootprint: 8, maxFootprint: 8, minBands: 11, maxBands: 12 },
  { minFootprint: 8, maxFootprint: 8, minBands: 13, maxBands: 15 },
  { minFootprint: 8, maxFootprint: 8, minBands: 16, maxBands: 19 },
];

/**
 * Distribuzione del livello iniziale, cumulata.
 *
 * Coda lunga di proposito: quasi tutto nasce al livello base e pochissimo piu'
 * su. Uno skyline e' fatto di molti volumi bassi e pochi picchi; una
 * distribuzione uniforme darebbe un altopiano, che a colpo d'occhio non si legge
 * come una citta'.
 *
 * **Ha una voce per livello, ed e' un requisito e non un'abitudine.**
 * `startLevel` scorre questo elenco: finche' era lungo `maxLevel + 1` per caso,
 * alzare `maxLevel` da solo avrebbe fatto leggere `undefined` — e `roll <
 * undefined` e' falso, quindi **ogni** edificio sarebbe nato al livello massimo.
 * Un test verifica ora la lunghezza insieme a quella di `LEVEL_CAPS`, invece di
 * lasciarla alla buona volonta' del prossimo cambio di scala.
 */
export const START_LEVEL_CDF: readonly number[] =
  [0.78, 0.94, 0.985, 0.997, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/**
 * Soglia di desiderabilita' per promuovere al livello indicato.
 *
 * Ripete l'ultima voce oltre la fine della scala, e non e' un ripiego: da li' in
 * su la desiderabilita' ha finito l'alfabeto e chi decide e' la gerarchia
 * verticale. Leggere `upgradeThreshold[level]` direttamente darebbe `undefined`,
 * e un confronto con `undefined` e' sempre falso — cioe' nessuna promozione, in
 * silenzio.
 */
export function upgradeThresholdOf(level: number): number {
  const scale = BUILDER.upgradeThreshold;
  return scale[Math.min(Math.max(level, 0), scale.length - 1)];
}
