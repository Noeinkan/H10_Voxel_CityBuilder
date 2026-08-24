import { createHudIcon } from './hudIcons';
import {
  buildSelectionPanelModel,
  defaultSection,
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
 * Non ha test, come il resto del DOM del progetto: cosa mostrare lo decide
 * `SelectionPanelModel`, che e' puro ed e' li' che le prove stanno.
 */

/** Nomi delle quattro linguette. Corti: sono etichette, non frasi. */
const TAB_LABELS: Readonly<Record<SelectionSectionId, string>> = {
  structure: 'Structure',
  block: 'Block',
  column: 'Column',
  voxel: 'Voxel',
};

const REFRESH_MS = 150;

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
  readonly tab: HTMLButtonElement;
  readonly body: HTMLElement;
  readonly summary: HTMLElement;
  readonly rows: HTMLElement;
  readonly action: HTMLButtonElement;
}

export class SelectionPanel {
  private readonly root = document.createElement('aside');
  private readonly title = document.createElement('strong');
  private readonly subtitle = document.createElement('span');
  private readonly tabs = document.createElement('div');
  private readonly views = new Map<SelectionSectionId, SectionView>();

  private active: SelectionSectionId = 'column';
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

    this.tabs.className = 'selection-tabs';
    this.tabs.setAttribute('role', 'tablist');

    this.root.append(head, this.tabs);
    for (const id of ['structure', 'block', 'column', 'voxel'] as const) {
      this.views.set(id, this.createSection(id));
    }
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  get section(): SelectionSectionId {
    return this.active;
  }

  needsPaint(now: number): boolean {
    return this.open && now - this.lastPaint >= REFRESH_MS;
  }

  /**
   * Apre la scheda su una selezione nuova.
   *
   * La sezione torna sempre alla piu' specifica che esiste: chi clicca un'altra
   * cosa sta cambiando soggetto, e conservare la linguetta aperta gli mostrerebbe
   * l'isolato del palazzo che ha appena smesso di guardare.
   */
  show(selection: Selection, now: number, isolatedBlock: string | null = null): void {
    this.active = defaultSection(selection);
    this.root.hidden = false;
    this.paint(selection, now, isolatedBlock);
    this.handlers.onSection(this.active);
  }

  /** Riscrive i valori senza toccare quale linguetta e' aperta. */
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

    const present = new Set(model.sections.map((section) => section.id));
    // Se la sezione aperta non esiste piu' — un edificio demolito sotto il
    // pannello, o promosso mentre lo si guarda — si ricade sulla colonna invece
    // di lasciare una scheda che descrive qualcosa che non c'e'.
    if (!present.has(this.active)) {
      this.active = defaultSection(selection);
      this.handlers.onSection(this.active);
    }

    for (const [id, view] of this.views) {
      const section = model.sections.find((entry) => entry.id === id) ?? null;
      view.tab.hidden = section === null;
      view.body.hidden = section === null || id !== this.active;
      const open = section !== null && id === this.active;
      view.tab.setAttribute('aria-selected', open ? 'true' : 'false');
      view.tab.dataset['active'] = open ? 'true' : 'false';
      if (section !== null && open) paintRows(view, section, model.summary);
    }
  }

  private createSection(id: SelectionSectionId): SectionView {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'selection-tab';
    tab.id = `selection-tab-${id}`;
    tab.textContent = TAB_LABELS[id];
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `selection-body-${id}`);
    tab.addEventListener('click', () => this.select(id));
    this.tabs.appendChild(tab);

    const body = document.createElement('div');
    body.className = 'selection-body';
    body.id = `selection-body-${id}`;
    body.setAttribute('role', 'tabpanel');
    body.setAttribute('aria-labelledby', tab.id);
    body.hidden = true;
    const summary = document.createElement('p');
    summary.className = 'selection-summary';
    const rows = document.createElement('dl');
    rows.className = 'selection-rows';

    // Il bottone nasce con la sezione e resta lo stesso nodo per tutta la vita
    // del pannello, a differenza delle righe che si ricostruiscono a ogni
    // riscrittura: un nodo ricreato sotto il dito perderebbe il click fra
    // `pointerdown` e `click`, ed e' esattamente il difetto per cui il dock non
    // puo' ricostruire i propri.
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'selection-action';
    action.hidden = true;
    action.addEventListener('click', () => {
      const chosen = action.dataset['action'];
      if (chosen !== undefined) this.handlers.onAction(chosen as SelectionActionId);
    });

    body.append(summary, rows, action);
    this.root.appendChild(body);

    return { tab, body, summary, rows, action };
  }

  private select(id: SelectionSectionId): void {
    if (this.active === id) return;
    this.active = id;
    for (const [other, view] of this.views) {
      const open = other === id;
      view.body.hidden = !open || view.tab.hidden;
      view.tab.setAttribute('aria-selected', open ? 'true' : 'false');
      view.tab.dataset['active'] = open ? 'true' : 'false';
    }
    this.handlers.onSection(id);
  }
}

/**
 * Riscrive le righe di una sezione.
 *
 * Ricostruisce i nodi invece di aggiornarli in posto perche' il numero di righe
 * cambia con cio' che c'e' — una fila, un appoggio, l'acqua sopra la colonna — e
 * qui non ci sono bottoni da tenere stabili fra `pointerdown` e `click`: e' la
 * ragione per cui il dock non puo' fare lo stesso e questo pannello si'.
 */
function paintRows(view: SectionView, section: SelectionSection, heading: string): void {
  // L'intestazione porta gia' il sommario della sezione di testa: ripeterlo due
  // righe piu' sotto occupava lo spazio delle uniche righe che valgono la
  // scheda, e insegnava a saltare la prima riga di ogni sezione.
  view.summary.textContent = section.summary;
  view.summary.hidden = section.summary === heading;
  view.rows.replaceChildren();
  for (const row of section.rows) {
    const label = document.createElement('dt');
    label.textContent = row.label;
    const value = document.createElement('dd');
    value.textContent = row.value;
    view.rows.append(label, value);
  }

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
