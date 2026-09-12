import { infoViewSpecOf, type InfoViewKind } from '../sim';

/**
 * La legenda della vista informativa attiva, in fondo al rail dei comandi.
 *
 * Mostra nome, descrizione e — per le viste categoriche — l'elenco delle
 * categorie nell'ordine dei colori, e porta l'unico gesto che le serve: come si
 * torna alla citta' nuda.
 *
 * **Sta nel rail, non sopra.** Era un riquadro fisso a sedici pixel dal bordo
 * in basso a sinistra, cioe' esattamente dove sta il dock: da qualunque schermo
 * la si guardasse copriva la fila City / Policies / Views / Data, e siccome
 * nessun bottone la chiudeva restava li' finche' non si ripescava `City` dal
 * picker. Dentro il rail e' invece **in flusso** con le altre superfici di
 * comando, e per costruzione non puo' coprirne nessuna — la stessa scelta che
 * la targa della vista d'ispezione aveva gia' fatto.
 *
 * **Niente colori ricopiati.** La rampa e le palette stanno nel renderer
 * (`InfoViewOverlay`); qui escono le parole, dallo stesso catalogo
 * `INFO_VIEWS` che l'overlay legge. Due copie della legenda divergerebbero al
 * primo refactor.
 */
export class InfoViewLegend {
  private readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private readonly description: HTMLElement;
  private readonly categories: HTMLElement;
  private readonly hint: HTMLElement;
  /** Chi spegne la vista quando si chiude la lettura dal bottone. */
  private dismiss: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'info-bar hud-surface';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'City data reading');
    this.root.setAttribute('aria-live', 'polite');

    const eyebrow = document.createElement('span');
    eyebrow.className = 'view-bar-eyebrow';
    eyebrow.textContent = 'Reading';

    this.label = document.createElement('strong');
    this.label.className = 'view-bar-label';
    this.description = document.createElement('p');
    this.description.className = 'view-bar-gesture';
    this.categories = document.createElement('div');
    this.categories.className = 'info-bar-categories';
    this.hint = document.createElement('span');
    this.hint.className = 'info-bar-hint';

    // Un bottone solo, e non due come sulla targa della vista: cambiare dato ha
    // gia' la sua tessera nel dock, due dita piu' su. Quello che qui mancava —
    // e che nessun'altra superficie diceva — e' come si esce.
    const actions = document.createElement('div');
    actions.className = 'view-bar-actions';
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'view-bar-button view-bar-exit';
    exit.textContent = 'Exit data';
    exit.title = 'Back to the city, with no data overlay · I';
    exit.addEventListener('click', () => this.dismiss?.());
    actions.appendChild(exit);

    this.root.append(eyebrow, this.label, this.description, this.categories, this.hint, actions);
    parent.appendChild(this.root);
  }

  /**
   * Chi spegne la vista quando il giocatore chiude la lettura.
   *
   * Lo passa `infoViewScene`, che possiede sia la legenda sia l'overlay: la
   * legenda non sa spegnere niente da se', e non deve — il giro delle viste ha
   * un posto solo in cui vive.
   */
  onDismiss(handler: () => void): void {
    this.dismiss = handler;
  }

  /** Mostra la legenda per una vista, o la nasconde per la citta' nuda. */
  setView(kind: InfoViewKind): void {
    if (kind === 'off') {
      this.root.hidden = true;
      return;
    }
    const spec = infoViewSpecOf(kind);
    this.label.textContent = spec.label;
    this.description.textContent = spec.description;
    this.categories.replaceChildren();
    for (const category of spec.categories) {
      const item = document.createElement('span');
      item.textContent = category;
      this.categories.appendChild(item);
    }
    this.hint.textContent = spec.mode === 'continuous' ? 'Brighter means more.' : '';
    this.hint.hidden = spec.mode !== 'continuous';
    this.root.hidden = false;
  }

  dispose(): void {
    this.root.remove();
  }
}
