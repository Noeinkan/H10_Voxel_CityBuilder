import type { ReachSummary } from '../engine/InfluenceOverlay';
import type { ActionFailure, SiteCost } from '../game/actions';
import { CLASS_LABELS, type BuildingClass } from '../sim/classes';
import type { LandmarkSite } from '../world/buildings/Builder';
import { GROUND, type GroundKind } from '../world/grading/grade';

/**
 * Le righe che il cursore mostra prima di un click, e i motivi di un rifiuto.
 *
 * **Sono funzioni pure, e stanno fuori da `main.ts` per questo.** Non leggono
 * scena, HUD ne' mondo: prendono cio' che l'azione ha gia' deciso e ne fanno una
 * frase in inglese. Chi cerca il testo che il giocatore legge lo trova qui invece
 * che in mezzo al cablaggio, e chi cabla non se le porta dietro.
 */

export function classLabel(cls: BuildingClass): string {
  return CLASS_LABELS[cls] ?? 'urban';
}

const GROUND_LABELS: Readonly<Record<GroundKind, string>> = {
  [GROUND.flat]: 'flat ground',
  [GROUND.sloped]: 'terraced slope',
  [GROUND.shore]: 'quay',
  [GROUND.rock]: 'rock',
  [GROUND.refused]: 'unworkable',
};

/**
 * Il perche' del sovrapprezzo, accanto al prezzo.
 *
 * Su terreno di listino non compare nulla: un `×1` accanto a ogni cartellino
 * insegnerebbe a ignorare la riga proprio dove invece cambia.
 */
export function groundNote(site: SiteCost | null): string {
  if (site === null || site.ground === GROUND.flat) return '';
  if (site.ground === GROUND.refused) return ` · ${GROUND_LABELS[site.ground]}`;
  return ` · ${GROUND_LABELS[site.ground]} ×${site.weight}`;
}

/**
 * Cosa il raggio nominale non dice: quanto terreno tocca davvero **da qui**.
 *
 * Da quando la portata e' geodetica il raggio e' un budget di cammino, e due
 * siti a dieci celle di distanza possono coprire il doppio l'uno dell'altro
 * perche' uno guarda l'entroterra e l'altro il mare. Il conto delle celle da
 * solo non si legge — nessuno sa se tremila siano tante — ma due siti a
 * confronto si', ed e' esattamente cio' che il giocatore sta facendo mentre
 * muove il cursore. La percentuale in coda compare solo dove il sito e'
 * tagliato: dirla sempre la ridurrebbe a rumore di fondo.
 */
export function reachNote(radius: number, coverage: ReachSummary | undefined): string {
  if (coverage === undefined) return `reach ${radius}`;
  const cells = `${coverage.cells.toLocaleString('en-US')} cells`;
  if (coverage.ratio >= 0.85) return `reach ${radius} · ${cells}`;
  return `reach ${radius} · ${cells} (${Math.round((1 - coverage.ratio) * 100)}% blocked)`;
}

/**
 * Cosa succedera' al riquadro del landmark, detto sul cursore.
 *
 * Sono tutte posizioni **valide**: il catalizzatore si piazza e il suo campo
 * funziona in ogni caso. La riga cambia solo cio' che il giocatore non potrebbe
 * dedurre — se il monumento comparira', e quante case costa.
 */
export function landmarkNote(site: LandmarkSite): string {
  // **Il terreno per primo**, come nella regola che lo decide: dire quante case
  // porta via un riquadro che nessuna opera reggerebbe manderebbe a cercare una
  // sacca bassa dove il problema e' la parete. Ed e' il solo dei tre casi in cui
  // non compare nemmeno la piazzola — `canPaint` scarta le colonne in parete —
  // quindi la riga promette meno delle altre due, di proposito.
  if (site.refusal === 'no-footing') {
    return 'Valid position, but nothing can be built on this slope: the catalyst works, the landmark will not appear. Try flatter ground.';
  }
  if (site.refusal === 'structure-in-the-way') {
    return 'Valid position. Something built to last stands here: only the plaza will appear.';
  }
  if (site.refusal === 'block-too-tall') {
    return 'Valid position, but too tall to clear: only the plaza will appear. Try a lower pocket.';
  }
  if (site.clears === 0) return 'Valid position.';
  const what = site.clears === 1 ? 'building' : 'buildings';
  return `Valid position. Clears ${site.clears} ${what} to make room.`;
}

const FAILURE_LABELS: Readonly<Record<ActionFailure, string>> = {
  'terrain-loading': 'The terrain is still being generated.',
  'not-buildable': 'No earthwork holds here: cliff or deep water.',
  'needs-coast': 'This link has to reach the sea.',
  'needs-waterfront': 'A Marina needs the sea or a lake.',
  'needs-open-ground': 'Needs a wide, level clearing.',
  'too-close': 'Too close to a catalyst of the same class.',
  'insufficient-funds': 'Not enough funds.',
  'insufficient-materials': 'Not enough materials. Grow industry first.',
  // Senza un numero: tre azioni con tre soglie diverse passano di qui — il
  // settore, la mensola, le policy — e citare quella dell'espansione era
  // gia' sbagliato per le policy. La cifra esatta sta nel tooltip di ciascuna
  // azione, che la prende dal proprio listino.
  'population-required': 'The city needs more residents for this.',
  'landmark-requires-city': 'This monument crowns an established city. Build more first.',
  'already-active': 'This action is already active.',
  'already-unlocked': 'This sector is already unlocked.',
  'onboarding-order': 'Complete the current tutorial step first.',
  'policy-incompatible': 'This policy conflicts with one that is already active.',
  'decision-option-invalid': 'This decision option is no longer available.',
  // Mensola e Skyport condividono gli stessi gesti: cercare un edificio,
  // cercarne uno piu' alto, cercare un'altra facciata.
  'needs-building': 'Point at a building facade.',
  'building-too-short': 'This building is too low to carry the structure.',
  'no-room-aloft': 'No room on this facade.',
  // I tre della funivia dicono tre gesti diversi, come quelli della mensola:
  // andare sulla costa, cercare un braccio di mare, spostarsi lungo la stessa
  // riva. Il terzo e' quello che capita di piu' su un lungomare costruito.
  'needs-shore': 'Point at dry land: a ropeway starts on a shore.',
  'needs-crossing': 'Nothing to cross from here: find water between two shores.',
  'no-room-for-line': 'No room for the towers here. Try further along the shore.',
  'landmark-in-the-way': 'A landmark already stands here: monuments are not replaced by another landmark.',
};

export function actionFailureLabel(reason: ActionFailure): string {
  return FAILURE_LABELS[reason];
}
