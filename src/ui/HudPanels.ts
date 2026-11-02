import type { DockPanel } from './BuildDock';

export type RightPanel = Exclude<DockPanel, 'menu'>;

interface Panel {
  hidden: boolean;
}

interface HelpPanel {
  readonly isOpen: boolean;
  hide(): void;
  toggle(): void;
}

export interface HudPanelOptions {
  readonly panels: Readonly<Record<RightPanel, Panel>>;
  readonly help: HelpPanel;
  readonly setExpanded: (panel: RightPanel, expanded: boolean) => void;
  readonly clearSelection: () => void;
}

const PANEL_ORDER: readonly RightPanel[] = ['city', 'policies', 'themes', 'views', 'info'];

/** Tiene allineati il pannello visibile, il dock e la striscia destra. */
export class HudPanels {
  constructor(private readonly options: HudPanelOptions) {}

  isOpen(panel: RightPanel): boolean {
    return !this.options.panels[panel].hidden;
  }

  toggle(panel: RightPanel): void {
    const opening = !this.isOpen(panel);
    this.options.panels[panel].hidden = !opening;
    this.options.setExpanded(panel, opening);
    if (!opening) return;

    // La selezione si chiude dopo l'apertura: e' l'ordine osservabile dei
    // pannelli originali e non va cambiato durante questo refactor.
    this.options.clearSelection();
    this.closeAll(panel);
    this.options.help.hide();
  }

  close(panel: RightPanel): void {
    this.options.panels[panel].hidden = true;
    this.options.setExpanded(panel, false);
  }

  closeAll(except?: RightPanel): void {
    for (const panel of PANEL_ORDER) {
      if (panel !== except) this.close(panel);
    }
  }

  dismiss(): void {
    this.closeAll();
    this.options.help.hide();
  }

  toggleHelp(): void {
    const opening = !this.options.help.isOpen;
    this.closeAll();
    if (opening) this.options.clearSelection();
    this.options.help.toggle();
  }

  anyOpen(): boolean {
    return PANEL_ORDER.some((panel) => this.isOpen(panel)) || this.options.help.isOpen;
  }
}
