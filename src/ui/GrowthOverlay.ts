import { CLASS_NAMES } from '../sim';
import { REJECT_REASONS } from '../world/buildings/Builder';
import type { GrowthStats } from '../game/growthScene';

const REFRESH_MS = 200;

/** Pannello separato della crescita automatica; non condivide stato con SimOverlay. */
export class GrowthOverlay {
  private readonly root: HTMLDetailsElement;
  private readonly summary: HTMLElement;
  private readonly body: HTMLPreElement;
  private lastPaint = 0;
  private previousCount = 0;
  private previousTime = 0;
  private rate = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('details');
    this.root.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:var(--game-hud-bottom, 12px)', 'z-index:16',
      'max-width:calc(100vw - 24px)', 'max-height:min(62vh,540px)', 'box-sizing:border-box', 'overflow:auto',
      'background:rgba(10,18,24,.88)', 'color:#dbe8e5',
      'font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'border:1px solid rgba(185,217,210,.22)', 'border-radius:8px',
      'box-shadow:0 8px 28px rgba(0,0,0,.24)', 'backdrop-filter:blur(8px)',
    ].join(';');

    this.summary = document.createElement('summary');
    this.summary.textContent = '▸ CRESCITA · preparazione terreno…';
    this.summary.style.cssText = [
      'padding:6px 9px', 'cursor:pointer', 'user-select:none', 'list-style:none',
      'font:700 10px/1.4 system-ui,sans-serif', 'letter-spacing:.04em',
      'color:#b9d9d2', 'white-space:nowrap',
    ].join(';');
    this.root.appendChild(this.summary);

    this.body = document.createElement('pre');
    this.body.style.cssText = [
      'margin:0', 'padding:8px 10px 10px', 'border-top:1px solid rgba(185,217,210,.14)',
      'font:inherit', 'color:inherit', 'white-space:pre', 'min-width:250px',
    ].join(';');
    this.body.textContent = 'preparazione terreno…';
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
  }

  needsPaint(now: number): boolean {
    return now - this.lastPaint >= REFRESH_MS;
  }

  update(stats: GrowthStats | null, now: number): void {
    this.lastPaint = now;
    if (stats === null) return;
    if (this.previousTime > 0 && now > this.previousTime) {
      this.rate = ((stats.buildings - this.previousCount) * 1000) / (now - this.previousTime);
    }
    this.previousCount = stats.buildings;
    this.previousTime = now;
    this.summary.textContent = `${this.root.open ? '▾' : '▸'} CRESCITA  ·  ${stats.buildings} edifici  ·  ${this.rate.toFixed(1)}/s`;

    const rejected = REJECT_REASONS.map(
      (reason, index) => `${reason} ${stats.builder.rejected[index] ?? 0}`,
    ).join('  ');
    this.body.textContent = [
      `crescita     tick ${stats.tick}  ${stats.tickMs.toFixed(3)} ms`,
      `edifici      ${stats.buildings}  ${this.rate.toFixed(1)}/s`,
      `classi       ${stats.countsByClass.map((n, i) => `${CLASS_NAMES[i].slice(0, 4)} ${n}`).join('  ')}`,
      `coda         ${stats.builder.growing}  upgrade ${stats.builder.upgraded}`,
      `livelli      ${stats.levels.map((n, i) => `L${i} ${n ?? 0}`).join('  ')}`,
      `blacklist    ${stats.builder.blacklisted}`,
      `scarti       ${rejected}`,
    ].join('\n');
  }
}
