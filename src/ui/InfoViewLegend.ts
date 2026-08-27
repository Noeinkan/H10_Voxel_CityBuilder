import { infoViewSpecOf, type InfoViewKind } from '../sim';

/**
 * La legenda della vista informativa attiva.
 *
 * Mostra nome, descrizione e — per le viste categoriche — l'elenco delle
 * categorie nell'ordine dei colori. E' una superficie di sola lettura: il
 * cambio di vista lo fanno il tasto `I` e l'overlay, qui si dice soltanto cosa
 * si sta guardando.
 *
 * **Niente colori ricopiati.** La rampa e le palette stanno nel renderer
 * (`InfoViewOverlay`); qui escono le parole, dallo stesso catalogo
 * `INFO_VIEWS` che l'overlay legge. Due copie della legenda divergerebbero al
 * primo refactor.
 */
export class InfoViewLegend {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly description: HTMLElement;
  private readonly categories: HTMLElement;
  private readonly hint: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '16px',
      bottom: '16px',
      maxWidth: '260px',
      padding: '12px 14px',
      borderRadius: '8px',
      background: 'rgba(16,20,28,0.82)',
      color: '#e8ecef',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '12px',
      lineHeight: '1.5',
      pointerEvents: 'none',
      zIndex: '40',
      display: 'none',
    });
    this.root.setAttribute('aria-live', 'polite');

    this.title = document.createElement('strong');
    this.title.style.display = 'block';
    this.title.style.fontSize = '13px';
    this.description = document.createElement('p');
    this.description.style.margin = '4px 0 8px';
    this.description.style.opacity = '0.82';
    this.categories = document.createElement('div');
    this.categories.style.display = 'flex';
    this.categories.style.flexWrap = 'wrap';
    this.categories.style.gap = '4px 10px';
    this.hint = document.createElement('span');
    this.hint.style.opacity = '0.6';

    this.root.append(this.title, this.description, this.categories, this.hint);
    parent.appendChild(this.root);
  }

  /** Mostra la legenda per una vista, o la nasconde per la citta' nuda. */
  setView(kind: InfoViewKind): void {
    if (kind === 'off') {
      this.root.style.display = 'none';
      return;
    }
    const spec = infoViewSpecOf(kind);
    this.title.textContent = spec.label;
    this.description.textContent = spec.description;
    this.categories.replaceChildren();
    for (const category of spec.categories) {
      const item = document.createElement('span');
      item.textContent = category;
      item.style.opacity = '0.9';
      this.categories.appendChild(item);
    }
    this.hint.textContent = spec.mode === 'continuous' ? 'Brighter means more.' : '';
    this.root.style.display = 'block';
  }

  dispose(): void {
    this.root.remove();
  }
}
