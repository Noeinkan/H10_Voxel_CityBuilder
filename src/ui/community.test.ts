import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_CHARS,
  FEEDBACK_MIN_CHARS,
  FEEDBACK_TO,
  SUPPORT_LABEL,
  SUPPORT_TITLE,
  SUPPORT_URL,
  composeFeedback,
  contextLines,
  feedbackCategory,
  handoffNote,
  mailtoTooLong,
  mailtoUrl,
  validateFeedback,
  type FeedbackContext,
  type FeedbackDraft,
} from './community';

const CONTEXT: FeedbackContext = {
  build: 'H10 Voxel City Builder · alpha',
  city: 'seed 1234 · 340 residents · 87 buildings',
  screen: '1920x1080',
  browser: 'Mozilla/5.0 (Windows NT 10.0)',
};

const SENT = new Date('2026-09-04T12:30:45Z');

function draft(over: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return {
    category: 'broken',
    message: 'The harbour district never fills up.',
    reply: '',
    context: CONTEXT,
    ...over,
  };
}

describe('sostegno', () => {
  it('punta alla pagina Ko-fi dello studio', () => {
    expect(SUPPORT_URL).toBe('https://ko-fi.com/noeinkan');
  });

  /**
   * Il vincolo non e' di gusto: Ko-fi riserva quelle parole alle non profit
   * verificate e segnala chi le usa senza esserlo. Vale su tutto cio' che si
   * legge — etichetta e titolo insieme, che sono la stessa frase due volte.
   */
  it('non usa mai il vocabolario riservato alle non profit', () => {
    for (const testo of [SUPPORT_LABEL, SUPPORT_TITLE]) {
      expect(testo).not.toMatch(/donat|charity/i);
    }
  });
});

describe('validateFeedback', () => {
  it('rifiuta il riquadro vuoto dicendo che manca il testo', () => {
    const verdict = validateFeedback({ message: '   ', reply: '' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/empty/i);
  });

  it('rifiuta la nota troppo corta chiedendo cosa manca', () => {
    const verdict = validateFeedback({ message: 'broken', reply: '' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/more words/i);
  });

  /** Il tetto del riquadro e quello del validatore sono lo stesso numero: se
   *  divergono, si scrive contro un muro che non dice niente. */
  it('rifiuta oltre il tetto del riquadro, e non un carattere prima', () => {
    const pieno = 'a'.repeat(FEEDBACK_MAX_CHARS);
    expect(validateFeedback({ message: pieno, reply: '' }).ok).toBe(true);
    expect(validateFeedback({ message: `${pieno}a`, reply: '' }).ok).toBe(false);
  });

  it('accetta esattamente la soglia minima', () => {
    expect(validateFeedback({ message: 'x'.repeat(FEEDBACK_MIN_CHARS), reply: '' }).ok).toBe(true);
  });

  it('accetta un indirizzo vuoto: anonimo resta una nota valida', () => {
    expect(validateFeedback({ message: 'The harbour never fills up.', reply: '  ' }).ok).toBe(true);
  });

  it('rifiuta un indirizzo malformato ricordando che si lascia anche vuoto', () => {
    const verdict = validateFeedback({ message: 'The harbour never fills up.', reply: 'chi@dove' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/blank to stay anonymous/i);
  });
});

describe('composeFeedback', () => {
  it('scrive le sezioni in ordine fisso', () => {
    const { body } = composeFeedback(draft(), SENT);
    const testa = body.indexOf('Type:');
    const messaggio = body.indexOf('--- Message ---');
    const contesto = body.indexOf('--- Context ---');
    const firma = body.indexOf('--- Sent from');
    expect(testa).toBeLessThan(messaggio);
    expect(messaggio).toBeLessThan(contesto);
    expect(contesto).toBeLessThan(firma);
  });

  it('riporta il testo verbatim, a capo compresi', () => {
    const message = 'What I did:\nBuilt a harbour\n\nWhat happened: nothing & nobody came — odd.';
    const { body } = composeFeedback(draft({ message }), SENT);
    expect(body).toContain(message);
  });

  it('dichiara l\'anonimato invece di lasciare la riga vuota', () => {
    expect(composeFeedback(draft({ reply: '' }), SENT).body).toContain('Reply: not given (anonymous)');
  });

  it('scrive l\'ora in UTC, uguale da qualunque fuso', () => {
    expect(composeFeedback(draft(), SENT).body).toContain('Sent:  2026-09-04 12:30 UTC');
  });

  it('tiene l\'oggetto in ASCII: le emoji non sopravvivono a ogni client', () => {
    for (const categoria of FEEDBACK_CATEGORIES) {
      const { subject } = composeFeedback(draft({ category: categoria.id }), SENT);
      expect(subject).toMatch(/^[ -~]+$/);
      expect(subject).toContain('H10 Voxel City');
    }
  });

  /**
   * La promessa a schermo e' «niente oltre a cio' che vedi qui». Questo test la
   * tiene vera: se qualcuno aggiunge un campo al contesto senza aggiungerlo
   * anche alla dichiarazione del pannello, qui diventa rosso.
   */
  it('non porta con se altro oltre ai quattro fatti dichiarati', () => {
    const { body } = composeFeedback(draft(), SENT);
    const righe = body.split('\n');
    const inizio = righe.indexOf('--- Context ---');
    const sezione = righe.slice(inizio + 1, righe.indexOf('', inizio + 1));
    expect(sezione).toHaveLength(contextLines(CONTEXT).length);
    for (const [etichetta] of contextLines(CONTEXT)) {
      expect(sezione.some((riga) => riga.startsWith(etichetta))).toBe(true);
    }
  });

  it('omette del tutto la sezione quando la spunta viene tolta', () => {
    const { body } = composeFeedback(draft({ context: null }), SENT);
    expect(body).not.toContain('--- Context ---');
    expect(body).not.toContain(CONTEXT.browser);
  });
});

describe('mailtoUrl', () => {
  it('indirizza alla sola casella e codifica oggetto e corpo', () => {
    const nota = composeFeedback(draft({ message: 'Roads & rails: it broke?' }), SENT);
    const url = mailtoUrl(nota);
    expect(url.startsWith(`mailto:${FEEDBACK_TO}?`)).toBe(true);
    // La e commerciale codificata: se restasse com'e', chiuderebbe il corpo li'.
    expect(url).toContain('%26');
    expect(decodeURIComponent(url.split('&body=')[1])).toBe(nota.body);
  });

  it('avvisa quando la nota diventa troppo lunga per il passaggio di consegne', () => {
    const corta = mailtoUrl(composeFeedback(draft(), SENT));
    const lunga = mailtoUrl(composeFeedback(draft({ message: 'x'.repeat(3000) }), SENT));
    expect(mailtoTooLong(corta)).toBe(false);
    expect(mailtoTooLong(lunga)).toBe(true);
  });
});

describe('handoffNote', () => {
  /** Aprire un client di posta non e' una consegna osservata: dirlo sarebbe
   *  l'unica bugia dell'interfaccia. */
  it('non afferma mai che la nota sia partita', () => {
    for (const testo of [handoffNote(false), handoffNote(true)]) {
      expect(testo).not.toMatch(/\bsent\b/i);
      expect(testo).toContain(FEEDBACK_TO);
    }
  });
});

describe('feedbackCategory', () => {
  it('trova ogni voce dal suo id', () => {
    for (const categoria of FEEDBACK_CATEGORIES) {
      expect(feedbackCategory(categoria.id)).toBe(categoria);
    }
  });

  it('da a ogni voce un segnaposto in forma di traccia, non di suggerimento', () => {
    for (const categoria of FEEDBACK_CATEGORIES) {
      expect(categoria.placeholder).toContain(':');
    }
  });
});
