import { PALETTE_SIZE } from '../../engine/paletteSlots';
import { unitAt } from '../rng';
import { BIOME, BIOME_STRATA, GROUND_COVER, ROCK } from './config';

/**
 * Erbette, fiori e sassi: **una cella** appoggiata sopra la superficie.
 *
 * E' la scala che mancava al terreno. Un cubo di prato e' due voxel per lato e
 * si legge come una campitura piatta; l'albero piu' piccolo del catalogo ne e'
 * cinque volte piu' alto. In mezzo non c'era niente, e una superficie senza
 * niente in mezzo si legge come una carta da parati — la stessa ragione per cui
 * le facciate hanno le campate.
 *
 * **Quella cella non e' un cubo, ed e' la seconda volta che si sbaglia scala.**
 * Riempirla di pieno mette sul prato un dado grande un quarto della faccia di un
 * cubo di terreno: alla distanza isometrica non legge come un ciuffo, legge come
 * un coriandolo, e piu' se ne mettono peggio va. Qui si decide *se* e *cosa*;
 * la cella arriva al mesher come marcatore (`packCoverMark`) e la lama, lo stelo
 * e il sasso li disegna `engine/mesher/coverDetail.ts` in prismi da 1/16.
 *
 * **Non e' un oggetto e non ha una cella sua.** Un albero ha un'origine, un
 * ingombro e dei vicini da non toccare, quindi ha bisogno di un PRNG e di un
 * record; qui la decisione e' per colonna, e una colonna non puo' collidere con
 * nessuno. Ne segue tutto il resto: un hash invece di un PRNG (niente chiusure
 * per duecentosessantamila colonne), un byte per colonna invece di un record, e
 * la scrittura dentro lo stesso ciclo che riempie la colonna invece di una fase
 * a se'.
 */

/** Cosa c'e' sopra una colonna. Sono i valori che viaggiano in `ColumnBlock.cover`. */
export const COVER = {
  none: 0,
  /** Ciuffo d'erba: un tono piu' chiaro della superficie. */
  grass: 1,
  /** L'eccezione del bioma: fiore in basso, sasso in quota, conchiglia sulla riva. */
  accent: 2,
  /**
   * Solco coltivato che corre lungo **x**, e il suo gemello lungo **y**.
   *
   * **L'asse sta nel tipo, e non e' un dettaglio di comodo.** Le altre coperture
   * prendono una delle quattro giravolte da un hash della colonna, che per un
   * ciuffo e' esattamente giusto — un prato tutto nella stessa direzione si
   * legge come carta da parati. Per un campo e' il difetto opposto: dei solchi
   * orientati a caso non sono un campo, sono rumore verde. Mettendo l'asse nel
   * marcatore l'intero lotto corre in un verso solo, e il mesher continua a non
   * sapere che i lotti esistono — legge un byte, come ha sempre fatto.
   *
   * I tre bit del marcatore reggono sette valori e ne erano usati due: questi
   * due non tolgono niente a nessuno.
   */
  cropX: 3,
  cropY: 4,
} as const;

export type CoverKind = (typeof COVER)[keyof typeof COVER];

/** Il solco orientato lungo l'asse chiesto: `false` per x, `true` per y. */
export function cropCover(alongY: boolean): CoverKind {
  return alongY ? COVER.cropY : COVER.cropX;
}

/**
 * Cosa spunta sulla colonna, dal solo hash della sua posizione.
 *
 * **Una frazione sola per due decisioni.** La stessa estrazione dice se c'e'
 * qualcosa e, riscalata sulla densita', cosa: due hash indipendenti darebbero la
 * stessa distribuzione al doppio del prezzo, su un percorso che gira una volta
 * per colonna.
 */
export function coverAt(seed: number, x: number, y: number, biome: number): CoverKind {
  const density = GROUND_COVER.density[biome];
  if (density === undefined || density <= 0) return COVER.none;

  const unit = unitAt(seed ^ GROUND_COVER.salt, x, y);
  if (unit >= density) return COVER.none;

  const share = GROUND_COVER.accentShare[biome] ?? 0;
  return unit / density < share ? COVER.accent : COVER.grass;
}

/**
 * Come si disegna una copertura. E' l'unica cosa che il mondo dice al mesher
 * oltre alla tinta: la forma dice *cosa* e' cresciuto li', non che aspetto ha.
 */
export const COVER_FORM = {
  none: 0,
  /** Ciuffo: qualche lama che esce dal prato. */
  tuft: 1,
  /** Fiore: uno stelo e una corolla, dove l'erba cresce. */
  bloom: 2,
  /** Sasso o conchiglia: una lastra bassa, dove l'erba non cresce. */
  pebble: 3,
  /**
   * Solco: un crinale continuo da un capo all'altro della cella.
   *
   * E' l'unica forma che **attraversa** la propria cella invece di stare dentro
   * un'aiuola al centro, ed e' tutto il punto: due colonne contigue con lo
   * stesso solco si saldano in una fila unica, e un lotto legge come un campo
   * arato invece che come una fila di cespugli. Le due voci sono la stessa forma
   * girata di novanta gradi, e a sceglierle e' il marcatore, non un hash.
   */
  rowX: 4,
  rowY: 5,
} as const;

export type CoverForm = (typeof COVER_FORM)[keyof typeof COVER_FORM];

/**
 * Voci per palette di terreno: una per valore di `COVER`, piu' lo zero.
 *
 * Cresciuta da quattro a otto quando sono arrivati i solchi. E' il passo di due
 * tabelle da `PALETTE_SIZE * COVER_STRIDE` byte — 256 in tutto, contro le 128 di
 * prima — quindi la potenza di due si paga in niente e tiene l'indice una
 * moltiplicazione invece di un ramo.
 */
const COVER_STRIDE = 8;

/**
 * Tinta e forma di una copertura, indicizzate dalla palette del terreno che la
 * porta e non dal bioma.
 *
 * **Il bioma non arriva fino al mesher, e non deve.** Quello che arriva e' il
 * volume, e nel volume il bioma c'e' gia' — e' la palette del voxel di
 * superficie, che nessun altro bioma scrive. Girare la tabella su quella chiave
 * e' quindi tutto quello che serve perche' il mesher legga cosa cresce dove
 * senza sapere che esistono i biomi.
 *
 * Sono **derivate** da `GROUND_COVER` e `BIOME_STRATA`, non riscritte: un tono
 * cambiato in `config.ts` si propaga qui da solo, ed e' il motivo per cui il
 * mesher puo' permettersi di non portarsi dietro la tinta nel marcatore.
 *
 * La forma segue la stessa riga di `accentShare`: dove l'erba non cresce —
 * spiaggia e roccia, le due voci con `grassTone` nullo — l'accento e' un sasso e
 * non un fiore.
 */
const coverToneTable = new Uint8Array(PALETTE_SIZE * COVER_STRIDE);
const coverFormTable = new Uint8Array(PALETTE_SIZE * COVER_STRIDE);

/**
 * Le palette di superficie che un bioma sa scrivere.
 *
 * Quasi tutti ne hanno una sola, quella di `BIOME_STRATA`. **La roccia no**: da
 * quando la parete percorre `ROCK.tones`, la sua superficie e' una banda fra le
 * prime `ROCK.surfaceTones` della rampa, e chiederle tutte e' l'unico modo
 * perche' il sasso compaia su ogni gradone invece che su uno su tre.
 */
export function coverGroundPalettes(biome: number): readonly number[] {
  if (biome === BIOME.rock) return ROCK.tones.slice(0, ROCK.surfaceTones);
  return [BIOME_STRATA[biome].surface];
}

for (let biome = 0; biome < BIOME_STRATA.length; biome++) {
  // Il solco non ha densita' — lo posa un lotto, non un hash — quindi si scrive
  // fuori dal filtro che salta i biomi dove non cresce niente da se'.
  const crop = GROUND_COVER.cropTone[biome] ?? 0;
  if (crop !== 0) {
    for (const palette of coverGroundPalettes(biome)) {
      const ground = palette * COVER_STRIDE;
      coverToneTable[ground + COVER.cropX] = crop;
      coverFormTable[ground + COVER.cropX] = COVER_FORM.rowX;
      coverToneTable[ground + COVER.cropY] = crop;
      coverFormTable[ground + COVER.cropY] = COVER_FORM.rowY;
    }
  }

  if ((GROUND_COVER.density[biome] ?? 0) <= 0) continue;
  const grass = GROUND_COVER.grassTone[biome] ?? 0;
  const accent = GROUND_COVER.accentTone[biome] ?? 0;

  for (const palette of coverGroundPalettes(biome)) {
    const ground = palette * COVER_STRIDE;
    if (grass !== 0) {
      coverToneTable[ground + COVER.grass] = grass;
      coverFormTable[ground + COVER.grass] = COVER_FORM.tuft;
    }
    if (accent !== 0) {
      coverToneTable[ground + COVER.accent] = accent;
      coverFormTable[ground + COVER.accent] = grass !== 0 ? COVER_FORM.bloom : COVER_FORM.pebble;
    }
  }
}

/**
 * Indice di palette di una copertura appoggiata su `ground`, o 0 se su quel
 * terreno quel tipo di copertura non esiste.
 *
 * Lo zero non e' un caso di errore ed e' anzi la risposta piu' frequente sui
 * chunk edificati: un marcatore sopravvissuto a una strada che ha ripavimentato
 * la colonna sotto di lui non trova piu' il suo terreno, e sparisce invece di
 * mettersi un ciuffo d'erba sull'asfalto.
 */
export function coverToneOn(ground: number, kind: number): number {
  return kind < COVER_STRIDE ? coverToneTable[ground * COVER_STRIDE + kind] : 0;
}

/** Forma di una copertura appoggiata su `ground`, o `COVER_FORM.none`. */
export function coverFormOn(ground: number, kind: number): CoverForm {
  const form = kind < COVER_STRIDE ? coverFormTable[ground * COVER_STRIDE + kind] : 0;
  return form as CoverForm;
}
