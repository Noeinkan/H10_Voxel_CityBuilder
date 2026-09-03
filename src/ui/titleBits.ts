/**
 * I mattoni delle due superfici vestite da `titleScreen.css`.
 *
 * Sono due e si somigliano di proposito: la porta d'ingresso e il menu di pausa
 * pongono la stessa domanda — quale citta', e come si guarda — e chi torna dal
 * gioco al menu non deve reimparare dove stanno le cose. Quello che cambia e' il
 * fondo: un cielo prima che il mondo esista, la citta' sfocata quando c'e' gia'.
 *
 * Qui vive solo cio' che non sa quale delle due sta disegnando: un titoletto, una
 * riga di nota, un bottone piccolo. Stessa divisione di `drawerBits.ts` per i
 * cassetti dell'HUD, con un vocabolario diverso — questi non conoscono i token di
 * `hud.css`, perche' meta' di loro si disegna prima che quel foglio esista.
 */

/** Il titoletto di un gruppo dentro una sottoschermata. */
export function titleGroup(text: string): HTMLElement {
  const label = document.createElement('h3');
  label.className = 'title-group';
  label.textContent = text;
  return label;
}

/** Una riga di prosa: spiega, avverte, o riferisce un esito. */
export function titleNote(text = ''): HTMLElement {
  const note = document.createElement('p');
  note.className = 'title-note';
  note.textContent = text;
  return note;
}

/** Il bottone secondario: un gesto su una riga, non una voce di menu. */
export function titleSmall(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'title-small';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/** Il corpo di una sezione: una colonna sola, come tutto il resto della pagina. */
export function titleSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'title-section';
  return section;
}

/** Una fila di gesti pari fra loro, che si dividono la larghezza. */
export function titleRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'title-row';
  return row;
}
