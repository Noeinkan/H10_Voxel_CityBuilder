import { describe, expect, it } from 'vitest';
import { CUES, CUE_IDS, cueLength, voiceAttack } from './cues';

describe('il catalogo dei cue', () => {
  it('ha i cinque suoni dichiarati, ognuno con almeno una voce', () => {
    expect(CUE_IDS).toEqual(['click', 'place', 'demolish', 'refuse', 'milestone']);
    for (const id of CUE_IDS) expect(CUES[id].voices.length).toBeGreaterThan(0);
  });

  it('ogni voce ha durata e frequenze positive', () => {
    for (const id of CUE_IDS) {
      for (const voice of CUES[id].voices) {
        expect(voice.duration).toBeGreaterThan(0);
        expect(voice.at).toBeGreaterThanOrEqual(0);
        // Zero e' vietato dalle rampe esponenziali che la board usa su
        // frequenza e volume: un esponenziale non ci arriva mai.
        expect(voice.from).toBeGreaterThan(0);
        if (voice.to !== undefined) expect(voice.to).toBeGreaterThan(0);
        expect(voice.gain).toBeGreaterThan(0);
      }
    }
  });

  /**
   * La somma delle voci e' il caso peggiore: se tutte suonassero nello stesso
   * istante a volume pieno, oltre l'unita' il browser tosa l'onda e il tonfo
   * diventa un crepitio. Il margine e' largo perche' sopra c'e' ancora il volume
   * generale della board.
   */
  it('nessun cue puo saturare l uscita', () => {
    for (const id of CUE_IDS) {
      const peak = CUES[id].voices.reduce((sum, voice) => sum + voice.gain, 0);
      expect(peak).toBeLessThan(1);
    }
  });

  /**
   * Il click parte a ogni bottone dell'HUD: e' l'unico che si sente decine di
   * volte al minuto, e va tenuto sotto tutti gli altri.
   */
  it('il click e il piu discreto del catalogo', () => {
    const click = CUES.click.voices.reduce((sum, voice) => sum + voice.gain, 0);
    for (const id of CUE_IDS) {
      if (id === 'click') continue;
      const other = CUES[id].voices.reduce((sum, voice) => sum + voice.gain, 0);
      expect(click).toBeLessThan(other);
    }
  });

  it('ogni cue ha una soglia anti raffica', () => {
    for (const id of CUE_IDS) expect(CUES[id].minGapMs).toBeGreaterThan(0);
  });

  it('la durata di un cue e la coda piu lunga, non l ultima scritta', () => {
    // In `demolish` la voce scritta per ultima e' la coda grave, che finisce a
    // 0,30 s; a spegnersi davvero per ultimo e' il terzo scoppio di rumore, a
    // 0,31 s. E' il caso che un `at + duration` dell'ultimo elemento sbaglia.
    expect(cueLength(CUES.demolish)).toBeCloseTo(0.31, 5);
    expect(cueLength(CUES.click)).toBeCloseTo(0.045, 5);
  });

  it('l attacco ha un default, ma la voce puo dettarne uno suo', () => {
    expect(voiceAttack({ tone: 'sine', at: 0, duration: 0.1, gain: 0.1, from: 440 })).toBe(0.003);
    expect(
      voiceAttack({ tone: 'sine', at: 0, duration: 0.1, gain: 0.1, from: 440, attack: 0.02 }),
    ).toBe(0.02);
  });
});
