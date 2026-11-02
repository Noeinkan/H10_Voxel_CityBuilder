import { describe, expect, it } from 'vitest';
import { HudPanels, type RightPanel } from './HudPanels';

const IDS: readonly RightPanel[] = ['city', 'policies', 'themes', 'views', 'info'];

function fixture() {
  const panels = Object.fromEntries(IDS.map((id) => [id, { hidden: true }])) as
    Record<RightPanel, { hidden: boolean }>;
  const expanded = new Map<RightPanel, boolean>();
  const events: string[] = [];
  const help = {
    isOpen: false,
    hide() { this.isOpen = false; events.push('hide help'); },
    toggle() { this.isOpen = !this.isOpen; events.push('toggle help'); },
  };
  const controller = new HudPanels({
    panels,
    help,
    setExpanded: (id, open) => { expanded.set(id, open); events.push(`${id} ${open}`); },
    clearSelection: () => { events.push('clear selection'); },
  });
  return { controller, panels, expanded, events, help };
}

describe('HudPanels', () => {
  it('apre un pannello alla volta e tiene il dock allineato', () => {
    const { controller, panels, expanded, events } = fixture();
    controller.toggle('city');
    controller.toggle('views');

    expect(controller.isOpen('views')).toBe(true);
    expect(panels.city.hidden).toBe(true);
    expect(expanded.get('city')).toBe(false);
    expect(expanded.get('views')).toBe(true);
    expect(events.indexOf('views true')).toBeLessThan(events.lastIndexOf('clear selection'));

    controller.toggle('views');
    expect(controller.anyOpen()).toBe(false);
    expect(expanded.get('views')).toBe(false);
  });

  it('l’aiuto esclude gli altri pannelli e si richiude al secondo gesto', () => {
    const { controller, help, expanded } = fixture();
    controller.toggle('info');
    controller.toggleHelp();
    expect(help.isOpen).toBe(true);
    expect(expanded.get('info')).toBe(false);
    controller.toggle('city');
    expect(help.isOpen).toBe(false);
    expect(controller.isOpen('city')).toBe(true);
    controller.toggleHelp();
    expect(help.isOpen).toBe(true);
    controller.toggleHelp();
    expect(controller.anyOpen()).toBe(false);
  });

  it('dismiss chiude anche l’aiuto senza toccare la selezione', () => {
    const { controller, events } = fixture();
    controller.toggleHelp();
    const before = events.filter((event) => event === 'clear selection').length;
    controller.dismiss();
    expect(controller.anyOpen()).toBe(false);
    expect(events.filter((event) => event === 'clear selection')).toHaveLength(before);
  });
});
