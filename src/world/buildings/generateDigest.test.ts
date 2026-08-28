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
 *
 * Rigenerate una terza volta quando una fascia il cui ramo e' esaurito ha
 * cominciato a provare l'altro (`GRAMMAR.spareBranchChance`): il tiro in piu' per
 * fascia sposta la sequenza, e sopra `minBandSide` la sagoma cambia davvero
 * invece di ripetere quella sotto. Le sagome di livello zero — una o due fasce,
 * niente corpo bloccato — sono rimaste identiche, ed e' il segno che il
 * cambiamento morde dove doveva.
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
  '0-0-13': 'bffd94c5', '0-0-7932': 'b9670246', '0-0-15851': '6162ea37',
  '0-3-13': '38abb4b6', '0-3-7932': 'cd8062e4', '0-3-15851': '8761ae6d',
  '0-6-13': '3627f1a0', '0-6-7932': 'afbbec8e', '0-6-15851': '2aaeef7b',
  '0-9-13': 'e170c277', '0-9-7932': '19ea7d60', '0-9-15851': 'f16fd557',
  '0-20-13': 'b36f6dbf', '0-20-7932': 'a9921893', '0-20-15851': 'd3fd25d0',

  '1-0-13': '0b195fe3', '1-0-7932': '09c8e49e', '1-0-15851': '4c518d3e',
  '1-3-13': '767c77d6', '1-3-7932': 'd5d6786f', '1-3-15851': '8d48593a',
  '1-6-13': 'adef1429', '1-6-7932': 'c4c15c13', '1-6-15851': '504681f2',
  '1-9-13': 'a42e9903', '1-9-7932': '76478029', '1-9-15851': 'c509cc0e',
  '1-20-13': '79f09e88', '1-20-7932': 'b5e4b504', '1-20-15851': 'c702f109',

  '2-0-13': '9c29ce2e', '2-0-7932': '3fc0398f', '2-0-15851': '1b8fdb2f',
  '2-3-13': '9f03b272', '2-3-7932': '169b5061', '2-3-15851': 'd423bf5f',
  '2-6-13': '3ec95cec', '2-6-7932': '88b48952', '2-6-15851': '8c21cec0',
  '2-9-13': '4fb3b344', '2-9-7932': 'eda11a58', '2-9-15851': '202e6e17',
  '2-20-13': 'd266ca26', '2-20-7932': '097df9e1', '2-20-15851': 'b9365c7d',

  '3-0-13': '0313822b', '3-0-7932': '2344f301', '3-0-15851': 'a49bba87',
  '3-3-13': 'a5aeee90', '3-3-7932': '5ce24126', '3-3-15851': 'a0a8482b',
  '3-6-13': '9a60f39b', '3-6-7932': '4b0a27a6', '3-6-15851': '656943ba',
  '3-9-13': 'f6ba2362', '3-9-7932': '07dc7bd3', '3-9-15851': '639cc37a',
  '3-20-13': 'eb6f84ea', '3-20-7932': '90bcd987', '3-20-15851': 'a321c077',
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
