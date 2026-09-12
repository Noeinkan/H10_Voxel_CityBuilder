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
 *
 * Rigenerate una quarta volta quando la cima e' diventata un **repertorio**: una
 * tipologia dichiara `crownKinds` e il canale del tetto ne pesca una, e il
 * pennone sotto la soglia di skyline e' anch'esso un tiro — lato, altezza e
 * presenza. Sono tre tiri in piu' sul canale del tetto, quindi ogni cima e'
 * cambiata; il corpo no, e nemmeno la sua sequenza. **La citta' gia' costruita
 * si ricarica senza danno**: `recordStamp` rigenera dal record, e la sagoma che
 * ne esce e' coerente con se stessa — cambia rispetto a ieri, non rispetto a
 * quel che il registro crede di avere.
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
  '0-0-13': 'f2adec9f', '0-0-7932': 'ef2bd248', '0-0-15851': '0acc0cc7',
  '0-3-13': 'ea49c56f', '0-3-7932': 'fe47df15', '0-3-15851': '6af9e61b',
  '0-6-13': '02b24f7a', '0-6-7932': '15ca1ed3', '0-6-15851': '462124bb',
  '0-9-13': '1b490651', '0-9-7932': '65059bb8', '0-9-15851': '92a6cbd7',
  '0-20-13': '00e1852c', '0-20-7932': 'cb89c9eb', '0-20-15851': '3671a6ce',

  '1-0-13': 'f4917abb', '1-0-7932': 'fcfc8b5e', '1-0-15851': '08e79a1e',
  '1-3-13': 'f1e65782', '1-3-7932': '8f62f1c5', '1-3-15851': 'fe0a758c',
  '1-6-13': 'ebfa988b', '1-6-7932': '09d4b229', '1-6-15851': 'f08c6b7d',
  '1-9-13': '23fee7e0', '1-9-7932': '02766745', '1-9-15851': '503eb9d3',
  '1-20-13': 'b25a2f5a', '1-20-7932': '45ed7cdf', '1-20-15851': '63da176d',

  '2-0-13': 'c6aef72e', '2-0-7932': '2a63816f', '2-0-15851': '2753c6cf',
  '2-3-13': 'b88d7154', '2-3-7932': '44092c69', '2-3-15851': '725d78bb',
  '2-6-13': '7a50f6f4', '2-6-7932': '77cffda2', '2-6-15851': '065c89bc',
  '2-9-13': '6f60835c', '2-9-7932': 'baa26bf0', '2-9-15851': 'aebe2caf',
  '2-20-13': 'f5b5d72a', '2-20-7932': '35624ab4', '2-20-15851': 'bae11df8',

  '3-0-13': 'cec7cc92', '3-0-7932': 'b2cc5fee', '3-0-15851': '8e918df7',
  '3-3-13': '79e19ae3', '3-3-7932': 'd89e40ec', '3-3-15851': '60db675b',
  '3-6-13': '8fb006d0', '3-6-7932': '4c507e02', '3-6-15851': '07457292',
  '3-9-13': '668c046f', '3-9-7932': '7aac5d4a', '3-9-15851': '6286346a',
  '3-20-13': '9d04dfb9', '3-20-7932': 'dadb3ccf', '3-20-15851': '75f6287c',
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
