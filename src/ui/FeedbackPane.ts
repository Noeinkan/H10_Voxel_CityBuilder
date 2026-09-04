import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_CHARS,
  FEEDBACK_TO,
  composeFeedback,
  contextLines,
  feedbackCategory,
  handoffNote,
  mailtoTooLong,
  mailtoUrl,
  validateFeedback,
  type FeedbackCategoryId,
  type FeedbackContext,
  type FeedbackDraft,
} from './community';
import { ABOUT_LINE } from './MainMenuModel';
import { titleNote } from './titleBits';
import './community.css';

/**
 * La sottoschermata da cui si manda una nota a chi fa il gioco.
 *
 * **E' una sottoschermata, non una seconda modale.** Il menu e' gia' una modale
 * con il suo velo, la sua trappola del `Tab` e il suo `Esc` che torna
 * all'elenco: aprirne un'altra sopra vorrebbe dire due trappole che si
 * contendono il fuoco e due `Esc` che si contendono la chiusura. Vestendosi da
 * pannello come «Settings» e «Help» eredita tutto e non aggiunge un modo.
 *
 * **Il pannello da cui si copia non e' un ripiego, e' il pannello.** La consegna
 * e' un `mailto:`, cioe' un passaggio di consegne a un programma che potrebbe
 * non esserci: e' l'unico gesto del gioco il cui fallimento non si vede: chi
 * scrive vede un bottone che non ha fatto niente, e noi vediamo un silenzio
 * identico a «nessuno aveva niente da dire». La nota composta resta percio'
 * sempre a schermo, accanto all'indirizzo, prima ancora che si prema «Send».
 *
 * Come i cassetti e le altre sezioni del menu, non conosce ne' lo storage ne'
 * la simulazione: la riga della partita gliela passa chi la possiede.
 */

export interface FeedbackPaneHandlers {
  /**
   * La partita in una riga, chiesta all'apertura.
   *
   * Non e' un dato salvato: il contesto allegato dichiara valori veri e
   * correnti, e una riga presa mezz'ora fa sarebbe una dichiarazione falsa.
   */
  readonly onCity: () => string;
}

const TITLE = 'Send feedback';
const SUBTITLE = 'One note, one inbox — it reaches the person who makes the game.';

export class FeedbackPane {
  readonly root: HTMLElement;

  private readonly hints = new Map<FeedbackCategoryId, HTMLElement>();
  private readonly headers = new Map<FeedbackCategoryId, HTMLButtonElement>();
  private readonly message: HTMLTextAreaElement;
  private readonly reply: HTMLInputElement;
  private readonly attach: HTMLInputElement;
  private readonly contextList: HTMLElement;
  private readonly status: HTMLElement;
  private readonly copyBox: HTMLDetailsElement;
  private readonly copyText: HTMLElement;
  private readonly copyButton: HTMLButtonElement;
  private category: FeedbackCategoryId = 'broken';
  private context: FeedbackContext | null = null;

  constructor(private readonly handlers: FeedbackPaneHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'title-pane';

    const title = document.createElement('h2');
    title.className = 'title-pane-title';
    title.textContent = TITLE;

    const list = document.createElement('div');
    list.className = 'feedback-kinds';
    for (const entry of FEEDBACK_CATEGORIES) {
      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'feedback-kind';
      header.textContent = entry.label;
      header.addEventListener('click', () => this.choose(entry.id));
      const hint = titleNote(entry.hint);
      hint.classList.add('feedback-hint');
      this.headers.set(entry.id, header);
      this.hints.set(entry.id, hint);
      list.append(header, hint);
    }

    this.message = document.createElement('textarea');
    this.message.className = 'feedback-message';
    this.message.rows = 7;
    // Lo stesso numero del validatore: un tetto piu' basso qui sarebbe un muro
    // silenzioso a meta' frase, e chi ci sbatte sta gia' segnalando qualcosa.
    this.message.maxLength = FEEDBACK_MAX_CHARS;
    this.message.setAttribute('aria-label', 'Your note');
    this.message.addEventListener('input', () => this.repaintNote());

    this.reply = document.createElement('input');
    this.reply.type = 'email';
    this.reply.className = 'title-field';
    this.reply.placeholder = 'you@example.com';
    this.reply.setAttribute('aria-label', 'Reply address, optional');
    this.reply.addEventListener('input', () => this.repaintNote());

    const attachRow = document.createElement('label');
    attachRow.className = 'feedback-check';
    this.attach = document.createElement('input');
    this.attach.type = 'checkbox';
    this.attach.checked = true;
    this.attach.addEventListener('change', () => this.repaintNote());
    const attachText = document.createElement('span');
    attachText.textContent = 'Attach what I am looking at';
    attachRow.append(this.attach, attachText);

    // I valori veri, non una descrizione di quali siano: la promessa e' «niente
    // oltre a cio' che vedi qui», e si mantiene solo mostrandolo.
    const disclosure = document.createElement('details');
    disclosure.className = 'feedback-disclose';
    const summary = document.createElement('summary');
    summary.textContent = 'Exactly what that attaches';
    this.contextList = document.createElement('div');
    this.contextList.className = 'feedback-context';
    disclosure.append(summary, this.contextList);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'title-button title-button--primary';
    const sendLabel = document.createElement('span');
    sendLabel.className = 'title-label';
    sendLabel.textContent = 'Send';
    send.appendChild(sendLabel);
    send.addEventListener('click', () => this.send());

    this.status = document.createElement('p');
    this.status.className = 'feedback-status';
    this.status.setAttribute('role', 'status');

    this.copyBox = document.createElement('details');
    this.copyBox.className = 'feedback-copy';
    const copySummary = document.createElement('summary');
    copySummary.textContent = `Or send it yourself to ${FEEDBACK_TO}`;
    this.copyText = document.createElement('pre');
    this.copyText.className = 'feedback-preview';
    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'title-small';
    this.copyButton.textContent = 'Copy the note';
    this.copyButton.addEventListener('click', () => void this.copy());
    this.copyBox.append(copySummary, this.copyText, this.copyButton);

    this.root.append(
      title,
      titleNote(SUBTITLE),
      list,
      this.message,
      titleNote('Reply address — leave it blank to stay anonymous.'),
      this.reply,
      attachRow,
      disclosure,
      send,
      this.status,
      this.copyBox,
    );
    this.choose(this.category);
  }

  /**
   * Il pannello si apre: si rilegge il contesto e si azzera cio' che diceva.
   *
   * Il testo gia' scritto invece resta. Chi esce a controllare un numero e
   * rientra non deve ritrovare il riquadro vuoto: sarebbe la perdita di lavoro
   * piu' facile da causare e la meno perdonabile qui.
   */
  open(): void {
    this.context = this.snapshot();
    this.status.textContent = '';
    this.paintContext();
    this.repaintNote();
  }

  /** Cosa parte insieme alla nota: quattro fatti, e nessuno riguarda chi scrive. */
  private snapshot(): FeedbackContext {
    return {
      build: ABOUT_LINE,
      city: this.handlers.onCity(),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      browser: navigator.userAgent,
    };
  }

  private paintContext(): void {
    const context = this.context;
    if (context === null) return;
    this.contextList.replaceChildren();
    for (const [label, value] of contextLines(context)) {
      const row = document.createElement('div');
      row.className = 'feedback-context-row';
      const name = document.createElement('span');
      name.textContent = label;
      const text = document.createElement('span');
      text.textContent = value;
      row.append(name, text);
      this.contextList.appendChild(row);
    }
  }

  /**
   * Sceglie la categoria e apre la sua riga.
   *
   * **Il testo gia' scritto non si tocca.** Un riquadro per categoria lo
   * mangerebbe a ogni ripensamento; questo e' uno solo, e cambia il segnaposto.
   */
  private choose(id: FeedbackCategoryId): void {
    this.category = id;
    for (const [key, header] of this.headers) {
      const open = key === id;
      header.setAttribute('aria-expanded', String(open));
      const hint = this.hints.get(key);
      if (hint !== undefined) hint.hidden = !open;
    }
    this.message.placeholder = feedbackCategory(id).placeholder;
    this.repaintNote();
  }

  private draft(): FeedbackDraft {
    return {
      category: this.category,
      message: this.message.value,
      reply: this.reply.value,
      context: this.attach.checked ? this.context : null,
    };
  }

  /** La nota da copiare segue cio' che si sta scrivendo, non l'ultimo invio. */
  private repaintNote(): void {
    const { subject, body } = composeFeedback(this.draft(), new Date());
    this.copyText.textContent = `Subject: ${subject}\n\n${body}`;
  }

  private send(): void {
    const draft = this.draft();
    const verdict = validateFeedback(draft);
    if (!verdict.ok) {
      this.say(verdict.reason);
      return;
    }
    const note = composeFeedback(draft, new Date());
    const url = mailtoUrl(note);
    this.copyText.textContent = `Subject: ${note.subject}\n\n${note.body}`;
    // Aperto prima del passaggio di consegne, non dopo: se il client non c'e',
    // qui non arriva nessun errore da intercettare, e cio' che resta a schermo
    // e' l'unica via che la nota ha ancora.
    this.copyBox.open = true;
    this.say(handoffNote(mailtoTooLong(url)));
    window.location.href = url;
  }

  private async copy(): Promise<void> {
    const text = this.copyText.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      this.copyButton.textContent = 'Copied';
      window.setTimeout(() => {
        this.copyButton.textContent = 'Copy the note';
      }, 1600);
    } catch {
      // Gli appunti si negano senza spiegazioni: selezionare il testo e' la via
      // che resta, e dirlo vale piu' di un errore ingoiato.
      this.say('The clipboard said no — select the note above and copy it by hand.');
    }
  }

  /**
   * Una riga di esito, portata dentro la vista.
   *
   * La colonna del menu scorre: in fondo a un pannello lungo questa riga nasce
   * spesso sotto il bordo, e un rifiuto che non si vede e' identico a un
   * bottone morto — che e' esattamente cio' che si sta cercando di evitare.
   */
  private say(text: string): void {
    this.status.textContent = text;
    this.status.scrollIntoView({ block: 'nearest' });
  }
}
