import { CATALYSTS } from '../sim';
import { createHudIcon } from './hudIcons';
import type { HudAction } from './GameHudModel';

/**
 * La scheda che si apre passando sopra a un'azione del dock.
 *
 * **Era un blocco di testo, ed e' il motivo per cui non si leggeva.** Quattro
 * righe separate da un a capo hanno tutte lo stesso peso: il nome dello
 * strumento non c'era, il costo nemmeno, la frase che spiega *cosa fa* spariva
 * appena l'azione era bloccata — al suo posto restava «Not enough funds.» e
 * nient'altro — e i numeri nudi («Radius 52») chiedevano al giocatore di sapere
 * gia' cosa sia grande e cosa piccolo in questa citta'.
 *
 * Qui c'e' la **struttura**: un'intestazione con nome e prezzo, la frase in
 * chiaro, le righe etichettate del comportamento, e in fondo il gesto che la usa
 * o cio' che la sta fermando. Chi disegna e' `tipElement`, ma il modello e' puro
 * e si prova senza DOM — che e' esattamente la meta' che sbagliava, perche' il
 * testo non lo controlla nessun tipo.
 */

export interface HudTipRow {
  readonly label: string;
  readonly value: string;
}

export interface HudTip {
  readonly title: string;
  readonly cost: number;
  readonly materialCost: number | null;
  /** Cosa fa, in una frase. **C'e' anche quando l'azione e' bloccata.** */
  readonly lead: string | null;
  readonly rows: readonly HudTipRow[];
  /** Cio' che solo questo ruolo apre, con la condizione per arrivarci. */
  readonly note: string | null;
  /** Il gesto che la usa, oppure cio' che la sta fermando. */
  readonly status: string;
  /** Le due cifre del requisito, quando a fermarla e' una soglia. */
  readonly detail: string | null;
  readonly blocked: boolean;
}

/**
 * Quanti nomi entrano in un elenco prima di diventare un conteggio.
 *
 * Tre e' quanti se ne ricordano leggendo. La coda e' «and 17 more» e non
 * «+17 more» perche' la riga e' una frase: il segno piu' e' notazione, e in
 * mezzo a delle parole si legge come un errore di stampa.
 */
const NAMES_SHOWN = 3;

export function nameList(items: readonly string[], separator = ', '): string {
  const rest = items.length - NAMES_SHOWN;
  const shown = items.slice(0, NAMES_SHOWN).join(separator);
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

/**
 * La portata detta in parole, e **poi** in cifre.
 *
 * «Radius 52» e' un numero senza scala: per sapere se sia tanto bisogna aver
 * gia' visto gli altri otto ruoli, cioe' averli comprati. La banda arriva dal
 * catalogo e non da soglie scritte a mano, cosi' resta vera se un raggio cambia
 * in `balance.ts`.
 */
const REACH_BANDS = ['Short', 'Medium', 'Long'] as const;
const RADII: readonly number[] = CATALYSTS.map((entry) => entry.radius);
const RADIUS_MIN = Math.min(...RADII);
const RADIUS_MAX = Math.max(...RADII);

export function reachLabel(radius: number): string {
  const span = RADIUS_MAX - RADIUS_MIN;
  const position = span <= 0 ? 1 : (radius - RADIUS_MIN) / span;
  const index = Math.min(REACH_BANDS.length - 1, Math.floor(position * REACH_BANDS.length));
  return `${REACH_BANDS[index]} · ${radius} tiles`;
}

/**
 * Il modello della scheda a partire dall'azione.
 *
 * **La descrizione e lo stato sono due cose diverse**, e tenerle in un campo
 * solo e' il difetto che questa funzione ripara: `reason` dice perche' il
 * bottone e' com'e' adesso, `description` dice cosa lo strumento fa sempre. Chi
 * non puo' permettersi il porto ha bisogno di sapere **entrambe**, ed e' proprio
 * mentre risparmia che vuole leggere a cosa serve.
 */
export function buildActionTip(action: HudAction): HudTip {
  const rows: HudTipRow[] = [];
  // Il vincolo di sito apre l'elenco: e' l'unica riga che cambia *dove* si
  // clicca, e leggerla in fondo vorrebbe dire leggerla dopo aver gia' scelto.
  if (action.site !== undefined) rows.push({ label: 'Where', value: action.site });
  if (action.radius !== undefined) rows.push({ label: 'Reach', value: reachLabel(action.radius) });
  // Gli usi urbani sono quattro: qui si nominano tutti. Il vecchio elenco si
  // accorciava a tre e chiudeva con «+1 more», che e' un'ellissi piu' lunga del
  // nome che nascondeva.
  if (action.favours !== undefined && action.favours.length > 0) {
    rows.push({ label: 'Attracts', value: action.favours.join(', ') });
  }
  if (action.penalises !== undefined && action.penalises.length > 0) {
    rows.push({ label: 'Pushes out', value: action.penalises.join(', ') });
  }
  // **Cosa ne ricava la citta'**, subito dopo cosa attira: e' la stessa frase
  // letta un passo piu' avanti — un mercato non porta fondi, porta i negozi che
  // li portano — e fra lo strumento in mano e la barra delle risorse non c'era
  // niente a dirlo.
  if (action.yields !== undefined) rows.push({ label: 'Yields', value: action.yields });
  if (action.typologies !== undefined && action.typologies.length > 0) {
    rows.push({ label: 'Grows', value: nameList(action.typologies) });
  }
  // La coppia sta **prima** di «Only here», e l'ordine e' la catena: due campi
  // sovrapposti fanno un quartiere, e il quartiere apre le forme. Letta dopo,
  // la promessa arriverebbe di nuovo senza la sua condizione.
  if (action.pairs !== undefined && action.pairs.length > 0) {
    rows.push({ label: 'Pairs with', value: nameList(action.pairs, '; ') });
  }

  return {
    title: action.label,
    cost: action.cost,
    materialCost: action.materialCost ?? null,
    lead: action.description ?? null,
    rows,
    note: action.unlocks !== undefined && action.unlocks.length > 0
      // «Only here» e' la meta' che conta: sono le forme che nessun altro ruolo
      // apre, ed e' l'unica riga per cui valga la pena comprare *questo*.
      ? `Only here: ${nameList(action.unlocks, '; ')}`
      : null,
    status: action.reason,
    detail: action.requirement ?? null,
    blocked: !action.available,
  };
}

/** Il testo intero della scheda, per chi la legge invece di guardarla. */
export function tipText(tip: HudTip): string {
  const materialCost = tip.materialCost === null ? '' : ` · ${tip.materialCost} materials`;
  const lines = [`${tip.title} · ${tip.cost} funds${materialCost}`];
  if (tip.lead !== null) lines.push(tip.lead);
  for (const row of tip.rows) lines.push(`${row.label}: ${row.value}`);
  if (tip.note !== null) lines.push(tip.note);
  lines.push(tip.detail === null ? tip.status : `${tip.status} ${tip.detail}`);
  return lines.join('\n');
}

/**
 * La scheda come elemento, **dentro** il bottone.
 *
 * Solo `<span>`: un bottone accetta contenuto di frase e nient'altro, e un
 * `<div>` qui dentro sarebbe markup non valido che i browser riparano ognuno a
 * modo suo. Il `display` lo da' il CSS, che e' dove sta gia' tutto il resto.
 */
export function tipElement(tip: HudTip): HTMLElement {
  const root = document.createElement('span');
  root.className = 'hud-tip';
  root.setAttribute('role', 'tooltip');
  root.dataset.blocked = tip.blocked ? 'true' : 'false';

  const head = block('hud-tip-head');
  head.appendChild(block('hud-tip-title', tip.title));
  const cost = block('hud-tip-cost');
  cost.append(createHudIcon('funds'), document.createTextNode(String(tip.cost)));
  if (tip.materialCost !== null) {
    cost.append(
      document.createTextNode(' · '),
      createHudIcon('materials'),
      document.createTextNode(String(tip.materialCost)),
    );
  }
  head.appendChild(cost);
  root.appendChild(head);

  if (tip.lead !== null) root.appendChild(block('hud-tip-lead', tip.lead));

  if (tip.rows.length > 0) {
    const rows = block('hud-tip-rows');
    for (const row of tip.rows) {
      const line = block('hud-tip-row');
      line.append(block('hud-tip-key', row.label), block('hud-tip-value', row.value));
      rows.appendChild(line);
    }
    root.appendChild(rows);
  }

  if (tip.note !== null) root.appendChild(block('hud-tip-note', tip.note));

  const status = block('hud-tip-status', tip.status);
  if (tip.detail !== null) status.appendChild(block('hud-tip-detail', tip.detail));
  root.appendChild(status);
  return root;
}

function block(className: string, text?: string): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
