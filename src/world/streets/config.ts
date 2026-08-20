import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { TERRAIN } from '../terrain/config';

/**
 * Unica fonte di verita' dei numeri della rete stradale.
 *
 * Vale la stessa regola di `terrain/config.ts`, `sim/balance.ts` e
 * `buildings/config.ts`: nessun altro file di `src/world/streets/` contiene un
 * passo, una larghezza o un indice di palette. Se la maglia viene troppo fitta o
 * troppo larga la risposta sta qui, mai nel generatore che la disegna.
 *
 * **Perche' una griglia deformata e non un tracciato.** Un tracciato vero —
 * crescita a L-system, minimi percorsi fra poli — non e' una funzione della
 * colonna: dipende dall'ordine in cui e' cresciuto, va conservato, va
 * aggiornato quando arriva un catalizzatore, e va serializzato. Una griglia con
 * passo variabile e' invece **pura**: `(seed, x, y)` bastano a dire se una
 * colonna e' carreggiata, e questo la rende gratis da interrogare, immune
 * all'ordine di visita e a costo zero di memoria. La varieta' che perde in
 * topologia la recupera nel passo, nella gerarchia e soprattutto nel terreno,
 * che ritaglia la maglia sulla forma dell'isola senza che nessuno la disegni.
 */
export const STREETS = {
  /**
   * Distanza nominale fra due assi consecutivi.
   *
   * E' il numero che decide la scala della citta'. Ventidue colonne con
   * l'impronta massima a otto lasciano un isolato che ospita tre edifici per
   * lato piu' un cuore libero: sotto le diciotto il cuore sparisce e la citta'
   * diventa una scacchiera di edifici attaccati, sopra le trenta gli isolati
   * leggono come campi recintati invece che come isolati.
   */
  pitch: 22,

  /**
   * Scostamento massimo di un asse dalla sua posizione nominale.
   *
   * E' l'unica cosa che separa questa maglia da un reticolo perfetto, e va
   * tenuta sotto meta' del passo: a `pitch / 2` due assi consecutivi possono
   * toccarsi e l'isolato fra loro sparisce. A quattro, il lato di un isolato
   * varia fra 14 e 30 colonne — abbastanza da non leggersi come una griglia, mai
   * abbastanza da non ospitare l'impronta massima.
   */
  jitter: 4,

  /** Un asse ogni quanti e' principale. */
  arterialEvery: 4,

  /**
   * Passo con cui assi e lotti si allineano.
   *
   * E' il cubo di terreno. Il terreno sta a quote multiple di `cellSize` e
   * cambia quota solo al confine fra due cubi: un lotto che parte a meta' di un
   * cubo si trova sotto l'impronta due quote diverse dove il terreno e' piatto,
   * e le opere gli mettono sotto un riempimento che nessun dislivello vero
   * giustifica. Allineando, un edificio poggia su cubi interi.
   *
   * Vale sia per lo scostamento degli assi sia per lo scorrimento del lotto
   * lungo il fronte: allinearne uno solo non basterebbe.
   */
  align: TERRAIN.cellSize,

  /**
   * Larghezza della carreggiata di un asse secondario.
   *
   * Due voxel, cioe' un cubo di terreno: una carreggiata da un voxel sarebbe
   * meta' del cubo su cui e' dipinta, e leggerebbe come una crepa invece che
   * come una strada.
   */
  minorWidth: 2,

  /**
   * Larghezza della carreggiata di un asse principale.
   *
   * La gerarchia si legge dalla larghezza prima che dal colore: a distanza di
   * gioco due colori di asfalto sono lo stesso grigio, due larghezze no.
   */
  arterialWidth: 4,

  /** Colore della carreggiata secondaria. */
  minorPalette: PALETTE_SLOTS.asphalt,

  /** Colore della carreggiata principale. */
  arterialPalette: PALETTE_SLOTS.asphaltDark,
} as const;
