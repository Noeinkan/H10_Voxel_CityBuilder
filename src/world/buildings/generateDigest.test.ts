import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, type BuildingClass } from '../../sim';
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
 * Le digest qui sotto sono state **calcolate su questo codice**. Se cadono dopo
 * un refactor che dichiarava di non cambiare niente, e' il refactor ad avere
 * torto. Se cadono dopo un cambio di grammatica dichiarato, si rigenerano — ma
 * allora la citta' gia' costruita va considerata persa, e va detto nel CHANGELOG.
 *
 * Rigenerate quando `nextRect` ha smesso di prendere sempre la testa del
 * repertorio (`preferredStart`): due tiri in piu' per fascia spostano tutta la
 * sequenza, quindi **ogni** sagoma e' cambiata. Era il senso del cambiamento.
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
const LEVELS = [0, 3, 6, 9, 20] as const;

/** Chiave `uso-livello-seme`. L'ordine degli usi e' contratto (invariante 10). */
const DIGESTS: Readonly<Record<string, string>> = {
  '0-0-13': '98ebc911', '0-0-7932': '3a65a969', '0-0-15851': 'b17b6c74',
  '0-3-13': '8eba8cfd', '0-3-7932': 'a073aa84', '0-3-15851': '6cafc11b',
  '0-6-13': 'b75fa3f3', '0-6-7932': '3d3831c3', '0-6-15851': 'e657adb8',
  '0-9-13': '59ca32d6', '0-9-7932': '55e535fb', '0-9-15851': '1dddd5d5',
  '0-20-13': '7d91ff75', '0-20-7932': 'f690b950', '0-20-15851': '1f34500f',

  '1-0-13': 'eba8aea2', '1-0-7932': '6408f64d', '1-0-15851': 'e38ea417',
  '1-3-13': '4e599582', '1-3-7932': '9faeae6c', '1-3-15851': '5ea73646',
  '1-6-13': '4b2e25ab', '1-6-7932': '096c64fa', '1-6-15851': '7a31913f',
  '1-9-13': '4aa053c6', '1-9-7932': 'cdbff72b', '1-9-15851': '67ac11f1',
  '1-20-13': '8384e586', '1-20-7932': '435062f2', '1-20-15851': '508aaa78',

  '2-0-13': 'f5c9ab8d', '2-0-7932': '7b27bc77', '2-0-15851': '80416cca',
  '2-3-13': 'c8bf7445', '2-3-7932': '9963b180', '2-3-15851': '6c6c8695',
  '2-6-13': '97209a7a', '2-6-7932': 'bee6d502', '2-6-15851': '0835e496',
  '2-9-13': '328c5348', '2-9-7932': 'bf0fc5a1', '2-9-15851': 'b238e80b',
  '2-20-13': '14e12653', '2-20-7932': '0d9fc0b7', '2-20-15851': 'a8daf549',

  '3-0-13': '425980fa', '3-0-7932': '97b9655d', '3-0-15851': '56fd26e0',
  '3-3-13': '80710c4d', '3-3-7932': '088cf8b8', '3-3-15851': '5d47a509',
  '3-6-13': '4412e366', '3-6-7932': '19d5020e', '3-6-15851': '3b224ef6',
  '3-9-13': '8eb075e1', '3-9-7932': '4dd5bed8', '3-9-15851': 'cba3c13f',
  '3-20-13': '96631393', '3-20-7932': '39fcc5a2', '3-20-15851': '24e002bf',
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
