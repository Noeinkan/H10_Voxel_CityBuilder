/**
 * Quanto spazio serve perche' un soggetto non ne copra un altro.
 *
 * **E' l'unico posto in cui il conto dell'occlusione sta scritto**, e lo leggono
 * tutti e tre i posti che collocano qualcosa nel campionario: le tre fasce di
 * `swatchLayout.ts`, le quattro gallerie di `swatchCatalog.ts` e il test che
 * verifica che nessuna riga sparisca dietro quella davanti. Tre copie della
 * stessa trigonometria divergerebbero al primo ritocco, ed e' gia' successo:
 * la formula che stava nel commento dell'interasse della matrice sbagliava per
 * difetto, e la griglia era occlusa piu' di quanto dichiarasse.
 *
 * ## Il conto
 *
 * A `REST_PITCH` la camera guarda da `(+x, +y, +z)`. Proiettando con
 * `s = sin(pitch)` e `c = cos(pitch)`:
 *
 * ```
 * r(x, y)    = (y - x) / √2                 // ascissa a schermo
 * u(x, y, z) = c·z - (s/√2)·(x + y)         // ordinata a schermo
 * ```
 *
 * Da qui viene il rapporto due che l'isometrica vera promette — un voxel di
 * quota vale `c`, uno di profondita' `s/√2 = c/2 — ma **quel rapporto non e' la
 * risposta**: due soggetti a `y` diverse non stanno uno sopra l'altro a schermo,
 * perche' cambia anche `r`. La domanda giusta si fa a `r` costante, cioe' lungo
 * una colonna di pixel: li' `y - x` e' fisso e resta
 *
 * ```
 * u = c·(z - y) + s·r
 * ```
 *
 * cioe' **un voxel di y vale esattamente un voxel di z**, non mezzo. Il resto e'
 * aritmetica su due intervalli.
 *
 * ## Le due regole
 *
 * **Dietro** — due file su tutta la larghezza, quella dietro alta `hB`, quella
 * davanti alta `hF`. Lungo una colonna di pixel la fila davanti copre fino a
 * `c·(hF - yF)`, e il punto piu' basso di quella dietro — lo spigolo del suo
 * fronte, che e' anche la faccia che si guarda — sta a `c·(-yB - dB)`. Quella
 * dietro si vede **per intero** quando
 *
 * ```
 * yF - (yB + dB) ≥ hF        cioe' vuoto libero ≥ altezza di chi sta davanti
 * ```
 *
 * e con un vuoto minore ne resta nascosto `hF - vuoto`.
 *
 * **Di fianco** — due soggetti nella stessa fila, il secondo a `x` maggiore.
 * L'ascissa di un riquadro copre `[y0 - x0 - w, y0 + d - x0]`, e il secondo sta
 * a sinistra del primo: le due strisce sono disgiunte quando
 *
 * ```
 * vuoto libero ≥ d del soggetto a x maggiore
 * ```
 *
 * Qui l'altezza non entra affatto, ed e' il motivo per cui una fila di
 * megastrutture si separa a poco prezzo: basta un vuoto pari alla loro
 * profondita', non al doppio della loro quota.
 */

/**
 * Vuoto in y che serve per non coprire niente di cio' che sta dietro.
 *
 * `frontHeight` si misura **dal piano di terra**, basamento compreso: e' la
 * quota a cui il soggetto arriva, non la sua altezza sopra il proprio zoccolo.
 */
export function clearanceBehind(frontHeight: number): number {
  return Math.max(0, Math.ceil(frontHeight));
}

/**
 * Quanto resta nascosto di cio' che sta dietro, con questo vuoto.
 *
 * Zero o meno vuol dire che si vede tutto. Lo consuma il test dell'interasse
 * della matrice, l'unico posto del campionario che accetta di nascondere
 * qualcosa — il podio sotto `CELL_LEDGE` — e che percio' deve poterlo misurare
 * invece di dichiararlo.
 */
export function hiddenBehind(frontHeight: number, gap: number): number {
  return frontHeight - gap;
}

/**
 * Vuoto in x che impedisce al vicino di sovrapporsi di fianco.
 *
 * `nextDepth` e' la profondita' del soggetto **a x maggiore**, quello piu'
 * vicino alla camera: e' lui che scivola a sinistra sopra l'altro.
 */
export function clearanceBeside(nextDepth: number): number {
  return Math.max(0, Math.ceil(nextDepth));
}
