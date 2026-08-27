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
 *
 * Rigenerate di nuovo quando il PRNG unico e' diventato quattro canali
 * indipendenti dal livello (massa, fasce, facciata, tetto): la sequenza di ogni
 * edificio e' un'altra, e con lei ogni digest. Era il senso di quel cambiamento —
 * un upgrade conserva i piani bassi e rifa' la cima.
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
  '0-0-13': 'bffd94c5', '0-0-7932': '8044431a', '0-0-15851': '6162ea37',
  '0-3-13': '60a19738', '0-3-7932': '24273cb7', '0-3-15851': 'd5dc812b',
  '0-6-13': '651913ad', '0-6-7932': 'a56dd92f', '0-6-15851': 'ce81d35b',
  '0-9-13': 'ad69cb16', '0-9-7932': '8893e56c', '0-9-15851': '305a7c7b',
  '0-20-13': 'a26e22fe', '0-20-7932': 'faf427f5', '0-20-15851': '85d1dca1',

  '1-0-13': '0b195fe3', '1-0-7932': '529d4710', '1-0-15851': '4c518d3e',
  '1-3-13': 'cd8e97bd', '1-3-7932': '577de3dc', '1-3-15851': '5bf83850',
  '1-6-13': 'ac4175da', '1-6-7932': '1e4abf5e', '1-6-15851': 'd9f51847',
  '1-9-13': '11da60b0', '1-9-7932': 'b75a9b9f', '1-9-15851': 'b9967848',
  '1-20-13': '9e633209', '1-20-7932': '9eab491b', '1-20-15851': '353db270',

  '2-0-13': 'caae781a', '2-0-7932': '7177f2cf', '2-0-15851': '8170442f',
  '2-3-13': '6ca6f6df', '2-3-7932': '84a606e8', '2-3-15851': '977b23ad',
  '2-6-13': '8d977dcd', '2-6-7932': '5ee8c672', '2-6-15851': '56e842ce',
  '2-9-13': 'fcb0d4ca', '2-9-7932': 'ce76c4f9', '2-9-15851': '2d05b271',
  '2-20-13': 'c89b3b0a', '2-20-7932': '16a24f8a', '2-20-15851': 'd3968637',

  '3-0-13': '0313822b', '3-0-7932': 'c13b69f3', '3-0-15851': 'a49bba87',
  '3-3-13': '05182ca4', '3-3-7932': '1199b521', '3-3-15851': '1000cdce',
  '3-6-13': '8e27c5a2', '3-6-7932': '798c7f6b', '3-6-15851': 'b9da5fb3',
  '3-9-13': '2319535a', '3-9-7932': '5c2aa711', '3-9-15851': 'e684173b',
  '3-20-13': '73928785', '3-20-7932': '819531b1', '3-20-15851': '76114ff6',
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
