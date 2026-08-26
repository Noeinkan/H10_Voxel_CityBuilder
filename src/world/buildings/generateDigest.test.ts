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
  '0-3-13': '8eba8cfd', '0-3-7932': 'a073aa84', '0-3-15851': '876aad59',
  '0-6-13': '5674f46f', '0-6-7932': 'd456e213', '0-6-15851': '8a304d87',
  '0-9-13': '674a5e4e', '0-9-7932': '55e535fb', '0-9-15851': '49e49591',
  '0-20-13': '166491b0', '0-20-7932': '2eacfc14', '0-20-15851': '137b913f',

  '1-0-13': 'eba8aea2', '1-0-7932': '6408f64d', '1-0-15851': 'e38ea417',
  '1-3-13': 'ccb46fd2', '1-3-7932': '9faeae6c', '1-3-15851': 'db21f286',
  '1-6-13': 'b414cd7f', '1-6-7932': '339e3716', '1-6-15851': '1fb5c2a7',
  '1-9-13': '39d27419', '1-9-7932': 'cdbff72b', '1-9-15851': '8a37b317',
  '1-20-13': 'c4e98f57', '1-20-7932': 'd639afea', '1-20-15851': 'f039891a',

  '2-0-13': 'f5c9ab8d', '2-0-7932': '7b27bc77', '2-0-15851': '80416cca',
  '2-3-13': '7d7af335', '2-3-7932': '61b7df74', '2-3-15851': '6c6c8695',
  '2-6-13': '97209a7a', '2-6-7932': '2773fd2a', '2-6-15851': '25516152',
  '2-9-13': '328c5348', '2-9-7932': '296439bb', '2-9-15851': 'd30b6791',
  '2-20-13': '3f0a87ff', '2-20-7932': '4cf3ba0f', '2-20-15851': '037cf04d',

  '3-0-13': '425980fa', '3-0-7932': '97b9655d', '3-0-15851': '56fd26e0',
  '3-3-13': '270ed035', '3-3-7932': 'b4a779a4', '3-3-15851': '85a2ac4c',
  '3-6-13': '4412e366', '3-6-7932': '19d5020e', '3-6-15851': '66983e2d',
  '3-9-13': '87ef2f59', '3-9-7932': '4dd5bed8', '3-9-15851': 'cba3c13f',
  '3-20-13': '2d5b2aaf', '3-20-7932': 'cc2c20e2', '3-20-15851': '2f816e4c',
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
