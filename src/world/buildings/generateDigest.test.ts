import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, type BuildingClass } from '../../sim';
import { BUILDER } from './config';
import { generateBuilding } from './generate';
import type { VoxelStamp } from './stamp';

/**
 * Impronte digitali della grammatica, fissate su codice funzionante.
 *
 * **Non verifica una forma: verifica che la forma non si muova.** La suite di
 * `generate.test.ts` controlla che due chiamate uguali diano lo stesso stamp e
 * che ogni stamp rispetti i vincoli del livello — cioe' proprieta' che
 * sopravvivono benissimo a una grammatica cambiata per sbaglio. Quello che
 * nessun test copriva e' il caso in cui uno *spostamento di codice* consuma un
 * tiro in piu', o in un altro ordine: la citta' resta legale, resta
 * deterministica, e non e' piu' quella di ieri. Con `recordStamp` che rigenera
 * la sagoma per cancellarla, quel giorno gli edifici gia' costruiti smettono di
 * poter essere cancellati.
 *
 * Le digest qui sotto sono state **calcolate su questo codice**, prima di
 * spezzare `generate.ts` nei suoi moduli. Se cadono dopo un refactor che
 * dichiarava di non cambiare niente, e' il refactor ad avere torto. Se cadono
 * dopo un cambio di grammatica dichiarato, si rigenerano — ma allora la citta'
 * gia' costruita va considerata persa, e va detto nel CHANGELOG.
 */

/**
 * Hash FNV-1a a 32 bit dei tre buffer che descrivono uno stamp.
 *
 * Un hash e non un confronto elemento per elemento: la tabella di riferimento
 * sarebbe altrimenti qualche megabyte di letterali, e un test che nessuno
 * riesce a leggere non e' una rete di sicurezza. La collisione non preoccupa —
 * qui si confronta lo stesso ingresso con se stesso nel tempo, non due ingressi
 * fra loro.
 */
export function stampDigest(stamp: VoxelStamp): string {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };

  // Le dimensioni entrano nell'hash: due stamp con gli stessi byte e lati
  // diversi sono edifici diversi, e senza di loro l'hash non lo direbbe.
  for (const size of [stamp.sizeX, stamp.sizeY, stamp.sizeZ, stamp.anchorX, stamp.anchorY, stamp.anchorZ]) {
    mix(size);
    mix(size >>> 8);
  }
  for (const value of stamp.voxels) mix(value);
  for (const value of stamp.surfaces) mix(value);
  for (const start of stamp.bandStarts) {
    mix(start);
    mix(start >>> 8);
  }
  return hash.toString(16).padStart(8, '0');
}

/** Gli stessi semi di `everyStamp`, ridotti a tre per non fissare un muro. */
const SEEDS = [13, 7932, 15851] as const;

/** Livelli campione: i due estremi e tre quote in mezzo. */
const LEVELS = [0, 3, 6, 9, BUILDER.maxLevel] as const;

/** Chiave `uso-livello-seme`. L'ordine degli usi e' contratto (invariante 10). */
const DIGESTS: Readonly<Record<string, string>> = {
  '0-0-13': '3a745605', '0-0-7932': 'e59f8769', '0-0-15851': 'a230086b',
  '0-3-13': '51531c29', '0-3-7932': 'c4805ee6', '0-3-15851': '54db7937',
  '0-6-13': '427e06cc', '0-6-7932': 'fcbc8b2c', '0-6-15851': '2197c4f0',
  '0-9-13': '674608c5', '0-9-7932': 'f3b9e690', '0-9-15851': '709a7cb5',
  '0-12-13': '534ace13', '0-12-7932': 'ed1f04fc', '0-12-15851': 'e67698fd',

  '1-0-13': 'ca5daef0', '1-0-7932': 'c870e445', '1-0-15851': '73fd4033',
  '1-3-13': 'b78f5665', '1-3-7932': 'ab8f3ed4', '1-3-15851': '336fd6b4',
  '1-6-13': '1776a755', '1-6-7932': 'eee2ac6e', '1-6-15851': '89fa0883',
  '1-9-13': '8ae0793a', '1-9-7932': 'f6c1aab6', '1-9-15851': '1c030343',
  '1-12-13': 'aa862d2a', '1-12-7932': 'f8e15a03', '1-12-15851': 'fec1d0ec',

  '2-0-13': '9d464892', '2-0-7932': '6a3001b8', '2-0-15851': 'f5e82aa6',
  '2-3-13': '960a2c24', '2-3-7932': 'a4c271c4', '2-3-15851': '23efe757',
  '2-6-13': '871b4dfc', '2-6-7932': 'b74e113c', '2-6-15851': '891326e3',
  '2-9-13': '7cdc687a', '2-9-7932': 'bce28300', '2-9-15851': '6ddf26d7',
  '2-12-13': '215cdae0', '2-12-7932': '0c88d00c', '2-12-15851': '5afdafcf',

  '3-0-13': 'c6544e89', '3-0-7932': 'df4de7d9', '3-0-15851': 'baa8deb8',
  '3-3-13': '061ff61f', '3-3-7932': '8be42247', '3-3-15851': 'b25515dc',
  '3-6-13': '7ef97ce1', '3-6-7932': '28b69b17', '3-6-15851': '08b71073',
  '3-9-13': '61eb909a', '3-9-7932': 'f65e9e13', '3-9-15851': '830bef14',
  '3-12-13': 'd36b6695', '3-12-7932': '90303069', '3-12-15851': '98b84807',
};

describe('impronte digitali della grammatica', () => {
  it('la sagoma di ogni uso, livello e seme e quella fissata', () => {
    for (const cls of ALL_CLASSES) {
      for (const level of LEVELS) {
        for (const seed of SEEDS) {
          const key = `${cls}-${level}-${seed}`;
          const stamp = generateBuilding({ class: cls as BuildingClass, level, seed });
          expect(stampDigest(stamp), key).toBe(DIGESTS[key]);
        }
      }
    }
  });

  it('copre ogni uso e ogni livello campione', () => {
    // Senza, un uso tolto per sbaglio dall'elenco farebbe passare il test di
    // sopra a vuoto: e' lo stesso difetto che `START_LEVEL_CDF` ha gia' avuto,
    // e non lancia niente.
    expect(Object.keys(DIGESTS)).toHaveLength(ALL_CLASSES.length * LEVELS.length * SEEDS.length);
  });

  it('l hash distingue due sagome diverse', () => {
    // Una rete di sicurezza che risponde sempre lo stesso non e' una rete. Due
    // semi diversi sullo stesso uso e livello devono dare digest diverse.
    const a = generateBuilding({ class: ALL_CLASSES[0], level: 6, seed: 13 });
    const b = generateBuilding({ class: ALL_CLASSES[0], level: 6, seed: 7932 });
    expect(stampDigest(a)).not.toBe(stampDigest(b));
  });
});
