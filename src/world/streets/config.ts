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

  /**
   * Isolati di margine oltre il riquadro fra i due capi di un raccordo.
   *
   * E' il gioco che la ricerca di `corridor.ts` ha per scansare un ostacolo. A
   * zero il percorso resta chiuso nel rettangolo fra i due isolati e una baia che
   * lo attraversa da parte a parte non ha aggiramento: la ricerca fallisce e il
   * porto resta staccato, cioe' il difetto di partenza. A due, il percorso puo'
   * uscire di quarantaquattro colonne per lato — abbastanza da girare attorno a
   * una darsena o a uno sperone, troppo poco perche' una strada faccia il giro
   * dell'isola per evitare una salita.
   */
  linkMargin: 2,

  /**
   * Isolati oltre i quali un raccordo non si tira piu'.
   *
   * Conta isolati e non colonne, come `BUILDER.blockSearchRadius`, quindi non
   * segue la scala del voxel.
   *
   * **Non e' questo numero a decidere i casi veri, ed e' il motivo per cui e'
   * largo.** Misurato su un'isola generata di lato 256, con una citta' di
   * centosettantotto edifici: i siti di porto veri — terra asciutta che vede
   * l'acqua — stanno **tutti entro cinque isolati** dalla rete gia' dipinta, e
   * quello piu' lontano si collega con due tratti, settantatre colonne di
   * carreggiata e sei frame di posa. Un raggio stretto non li toccherebbe
   * comunque.
   *
   * Chi resta fuori, resta fuori **per l'acqua e non per la distanza**: il sito
   * piu' remoto che l'isola ammette sta a dodici isolati, e sulla retta che lo
   * separa dalla citta' ci sono settantacinque colonne rifiutate contro
   * cinquantaquattro buone. Lo rifiuta `linkMinPaved`, e lo rifiuterebbe a
   * qualunque portata — alzarla da dieci a quarantotto non ha cambiato quel caso
   * di una colonna, ed e' esattamente cio' che si voleva verificare.
   *
   * Resta largo perche' un raggio stretto sarebbe **un secondo gate silenzioso**
   * accanto a quello vero: la taratura del terreno e' per un'isola di lato 512
   * (vedi `src/world/AGENTS.md`), dove le stesse distanze raddoppiano, e un
   * numero tarato sui 256 taglierebbe la meta' di quella mappa senza che niente
   * lo dica. Quarantotto e' la diagonale in isolati alla dimensione di taratura:
   * copre qualunque coppia di punti sulla stessa terra, e lascia la domanda a chi
   * la sa rispondere — non «quanto e' lontano» ma «ci si arriva a piedi asciutti».
   */
  linkReach: 48,

  /**
   * Quanto pesa, in un raccordo, una colonna che non si puo' dipingere.
   *
   * E' l'unico numero che decide se il percorso gira attorno a un ostacolo o ci
   * passa attraverso. A uno peserebbe come una colonna qualunque e la strada
   * andrebbe sempre dritta, riducendo la ricerca a una L; a ventiquattro, un
   * passo che finisce in acqua costa quanto ventiquattro passi buoni, e conviene
   * qualunque aggiramento che stia dentro `linkMargin`.
   */
  linkRefusedCost: 24,

  /**
   * Frazione di colonne dipingibili sotto la quale un passo e' impraticabile.
   *
   * Senza, un raccordo che attraversa una baia si costruisce comunque e dipinge
   * il pugno di colonne che affiorano: quello che si vede non e' una strada ma
   * dei sassi in mezzo all'acqua, che e' peggio del prato di prima perche'
   * *sembra* un errore invece che un'assenza. A meta', un passo deve essere
   * carreggiata per almeno meta' della sua lunghezza — sotto, la ricerca lo
   * scansa, e se non c'e' alternativa il raccordo non nasce affatto.
   */
  linkMinPaved: 0.5,
} as const;
