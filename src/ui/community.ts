/**
 * Le due porte verso chi ha fatto il gioco: il sostegno e la nota di feedback.
 *
 * Sta qui in TypeScript puro, senza DOM, per la stessa ragione di
 * `MainMenuModel.ts`: la parte che si sbaglia non e' disegnare un bottone, e'
 * comporre un messaggio: se il corpo perde una sezione o l'indirizzo di risposta
 * finisce nel posto sbagliato, la nota arriva illeggibile e chi l'ha scritta non
 * lo sapra' mai. Un modello testabile in `node` e' l'unico modo di verificarlo
 * senza un browser.
 *
 * **Una nota non deve poter sparire.** E' la regola che ha dettato la forma di
 * tutto il resto: la consegna e' un `mailto:`, cioe' un passaggio di consegne a
 * un programma che potrebbe non esserci, ed e' l'unico gesto del gioco il cui
 * fallimento e' invisibile — chi scrive vede un bottone che non ha fatto niente,
 * e noi vediamo un silenzio identico a «nessuno aveva niente da dire». Percio'
 * `composeFeedback` restituisce il testo intero, che `FeedbackPane.ts` mostra
 * sempre accanto all'indirizzo: se il passaggio non riesce, la nota e' ancora
 * li' da copiare.
 */

/**
 * La pagina di sostegno.
 *
 * Solo un collegamento: nessun pagamento passa da qui, e non c'e' niente da
 * configurare ne' da tenere segreto.
 */
export const SUPPORT_URL = 'https://ko-fi.com/noeinkan';

/**
 * L'etichetta non dice «Donate», e non e' una scelta di tono.
 *
 * Ko-fi riserva quella parola — e «Donation», e «Charity» — alle organizzazioni
 * non profit registrate e verificate, e la fa rispettare a posteriori
 * segnalando l'account di chi la usa senza esserlo. «Support» dice la stessa
 * cosa senza fare una promessa che non possiamo mantenere. Chi la cambia deve
 * cambiarla anche in `SUPPORT_TITLE`: sono la stessa frase, letta due volte.
 */
export const SUPPORT_LABEL = 'Support';

/** Il titolo del collegamento: dice dove si va prima di andarci. */
export const SUPPORT_TITLE = 'Support this project on Ko-fi';

/**
 * L'unica casella dove arriva una nota.
 *
 * E' un indirizzo di studio e non quello personale dell'autore, per la stessa
 * ragione per cui `ABOUT_LINE` firma «Noein Solutions»: questa riga finisce nel
 * bundle pubblico, e li' la raccolgono anche i raccoglitori automatici.
 */
export const FEEDBACK_TO = 'andrea.aita@noeinsolutions.com';

/** Il prefisso dell'oggetto: ordina la casella per progetto, non per mittente. */
export const FEEDBACK_SUBJECT_TAG = 'H10 Voxel City';

/**
 * Sotto questa soglia non c'e' abbastanza per rispondere.
 *
 * Non e' una difesa dallo spam — un `mailto:` non ne ha bisogno — e' il rifiuto
 * che spiega: «broken» da solo non dice ne' cosa ne' dove.
 */
export const FEEDBACK_MIN_CHARS = 12;

/**
 * Il tetto del riquadro, e lo stesso numero che il validatore controlla.
 *
 * Devono restare uguali: un `maxlength` piu' basso della validazione e' un muro
 * silenzioso a meta' frase, ed e' il difetto piu' comune di questi riquadri.
 */
export const FEEDBACK_MAX_CHARS = 4000;

/**
 * Oltre questa lunghezza il `mailto:` non e' piu' affidabile.
 *
 * Il limite non e' nostro: Windows tronca la riga di comando con cui apre il
 * client di posta, e la nota arriva tagliata a meta' senza che nessuno se ne
 * accorga. Sopra la soglia il pannello lo dice prima, e indica di copiare.
 */
export const MAILTO_SAFE_CHARS = 1800;

export type FeedbackCategoryId = 'broken' | 'balance' | 'idea' | 'confused' | 'general';

export interface FeedbackCategory {
  readonly id: FeedbackCategoryId;
  /** Cio' che si legge sulla voce chiusa, in prima persona: e' chi scrive a parlare. */
  readonly label: string;
  /** Lo stesso concetto in ASCII, per l'oggetto: le emoji non sopravvivono a ogni client. */
  readonly subject: string;
  /** Aprendo la voce: cosa rende utile una nota di questo tipo. */
  readonly hint: string;
  /** Il segnaposto del riquadro: una traccia da riempire, non un suggerimento. */
  readonly placeholder: string;
}

/**
 * Le cinque voci, in ordine di quanto e' urgente leggerle.
 *
 * **Sono una fisarmonica, non un menu a tendina.** Aprire una voce sceglie la
 * categoria *e* mostra cosa serve scrivere: la tendina sceglie altrettanto bene
 * e non insegna niente, e la domanda «cosa ti aspettavi invece» va posta li',
 * accanto al riquadro, non in un muro di istruzioni sopra.
 *
 * Cinque e' il numero giusto: di piu' diventa un elenco da leggere, di meno
 * smette di ordinare la casella.
 */
export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  {
    id: 'broken',
    label: '🐞 Something is broken',
    subject: 'Bug report',
    hint: 'What you were doing, what you expected, and what happened instead. The seed helps: it is in the context below.',
    placeholder: 'What I did:\nWhat I expected:\nWhat happened instead:',
  },
  {
    id: 'balance',
    label: '📉 The city does not add up',
    subject: 'Balance report',
    hint: 'A number that reads wrong: money that never runs out, residents that never arrive, a district that never grows.',
    placeholder: 'What I was watching:\nWhat the numbers said:\nWhat I expected them to say:',
  },
  {
    id: 'idea',
    label: '💡 I have an idea',
    subject: 'Idea',
    hint: 'What you wanted to do that the city would not let you do — the want matters more than the feature.',
    placeholder: 'What I wanted to do:\nWhy the city would not let me:',
  },
  {
    id: 'confused',
    label: '🧭 Something confused me',
    subject: 'Usability',
    hint: 'Where you got lost, and what you thought would happen. This is the bug we cannot see from our side.',
    placeholder: 'Where I got lost:\nWhat I thought would happen:',
  },
  {
    id: 'general',
    label: '💬 General impressions',
    subject: 'General feedback',
    hint: 'Anything else. Blunt is fine: it is more useful than polite.',
    placeholder: 'What I think:',
  },
];

/** La categoria dal suo id; la prima e' un ripiego onesto quanto un `!`. */
export function feedbackCategory(id: FeedbackCategoryId): FeedbackCategory {
  return FEEDBACK_CATEGORIES.find((entry) => entry.id === id) ?? FEEDBACK_CATEGORIES[0];
}

/**
 * Cio' che la nota porta con se' oltre al testo, se chi scrive acconsente.
 *
 * **Quattro campi, e sono tutti qui.** La casella di spunta nel pannello elenca
 * questi e mostra i valori veri, non una descrizione: la promessa e' «niente
 * oltre a cio' che vedi», e un tipo chiuso e' cio' che la tiene vera anche dopo
 * la prossima modifica. Niente nomi utente, niente percorsi di file, niente di
 * cio' che sta nel `localStorage`.
 */
export interface FeedbackContext {
  /** Quale gioco e quale edizione: la stessa riga che si legge in fondo al menu. */
  readonly build: string;
  /** La partita in una riga: seed, abitanti, edifici. Il seed rende riproducibile il resto. */
  readonly city: string;
  /** La finestra, non lo schermo: e' quella che decide cosa ci sta dentro. */
  readonly screen: string;
  /** Il browser come si dichiara lui: motore e sistema, che e' quanto serve. */
  readonly browser: string;
}

export interface FeedbackDraft {
  readonly category: FeedbackCategoryId;
  readonly message: string;
  /** Vuoto vuol dire anonimo, ed e' una nota valida quanto le altre. */
  readonly reply: string;
  /** `null` quando la spunta e' tolta: allora la sezione non si scrive proprio. */
  readonly context: FeedbackContext | null;
}

export interface FeedbackVerdict {
  readonly ok: boolean;
  /** Perche' no. Vuoto quando `ok`: un rifiuto senza motivo e' un bottone morto. */
  readonly reason: string;
}

/** La forma minima di un indirizzo: qualcosa, una chiocciola, un dominio con un punto. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Si puo' spedire?
 *
 * Ogni no dice cosa correggere. Il rifiuto muto e' indistinguibile da un bottone
 * rotto, e chi lo incontra sta gia' cercando di segnalare qualcosa.
 */
export function validateFeedback(draft: Pick<FeedbackDraft, 'message' | 'reply'>): FeedbackVerdict {
  const message = draft.message.trim();
  if (message.length === 0) {
    return { ok: false, reason: 'Write a line or two first — the box above is empty.' };
  }
  if (message.length < FEEDBACK_MIN_CHARS) {
    return { ok: false, reason: 'A few more words, please: what happened, and what did you expect?' };
  }
  if (message.length > FEEDBACK_MAX_CHARS) {
    return { ok: false, reason: `That is longer than ${FEEDBACK_MAX_CHARS} characters — trim it, or send it in two notes.` };
  }
  const reply = draft.reply.trim();
  if (reply !== '' && !EMAIL_SHAPE.test(reply)) {
    return { ok: false, reason: 'That reply address does not look like an email. Leave it blank to stay anonymous.' };
  }
  return { ok: true, reason: '' };
}

/** Le righe della sezione «Context», etichetta e valore, nell'ordine del tipo. */
export function contextLines(context: FeedbackContext): readonly (readonly [string, string])[] {
  return [
    ['Build', context.build],
    ['City', context.city],
    ['Screen', context.screen],
    ['Browser', context.browser],
  ];
}

export interface FeedbackNote {
  readonly subject: string;
  readonly body: string;
}

/** Quando: in UTC e in cifre, che si legge uguale da qualunque fuso. */
function stamp(sentAt: Date): string {
  return `${sentAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * La nota come arriva in casella.
 *
 * Sezioni fisse in ordine fisso: una casella piena resta scorribile solo se ogni
 * messaggio ha la stessa forma, e il testo di chi scrive sta tutto in un blocco
 * suo, verbatim — non ricomposto, non riassunto.
 *
 * L'ora arriva da fuori invece di leggere l'orologio qui: e' cio' che rende
 * questa funzione verificabile, e `AGENTS.md` tiene comunque `Date.now()` fuori
 * dai percorsi che devono ripetersi uguali.
 */
export function composeFeedback(draft: FeedbackDraft, sentAt: Date): FeedbackNote {
  const category = feedbackCategory(draft.category);
  const reply = draft.reply.trim();
  const lines = [
    `Type:  ${category.subject}`,
    `Sent:  ${stamp(sentAt)}`,
    `Reply: ${reply === '' ? 'not given (anonymous)' : reply}`,
    '',
    '--- Message ---',
    draft.message.trim(),
  ];
  if (draft.context !== null) {
    lines.push('', '--- Context ---');
    for (const [label, value] of contextLines(draft.context)) {
      lines.push(`${label.padEnd(8)} ${value}`);
    }
  }
  lines.push('', `--- Sent from the ${FEEDBACK_SUBJECT_TAG} feedback button ---`);
  return { subject: `[${FEEDBACK_SUBJECT_TAG}] ${category.subject}`, body: lines.join('\n') };
}

/** L'indirizzo che apre il client di posta con la nota gia' scritta dentro. */
export function mailtoUrl(note: FeedbackNote): string {
  const query = `subject=${encodeURIComponent(note.subject)}&body=${encodeURIComponent(note.body)}`;
  return `mailto:${FEEDBACK_TO}?${query}`;
}

/** Troppo lungo per fidarsi del passaggio di consegne: meglio dirlo prima. */
export function mailtoTooLong(url: string): boolean {
  return url.length > MAILTO_SAFE_CHARS;
}

/**
 * Cosa si legge dopo aver premuto «Send».
 *
 * **Non dice mai «sent».** Aprire un `mailto:` consegna la nota a un altro
 * programma e finisce li': nessuno qui ha visto partire niente, e affermarlo
 * sarebbe l'unica bugia dell'interfaccia. Dice cosa dovrebbe succedere, e cosa
 * fare se non succede.
 */
export function handoffNote(truncated: boolean): string {
  const base = `Your mail app should be opening. If nothing happens, copy the note below and send it to ${FEEDBACK_TO}.`;
  return truncated
    ? `This note is long enough that some mail apps will cut it short — copying it below is the safe way. ${base}`
    : base;
}
