import { SIM_TICK_RATE } from '../game/simScene';
import { decisionMark, type GameHudModel } from './GameHudModel';

/**
 * La decisione in attesa, disegnata una volta sola per tre superfici.
 *
 * La carta modale, l'inbox della dashboard e quella del cassetto Policy
 * mostravano — o avrebbero dovuto mostrare — le stesse alternative con lo stesso
 * segno sotto. Erano due copie e mezzo dello stesso `for`, e la scadenza ne
 * avrebbe fatte tre: da qui escono i nodi, e chi li ospita decide solo dove.
 *
 * **La scadenza si dice in secondi, non in tick.** Il tick e' l'unita' della
 * simulazione e non compare da nessun'altra parte nell'interfaccia; «2:00» e'
 * leggibile senza sapere cosa sia un tick, che e' il requisito minimo per un
 * conto alla rovescia su cui si deve decidere.
 */

export interface DecisionInboxHandlers {
  readonly onDecision: (optionId: string) => void;
  readonly onSnooze: () => void;
}

interface OptionListConfig {
  /**
   * Vero quando i bottoni vanno disarmati dopo il primo clic.
   *
   * Serve alla carta modale, che si ridisegna solo quando cambia l'id della
   * decisione: senza, un doppio clic applicherebbe due volte la stessa scelta.
   * I cassetti si ridisegnano a ogni passata e non ne hanno bisogno.
   */
  readonly once: boolean;
}

/** Il conto alla rovescia, in `m:ss`. Sotto il minuto resta in secondi. */
export function decisionCountdown(ticksLeft: number): string {
  const seconds = Math.max(0, Math.ceil(ticksLeft / SIM_TICK_RATE));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * La riga d'urgenza: quanto tempo resta e **cosa succede** se non si risponde.
 *
 * Le due meta' viaggiano insieme apposta. Un conto alla rovescia da solo dice
 * che c'e' fretta e non cosa si rischia, ed e' la forma di pressione peggiore:
 * quella su cui non si puo' decidere. Nominare l'alternativa che scattera' e'
 * cio' che rende «decidi piu' tardi» una scelta invece di un rinvio.
 */
export function decisionDeadline(model: GameHudModel): HTMLElement | null {
  const ticksLeft = model.decisionTicksLeft;
  if (ticksLeft === null) return null;
  const line = document.createElement('p');
  line.className = 'decision-deadline';
  line.dataset['urgent'] = ticksLeft <= 0 ? 'true' : 'false';
  const lapse = model.decisionLapseLabel;
  line.textContent = lapse === null
    ? `The council decides in ${decisionCountdown(ticksLeft)}.`
    : `${decisionCountdown(ticksLeft)} left — with no answer the council will choose “${lapse}”.`;
  return line;
}

/** Le alternative, con il segno che ognuna lascia, e il «decidi piu' tardi». */
export function decisionOptionList(
  model: GameHudModel,
  handlers: DecisionInboxHandlers,
  config: OptionListConfig,
): HTMLElement {
  const decision = model.decision;
  const options = document.createElement('div');
  options.className = 'decision-options';
  if (decision === null) return options;

  for (const option of decision.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'decision-option';
    // L'alternativa che scattera' da sola si riconosce senza leggere la riga
    // della scadenza: e' la stessa informazione, ma dove sta la mano.
    if (option.onLapse === true) button.dataset['lapse'] = 'true';
    const label = document.createElement('strong');
    label.textContent = option.label;
    const description = document.createElement('span');
    description.textContent = option.description;
    button.append(label, description);
    // Il segno che l'alternativa lascia sulla forma della citta'. Senza questa
    // riga il giocatore legge tre travasi di risorse e non sa che sta
    // scegliendo anche come cresceranno i suoi isolati — o quale policy sta
    // per perdere.
    const mark = decisionMark(option, model.decisionActiveCharter);
    if (mark !== null) {
      const consequence = document.createElement('span');
      consequence.className = 'decision-mark';
      consequence.textContent = mark;
      button.appendChild(consequence);
    }
    button.addEventListener(
      'click',
      () => handlers.onDecision(option.id),
      config.once ? { once: true } : undefined,
    );
    options.appendChild(button);
  }

  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'decision-later';
  later.textContent = 'Decide later';
  later.addEventListener(
    'click',
    () => handlers.onSnooze(),
    config.once ? { once: true } : undefined,
  );
  options.appendChild(later);
  return options;
}

/**
 * L'inbox del consiglio, per un cassetto.
 *
 * E' la stessa decisione della carta, dentro il pannello che il giocatore ha
 * aperto: la carta e i cassetti condividono il corridoio destro e non possono
 * stare a schermo insieme, quindi la scelta deve poter vivere in entrambi.
 */
export function decisionInbox(
  model: GameHudModel,
  handlers: DecisionInboxHandlers,
  sectionTitle: (text: string) => HTMLElement,
): HTMLElement | null {
  const decision = model.decision;
  if (decision === null) return null;

  const section = document.createElement('section');
  section.className = 'overview-section decision-inbox';
  section.dataset['urgency'] = decision.urgency;
  section.appendChild(sectionTitle('Decision awaits'));

  const title = document.createElement('strong');
  title.className = 'decision-inbox-title';
  title.textContent = decision.title;
  const message = document.createElement('p');
  message.className = 'decision-inbox-message';
  message.textContent = decision.message;
  section.append(title, message);

  const deadline = decisionDeadline(model);
  if (deadline !== null) section.appendChild(deadline);

  section.appendChild(decisionOptionList(model, handlers, { once: false }));
  return section;
}
