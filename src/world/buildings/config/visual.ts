/**
 * Le cinque soglie visuali condivise: quanto un edificio e' cresciuto, in
 * linguaggio di facciata e coronamento.
 *
 * **Sono soglie condivise, non una quarta leva.** Il livello resta l'unica cosa
 * che fa crescere un edificio, e la massa la dice `levels.ts`; qui sta soltanto
 * *quando* il dettaglio cambia volto a parita' di massa. Un edificio di livello
 * quattro non e' piu' alto di uno di livello tre solo nei voxel: ha anche la
 * campata, il fronte acceso e — piu' su — terrazze attrezzate e un coronamento
 * che cresce. La microgeometria non conosce il livello: reagisce alla superficie
 * e alla geometria che `paint` emette **solo oltre** la soglia, quindi le soglie
 * sono il solo punto in cui "cresciuto" si traduce in linguaggio.
 *
 * **Due soglie esistevano gia'**, scritte in `GRAMMAR` come
 * `luminousFromLevel` e `luminousFullLevel`: erano le stesse quote di
 * `consolidated` e `mature`, e ora `GRAMMAR` le importa da qui invece di
 * ripeterle. Il resto della scala — campata, terrazze attrezzate, coronamento —
 * e' nuovo e usa le stesse soglie: e' cio' che le rende *condivise* invece che
 * una collezione di numeri che per caso coincidono.
 *
 * **Il livello 13 sta sotto `SCALE.maxLevel`** e deve starci: sopra di lui la
 * scala continua a dare massa (fasce, impronta) ma non un altro volto — la
 * progressione visiva si e' compiuta, e resta la gerarchia verticale a decidere
 * se una colonna puo' salirci.
 */
export const VISUAL_LEVELS = {
  /** Edificio base: volume, zoccolo, portale. Niente ritmo, niente luci. */
  base: 0,
  /** Consolidato: la campata spezza la facciata e la faccia d'accento si accende. */
  consolidated: 2,
  /** Maturo: la faccia d'accento e' una lama intera, il fronte e' attivo. */
  mature: 4,
  /** Torre: le terrazze diventano attrezzate e il coronamento cresce. */
  tower: 8,
  /** Skyline: coronamento pieno e dettaglio verticale garantito. */
  skyline: 13,
} as const;

/**
 * Quanto il coronamento cresce oltre la soglia di torre e oltre quella di
 * skyline, in voxel.
 *
 * E' la sola voce di questa tabella che tocca la **massa**: un tetto piu' alto
 * e' un edificio piu' alto. Non e' un privilegio della torre — la cima e' il
 * luogo in cui un edificio dice quanto e' cresciuto senza che il corpo cambi
 * grammatica, e due voxel sono un cubo di terreno, cioe' il piu' piccolo salto
 * che a distanza isometrica si legga come «piu' cima» invece che come un bordo
 * storto.
 */
export const VISUAL_CROWN_BONUS = {
  tower: 2,
  skyline: 4,
} as const;

/**
 * Altezza minima del dettaglio verticale sul tetto alla soglia di skyline.
 *
 * La cima piena di un edificio arrivato in fondo alla scala porta sempre il suo
 * pennone: e' la riga che chiude la silhouette da lontano, la stessa funzione
 * del collarino e dell'ago sulle colonne isolate, dichiarata qui perche' il
 * livello e' la leva che la merita.
 */
export const SKYLINE_PROP_HEIGHT = 6;

/**
 * Il bonus di coronamento per il livello indicato.
 *
 * Zero sotto la soglia di torre, due da li' e quattro dallo skyline: e' una
 * scala, non un salto, e le due soglie sono le stesse della tabella sopra.
 */
export function crownBonusOf(level: number): number {
  if (level >= VISUAL_LEVELS.skyline) return VISUAL_CROWN_BONUS.skyline;
  if (level >= VISUAL_LEVELS.tower) return VISUAL_CROWN_BONUS.tower;
  return 0;
}
