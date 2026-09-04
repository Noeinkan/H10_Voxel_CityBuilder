import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { BAND_OP, type BandOp } from './grammar';

/** Proporzioni e colori di una classe. */
export interface ClassProfile {
  /**
   * Altezza di una fascia, estremi inclusi.
   *
   * Una fascia e' un piano. A quattro-sei voxel invece di due-tre, la cornice
   * sulla sua sommita' ha sotto di se' una parete vera: e' cosi' che nascono le
   * righe di piano che danno la scala all'edificio, che a due voxel erano la
   * meta' della fascia e non si leggevano come marcapiano.
   */
  readonly bandHeight: readonly [number, number];

  /**
   * Quanto la classe tende a restringersi salendo, in 0..1.
   *
   * A 1 ogni fascia rientra e l'edificio e' un gradone; a 0 le fasce si spostano
   * e sporgono senza rimpicciolire, e l'edificio resta un blocco irregolare.
   */
  readonly shrinkBias: number;

  /**
   * Trasformazioni provate quando il tiro cade sotto `shrinkBias`, in ordine.
   *
   * Si prende la prima che regge i vincoli, quindi l'ordine e' una preferenza e
   * non un'alternativa: mettere `setback` in testa significa "questo uso arretra
   * profondo quando puo', e ripiega su una rientranza normale quando non ci sta".
   * E' qui, e non in `TypologyShape`, perche' `typologyProfile` fonde gia' il
   * profilo dell'uso con quello della tipologia: una riga di catalogo puo'
   * sovrascrivere il repertorio senza una riga di plumbing in piu'.
   */
  readonly shrinkOps: readonly BandOp[];

  /** Trasformazioni provate quando il tiro cade sopra `shrinkBias`, in ordine. */
  readonly growOps: readonly BandOp[];

  /** Preferenza di impronta applicata al tiro comune, prima del clamp di livello. */
  readonly footprintBias: number;

  /**
   * Passo dei montanti di facciata, in voxel. Sotto due, la parete resta piena.
   *
   * **E' l'unica cosa che spezza una parete in verticale, e serve perche' la
   * grammatica delle fasce non ci arriva.** Con `MAX_FOOTPRINT` a otto e
   * `GRAMMAR.minBandSide` a quattro il gioco totale della sagoma e' due voxel
   * per lato: su una torre da centoquaranta si esaurisce entro il primo quinto,
   * e sopra restano ottanta voxel di corpo che possono solo *scorrere*. Da li'
   * in su a raccontare la scala c'e' la sola facciata, e finora la facciata era
   * un colore con una riga ogni fascia.
   *
   * **Conta i montanti, non le aperture**, e la differenza si vede proprio dove
   * conta: un fronte da quattro — la larghezza a cui ogni torre alta finisce —
   * ha due sole colonne fra i cantonali, e un passo contato sulle aperture puo'
   * non trovarne nessuna. Contando i montanti ce n'e' sempre almeno una.
   */
  readonly bayPeriod: number;

  /** Corpo. */
  readonly body: number;
  /** Cornice: il voxel di sommita' di ogni fascia. */
  readonly bodyAlt: number;
  /** Faccia d'accento, e corpo intero quando l'accento sale di scala. */
  readonly accent: number;
  /** Coronamento. */
  readonly crown: number;
  /** Zoccolo a contatto col terreno. */
  readonly plinth: number;
  /** Unico dettaglio verticale sul tetto. */
  readonly roofProp: number;
  /** Altezza del dettaglio sul tetto. */
  readonly roofPropHeight: number;
  /**
   * Pavimentazione dell'anello scoperto lasciato da una rientranza.
   *
   * Una terrazza non e' una fascia in piu': e' la sommita' della fascia sotto
   * dove quella sopra non arriva, che la grammatica produce da sempre e che
   * finora restava verniciata come una parete qualunque.
   */
  readonly terrace: number;
  /** Verde del giardino pensile, quando la tipologia lo chiede. */
  readonly garden: number;
}

/**
 * I quattro usi urbani, indicizzati come `BUILDING_CLASS`.
 *
 * E' il colore e la proporzione *di base* di un uso: la tipologia
 * (`typologies.ts`) ne sovrascrive quel che le serve. Un uso senza tipologia
 * riconosciuta resta comunque leggibile, ed e' cio' che tiene in piedi la citta'
 * anche nelle colonne che non esprimono niente di particolare.
 *
 * I colori escono tutti dai 32 slot esistenti: l'uniform `vec3[32]` e' un
 * invariante del progetto, e un edificio non e' una buona ragione per
 * consumarne uno nuovo.
 */
export const CLASS_PROFILE: readonly ClassProfile[] = [
  // residenziale — moduli terrazzati e scafi chiari, massa di fondo della citta'.
  {
    bandHeight: [4, 6],
    // **Alzarlo non produce piu' terrazze, ed e' stato misurato.** A 0,46 le
    // celle di terrazza su ventiquattro torri di livello dodici passano da 222 a
    // 224: il collo di bottiglia non e' la frequenza del ramo che rimpicciolisce
    // ma `minBandSide`, che il corpo residenziale tocca entro le prime fasce —
    // da li' in su nessuna rientranza regge e il ripiego passa al ramo che
    // sposta. Chi vuole piu' gradoni qui alzi l'impronta o il minimo di fascia,
    // non questo numero.
    shrinkBias: 0.38,
    // Arretra profondo quando lo spazio c'e': e' l'uso che deve produrre le
    // terrazze abitabili, ed e' anche quello che ne ha piu' bisogno per non
    // leggersi come una fila di scatole.
    shrinkOps: [BAND_OP.setback, BAND_OP.shrink, BAND_OP.shrinkOneSide, BAND_OP.jog],
    growOps: [BAND_OP.jog, BAND_OP.grow, BAND_OP.shrinkOneSide],
    footprintBias: 2,
    // Montanti radi e aperture larghe due: e' l'uso che deve leggersi come
    // abitato, e due voxel di apertura sono la loggia che una terrazza promette.
    bayPeriod: 3,
    body: PALETTE_SLOTS.concretePale,
    bodyAlt: PALETTE_SLOTS.glassDeep,
    accent: PALETTE_SLOTS.glass,
    crown: PALETTE_SLOTS.roofPale,
    plinth: PALETTE_SLOTS.metalDark,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 4,
    terrace: PALETTE_SLOTS.stone,
    garden: PALETTE_SLOTS.grass,
  },
  // commerciale — fronti caldi e bassi, insegne d'ottone, tetti larghi.
  {
    bandHeight: [4, 6],
    shrinkBias: 0.40,
    // **`setback` entra in testa, e prima non c'era affatto: e' la riga che da'
    // al commercio le sue terrazze.** Arretrava solo con `shrink`, che toglie un
    // passo **per lato**: la pianta si stringe quanto con un `setback`, ma
    // l'anello scoperto che resta e' largo un passo, e `terraceMinRing` lo
    // scarta apposta — a distanza di gioco e' un gradino, non un luogo dove si
    // sta. Ne seguiva che un isolato commerciale non produceva **una** terrazza
    // per quanto salisse: misurato su ventiquattro torri di livello dodici, zero
    // celle di terrazza contro le 222 del residenziale. Con `setback` in testa e
    // il ramo pescato piu' spesso sono 442.
    shrinkOps: [BAND_OP.setback, BAND_OP.shrink, BAND_OP.shrinkOneSide, BAND_OP.jog],
    growOps: [BAND_OP.jog, BAND_OP.grow, BAND_OP.keep],
    footprintBias: 2,
    // Grana fitta: un fronte in mattoni alterna pieno e vuoto a ogni colonna, ed
    // e' quella cadenza stretta a distinguerlo da una parete vetrata.
    bayPeriod: 2,
    body: PALETTE_SLOTS.brick,
    bodyAlt: PALETTE_SLOTS.brickLight,
    accent: PALETTE_SLOTS.metalBrass,
    crown: PALETTE_SLOTS.roofPale,
    plinth: PALETTE_SLOTS.stoneWarm,
    roofProp: PALETTE_SLOTS.metalGold,
    roofPropHeight: 4,
    terrace: PALETTE_SLOTS.stoneWarm,
    garden: PALETTE_SLOTS.grassLight,
  },
  // industriale — megastrutture compatte, corazze e apparati di dissipazione.
  {
    bandHeight: [4, 6],
    shrinkBias: 0.18,
    // `keep` in testa al ramo che sale: un capannone e' un corpo continuo, e
    // prima l'unico modo di ottenerlo era che tutte le candidate fallissero.
    shrinkOps: [BAND_OP.shrinkOneSide, BAND_OP.jog],
    growOps: [BAND_OP.keep, BAND_OP.jog, BAND_OP.grow],
    footprintBias: 2,
    // Passo largo e due toni scuri accostati: non sono finestre ma pannelli di
    // lamiera, che e' esattamente cio' che un capannone ha al posto delle
    // finestre. Il ritmo spezza la parete senza promettere che dentro si abiti.
    bayPeriod: 4,
    body: PALETTE_SLOTS.stoneDeep,
    bodyAlt: PALETTE_SLOTS.metalDark,
    accent: PALETTE_SLOTS.metalRust,
    crown: PALETTE_SLOTS.metalDark,
    plinth: PALETTE_SLOTS.asphaltDark,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 6,
    terrace: PALETTE_SLOTS.asphalt,
    garden: PALETTE_SLOTS.grassDark,
  },
  // civico — guglie vetrate ed esoscheletri chiari, i landmark dello skyline.
  {
    bandHeight: [6, 8],
    shrinkBias: 0.62,
    // `stack` in testa: il civico e' l'uso che deve produrre corpi sovrapposti,
    // cioe' una torre che riparte piu' stretta invece di assottigliarsi.
    shrinkOps: [BAND_OP.stack, BAND_OP.shrink, BAND_OP.shrinkOneSide],
    growOps: [BAND_OP.jog, BAND_OP.shrink, BAND_OP.grow],
    footprintBias: 0,
    // Curtain wall: montante ogni tre, e la cornice di fascia e' dello stesso
    // vetro delle aperture. E' la classe che sale piu' in alto — quella su cui
    // la sagoma finisce prima il fiato — quindi e' anche quella che ha piu'
    // bisogno di una parete che dica dove finisce un piano.
    bayPeriod: 3,
    body: PALETTE_SLOTS.concreteWhite,
    bodyAlt: PALETTE_SLOTS.glassPale,
    // Era `glassDeep`, l'unico accento troppo scuro per emettere: da quando il
    // bagliore prende il colore dello slot, un blu profondo spegneva proprio la
    // classe che sullo skyline deve leggersi da piu' lontano.
    accent: PALETTE_SLOTS.glassPale,
    crown: PALETTE_SLOTS.roofWhite,
    plinth: PALETTE_SLOTS.concrete,
    roofProp: PALETTE_SLOTS.metalBrass,
    roofPropHeight: 6,
    terrace: PALETTE_SLOTS.concreteLight,
    garden: PALETTE_SLOTS.grassPale,
  },
];
