import { BUILDER } from './builder';
import { levelCapsOf, startLevelCdfOf, type LevelCaps } from '../../scale';

export type { LevelCaps };

/**
 * Come il livello si traduce in massa: tetti di impronta e di fasce, livello di
 * nascita, soglia di promozione.
 *
 * Il livello e' l'unica leva che fa crescere un edificio, e cresce solo per
 * desiderabilita'. Footprint e fasce salgono insieme perche' una torre stretta e
 * altissima su una base 1x1 si legge come un palo, non come un edificio.
 *
 * **Le due tabelle sono derivate, non piu' scritte a mano.** Prima `LEVEL_CAPS`
 * e `START_LEVEL_CDF` erano elenchi che andavano allungati a mano a ogni cambio
 * di `maxLevel`, e dimenticarne uno faceva leggere `undefined` — con il difetto
 * documentato piu' sotto su `startLevel`. Ora sono `levelCapsOf` e
 * `startLevelCdfOf` di `src/world/scale.ts`: la massa di un livello segue le
 * manopole da sola, e la silhouette resta quella di sempre (l'impronta satura
 * per prima, poi le fasce continuano a salire).
 */
export const LEVEL_CAPS: readonly LevelCaps[] = levelCapsOf();

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
 * La derivazione lo garantisce per costruzione, e un test verifica la lunghezza
 * insieme a quella di `LEVEL_CAPS`.
 */
export const START_LEVEL_CDF: readonly number[] = startLevelCdfOf();

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
