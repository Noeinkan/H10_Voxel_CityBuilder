import { CLASS_NAMES } from '../sim';
import { REJECT_REASONS } from '../world/buildings/Builder';
import type { GrowthStats } from '../game/growthScene';

const REFRESH_MS = 200;

/** Pannello separato della crescita automatica; non condivide stato con SimOverlay. */
export class GrowthOverlay {
  private readonly root: HTMLPreElement;
  private lastPaint = 0;
  private previousCount = 0;
  private previousTime = 0;
  private rate = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('pre');
    this.root.style.cssText = [
      'position:fixed', 'top:8px', 'right:8px', 'z-index:10', 'margin:0',
      'padding:8px 10px', 'background:rgba(8,11,14,0.82)', 'color:#d8dce0',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'border:1px solid rgba(216,220,224,0.16)', 'border-radius:4px',
      'pointer-events:none', 'min-width:250px',
    ].join(';');
    this.root.textContent = 'crescita  preparazione terreno…';
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

    const rejected = REJECT_REASONS.map(
      (reason, index) => `${reason} ${stats.builder.rejected[index] ?? 0}`,
    ).join('  ');
    this.root.textContent = [
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
