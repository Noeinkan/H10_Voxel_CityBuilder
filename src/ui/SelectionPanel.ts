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
  readonly body: HTMLElement;
  readonly summary: HTMLElement;
  readonly rows: HTMLElement;
  readonly action: HTMLButtonElement;
}

export class SelectionPanel {
  private readonly root = document.createElement('aside');
  private readonly title = document.createElement('strong');
  private readonly subtitle = document.createElement('span');
  private readonly view: SectionView;
  private activeSection: SelectionSectionId = 'block';

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

    this.root.append(head);
    this.view = this.createSection();
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  get section(): SelectionSectionId {
    return this.activeSection;
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
    this.root.hidden = false;
    this.activeSection = defaultSection(selection);
    this.paint(selection, now, isolatedBlock);
    this.handlers.onSection(this.activeSection);
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
    let section = model.sections.find((candidate) => candidate.id === this.activeSection);
    if (section === undefined) {
      this.activeSection = 'block';
      section = model.sections.find((candidate) => candidate.id === 'block');
    }
    if (section === undefined) return;
    this.title.textContent = section.title;
    this.subtitle.textContent = section.summary;
    paintRows(this.view, section, section.summary);
  }

  private createSection(): SectionView {
    const body = document.createElement('div');
    body.className = 'selection-body';
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

    return { body, summary, rows, action };
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
