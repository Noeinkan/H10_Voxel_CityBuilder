/**
 * Una scelta fra N come **una pista sola**, non N scatole.
 *
 * Quattro bottoni bordati uno accanto all'altro si leggevano come quattro
 * comandi indipendenti — quattro cornici, quattro fondi, quattro ombre — mentre
 * la domanda e' una: *quale dei quattro*. Il bordo che porta informazione e'
 * quello del gruppo; dentro, cio' che distingue la scelta in corso e' **dove sta
 * la pastiglia**, e non l'ennesimo rettangolo.
 *
 * Qui vive solo la meccanica della pista, non l'aspetto: il nome della classe
 * arriva da fuori proprio perche' le superfici che la usano parlano vocabolari
 * diversi — l'HUD ha i token di `hud.css`, il titolo e il menu di pausa hanno i
 * colori scritti a mano di `titleScreen.css`, e quella separazione e' voluta.
 * Due classi, un solo meccanismo.
 *
 * I bottoni restano quelli di prima e continuano a dichiarare il proprio stato
 * come sempre (`aria-pressed`, o `data-active` nell'HUD): la pastiglia lo
 * **legge**, non lo tiene. Nessuna superficie ha percio' un secondo stato da
 * ricordare, che e' la parte che diverge al primo cambio.
 */

/**
 * L'indice della cella accesa, o `-1` se non ce n'e' nessuna.
 *
 * **"Nessuna accesa" non e' "la prima".** E' la pista appena costruita, prima
 * che lo stato le arrivi da fuori: la fila dell'anno lo sa solo dal giro di
 * aggiornamento dell'HUD, che legge il calendario ogni 150 ms, e le piste del
 * menu di pausa aspettano il primo `setSeason`. Trattarlo come zero
 * parcheggerebbe la pastiglia su una scelta che nessuno ha fatto — «Spring» su
 * una citta' d'estate — quindi chi disegna lo distingue e la fa sparire.
 *
 * La pausa **non** e' questo caso: il suo bottone e' la prima cella della
 * pista del tempo e si accende come le velocita', quindi li' la pastiglia ha
 * sempre dove stare.
 */
export function pickedIndex(states: readonly boolean[]): number {
  return states.findIndex((on) => on);
}

/**
 * La pista vuota, pronta a ricevere i bottoni.
 *
 * La pastiglia entra per prima e resta il primo figlio: e' fuori dal flusso —
 * assoluta — quindi l'ordine non conta per l'occhio, ma sta in testa perche'
 * cosi' nessuno dei bottoni finisce mai a coprirla senza dirlo.
 */
export function segmentedRow(className: string): HTMLElement {
  const track = document.createElement('div');
  track.className = className;
  // Un gruppo e non un `radiogroup`: i bottoni dentro sono `button` con
  // `aria-pressed`, e promettere semantiche da radio senza le frecce che le
  // accompagnano direbbe a chi legge con la tastiera una cosa falsa.
  track.setAttribute('role', 'group');
  const pill = document.createElement('span');
  pill.className = `${className}-pill`;
  pill.setAttribute('aria-hidden', 'true');
  track.appendChild(pill);
  return track;
}

/** I bottoni della pista, in ordine: la pastiglia non e' una cella. */
export function segmentedCells(track: HTMLElement): HTMLButtonElement[] {
  return Array.from(track.querySelectorAll<HTMLButtonElement>(':scope > button'));
}

/**
 * Sposta la pastiglia sulla cella accesa.
 *
 * Va chiamata **dopo** che i bottoni hanno cambiato stato, e da ogni strada che
 * li cambia: il clic, il tasto, e il tempo che passa da solo.
 *
 * Quando non c'e' nessuna cella accesa l'indice resta l'ultimo buono e cambia
 * solo `data-picked`: la pastiglia svanisce dov'era invece di scivolare in
 * prima posizione mentre sparisce, che si leggerebbe come una scelta.
 */
export function paintSegmented(track: HTMLElement): void {
  const cells = segmentedCells(track);
  const index = pickedIndex(
    cells.map((cell) => cell.getAttribute('aria-pressed') === 'true' || cell.dataset.active === 'true'),
  );
  track.style.setProperty('--segment-count', String(Math.max(1, cells.length)));
  if (index >= 0) track.style.setProperty('--segment-index', String(index));
  track.dataset.picked = index >= 0 ? 'true' : 'false';
}
