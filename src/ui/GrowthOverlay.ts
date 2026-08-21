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
    this.root.className = 'debug-panel debug-panel--right';

    this.summary = document.createElement('summary');
    this.summary.className = 'debug-summary';
    this.summary.textContent = '▸ GROWTH · preparing terrain…';
    this.root.appendChild(this.summary);

    this.body = document.createElement('pre');
    this.body.className = 'debug-body';
    this.body.textContent = 'preparing terrain…';
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
  }

  needsPaint(now: number): boolean {
    return !this.root.hidden && now - this.lastPaint >= REFRESH_MS;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  toggle(): boolean {
    this.setVisible(this.root.hidden);
    return !this.root.hidden;
  }

  update(stats: GrowthStats | null, now: number): void {
    this.lastPaint = now;
    if (stats === null) return;
    if (this.previousTime > 0 && now > this.previousTime) {
      this.rate = ((stats.buildings - this.previousCount) * 1000) / (now - this.previousTime);
    }
    this.previousCount = stats.buildings;
    this.previousTime = now;
    this.summary.textContent = `${this.root.open ? '▾' : '▸'} GROWTH  ·  ${stats.buildings} buildings  ·  ${this.rate.toFixed(1)}/s`;

    const rejected = REJECT_REASONS.map(
      (reason, index) => `${reason} ${stats.builder.rejected[index] ?? 0}`,
    ).join('  ');
    this.body.textContent = [
      `growth       tick ${stats.tick}  ${stats.tickMs.toFixed(3)} ms`,
      `buildings    ${stats.buildings}  ${this.rate.toFixed(1)}/s`,
      `uses         ${stats.countsByClass.map((n, i) => `${CLASS_NAMES[i].slice(0, 4)} ${n}`).join('  ')}`,
      `mixed        ${stats.mixedByClass.map((n, i) => `${CLASS_NAMES[i].slice(0, 4)} ${n}`).join('  ')}`,
      `typologies   ${stats.typologies.length === 0
        ? 'none yet'
        : stats.typologies.map(([id, n]) => `${id} ${n}`).join('  ')}`,
      `commerce     served ${stats.state.commerce.served.toFixed(1)} / ${stats.state.commerce.demand.toFixed(1)}` +
        `  service ${(stats.state.commerce.service * 100).toFixed(0)}%` +
        `  occupancy ${(stats.state.commerce.occupancy * 100).toFixed(0)}%`,
      `             revenue ${stats.state.commerce.revenue.toFixed(2)}/t  goods ${stats.state.commerce.goods.toFixed(2)}/t`,
      `queue        ${stats.builder.growing}  upgrades ${stats.builder.upgraded}`,
      `levels       ${stats.levels.map((n, i) => `L${i} ${n ?? 0}`).join('  ')}`,
      // `reach` e' il gate della 4.5 senza aprire una console: a uno la rete in
      // quota e' un ornamento — ponti che non portano da nessuna parte — e da
      // due in su e' un secondo piano stradale.
      `spans        ${stats.builder.spans}  reach ${stats.builder.spanReach} blocks`,
      `blacklist    ${stats.builder.blacklisted}`,
      `rejected     ${rejected}`,
    ].join('\n');
  }
}
