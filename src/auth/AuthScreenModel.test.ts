import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  authErrorText,
  authPaneFor,
  emailProblem,
  expiredNote,
  passwordProblem,
  verifyNote,
} from './AuthScreenModel';

describe('authPaneFor', () => {
  it('manda alla verifica chi non ha confermato l indirizzo', () => {
    expect(authPaneFor({ kind: 'unverified' })).toBe('verify');
  });

  it('manda alla richiesta beta chi ha finito i minuti', () => {
    expect(authPaneFor({ kind: 'expired' })).toBe('expired');
  });

  it('non impone niente a chi puo entrare', () => {
    // `null` vuol dire «lascia passare»: e' il valore che fa partire il menu
    // del titolo, quindi non deve comparire per sbaglio in nessuno degli stati
    // che bloccano.
    expect(authPaneFor({ kind: 'ready' })).toBeNull();
    expect(authPaneFor({ kind: 'trial', secondsLeft: 60 })).toBeNull();
    expect(authPaneFor({ kind: 'unlimited' })).toBeNull();
    expect(authPaneFor({ kind: 'signedOut' })).toBeNull();
  });
});

describe('emailProblem', () => {
  it('accetta gli indirizzi normali', () => {
    for (const email of ['a@b.co', 'nome.cognome@esempio.com', 'x+tag@sub.esempio.it']) {
      expect(emailProblem(email)).toBeNull();
    }
  });

  it('prende i refusi evidenti', () => {
    expect(emailProblem('')).not.toBeNull();
    expect(emailProblem('   ')).not.toBeNull();
    expect(emailProblem('senza-chiocciola.com')).not.toBeNull();
    expect(emailProblem('due@@esempio.com')).not.toBeNull();
    expect(emailProblem('nome@senza-punto')).not.toBeNull();
    expect(emailProblem('nome@.com')).not.toBeNull();
    expect(emailProblem('con spazio@esempio.com')).not.toBeNull();
  });
});

describe('passwordProblem', () => {
  it('chiede la lunghezza minima, che e piu severa del server', () => {
    // La regola locale e' piu' stretta di quella predefinita del progetto: cosi'
    // non puo' mai accettare qualcosa che il server rifiuterebbe.
    expect(passwordProblem('1234567')).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    expect(passwordProblem('12345678')).toBeNull();
    expect(passwordProblem('')).not.toBeNull();
  });
});

describe('authErrorText', () => {
  it('la rete assente si riconosce e si spiega', () => {
    // `status: 0` e' la libreria che non ha potuto parlare affatto. E' l'unico
    // guasto su cui la persona puo' davvero fare qualcosa, quindi vale la pena
    // distinguerlo dal generico «qualcosa e' andato storto».
    expect(authErrorText({ status: 0 })).toContain('connection');
  });

  it('le credenziali sbagliate dicono cosa e sbagliato, non chi', () => {
    // Mai «questo indirizzo non esiste»: sarebbe un modo per scoprire chi ha un
    // account.
    const text = authErrorText({ code: 'invalid_credentials' });
    expect(text).toContain('do not match');
  });

  it('riconosce i rifiuti che hanno un rimedio', () => {
    expect(authErrorText({ code: 'email_not_confirmed' })).toContain('inbox');
    expect(authErrorText({ code: 'user_already_exists' })).toContain('Sign in');
    expect(authErrorText({ code: 'email_exists' })).toContain('Sign in');
    expect(authErrorText({ code: 'over_email_send_rate_limit' })).toContain('Wait');
    expect(authErrorText({ code: 'same_password' })).toContain('new one');
    expect(authErrorText({ code: 'signup_disabled' })).toContain('closed');
  });

  it('il testo del server non arriva a schermo', () => {
    // E' scritto per chi sviluppa, cambia fra versioni e in qualche caso
    // racconta com'e' fatto il progetto. Quello che si legge e' la stessa
    // notizia in una frase comprensibile; l'originale resta nella console.
    const raw = 'relation "access_grants" does not exist at character 42';
    const text = authErrorText({ code: 'inesistente', message: raw });
    expect(text).not.toContain('access_grants');
    expect(text).not.toContain('character 42');
    expect(text).toBe('Something went wrong. Try again.');
  });

  it('anche un errore vuoto o assente ha una frase', () => {
    for (const error of [null, undefined, {}]) {
      expect(authErrorText(error).length).toBeGreaterThan(0);
    }
  });
});

describe('le note che nominano l indirizzo', () => {
  it('la verifica dice dove guardare, non quando sarebbe partita', () => {
    // Chi ricarica la pagina torna su questa schermata senza che nessun
    // messaggio sia partito adesso: «ti abbiamo appena scritto» sarebbe falso.
    expect(verifyNote('persona@esempio.com')).toContain('persona@esempio.com');
    expect(verifyNote('')).toContain('your email address');
  });

  it('la scadenza nomina l account e la durata', () => {
    expect(expiredNote('persona@esempio.com')).toContain('persona@esempio.com');
    expect(expiredNote('persona@esempio.com')).toContain('45-minute');
  });
});
