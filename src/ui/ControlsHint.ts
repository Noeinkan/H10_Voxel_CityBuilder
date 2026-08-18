export interface ControlHint {
  readonly keys: readonly string[];
  readonly action: string;
}

/** Unica fonte delle indicazioni mostrate all'utente. */
export const CONTROL_HINTS: readonly ControlHint[] = [
  { keys: ['WASD', '↑←↓→'], action: 'Sposta' },
  { keys: ['Q', 'E'], action: 'Ruota' },
  { keys: ['Rotella'], action: 'Zoom' },
  { keys: ['Trascina'], action: 'Sposta vista' },
  { keys: ['F'], action: 'Reinquadra' },
];

/** Promemoria compatto sempre visibile, distinto dagli overlay tecnici di debug. */
export class ControlsHint {
  constructor(parent: HTMLElement, debugEnabled = false) {
    const root = document.createElement('aside');
    root.setAttribute('aria-label', 'Comandi di navigazione');
    root.style.cssText = [
      'position:fixed', 'left:50%', 'z-index:15', 'transform:translateX(-50%)',
      `bottom:calc(var(--game-hud-bottom, 12px) + ${debugEnabled ? '38px' : '0px'})`,
      'display:flex', 'align-items:center', 'justify-content:flex-end', 'gap:10px', 'flex-wrap:wrap',
      'padding:5px 7px', 'max-width:calc(100vw - 24px)', 'box-sizing:border-box',
      'border:1px solid rgba(255,255,255,.16)', 'border-radius:7px',
      'background:rgba(9,16,24,.72)', 'backdrop-filter:blur(6px)',
      'color:#edf6f4', 'font:10px/1.35 system-ui,sans-serif',
      'box-shadow:0 6px 20px rgba(0,0,0,.18)', 'pointer-events:none', 'white-space:nowrap',
    ].join(';');

    for (const hint of CONTROL_HINTS) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:5px;white-space:nowrap';

      const keys = document.createElement('span');
      keys.style.cssText = 'display:flex;align-items:center;gap:3px;white-space:nowrap';
      for (const [index, label] of hint.keys.entries()) {
        if (index > 0) keys.append(' / ');
        const key = document.createElement('kbd');
        key.textContent = label;
        key.style.cssText = [
          'display:inline-block', 'min-width:15px', 'padding:0 3px', 'box-sizing:border-box',
          'border:1px solid rgba(255,255,255,.28)', 'border-radius:4px',
          'background:rgba(255,255,255,.1)', 'font:9px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
          'text-align:center',
        ].join(';');
        keys.appendChild(key);
      }

      const action = document.createElement('span');
      action.textContent = hint.action;
      action.style.color = '#d8e5e2';
      row.append(keys, action);
      root.appendChild(row);
    }

    parent.appendChild(root);
  }
}
