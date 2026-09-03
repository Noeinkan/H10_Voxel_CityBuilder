import { createHudIcon } from './hudIcons';
import { amount, percent, signed, type Breakdown, type Contribution, type Meter, type Verdict } from './meters';
import type { SiteAdvice } from './siteAdvice';

/**
 * Il disegno delle misure: barre, verdetti, composizioni e consigli.
 *
 * Gemello di `drawerBits.ts` e diviso dalla stessa linea: qui stanno i nodi che
 * **non sanno** quale superficie li stia usando. La scheda di selezione e il
 * cassetto Citta' chiamano gli stessi cinque costruttori, ed e' cio' che tiene
 * un solo vocabolario grafico invece di due che divergono — lo stesso motivo per
 * cui `overviewGoal` viveva gia' esportato invece che ricopiato.
 *
 * Senza test, come il resto del DOM del progetto: cosa mostrare lo decidono
 * `meters.ts`, `selectionMeters.ts` e `siteAdvice.ts`, che sono puri ed e' li'
 * che le prove stanno.
 */

/** La risposta corta in cima al pannello: due parole e un tono. */
export function verdictCard(verdict: Verdict): HTMLElement {
  const card = document.createElement('section');
  card.className = 'panel-verdict';
  card.dataset['tone'] = verdict.tone;

  const headline = document.createElement('strong');
  headline.className = 'panel-verdict-headline';
  headline.textContent = verdict.headline;

  const detail = document.createElement('span');
  detail.className = 'panel-verdict-detail';
  detail.textContent = verdict.detail;

  card.append(headline, detail);
  return card;
}

/**
 * Le misure come barre.
 *
 * La frase che prima era il valore della riga finisce nel `title`: serve la
 * prima volta e poi mai piu', e stampata fissa mangerebbe lo spazio che rende
 * leggibili le barre — che e' la stessa scelta gia' fatta per il `hint` del
 * bottone d'azione.
 */
export function meterList(meters: readonly Meter[]): HTMLElement {
  const list = document.createElement('div');
  list.className = 'meter-list';
  for (const entry of meters) list.appendChild(meterRow(entry));
  return list;
}

function meterRow(entry: Meter): HTMLElement {
  const row = document.createElement('div');
  row.className = 'meter';
  row.dataset['tone'] = entry.tone;
  row.title = entry.hint;

  if (entry.icon !== null) row.appendChild(createHudIcon(entry.icon));

  const label = document.createElement('span');
  label.className = 'meter-label';
  label.textContent = entry.label;

  const value = document.createElement('strong');
  value.className = 'meter-value';
  value.textContent = entry.value;

  row.append(label, value);
  // Nessuna barra dove non c'e' un tetto: una lunghezza che non si confronta con
  // niente direbbe il falso proprio nel colpo d'occhio per cui la barra esiste.
  if (entry.ratio !== null) row.appendChild(track(entry.ratio, 'meter'));
  return row;
}

/**
 * Quanto ce n'e' contro quanto ne serve, e da chi viene.
 *
 * Le voci hanno una barra propria e non una fetta della barra grande: sono
 * contributi al **totale**, non parti di esso — la congestione ne toglie — e
 * impilarle direbbe che si sommano fino al pieno, che e' esattamente cio' che
 * non fanno.
 */
export function breakdownBlock(breakdown: Breakdown): HTMLElement {
  const block = document.createElement('div');
  block.className = 'breakdown';
  block.dataset['met'] = breakdown.met ? 'true' : 'false';

  const head = document.createElement('div');
  head.className = 'breakdown-head';
  const label = document.createElement('span');
  label.textContent = breakdown.label;
  const value = document.createElement('strong');
  value.textContent = `${amount(breakdown.value)} / ${amount(breakdown.target)}`;
  head.append(label, value);

  block.append(head, track(breakdown.ratio, 'meter'));
  if (breakdown.parts.length === 0) return block;

  const parts = document.createElement('ul');
  parts.className = 'breakdown-parts';
  for (const part of breakdown.parts) {
    const item = document.createElement('li');
    item.className = 'breakdown-part';
    item.dataset['negative'] = part.negative ? 'true' : 'false';

    const name = document.createElement('span');
    name.className = 'part-name';
    name.textContent = part.label;

    const number = document.createElement('strong');
    number.className = 'part-value';
    number.textContent = signed(part.value);

    item.append(name, track(part.share, 'part'), number);
    parts.appendChild(item);
  }
  block.appendChild(parts);
  return block;
}

/**
 * Di cosa e' fatta un'unita', come una barra sola divisa in usi.
 *
 * La legenda sta sotto e non dentro i segmenti: a ventitre edifici su quattro
 * usi qualche fetta e' larga sei pixel, e un'etichetta dentro sarebbe illeggibile
 * proprio nei casi in cui serve.
 */
export function mixBar(parts: readonly Contribution[]): HTMLElement {
  const block = document.createElement('div');
  block.className = 'mix';
  if (parts.length === 0) return block;

  const bar = document.createElement('span');
  bar.className = 'mix-bar';
  const legend = document.createElement('div');
  legend.className = 'mix-legend';

  for (const part of parts) {
    const slice = document.createElement('span');
    slice.className = 'mix-slice';
    slice.style.width = `${part.share * 100}%`;
    if (part.key !== undefined) slice.dataset['use'] = part.key;
    slice.title = `${amount(part.value)} ${part.label.toLowerCase()} · ${percent(part.share)}`;
    bar.appendChild(slice);

    const item = document.createElement('span');
    item.className = 'mix-key';
    if (part.key !== undefined) item.dataset['use'] = part.key;
    item.textContent = `${amount(part.value)} ${part.label.toLowerCase()}`;
    legend.appendChild(item);
  }

  block.append(bar, legend);
  return block;
}

/**
 * Cosa piazzare qui attorno, in tre righe cliccabili con lo sguardo.
 *
 * «up to» e non «+34» secco: il valore e' al centro del raggio, e la portata
 * segue strade e terreno. La parola e' l'unica cosa che rende vera la promessa
 * senza rifare qui il calcolo geodetico che vive in `reach.ts`.
 */
export function adviceCard(advice: SiteAdvice): HTMLElement {
  const card = document.createElement('section');
  card.className = 'advice';

  const title = document.createElement('h4');
  title.className = 'advice-title';
  title.textContent = `Place nearby to lift ${advice.label.toLowerCase()}`;

  const note = document.createElement('span');
  note.className = 'advice-note';
  note.textContent = advice.missing > 0
    ? `${advice.missing} desirability short · values are at the catalyst's centre`
    : 'Values are at the catalyst\'s centre and fall off with distance';

  const list = document.createElement('ul');
  list.className = 'advice-list';
  for (const option of advice.options) {
    const item = document.createElement('li');
    item.className = 'advice-option';
    item.dataset['present'] = option.present ? 'true' : 'false';
    // Chi chiude il divario da solo si distingue da chi lo accorcia: sono due
    // consigli diversi, e la lista li mette gia' in quest'ordine.
    item.dataset['enough'] = option.enough ? 'true' : 'false';
    item.title = option.present
      ? `${option.hint} You already have one within reach.`
      : option.hint;

    const name = document.createElement('span');
    name.className = 'advice-name';
    name.textContent = option.label;

    const gain = document.createElement('strong');
    gain.className = 'advice-gain';
    gain.textContent = `up to ${signed(option.gain)}`;

    const cost = document.createElement('span');
    cost.className = 'advice-cost';
    cost.textContent = `${option.cost}`;

    item.append(createHudIcon(option.icon), name, track(option.share, 'advice'), gain, cost);
    list.appendChild(item);
  }

  card.append(title, note, list);
  return card;
}

/** Una barra sola: la vaschetta e il suo riempimento, in percentuale. */
function track(ratio: number, kind: 'meter' | 'part' | 'advice'): HTMLElement {
  const rail = document.createElement('span');
  rail.className = `${kind}-track`;
  const fill = document.createElement('span');
  fill.className = `${kind}-fill`;
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
  rail.appendChild(fill);
  return rail;
}
