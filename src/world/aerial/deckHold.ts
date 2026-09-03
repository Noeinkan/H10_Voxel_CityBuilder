import type { DeckRect } from './deckPlan';

/**
 * L'appiglio di un impalcato: la parete che lo regge, vista da chi sta per
 * cambiare sagoma.
 *
 * **«Chi regge non cresce» era una regola sull'edificio; questa e' una domanda
 * sulla parete.** Il guinzaglio di `supports` fermava la promozione di chiunque
 * portasse qualcosa, e non era la lettura giusta: i quattro canali casuali di
 * `buildings/generate.ts` non dipendono dal livello, quindi a parita' di
 * tipologia e impronta **i piani bassi sono identici a ogni livello** e la
 * parete a cui una mensola e' appesa e' quasi sempre ancora li' dopo la
 * promozione. Fermare tutti per il caso in cui non lo e' costava una torre a
 * ogni Skyport posato.
 *
 * **Pura come `deckPlan.ts`, e per la stessa ragione.** Le due sagome — quella
 * di prima e quella che sta per essere scritta — entrano come predicati, quindi
 * il vincolo del dominio si verifica in ambiente `node` senza mondo, senza
 * stamp e senza registry.
 */

/** Cio' che un edificio porta, ridotto a cio' che la sua promozione deve rispettare. */
export interface DeckHold {
  readonly rect: DeckRect;
  /**
   * Quota a cui la parete lo regge.
   *
   * **Non e' sempre la sua quota di base**, e le due si separano su cosa
   * l'impalcato ha sopra: un impalcato in quota porta la travatura *sotto* il
   * piano, quindi il piano e' la sua ultima quota; una piattaforma di landmark
   * porta invece la propria ricetta sopra il piano, e li' il piano e' la prima.
   */
  readonly z: number;
  /** Prima quota occupata e voxel occupati: il volume che deve restare aria. */
  readonly baseZ: number;
  readonly height: number;
  /**
   * Asse e verso in cui sporge dall'ospite. La parete sta dalla parte opposta.
   *
   * E' lo stesso verso che `AerialDriver.openSideOf` calcola per far partire un
   * percorso dal lato libero: da un capo c'e' il vuoto, dall'altro il muro.
   */
  readonly axis: 0 | 1;
  readonly sign: 1 | -1;
}

/**
 * Perche' una promozione lascerebbe male cio' che l'edificio porta.
 *
 * Sono motivi e non errori, come i rifiuti di `planDeck`: servono ai test, che
 * senza di loro potrebbero solo dire "no" e non "no per la ragione giusta".
 */
export const HOLD_REFUSALS = [
  /** Il volume nuovo occuperebbe il piano: l'impalcato ci finirebbe dentro. */
  'swallowed',
  /** La parete a cui e' appeso non c'e' piu' alla sua quota. */
  'unwalled',
] as const;

export type HoldRefusal = (typeof HOLD_REFUSALS)[number];

/** Una sagoma vista come occupazione del mondo. E' il predicato del vuoto di `AerialProbe`. */
export type SolidAt = (x: number, y: number, z: number) => boolean;

/**
 * null se la sagoma nuova regge ancora questo impalcato, il motivo se no.
 *
 * **Due domande, e sono le due meta' di «sta ancora appeso li'».** Il volume del
 * piano deve restare aria — una sagoma che cresce dentro l'impalcato se lo
 * mangia — e la parete deve reggere ancora alla sua quota.
 *
 * **La parete si misura per differenza, non con una soglia.** Quanto muro
 * servisse lo ha deciso chi ha appeso l'impalcato: una mensola prende tutta la
 * corsa che ha sotto, una piattaforma di facciata si centra sull'intera facciata
 * e ne lascia libero qualche capo. Ricavare qui un minimo vorrebbe dire
 * inventare un terzo numero che nessuna delle due regole conosce; chiedere
 * invece che **nessuna colonna di muro sia sparita** e' la stessa domanda per
 * tutte le forme, e non ha parametri da tarare.
 */
export function holdFits(hold: DeckHold, was: SolidAt, now: SolidAt): HoldRefusal | null {
  const { rect } = hold;
  for (let z = hold.baseZ; z < hold.baseZ + hold.height; z++) {
    for (let dy = 0; dy < rect.sizeY; dy++) {
      for (let dx = 0; dx < rect.sizeX; dx++) {
        if (now(rect.x + dx, rect.y + dy, z)) return 'swallowed';
      }
    }
  }

  // La striscia di parete e' la colonna subito **dentro** rispetto al verso in
  // cui l'impalcato sporge: il riquadro parte per costruzione dalla colonna
  // adiacente al muro, sia per `terraceRect` che per `facadeRect`.
  const along = hold.axis === 0
    ? (hold.sign > 0 ? rect.x - 1 : rect.x + rect.sizeX)
    : (hold.sign > 0 ? rect.y - 1 : rect.y + rect.sizeY);
  const crossFrom = hold.axis === 0 ? rect.y : rect.x;
  const crossTo = crossFrom + (hold.axis === 0 ? rect.sizeY : rect.sizeX) - 1;

  let held = false;
  for (let cross = crossFrom; cross <= crossTo; cross++) {
    const x = hold.axis === 0 ? along : cross;
    const y = hold.axis === 0 ? cross : along;
    if (!was(x, y, hold.z)) continue;
    if (!now(x, y, hold.z)) return 'unwalled';
    held = true;
  }
  // Nessuna colonna di muro nemmeno prima: non e' un appiglio che si puo'
  // misurare, ed e' il caso della gamba che poggia sul tetto del proprio ospite
  // invece di appendersi al suo fianco. Chi non si sa misurare non si promuove.
  return held ? null : 'unwalled';
}
