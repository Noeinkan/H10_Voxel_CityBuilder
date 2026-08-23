import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { TERRAIN } from '../terrain/config';

/**
 * Unica fonte di verita' dei numeri degli attraversamenti.
 *
 * Vale la stessa regola di `terrain/config.ts`, `streets/config.ts`,
 * `grading/config.ts`, `landmarks/config.ts` e `spans/config.ts`: nessun altro
 * file di `src/world/crossings/` contiene una lunghezza, una quota o un indice
 * di palette.
 *
 * **Perche' esiste questo dominio, dato che le campate ci sono gia'.** Una
 * campata di `spans/` e' corta per definizione — `SPANS.maxGap` vale dodici — e
 * il suo commento dice gia' cosa sta oltre: «non e' piu' una passerella ma un
 * viadotto, che ha bisogno di appoggi propri a terra». Questo e' quel viadotto.
 * Le due cose non si fondono in una perche' divergono proprio sull'invariante:
 * **una campata non prende suolo, un attraversamento sì**. Metterle nello stesso
 * file significherebbe tenere un ramo per l'invariante di ciascuna dentro ogni
 * funzione, che e' il modo in cui una regola smette di essere leggibile.
 *
 * **Un attraversamento lo chiede il giocatore, una campata no.** E' l'altra
 * differenza, e si vede nel formato: `spans/` esamina tutte le coppie di edifici
 * e ne accetta poche, questo riceve **un click** e deve trovare il compagno
 * migliore da se'. Da qui `chooseCrossing`, che non ha un corrispettivo di la'.
 */

/**
 * Cosa un attraversamento collega.
 *
 * Sono due righe della stessa regola e non due meccanismi: cambia da cosa
 * partono le testate e cosa regge la corsa in mezzo. Il ponte a terra parte
 * dalla riva e si regge su pile proprie; il ponte in quota parte dal corpo di
 * due edifici alti e in mezzo non ha niente — il vuoto sotto e' il contenuto,
 * come per le campate.
 */
export const CROSSING_KIND = {
  /** Da riva a riva, su pile che scendono nel fondale. */
  ground: 0,
  /** Da grattacielo a grattacielo, a quota libera. */
  sky: 1,
} as const;

export type CrossingKind = (typeof CROSSING_KIND)[keyof typeof CROSSING_KIND];

export const CROSSINGS = {
  /**
   * Larghezza dell'impalcato, in voxel.
   *
   * La stessa delle campate, e per la stessa ragione: sei voxel sono tre cubi di
   * terreno, cioe' due filari di parapetto e quattro di passaggio. Un
   * attraversamento e' piu' lungo, non piu' largo — allargarlo con la luce lo
   * farebbe leggere come una piattaforma, e la cosa che deve dire e' «di qua a
   * la'».
   */
  width: 6,

  /**
   * Spessore strutturale sotto la carreggiata, in voxel.
   *
   * Come per le campate: due voxel — un cubo di terreno — bastano perche' di
   * taglio l'impalcato abbia un'altezza propria invece di leggere come un nastro.
   */
  girderDepth: 2,

  /** Colonne, a ciascuna testata, in cui le travi riempiono tutta la larghezza. */
  corbel: 2,

  /**
   * Lunghezza massima di un segmento di comparsa, in voxel.
   *
   * **Gli attraversamenti lunghi si spezzano, non si esentano** — la stessa
   * regola delle campate e delle ricette dei landmark. Qui pesa di piu' che
   * altrove: una corsa da novantasei voxel attraversa tre chunk, e accodarla
   * intera sporcherebbe in un frame quello che il tetto per struttura esiste per
   * distribuire.
   */
  segmentLength: 8,

  /**
   * Luce minima, in voxel.
   *
   * Sotto questa soglia il compito e' gia' di `spans/`, che sa fare una
   * passerella fra due tetti affacciati senza piantare niente a terra. Un
   * attraversamento corto sarebbe una campata con delle pile inutili sotto.
   */
  minLength: 14,

  /**
   * Luce massima, in voxel.
   *
   * Non e' una regola di struttura ma di gioco e di budget: novantasei voxel
   * sono quarantotto cubi di terreno, cioe' tre chunk in fila, ed e' la distanza
   * oltre la quale un ponte smette di essere una scelta e diventa il modo per
   * annullare la geografia. Uno stretto piu' largo di cosi' vuole un traghetto.
   */
  maxLength: 96,

  /**
   * Passo delle pile lungo la corsa, in voxel.
   *
   * Dodici e' la stessa luce massima di una campata: e' la distanza a cui due
   * appoggi si leggono ancora come una coppia e non come una fila di pali. Con
   * `maxLength` a novantasei fanno sette pile al massimo, che e' un ordine di
   * grandezza gestibile per il budget di chunk di una struttura.
   */
  pierSpacing: 12,

  /** Lato di una pila, in voxel. Un cubo e mezzo di terreno: si vede da sotto. */
  pierSide: 3,

  /**
   * Fondale massimo, sotto il livello del mare, su cui una pila puo' poggiare.
   *
   * Piu' profondo di `GRADING.maxQuayDepth`, che vale dodici, e non e' una
   * svista: quello e' il pescaggio di un **muro** di banchina, che deve reggere
   * terra sul retro per tutta la sua altezza. Una pila regge se stessa e un
   * pezzo di impalcato, e per questo va dove una banchina non andrebbe. E'
   * anche la ragione per cui un ponte puo' attraversare uno stretto che nessun
   * terrapieno colmerebbe.
   */
  maxPierDepth: 20,

  /**
   * Quanto lontano dal click si cerca la riva, in voxel.
   *
   * Il click dice «di qua», non «esattamente qui»: e' cio' che un attrezzo a un
   * click deve concedere. Oltre due passi di pila la concessione diventa una
   * sorpresa — il ponte partirebbe da un posto che il giocatore non stava
   * guardando — quindi da li' in poi quella direzione non e' un attraversamento.
   */
  shoreSearch: 24,

  /**
   * Voxel liberi fra la trave piu' bassa e il pelo dell'acqua.
   *
   * E' il franco di navigazione, e ha una ragione che si vede: sotto un ponte
   * devono passare le barche che il porto ormeggia, che sono alte tre voxel piu'
   * la tuga. Sei lascia il margine, ed e' anche cio' che impedisce a un
   * attraversamento di leggere come una diga.
   */
  waterClearance: 6,

  /**
   * Voxel liberi fra la trave e il terreno piu' alto sotto la corsa.
   *
   * Meno del franco sull'acqua: a terra sotto ci passa la citta', non una barca,
   * e un ponte che si alzasse di sei sopra ogni dosso sarebbe sempre in quota
   * anche dove il terreno non lo chiede.
   */
  landClearance: 4,

  /**
   * Quanto la carreggiata di un ponte in quota sta sotto il tetto piu' basso dei
   * due appoggi.
   *
   * Due voxel: l'impalcato entra nel corpo dell'edificio invece di posarglisi
   * sopra, ed e' quella compenetrazione a far leggere l'attacco come un attacco.
   * A filo del tetto il ponte sembrerebbe appoggiato, e alla prima crescita
   * dell'edificio resterebbe sepolto.
   */
  skyDeckDrop: 2,

  /**
   * Quota minima della carreggiata sopra il terreno, per un ponte in quota.
   *
   * E' la soglia che separa questo dominio da `spans/` dal lato dell'immagine, e
   * non della struttura: sotto, un impalcato fra due edifici e' una passerella
   * fra due tetti — cosa che le campate fanno gia', automaticamente e meglio.
   * Ventiquattro voxel sono dodici cubi di terreno, cioe' un edificio intero: da
   * li' in su il ponte sta *nel cielo*, che e' cio' che il giocatore chiede
   * quando lo pretende fra due grattacieli.
   */
  minSkyRise: 24,

  /**
   * Quanto la carreggiata di un ponte a terra sta sopra la riva piu' alta.
   *
   * Serve la spalla: senza, un ponte che parte a filo di riva sulla sponda alta
   * e' un tratto di strada che finisce nell'acqua, e non si legge dove comincia.
   */
  shoreRise: TERRAIN.cellSize,

  /**
   * Colonne di riva che ciascuna testata deve trovare asciutte.
   *
   * Una spalla su un solo voxel di terra e' una spalla su uno scoglio: al primo
   * dosso l'attacco resta sospeso. Quattro colonne sono due cubi di terreno, che
   * e' anche la sporgenza massima che `GRADING.quayReach` concede a una banchina.
   */
  abutment: 4,

  /** Carreggiata: la stessa pietra della banchina, perche' e' suolo pubblico. */
  deckPalette: PALETTE_SLOTS.stone,

  /** Travi e pile: cemento, come i pylon del viadotto del trasporto. */
  girderPalette: PALETTE_SLOTS.concrete,

  /** Coronamento di una pila, l'unico voxel che si vede di taglio dall'acqua. */
  pierCoping: PALETTE_SLOTS.concretePale,
} as const;
