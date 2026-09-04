import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { TERRAIN } from '../../terrain/config';
import type { ClassProfile } from './classProfile';

/**
 * Numeri della forma dell'isolato: dove cade un lotto e cosa ci guadagna.
 *
 * Stanno qui e non in `streets/config.ts` perche' rispondono a una domanda
 * diversa. Quella li' dice **dove passano le strade**, e la sua risposta vale per
 * la carreggiata come per il marciapiede; questa dice **cosa si costruisce** su un
 * lotto a seconda di dove cade dentro il proprio isolato, che e' una scelta di
 * forma urbana e non di tracciato.
 *
 * **L'angolo cambia forma, non altezza, e la differenza e' misurata.** La
 * versione con un bonus di livello sull'angolo e' esistita ed e' stata tolta:
 * un livello in piu' sui quattro angoli di ogni isolato spegneva i montanti
 * della citta' in quota, e il gate della 4.9 — «ci si muove fra i livelli» —
 * scendeva a zero. Il meccanismo e' quello dichiarato in `aerial/`: chi ospita un
 * impalcato smette di promuovere, quindi spostare in alto il livello di nascita
 * degli angoli cambia chi puo' fare da ospite, e la rete verticale resta senza
 * appigli. Non e' una perdita: a dire «questo e' il vertice dell'isolato»
 * bastano la lanterna, lo smusso e il coronamento d'oro di `cornerTower`, che
 * sono forma e non quota — e la quota resta cio' che `skyline/` decide da solo.
 */
export const BLOCK = {
  /**
   * Quanto un lotto puo' stare lontano da un lato e ancora contare come suo.
   *
   * **Non si chiede il filo esatto.** `placeLot` scorre a passo di
   * `STREETS.align` e l'impronta puo' uscire dispari, quindi fra il lotto e la
   * carreggiata resta spesso un voxel: pretendere il filo direbbe «cuore
   * d'isolato» a un edificio che sta sul fronte strada. Due voxel sono un cubo di
   * terreno, cioe' il passo con cui i lotti si allineano.
   */
  edgeReach: TERRAIN.cellSize,
} as const;

// --- Stili di quartiere ----------------------------------------------------

/**
 * Numeri della scelta dello stile. Vedi `style.ts` per la regola.
 */
export const STYLE = {
  /**
   * Sale che separa «che stile ha questo isolato» da ogni altra domanda posta
   * sulle stesse coordinate.
   *
   * Serve per la ragione gia' scritta per `LANDMARK.variantSalt` e
   * `SKYLINE.peakSalt`, e contro lo stesso inciampo: la maglia stradale deriva
   * gia' da `(seed, kx, ky)`, e senza sale lo stile sarebbe correlato al jitter
   * degli assi — cioe' gli isolati larghi tenderebbero a un colore e quelli
   * stretti a un altro, che e' un motivo che nessuno ha scelto.
   */
  salt: 0x7b19_4c2f,

  /**
   * Isolati di lato che condividono lo stile.
   *
   * **A uno, la citta' e' coriandoli.** Uno stile per isolato sembra la scelta
   * ovvia e produce mattone accanto a vetro accanto a ruggine per tutta
   * l'isola: a distanza di gioco non si legge come quartiere ma come rumore,
   * che e' l'esatto contrario di cio' per cui gli stili esistono. A due, quattro
   * isolati contigui portano la stessa materia — una cinquantina di colonne di
   * lato — e il cambio di tessuto cade su una strada invece che su ogni angolo.
   */
  blocksPerQuarter: 2,
} as const;

/** Gli slot che uno stile puo' ridipingere: il **tessuto**, non l'accento. */
export type StylePalette = Pick<ClassProfile, 'body' | 'bodyAlt' | 'plinth' | 'crown'>;

/**
 * Uno stile: di che materia e' fatto un quartiere.
 *
 * **Non e' una tinta, ed e' la cosa piu' importante da sapere su questa
 * tabella.** I 32 slot sono famiglie di materia — mattone, cemento, pietra,
 * vetro, legno, metallo — e il loro *colore* lo scrive il tema, che e' globale.
 * Uno stile non puo' quindi rendere rosa un isolato e azzurro quello accanto;
 * puo' renderne uno di mattoni e l'altro di vetro, che a distanza di gioco si
 * legge lo stesso e vale in tutti e sette i temi invece che in uno.
 *
 * **Ortogonale all'uso.** La stessa riga vale per una casa, una bottega e un
 * capannone: e' il *luogo* a parlare, non la funzione. Cio' che distingue le
 * funzioni sopravvive comunque, e non per prudenza — `classSurface` da' a ogni
 * uso il proprio linguaggio di superficie, quindi un capannone imbiancato tiene
 * le sue nervature di lamiera e un civico il suo curtain wall.
 *
 * **L'accento resta alla tipologia.** `accent`, `terrace`, `garden` e `roofProp`
 * non sono nella tabella: il tessuto e' del quartiere, l'accento e' di cio' che
 * quell'edificio *fa*. Un mercato del porto dentro un isolato imbiancato esce
 * con le pareti chiare e le insegne d'ottone — che e' la lettura giusta, non un
 * compromesso.
 */
export interface StyleDefinition {
  readonly id: string;
  readonly label: string;
  /**
   * Cio' che lo stile ridipinge. Parziale di proposito: una riga che lascia
   * fuori `bodyAlt` sta dicendo «la cornice la decide l'edificio», ed e' il modo
   * in cui uno stile puo' essere leggero invece che totale.
   */
  readonly palette: Partial<StylePalette>;
}

/**
 * Il catalogo degli stili.
 *
 * Dieci righe, e la prima non dipinge niente: senza un ripiego neutro ogni
 * isolato dell'isola sarebbe caratterizzato, e un tessuto che non tace mai non
 * fa risaltare niente. E' la stessa ragione per cui ogni uso chiude il catalogo
 * delle tipologie con una riga senza condizioni.
 */
export const STYLES: readonly StyleDefinition[] = [
  // Il quartiere che non dichiara niente: resta il profilo dell'uso.
  { id: 'plain', label: 'Plain', palette: {} },
  {
    id: 'brickTown',
    label: 'Brick town',
    palette: {
      body: PALETTE_SLOTS.brick,
      bodyAlt: PALETTE_SLOTS.brickLight,
      plinth: PALETTE_SLOTS.stoneWarm,
      crown: PALETTE_SLOTS.roofPale,
    },
  },
  {
    id: 'timberRow',
    label: 'Timber row',
    palette: {
      body: PALETTE_SLOTS.wood,
      bodyAlt: PALETTE_SLOTS.brickLight,
      plinth: PALETTE_SLOTS.stone,
      crown: PALETTE_SLOTS.roofPale,
    },
  },
  {
    id: 'whitewash',
    label: 'Whitewash',
    palette: {
      body: PALETTE_SLOTS.concreteWhite,
      bodyAlt: PALETTE_SLOTS.concretePale,
      plinth: PALETTE_SLOTS.stone,
      crown: PALETTE_SLOTS.roofWhite,
    },
  },
  {
    id: 'graySlab',
    label: 'Gray slab',
    palette: {
      body: PALETTE_SLOTS.concrete,
      bodyAlt: PALETTE_SLOTS.concreteLight,
      plinth: PALETTE_SLOTS.stoneDark,
      crown: PALETTE_SLOTS.asphaltDark,
    },
  },
  {
    id: 'glassCurtain',
    label: 'Glass curtain',
    palette: {
      body: PALETTE_SLOTS.glassDeep,
      bodyAlt: PALETTE_SLOTS.glassPale,
      plinth: PALETTE_SLOTS.stoneDark,
      crown: PALETTE_SLOTS.metalDark,
    },
  },
  {
    id: 'oxide',
    label: 'Oxide',
    palette: {
      body: PALETTE_SLOTS.metalRust,
      bodyAlt: PALETTE_SLOTS.metalDark,
      plinth: PALETTE_SLOTS.asphaltShadow,
      crown: PALETTE_SLOTS.metalDark,
    },
  },
  {
    id: 'panelRender',
    label: 'Panel render',
    // Intonaco chiaro e pannello scuro: il quartiere di costruzione recente.
    //
    // **Condivide il corpo con `whitewash` e non e' un doppione**, perche' uno
    // stile e' la *coppia* corpo-cornice e non il solo corpo: li' la cornice e'
    // intonaco su intonaco — mezzo gradino di luminanza, cioe' un volume liscio
    // — e qui e' il tono piu' scuro della palette. E' la stessa distanza che
    // `terraceArcade` ha dovuto mettere fra `stone` e `stoneDark` per farsi
    // vedere, portata sull'unica famiglia che ancora non ce l'aveva.
    //
    // Il marcapiano scuro su fondo chiaro e' cio' che a distanza di gioco
    // legge come «serramento continuo» invece che come cornicione: e' il segno
    // dell'edilizia contemporanea, e non costa un voxel in piu' di quella
    // vecchia — cambia quale slot va sul voxel di sommita' della fascia.
    palette: {
      body: PALETTE_SLOTS.concreteWhite,
      bodyAlt: PALETTE_SLOTS.asphaltShadow,
      plinth: PALETTE_SLOTS.asphaltDark,
      crown: PALETTE_SLOTS.asphaltShadow,
    },
  },
  {
    id: 'sandBrick',
    label: 'Sand brick',
    // Il mattone chiaro con gli stessi serramenti scuri: e' `brickTown` detto
    // dall'altro capo del secolo. La famiglia della pietra calda porta il tono
    // sabbia che il mattone rosso non ha — `brick` e' #e0603f, cioe' un
    // laterizio d'epoca — e accostata a una cornice scura da' il fronte in
    // mattoni a vista dei quartieri nuovi invece della cortina ottocentesca.
    palette: {
      body: PALETTE_SLOTS.stoneWarm,
      bodyAlt: PALETTE_SLOTS.asphaltShadow,
      plinth: PALETTE_SLOTS.stoneDeep,
      crown: PALETTE_SLOTS.asphaltShadow,
    },
  },
  {
    id: 'stoneCourt',
    label: 'Stone court',
    palette: {
      body: PALETTE_SLOTS.stone,
      // Stessa correzione fatta su `terraceArcade`, e per la stessa ragione:
      // lo stile si applica **dopo** la tipologia, quindi era questa riga a
      // rimettere la coppia piatta su sette quartieri di pietra su otto. Le due
      // dovevano cambiare insieme o non cambiava niente.
      bodyAlt: PALETTE_SLOTS.stoneDark,
      plinth: PALETTE_SLOTS.stoneDeep,
      crown: PALETTE_SLOTS.roofWhite,
    },
  },
];

const STYLE_BY_ID = new Map<string, StyleDefinition>(
  STYLES.map((entry) => [entry.id, entry]),
);

export function styleById(id: string): StyleDefinition | null {
  return STYLE_BY_ID.get(id) ?? null;
}
