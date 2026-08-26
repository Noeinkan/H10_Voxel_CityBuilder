import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { GRADING } from '../grading/config';
import { SURFACE_KIND } from '../visualBlock';
import { PART, box, type Part } from './parts';

/**
 * Scorciatoie condivise fra le ricette dei landmark.
 *
 * Non sono astrazioni: sono nomi per gli argomenti posizionali, cosi' che una
 * riga di ricetta si legga come una frase invece che come nove numeri. `box` sta
 * in `parts.ts`, accanto al vocabolario che nomina; qui restano le scorciatoie
 * che parlano di catalizzatori e tornano utili a piu' di una ricetta.
 *
 * Vive in un file suo perche' le tabelle che lo usano sono ormai piu' d'una:
 * le dodici ricette storiche in `config.ts` e le nuove in `recipes/`.
 */

/**
 * Una gru di banchina: gamba, braccio a sbalzo sull'acqua, contrappeso.
 *
 * E' l'unica ricetta che si ripete tre volte con il solo `y` diverso, ed e' cio'
 * che rende il porto leggibile da lontano: la fila di bracci sopra la linea
 * dell'acqua e' la firma verticale del ruolo.
 */
export function craneAt(y: number): readonly Part[] {
  return [
    box(PART.mast, 9, y, 2, 3, 1, 12, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial),
    box(PART.boom, 9, y, 11, 2, 13, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
      cap: PALETTE_SLOTS.metalBrass,
    }),
    box(PART.slab, 6, y, 3, 2, 13, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial),
  ];
}

/**
 * Il piano di una banchina o di un molo: pietra alla quota del piano finito.
 *
 * **Qui non c'e' piu' nessuna darsena disegnata, ed e' il punto.** Fino alla 4.x
 * il porto scriveva l'acqua dentro il proprio stamp, perche' le opere portavano
 * *tutta* l'impronta alla quota della banchina e sotto non restava mare da
 * mostrare. Il risultato era una piattaforma rettangolare in mezzo al golfo con
 * dentro una pozza piu' alta del mare che la circondava. Ora l'opera si getta
 * solo sotto le colonne che una parte occupa (`stampFootprint` piu' la maschera
 * di `buildWorks`), quindi **la darsena e' il mare che c'era**: la ricetta la
 * ottiene non disegnando niente.
 */
export function quay(x: number, y: number, w: number, h: number): Part {
  return box(PART.deck, x, y, w, h, 0, 1, GRADING.quayDeck, SURFACE_KIND.utility);
}

/**
 * Una bitta d'ormeggio: un cubo di ghisa sul filo della banchina.
 *
 * E' la parte piu' piccola del catalogo e serve a una cosa sola: dire dove
 * finisce la pietra e comincia l'acqua. Su un molo lungo quattordici colonne il
 * bordo e' altrimenti una linea sola, e a distanza isometrica una linea non ha
 * spessore.
 */
export function bollard(x: number, y: number): Part {
  return box(PART.mast, x, y, 1, 1, 1, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial);
}

/**
 * Un vano d'ingresso: la parete riscritta con il linguaggio del portale.
 *
 * **Non disegna niente di piu' di una scatola**, e proprio per questo vale la
 * pena: `SURFACE_KIND.portal` e' il canale su cui il mesher aggancia montanti,
 * architrave e pensilina — sono gia' scritti in `microGeometry.ts` — e nessuna
 * ricetta di landmark lo usava. Otto strutture pubbliche senza una porta erano
 * otto volumi in cui non si entra, e la pensilina sopra l'ingresso e' il
 * dettaglio che a distanza di gioco dice «qui si entra» meglio di qualunque
 * differenza di colore.
 *
 * Va disegnato **dopo** la parete che buca: `put` sovrascrive, e un vano e'
 * esattamente questo, la stessa colonna con un altro linguaggio.
 */
export function entrance(x: number, y: number, w: number, h: number, height: number): Part {
  return box(PART.slab, x, y, w, h, 1, height, PALETTE_SLOTS.glassDeep, SURFACE_KIND.portal);
}

/**
 * Una fascia d'insegna: la parete riscritta con il linguaggio luminoso.
 *
 * Stessa idea del vano, altro canale. `emitLuminous` le mette attorno una
 * cornice di 1/16 e il fragment le da' emissione notturna, quindi una fascia
 * costa una riga di tabella e rende il landmark visibile **anche di notte** —
 * che per una struttura civica alta venti voxel e' meta' del tempo di gioco.
 *
 * Resta una fascia e non una facciata: la superficie luminosa frammenta la
 * fusione del greedy mesher, e vestirci un volume intero si paga in quad su
 * ogni parete vicina.
 */
export function signBand(x: number, y: number, w: number, h: number, z: number): Part {
  return box(PART.slab, x, y, w, h, z, 1, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous);
}

/**
 * Un albero: tronco sottile e chioma squadrata.
 *
 * Non riusa `writeTree` di `terrain/decor.ts`, e non per distrazione: quella
 * scrive nel `VoxelWorld` a coordinate di mondo, mentre qui siamo dentro uno
 * stamp che non sa dove finira'. Alla scala del parco la differenza fra una
 * chioma profilata e un cubo verde su un tronco non si vede; la differenza fra
 * uno stamp puro e uno che conosce il mondo si vedrebbe in ogni test.
 */
export function tree(x: number, y: number): readonly Part[] {
  return [
    box(PART.mast, x + 1, y + 1, 1, 1, 1, 4, PALETTE_SLOTS.wood, SURFACE_KIND.plain),
    box(PART.slab, x, y, 3, 3, 5, 3, PALETTE_SLOTS.grassDark, SURFACE_KIND.plain, {
      cap: PALETTE_SLOTS.grassLight,
    }),
  ];
}
