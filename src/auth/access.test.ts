import { describe, expect, it } from 'vitest';
import {
  SIGNED_OUT,
  accessState,
  clockSecondsLeft,
  formatCountdown,
  mayEnter,
  parseSnapshot,
  startClock,
  type AccessSnapshot,
} from './access';

function snapshot(overrides: Partial<AccessSnapshot> = {}): AccessSnapshot {
  return {
    authenticated: true,
    email: 'persona@esempio.com',
    emailVerified: true,
    betaUnlimited: false,
    secondsLeft: 900,
    ...overrides,
  };
}

describe('accessState', () => {
  it('senza sessione non si sa niente, e non e un errore', () => {
    expect(accessState(SIGNED_OUT)).toEqual({ kind: 'signedOut' });
  });

  it('l indirizzo non verificato viene prima di tutto il resto', () => {
    // Anche con una prova gia' accesa: `start_trial` rifiuterebbe comunque, e
    // una schermata che promette «gioca» per poi negarlo e' peggio di una che
    // chiede la cosa che manca davvero.
    const state = accessState(snapshot({ emailVerified: false, secondsLeft: 0 }));
    expect(state).toEqual({ kind: 'unverified' });
  });

  it('la prova mai iniziata e pronta, non scaduta', () => {
    // `null` e «zero» sono due cose diverse: la prima non e' ancora partita,
    // la seconda e' finita. Confonderle negherebbe l'ingresso a chi non ha mai
    // giocato.
    expect(accessState(snapshot({ secondsLeft: null }))).toEqual({ kind: 'ready' });
  });

  it('lo zero esatto e scaduto', () => {
    expect(accessState(snapshot({ secondsLeft: 0 }))).toEqual({ kind: 'expired' });
  });

  it('l accesso beta batte una prova scaduta', () => {
    // E' il caso che conta: il proprietario promuove qualcuno a meta' partita, e
    // la promozione deve valere anche con i 45 minuti gia' consumati.
    const state = accessState(snapshot({ betaUnlimited: true, secondsLeft: 0 }));
    expect(state).toEqual({ kind: 'unlimited' });
  });

  it('si entra solo con una prova viva o con l accesso beta', () => {
    expect(mayEnter({ kind: 'trial', secondsLeft: 1 })).toBe(true);
    expect(mayEnter({ kind: 'unlimited' })).toBe(true);
    expect(mayEnter({ kind: 'ready' })).toBe(false);
    expect(mayEnter({ kind: 'expired' })).toBe(false);
    expect(mayEnter({ kind: 'unverified' })).toBe(false);
    expect(mayEnter({ kind: 'signedOut' })).toBe(false);
  });
});

describe('parseSnapshot', () => {
  it('legge la forma che manda il server', () => {
    const parsed = parseSnapshot({
      authenticated: true,
      email: 'persona@esempio.com',
      email_verified: true,
      beta_unlimited: false,
      seconds_left: 2700,
      trial_expires_at: '2026-09-30T12:45:00.000Z',
    });
    expect(parsed).toEqual({
      authenticated: true,
      email: 'persona@esempio.com',
      emailVerified: true,
      betaUnlimited: false,
      secondsLeft: 2700,
    });
  });

  it('senza sessione risponde comunque, con lo stato vuoto', () => {
    expect(parseSnapshot({ authenticated: false })).toEqual(SIGNED_OUT);
  });

  it('un secondo negativo diventa zero invece di tornare indietro', () => {
    // Fra la risposta del server e la lettura puo' passare un istante: il
    // valore puo' arrivare gia' scaduto, e non deve diventare un numero
    // negativo che poi conta all'insu'.
    const parsed = parseSnapshot({
      authenticated: true,
      email: 'persona@esempio.com',
      seconds_left: -3,
    });
    expect(parsed?.secondsLeft).toBe(0);
  });

  it('una risposta che non si capisce vale null, non «disconnesso»', () => {
    // La differenza conta: «disconnesso» manda al modulo d'accesso e fa
    // ricominciare, mentre «non ho capito» e' un guasto da raccontare. Se
    // fossero la stessa cosa, un server che cambia forma butterebbe fuori chi
    // aveva diritto di restare.
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('ok')).toBeNull();
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot({ authenticated: true, seconds_left: 'poco' })).toBeNull();
    // Un campo che il server manda sempre e qui non c'e': la forma e' cambiata,
    // e non e' il caso di tirarla a indovinare.
    expect(parseSnapshot({ authenticated: true, seconds_left: 60 })).toBeNull();
  });
});

describe('clockSecondsLeft', () => {
  it('scende di un secondo alla volta, e solo a secondi interi', () => {
    // Fra 1000 e 1999 millisecondi non e' passato un secondo: arrotondare per
    // eccesso qui toglierebbe un secondo a ogni battito, e una prova di 45
    // minuti ne perderebbe 45.
    const clock = startClock(600, 1_000);
    expect(clockSecondsLeft(clock, 1_000)).toBe(600);
    expect(clockSecondsLeft(clock, 1_999)).toBe(600);
    expect(clockSecondsLeft(clock, 2_000)).toBe(599);
    expect(clockSecondsLeft(clock, 2_999)).toBe(599);
    expect(clockSecondsLeft(clock, 3_000)).toBe(598);
  });

  it('si ferma a zero e non va sotto', () => {
    const clock = startClock(2, 0);
    expect(clockSecondsLeft(clock, 60_000)).toBe(0);
    expect(clockSecondsLeft(clock, 10_000_000)).toBe(0);
  });

  it('un cronometro all indietro non regala secondi', () => {
    // `performance.now()` non torna indietro, ma questa e' l'unica riga che
    // trasforma un tempo in minuti di gioco: se un giorno la sorgente
    // cambiasse, il peggio che puo' succedere e' restare fermi, non allungare
    // la prova.
    const clock = startClock(600, 5_000);
    expect(clockSecondsLeft(clock, 4_000)).toBe(600);
  });
});

describe('formatCountdown', () => {
  it('scrive minuti e secondi con due cifre', () => {
    expect(formatCountdown(2700)).toBe('45:00');
    expect(formatCountdown(2699)).toBe('44:59');
    expect(formatCountdown(61)).toBe('1:01');
  });

  it('lo zero finale e 0:00, non un numero negativo', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('oltre l ora tiene la forma lunga', () => {
    expect(formatCountdown(3600)).toBe('1:00:00');
    expect(formatCountdown(3661)).toBe('1:01:01');
  });
});
