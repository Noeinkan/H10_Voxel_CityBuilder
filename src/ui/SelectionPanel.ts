import { createHudIcon } from './hudIcons';
import {
  buildSelectionPanelModel,
  defaultSection,
  SECTION_LABELS,
  type GrowthCard,
  type SelectionActionId,
  type SelectionSection,
  type SelectionSectionId,
} from './SelectionPanelModel';
import type { Selection } from '../game/selection';

/**
 * La scheda di cio' che il giocatore ha scelto.
 *
 * Vive in un file suo e non dentro `GameHud` per la ragione scritta in
 * `AGENTS.md`: quel file e' gia' oltre il budget, e il semaforo fra agenti prende
 * il lock **per path**. Ne resta indipendente anche nel montaggio — si appende
 * allo stesso genitore e non alla radice dell'HUD — cosi' che aprire una scheda
 * non passi mai per lo stato del dock.
 *
 * **Una colonna, non delle linguette.** La pila sotto il click — struttura,
 * isolato, colonna, voxel — si legge gia' tutta nello stesso pannello,
 * scorrendo: sono la stessa domanda a quattro ingrandimenti, e nascondere tre
 * risposte per farne vedere una costringeva a ricordare dove si era arrivati.
 * In cima sta la carta di cio' che serve per crescere, che e' la domanda da cui
 * il click nasce. Cliccare l'intestazione di una sezione sposta il contorno
 * in-world su quell'unita', che prima facevano le linguette.
 *
 * Non ha test, come il resto del DOM del progetto: cosa mostrare lo decide
 * `SelectionPanelModel`, che e' puro ed e' li' che le prove stanno.
 */

const REFRESH_MS = 150;

const SECTION_IDS: readonly SelectionSectionId[] = ['structure', 'block', 'column', 'voxel'];

export interface SelectionPanelHandlers {
  /** L'unita' di cui si sta leggendo e' cambiata: il contorno la deve seguire. */
  onSection(section: SelectionSectionId): void;
  /**
   * Il gesto della sezione aperta e' stato premuto.
   *
   * Il pannello non sa cosa faccia: passa l'identificatore che il modello gli ha
   * dato e si ferma li'. Isolare un isolato tocca vista, camera e materiale, e
   * questo file non conosce nessuno dei tre.
   */
  onAction(action: SelectionActionId): void;
  onClose(): void;
}

interface SectionView {
  readonly root: HTMLElement;
  readonly heading: HTMLButtonElement;
  readonly eyebrow: HTMLElement;
  readonly title: HTMLElement;
  readonly summary: HTMLElement;
  readonly rows: HTMLElement;
  readonly action: HTMLButtonElement;
}

interface GrowthView {
  readonly root: HTMLElement;
  readonly eyebrow: HTMLElement;
  readonly title: HTMLElement;
  readonly summary: HTMLElement;
  readonly rows: HTMLElement;
}

export class SelectionPanel {
  private readonly root = document.createElement('aside');
  private readonly title = document.createElement('strong');
  private readonly subtitle = document.createElement('span');
  private readonly body = document.createElement('div');
  private readonly growth: GrowthView;
  private readonly views = new Map<SelectionSectionId, SectionView>();
  private focusedSection: SelectionSectionId = 'block';

  private lastPaint = 0;

  constructor(parent: HTMLElement, private readonly handlers: SelectionPanelHandlers) {
    this.root.className = 'selection-panel hud-surface hud-surface--panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Selection details');

    const head = document.createElement('header');
    head.className = 'selection-head';
    this.title.className = 'selection-title';
    this.subtitle.className = 'selection-subtitle';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'selection-close';
    close.title = 'Clear selection · Esc';
    close.setAttribute('aria-label', 'Clear selection');
    close.appendChild(createHudIcon('close'));
    close.addEventListener('click', () => this.handlers.onClose());

    const heading = document.createElement('div');
    heading.className = 'selection-heading';
    heading.append(this.title, this.subtitle);
    head.append(heading, close);

    this.body.className = 'selection-body';
    this.growth = this.createGrowthView();
    this.body.appendChild(this.growth.root);

    // Le quattro sezioni nascono tutte qui e restano gli stessi nodi per tutta
    // la vita del pannello: l'insieme non cambia mai (la struttura c'e' o no),
    // e ricrearle a ogni riscrittura perderebbe il click sotto il dito — il
    // difetto per cui il dock non puo' ricostruire i propri bottoni.
    for (const id of SECTION_IDS) {
      const view = this.createSectionView(id);
      this.views.set(id, view);
      this.body.appendChild(view.root);
    }

    this.root.append(head, this.body);
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** L'unita' di cui il contorno in-world sta seguendo. */
  get section(): SelectionSectionId {
    return this.focusedSection;
  }

  needsPaint(now: number): boolean {
    return this.open && now - this.lastPaint >= REFRESH_MS;
  }

  /**
   * Apre la scheda su una selezione nuova.
   *
   * Il contorno torna sempre alla piu' specifica che esiste: chi clicca un'altra
   * cosa sta cambiando soggetto, e conservare l'evidenziazione precedente gli
   * mostrerebbe l'isolato del palazzo che ha appena smesso di guardare.
   */
  show(selection: Selection, now: number, isolatedBlock: string | null = null): void {
    this.root.hidden = false;
    this.focusSection(defaultSection(selection));
    this.paint(selection, now, isolatedBlock);
    this.handlers.onSection(this.focusedSection);
  }

  /** Riscrive i valori senza toccare quale unita' e' evidenziata. */
  update(selection: Selection, now: number, isolatedBlock: string | null = null): void {
    if (!this.open) return;
    this.paint(selection, now, isolatedBlock);
  }

  close(): void {
    this.root.hidden = true;
  }

  private paint(selection: Selection, now: number, isolatedBlock: string | null): void {
    this.lastPaint = now;
    const model = buildSelectionPanelModel(selection, isolatedBlock);
    this.title.textContent = model.title;
    this.subtitle.textContent = model.summary;
    this.paintGrowth(model.growth);
    for (const id of SECTION_IDS) {
      const section = model.sections.find((candidate) => candidate.id === id);
      this.paintSectionView(this.views.get(id)!, section, model.summary);
    }
  }

  private paintGrowth(card: GrowthCard | null): void {
    this.growth.root.hidden = card === null;
    if (card === null) return;
    this.growth.title.textContent = card.title;
    this.growth.summary.textContent = card.summary;
    paintRows(this.growth.rows, card.rows);
  }

  private paintSectionView(view: SectionView, section: SelectionSection | undefined, leadSummary: string): void {
    view.root.hidden = section === undefined;
    if (section === undefined) return;
    view.title.textContent = section.title;
    // L'intestazione del pannello porta gia' il sommario della sezione di testa:
    // ripeterlo due righe piu' sotto occupava lo spazio delle uniche righe che
    // valgono la scheda, e insegnava a saltare la prima riga di ogni sezione.
    view.summary.textContent = section.summary;
    view.summary.hidden = section.summary === leadSummary;
    paintRows(view.rows, section.rows);

    const action = section.action;
    view.action.hidden = action === null;
    if (action === null) {
      delete view.action.dataset['action'];
      return;
    }
    view.action.textContent = action.label;
    // Il perche' sta nel `title` e non sotto l'etichetta: e' una riga che serve la
    // prima volta e poi mai piu', e stampata fissa mangerebbe lo spazio delle
    // righe che sono il motivo per cui la scheda esiste.
    view.action.title = action.hint;
    view.action.dataset['action'] = action.id;
  }

  private focusSection(id: SelectionSectionId): void {
    if (this.focusedSection === id && this.views.get(id)?.heading.dataset['active'] === 'true') return;
    this.focusedSection = id;
    for (const [sectionId, view] of this.views) {
      const active = sectionId === id;
      view.heading.setAttribute('aria-pressed', active ? 'true' : 'false');
      view.heading.dataset['active'] = active ? 'true' : 'false';
    }
  }

  private createSectionView(id: SelectionSectionId): SectionView {
    const root = document.createElement('section');
    root.className = 'selection-card';

    // Il bottone nasce con la sezione e resta lo stesso nodo per tutta la vita
    // del pannello, a differenza delle righe che si ricostruiscono a ogni
    // riscrittura: un nodo ricreato sotto il dito perderebbe il click fra
    // `pointerdown` e `click`, ed e' esattamente il difetto per cui il dock non
    // puo' ricostruire i propri.
    const heading = document.createElement('button');
    heading.type = 'button';
    heading.className = 'selection-card-head';
    heading.addEventListener('click', () => {
      this.focusSection(id);
      this.handlers.onSection(id);
    });

    const eyebrow = document.createElement('span');
    eyebrow.className = 'selection-card-eyebrow';
    eyebrow.textContent = SECTION_LABELS[id];

    const title = document.createElement('strong');
    title.className = 'selection-card-title';
    const summary = document.createElement('span');
    summary.className = 'selection-card-summary';
    heading.append(eyebrow, title, summary);

    const rows = document.createElement('dl');
    rows.className = 'selection-rows';

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'selection-action';
    action.hidden = true;
    action.addEventListener('click', () => {
      const chosen = action.dataset['action'];
      if (chosen !== undefined) this.handlers.onAction(chosen as SelectionActionId);
    });

    root.append(heading, rows, action);
    return { root, heading, eyebrow, title, summary, rows, action };
  }

  private createGrowthView(): GrowthView {
    const root = document.createElement('section');
    root.className = 'selection-card selection-card--growth';
    root.setAttribute('aria-label', 'Growth');

    const eyebrow = document.createElement('span');
    eyebrow.className = 'selection-card-eyebrow';
    eyebrow.textContent = 'Growth';

    const title = document.createElement('strong');
    title.className = 'selection-card-title';
    const summary = document.createElement('span');
    summary.className = 'selection-card-summary';
    const rows = document.createElement('dl');
    rows.className = 'selection-rows';

    root.append(eyebrow, title, summary, rows);
    return { root, eyebrow, title, summary, rows };
  }
}

/**
 * Riscrive le righe di una carta o di una sezione.
 *
 * Ricostruisce i nodi invece di aggiornarli in posto perche' il numero di righe
 * cambia con cio' che c'e' — una fila, un appoggio, l'acqua sopra la colonna — e
 * qui non ci sono bottoni da tenere stabili fra `pointerdown` e `click`: e' la
 * ragione per cui il dock non puo' fare lo stesso e questo pannello si'.
 */
function paintRows(rows: HTMLElement, content: readonly { readonly label: string; readonly value: string }[]): void {
  rows.replaceChildren();
  for (const row of content) {
    const label = document.createElement('dt');
    label.textContent = row.label;
    const value = document.createElement('dd');
    value.textContent = row.value;
    rows.append(label, value);
  }
}
