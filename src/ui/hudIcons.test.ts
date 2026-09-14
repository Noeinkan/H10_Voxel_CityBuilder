import { describe, expect, it } from 'vitest';
import { iconMarkup, iconWeight, isResourceIcon, type HudIcon } from './hudIcons';

const RESOURCES = ['funds', 'population', 'food', 'materials', 'satisfaction'] as const;

/** Un campione delle azioni: le tessere che restano disegnate e le porte del dock. */
const ACTIONS: readonly HudIcon[] = [
  'residential', 'market', 'cathedral', 'expansion', 'terrace', 'ropeway', 'demolish',
  'city', 'policies', 'view', 'info', 'menu', 'close', 'pause', 'play', 'sound',
];

describe('hudIcons', () => {
  it('le cinque risorse sono piene, le azioni a tratto', () => {
    // I due pesi di 7.2: pieno vuol dire «hai», contorno vuol dire «fai».
    for (const name of RESOURCES) {
      expect(iconWeight(name), name).toBe('fill');
      expect(isResourceIcon(name), name).toBe(true);
    }
    for (const name of ACTIONS) expect(iconWeight(name), name).toBe('stroke');
  });

  it('una risorsa non porta massa: e gia tutta sagoma', () => {
    for (const name of RESOURCES) expect(iconMarkup(name), name).not.toContain('hud-mass');
  });

  it('gli edifici a tratto portano la loro massa, i segni astratti no', () => {
    // La massa e' la sagoma di cio' che si costruisce; chiudere o mettere in
    // pausa non ha una sagoma da riempire.
    for (const name of ['residential', 'market', 'cathedral', 'terrace', 'city'] as const) {
      expect(iconMarkup(name), name).toContain('hud-mass');
    }
    for (const name of ['close', 'pause', 'menu', 'expansion'] as const) {
      expect(iconMarkup(name), name).not.toContain('hud-mass');
    }
  });

  it('ogni disegno e markup chiuso', () => {
    // `innerHTML` in un SVG ripara in silenzio un tag aperto, spesso mangiandosi
    // il tracciato dopo: e' un'icona che esce a meta' senza errori.
    for (const name of [...RESOURCES, ...ACTIONS]) {
      const markup = iconMarkup(name);
      const opened = markup.match(/<(path|circle|rect)\b/g)?.length ?? 0;
      const closed = markup.match(/\/>/g)?.length ?? 0;
      expect(closed, name).toBe(opened);
    }
  });
});
