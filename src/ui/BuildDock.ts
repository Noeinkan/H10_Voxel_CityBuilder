import type { GameHudModel, GameTool, HudAction } from './GameHudModel';
import type { HudIcon } from './hudIcons';
import { iconButton, labeledButton, paintAction, tileButton } from './hudWidgets';

/**
 * Il rail di sinistra: cosa si puo' costruire, e come si guarda la citta'.
 *
 * Esce da `GameHud.ts` insieme alla barra risorse, e per la stessa ragione: e'
 * la superficie su cui atterrano gli strumenti della fase 7, e farla crescere
 * dentro un file da mille righe significherebbe tenerlo bloccato per tutto il
 * tempo. Qui c'e' il disegno e la ripittura; **cosa** sia disponibile lo decide
 * `GameHudModel`, e cosa faccia un clic lo decide chi costruisce il dock.
 *
 * **Sta di lato e non in fondo**, e la ragione e' la citta': cresce in verticale,
 * e una barra in basso piu' una in alto toglievano ~190px di corridoio proprio
 * dove in isometrica finiscono la cima delle torri e il piede dell'isola. Le
 * corsie restano le stesse quattro, incolonnate invece che in fila; la griglia a
 * due tessere e' cio' che le tiene tutte a schermo senza far scorrere il rail.
 */

/** I pannelli che il dock apre. Il dock non li possiede: chiede a chi li tiene. */
export type DockPanel = 'policies' | 'themes' | 'views';

/**
 * Se due strumenti sono lo stesso strumento.
 *
 * I catalizzatori si confrontano per id, e per classe solo quando l'id manca:
 * e' il caso dei salvataggi dell'MVP e delle fixture di scena, che portano la
 * classe e basta.
 */
function sameTool(tool: GameTool, selected: GameTool): boolean {
  if (tool.kind !== selected.kind) return false;
  if (tool.kind !== 'catalyst' || selected.kind !== 'catalyst') return true;
  return selected.id !== undefined ? selected.id === tool.id : selected.class === tool.class;
}

export interface BuildDockHandlers {
  readonly onTool: (tool: GameTool) => void;
  readonly onSwatch: () => void;
  readonly onPanel: (panel: DockPanel) => void;
  readonly onHelp: () => void;
}

export class BuildDock {
  readonly root: HTMLElement;

  /**
   * Paralleli a `model.catalysts`, non ai gruppi.
   *
   * Il ridisegno scorre la lista piatta, e tenere due ordini diversi sarebbe una
   * corrispondenza da mantenere a mano a ogni ripittura.
   */
  private readonly catalystButtons: HTMLButtonElement[] = [];
  private readonly expansionButton: HTMLButtonElement;
  private readonly terraceButton: HTMLButtonElement;
  private readonly ropewayButton: HTMLButtonElement;
  /**
   * Gli strumenti nell'ordine dei tasti `1`..`9`, cioe' quello a schermo.
   *
   * E' la stessa lista che i badge numerano, quindi il tasto e la tessera non
   * possono divergere: se il dock cambia ordine, cambiano insieme.
   */
  private readonly tools: { readonly tool: GameTool; readonly button: HTMLButtonElement }[] = [];
  private readonly policyToggle: HTMLButtonElement;
  private readonly themeToggle: HTMLButtonElement;
  private readonly viewToggle: HTMLButtonElement;

  constructor(model: GameHudModel, handlers: BuildDockHandlers) {
    this.root = document.createElement('nav');
    this.root.className = 'build-dock hud-surface hud-surface--framed';
    this.root.setAttribute('aria-label', 'Building actions');

    // La toolbar e' organizzata per funzione, non per costo o per ordine di
    // sblocco: prima cosa fa crescere la citta', poi cosa la collega, infine
    // cosa le da' un carattere. E' l'unica classificazione che il giocatore puo'
    // usare prima di conoscere i sette nomi.
    for (const group of model.catalystGroups) {
      const section = document.createElement('div');
      section.className = 'dock-group';
      const heading = document.createElement('span');
      heading.className = 'dock-group-title';
      heading.textContent = group.label;
      section.appendChild(heading);

      // Quante tessere ha la corsia, per il CSS: sul rail alto le corsie si
      // dividono l'altezza che avanza, e senza questo numero il `flex-grow`
      // uguale per tutte darebbe all'identita' — che ne ha due — tessere alte il
      // doppio di quelle delle connessioni, che ne hanno quattro.
      section.style.setProperty('--dock-tiles', String(group.actions.length));

      const row = document.createElement('div');
      row.className = 'dock-group-row';
      for (const action of group.actions) {
        const tool: GameTool = {
          kind: 'catalyst',
          class: action.class ?? 0,
          id: action.catalystId,
        };
        const button = this.addTool(action, (action.catalystId ?? 'market') as HudIcon, tool, handlers);
        this.catalystButtons[model.catalysts.indexOf(action)] = button;
        row.appendChild(button);
      }
      section.appendChild(row);
      this.root.appendChild(section);
    }

    // Le tre risposte a un suolo che finisce — comprarne altro, salire sopra
    // quello che c'e', o andare a prendere quello dall'altra parte dell'acqua —
    // stanno insieme e in una corsia loro, non fra i catalizzatori.
    const reach = document.createElement('div');
    reach.className = 'dock-group';
    reach.style.setProperty('--dock-tiles', '3');
    const reachTitle = document.createElement('span');
    reachTitle.className = 'dock-group-title';
    reachTitle.textContent = 'Reach';
    const reachRow = document.createElement('div');
    reachRow.className = 'dock-group-row';

    this.expansionButton = this.addTool(model.expansion, 'expansion', { kind: 'expansion' }, handlers);
    this.expansionButton.classList.add('hud-button--accent');
    this.terraceButton = this.addTool(model.terrace, 'terrace', { kind: 'terrace' }, handlers);
    this.terraceButton.classList.add('hud-button--accent');
    this.ropewayButton = this.addTool(model.ropeway, 'ropeway', { kind: 'ropeway' }, handlers);
    this.ropewayButton.classList.add('hud-button--accent');
    reachRow.append(this.expansionButton, this.terraceButton, this.ropewayButton);
    reach.append(reachTitle, reachRow);
    this.root.appendChild(reach);

    // I bottoni che non costruiscono niente stanno in un blocco loro, in coda.
    // Nel rail verticale non e' solo ordine: cinque bottoni a tutta larghezza
    // costerebbero cinque righe di un'altezza che le tessere si contendono, e i
    // tre che portano solo un'icona non hanno bisogno di una riga per uno.
    const utility = document.createElement('div');
    utility.className = 'dock-utility';

    this.policyToggle = labeledButton('policies', 'City', 'Open city overview and policies', () => handlers.onPanel('policies'));
    this.policyToggle.setAttribute('aria-expanded', 'false');
    utility.appendChild(this.policyToggle);
    // Le viste stanno fra le politiche e il tema perche' e' li' che passa il
    // confine: da qui in poi i bottoni non cambiano la citta', cambiano come la
    // si guarda.
    this.viewToggle = labeledButton('view', 'Views', 'Look inside the city · V', () => handlers.onPanel('views'));
    this.viewToggle.setAttribute('aria-expanded', 'false');
    utility.appendChild(this.viewToggle);

    const icons = document.createElement('div');
    icons.className = 'dock-utility-row';
    this.themeToggle = iconButton('theme', 'Change visual theme', () => handlers.onPanel('themes'));
    this.themeToggle.setAttribute('aria-expanded', 'false');
    icons.appendChild(this.themeToggle);
    // Subito dopo il tema, e non accanto alle viste: il campionario e' il
    // vocabolario **da cui** la citta' e' fatta, non un modo di guardare quella
    // che c'e'. Chi ha appena cambiato tema e' esattamente chi si chiede come
    // suonino i trentadue slot, ed e' li' che il bottone serve.
    //
    // Apre una scheda a parte, e il tooltip lo dice prima del clic: la scena e'
    // un'altra e ricaricare qui vorrebbe dire perdere la partita, che non e'
    // salvabile. Nessun `aria-expanded` — non apre un pannello, se ne va.
    icons.appendChild(iconButton(
      'swatch',
      'Voxel swatches: every palette slot and surface, in a new tab',
      () => handlers.onSwatch(),
    ));
    icons.appendChild(iconButton('help', 'Open help', () => handlers.onHelp()));
    utility.appendChild(icons);
    this.root.appendChild(utility);
  }

  /**
   * Una tessera, il suo posto nella fila dei tasti e il clic che la sceglie.
   *
   * Il badge nasce dalla posizione in `tools`, non da un numero scritto a mano:
   * e' l'unico modo perche' il `3` sulla tessera e il `3` sulla tastiera restino
   * la stessa cosa quando il dock cambia.
   */
  private addTool(
    action: HudAction,
    icon: HudIcon,
    tool: GameTool,
    handlers: BuildDockHandlers,
  ): HTMLButtonElement {
    const index = this.tools.length;
    const key = index < 9 ? String(index + 1) : null;
    const button = tileButton(action, icon, key, () => handlers.onTool(tool));
    this.tools.push({ tool, button });
    return button;
  }

  /** Lo strumento n-esimo del dock, se c'e' ed e' disponibile. Lo chiama un tasto. */
  toolAt(index: number): GameTool | null {
    const entry = this.tools[index];
    if (entry === undefined || entry.button.getAttribute('aria-disabled') === 'true') return null;
    return entry.tool;
  }

  paint(model: GameHudModel): void {
    model.catalysts.forEach((action, index) => paintAction(this.catalystButtons[index], action));
    paintAction(this.expansionButton, model.expansion);
    paintAction(this.terraceButton, model.terrace);
    paintAction(this.ropewayButton, model.ropeway);
  }

  /**
   * Quale tessera e' premuta: lo strumento in mano si vede dal dock.
   *
   * Scorre `tools` e non i soli catalizzatori: mensola e funivia erano fuori
   * dalla ripittura, quindi si potevano prendere senza che nulla nel dock lo
   * dicesse — e con uno stato selezionato forte quella dimenticanza si sarebbe
   * vista tre volte tanto.
   */
  paintSelection(selected: GameTool): void {
    for (const { tool, button } of this.tools) {
      button.setAttribute('aria-pressed', sameTool(tool, selected) ? 'true' : 'false');
    }
  }

  setExpanded(panel: DockPanel, open: boolean): void {
    const button = panel === 'policies'
      ? this.policyToggle
      : panel === 'themes' ? this.themeToggle : this.viewToggle;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /** Il tema in vigore, sul bottone che lo cambia. */
  setThemeLabel(label: string): void {
    this.themeToggle.setAttribute('aria-label', label);
    this.themeToggle.dataset.tooltip = label;
  }

  /** La vista accesa, sul bottone che le apre: il dock dice cosa si sta guardando. */
  setViewLabel(label: string, active: boolean): void {
    this.viewToggle.dataset.active = active ? 'true' : 'false';
    this.viewToggle.setAttribute('aria-label', label);
    this.viewToggle.dataset.tooltip = label;
  }
}
