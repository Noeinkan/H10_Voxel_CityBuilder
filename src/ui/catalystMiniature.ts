import { paletteHex } from '../engine/paletteHex';
import type { CatalystId } from '../sim/catalysts';
import { landmarkOf, maxStageOf } from '../world/landmarks/config';
import { generateLandmark } from '../world/landmarks/generate';
import { FACING } from '../world/streets/streetGrid';
import { createHudIcon } from './hudIcons';
import {
  LATTICE_COLUMN,
  miniatureFill,
  miniatureToken,
  projectMiniature,
  type Miniature,
} from './voxelMiniature';

/**
 * La miniatura di un catalizzatore: la sua ricetta, vista dal dock.
 *
 * E' il terzo punto della fase 7.2 e il gancio piu' diretto fra toolbar e mondo:
 * la tessera mostra lo stamp che `generateLandmark` posera' davvero, con la
 * palette del tema in vigore. Non c'e' un disegno da tenere d'accordo con la
 * ricetta — quando la ricetta cambia, cambia la tessera.
 *
 * Solo le tessere del dock: nelle righe da 14-15px (consigli di sito, metri) una
 * miniatura diventa una macchia, e li' resta il pittogramma a tratto di
 * `hudIcons.ts`.
 */

/**
 * Quando una miniatura smette di leggersi.
 *
 * Le strutture a sedime crescente arrivano a 52×40 voxel, e proiettate in 22px
 * sono un pulviscolo di dettaglio che costa decine di KB di tracciato senza
 * dire niente in piu'. Il monumento finito e' un ago: alto piu' del doppio di
 * quanto e' largo, in una casella quadrata si riduce a una riga.
 *
 * I due limiti non sono scelti per ruolo: uno stadio sale finche' li rispetta,
 * e quindi un ruolo nuovo trova il suo stadio da solo.
 */
export const MINIATURE_LIMIT = {
  /** Caratteri di tracciato, sommati su tutti i gruppi. */
  pathChars: 12_000,
  /** Altezza su larghezza, in unita' di schermo. */
  aspect: 2,
} as const;

/**
 * Il verso della ricetta nella miniatura.
 *
 * Ovest e' quello che, misurato sulla tavola dei diciannove ruoli, porta
 * ingressi e facciate sulle due facce che la camera allo scatto zero vede: con
 * gli altri tre la tessera mostra il retro o il fianco cieco.
 */
const MINIATURE_FACING = FACING.west;

export interface CatalystMiniature {
  readonly stage: number;
  readonly miniature: Miniature;
}

const cache = new Map<CatalystId, CatalystMiniature | null>();

/** Il numero da confrontare con `MINIATURE_LIMIT.aspect`. */
export function miniatureAspect(miniature: Miniature): number {
  return miniature.rows / 2 / (miniature.columns * LATTICE_COLUMN);
}

export function miniaturePathChars(miniature: Miniature): number {
  let total = 0;
  for (const group of miniature.groups) total += group.d.length;
  return total;
}

/**
 * Lo stadio piu' alto che si legge ancora, e la sua proiezione.
 *
 * **Sale dallo zero e si ferma al primo che non si legge**, invece di scendere
 * dall'ultimo: gli stadi pesanti sono proprio quelli da non generare, e fermarsi
 * al primo sforamento li salta tutti. Memorizzata: il dock la chiede una volta
 * per tessera, ma la ricostruzione di una partita rifa' il dock.
 */
export function catalystMiniature(id: CatalystId): CatalystMiniature | null {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;

  const recipe = landmarkOf(id);
  let best: CatalystMiniature | null = null;
  if (recipe !== null) {
    for (let stage = 0; stage <= maxStageOf(recipe); stage++) {
      const stamp = generateLandmark({ kind: id, stage, facing: MINIATURE_FACING });
      if (stamp === null) break;
      const miniature = projectMiniature(stamp);
      if (miniature.groups.length === 0) continue;
      const fits = miniaturePathChars(miniature) <= MINIATURE_LIMIT.pathChars &&
        miniatureAspect(miniature) <= MINIATURE_LIMIT.aspect;
      // Lo stadio zero entra anche fuori misura: una miniatura pesante e' pur
      // sempre il ruolo, una tessera vuota non e' niente.
      if (!fits && best !== null) break;
      best = { stage, miniature };
      if (!fits) break;
    }
  }
  cache.set(id, best);
  return best;
}

const markup = new Map<CatalystId, { readonly viewBox: string; readonly body: string }>();

/**
 * La miniatura come SVG, o il pittogramma a tratto se il ruolo non ha ricetta.
 *
 * Il colore di ogni tracciato e' una custom property scritta da `hudTokens`, con
 * `palette.json` come ripiego per il primo frame: e' cio' che lascia cambiare
 * tema senza ricostruire le tessere. Il riquadro e' quadrato e appoggiato in
 * basso, cosi' una fila di tessere ha una linea di terra sola invece di
 * diciannove edifici centrati ognuno alla sua quota.
 */
export function createCatalystMiniature(id: CatalystId): SVGSVGElement {
  let art = markup.get(id);
  if (art === undefined) {
    const entry = catalystMiniature(id);
    if (entry === null) return createHudIcon(id);
    const { miniature } = entry;
    const width = miniature.columns * LATTICE_COLUMN;
    const height = miniature.rows / 2;
    const side = Math.max(width, height);
    const paths = miniature.groups.map((group) => {
      const color = `var(${miniatureToken(group.slot, group.face)}, ${miniatureFill(paletteHex[group.slot] ?? '#808080', group.face)})`;
      return `<path d="${group.d}" style="fill:${color};stroke:${color}"/>`;
    }).join('');
    art = {
      viewBox: `${round((width - side) / 2)} ${round(height - side)} ${round(side)} ${round(side)}`,
      body: `<g transform="scale(${round(LATTICE_COLUMN)} 0.5)">${paths}</g>`,
    };
    markup.set(id, art);
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', art.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hud-icon', 'hud-miniature');
  svg.dataset.icon = id;
  svg.innerHTML = art.body;
  return svg;
}

function round(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
