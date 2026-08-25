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
const LEVELS = [0, 3, 6, 9, BUILDER.maxLevel] as const;

/** Chiave `uso-livello-seme`. L'ordine degli usi e' contratto (invariante 10). */
const DIGESTS: Readonly<Record<string, string>> = {
  '0-0-13': 'e3d2e329', '0-0-7932': '50669a8d', '0-0-15851': '4e7c2f2c',
  '0-3-13': 'e057b060', '0-3-7932': '37353fc4', '0-3-15851': '2fcf4eb9',
  '0-6-13': 'dd6a8e16', '0-6-7932': '45aefb82', '0-6-15851': '61b1477b',
  '0-9-13': '96e9b384', '0-9-7932': '93d05149', '0-9-15851': 'cdfa8252',
  '0-12-13': 'cbeec336', '0-12-7932': '3d5ff572', '0-12-15851': '7b3e3451',

  '1-0-13': '1a4397aa', '1-0-7932': '8893f4d9', '1-0-15851': '80aef66f',
  '1-3-13': '07ab9682', '1-3-7932': '0aa06a2f', '1-3-15851': '88ebfdf2',
  '1-6-13': '467f9cf3', '1-6-7932': 'aed24bd8', '1-6-15851': 'b106abff',
  '1-9-13': '76652802', '1-9-7932': 'efd10d34', '1-9-15851': 'd2062fec',
  '1-12-13': '9a409ed9', '1-12-7932': 'a9a265e5', '1-12-15851': 'be59a597',

  '2-0-13': '43f2eb39', '2-0-7932': '752581a9', '2-0-15851': '7ba32146',
  '2-3-13': 'c9954129', '2-3-7932': 'efa1bdb4', '2-3-15851': '2ce428b2',
  '2-6-13': '42c78222', '2-6-7932': '4dd5cd2a', '2-6-15851': '6463352c',
  '2-9-13': '557a96c2', '2-9-7932': 'b0d13a02', '2-9-15851': '8fcb29f8',
  '2-12-13': 'b5b78195', '2-12-7932': 'b739e846', '2-12-15851': '5d6d26f0',

  '3-0-13': '4e6e6dee', '3-0-7932': '1b18d051', '3-0-15851': '4b6e7d78',
  '3-3-13': '9089fac5', '3-3-7932': 'd7b2340c', '3-3-15851': '32dfc712',
  '3-6-13': 'ce423c0c', '3-6-7932': 'c1a05030', '3-6-15851': 'cd923230',
  '3-9-13': 'd4632327', '3-9-7932': 'ecc7793c', '3-9-15851': '094d07eb',
  '3-12-13': '9a2eaf12', '3-12-7932': 'caf6b5ff', '3-12-15851': '3db6678c',
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
