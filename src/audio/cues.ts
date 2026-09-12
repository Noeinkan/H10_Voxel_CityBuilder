/**
 * Il catalogo dei suoni, scritto in numeri invece che in file audio.
 *
 * Non c'e' nessun `.ogg` nel repo e non ce ne sara' uno: ogni cue e' un pugno di
 * oscillatori con la loro inviluppante, e il browser li sintetizza al volo. E'
 * la scelta che tiene il bundle dov'e' — nessun asset binario, nessuna licenza
 * da trascinarsi dietro — e soprattutto rende il suono **modificabile**: alzare
 * un semitono o accorciare un tonfo qui e' cambiare una cifra, non riaprire un
 * editor audio.
 *
 * Questo file e' dati puri e non tocca il DOM: gira in `node` come tutto il
 * resto, e chi lo suona sta in `SoundBoard.ts`.
 */

/**
 * Le forme d'onda, piu' il rumore bianco.
 *
 * `noise` non e' un oscillatore e per lui `from`/`to` non sono un'altezza ma il
 * **taglio del filtro passa-basso**: un rumore aperto a 2 kHz e' un fruscio di
 * detriti, lo stesso rumore chiuso a 300 Hz e' un tonfo sordo. Riusare i due
 * campi invece di aggiungerne altri due tiene la voce a una forma sola.
 */
export type CueTone = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';

/** Una singola voce dentro un cue: quando entra, con che timbro, per quanto. */
export interface CueVoice {
  readonly tone: CueTone;
  /** Ritardo dall'attacco del cue, in secondi. Zero significa subito. */
  readonly at: number;
  readonly duration: number;
  /** Picco dell'inviluppante, 0..1, prima del volume generale. */
  readonly gain: number;
  /** Hz iniziali; per `noise` e' il taglio del passa-basso. */
  readonly from: number;
  /** Hz finali: assente vuol dire nota ferma. */
  readonly to?: number;
  /** Salita fino al picco. Corta e' un colpo, lunga e' un respiro. */
  readonly attack?: number;
}

export interface AudioCue {
  readonly voices: readonly CueVoice[];
  /**
   * Distanza minima fra due emissioni dello **stesso** cue, in millisecondi.
   *
   * La citta' cresce a raffica: quattro edifici nati nello stesso tick darebbero
   * quattro tonfi sovrapposti, che non e' un suono piu' forte ma un impasto.
   * Sotto questa soglia il cue viene lasciato cadere invece che accodato — un
   * suono di feedback in ritardo mente su cosa lo ha causato.
   */
  readonly minGapMs: number;
}

export type CueId = 'click' | 'place' | 'demolish' | 'refuse' | 'milestone';

/** Salita di default: 3 ms non e' un click di digitale, ma non e' nemmeno un fade. */
const ATTACK = 0.003;

/**
 * I cinque suoni della citta'.
 *
 * Volumi bassi di proposito. Il click parte a ogni bottone dell'HUD e va sentito
 * senza essere ascoltato; il tonfo e la macerie sono gli unici che hanno diritto
 * a farsi notare, perche' raccontano qualcosa che e' successo nel mondo mentre
 * si stava guardando altrove.
 */
export const CUES: Readonly<Record<CueId, AudioCue>> = {
  /** Il tocco su un bottone: un tick secco che scende, quasi sottovoce. */
  click: {
    minGapMs: 40,
    voices: [
      { tone: 'sine', at: 0, duration: 0.045, gain: 0.05, from: 880, to: 620, attack: 0.002 },
    ],
  },

  /**
   * Un edificio che si posa: corpo grave piu' polvere.
   *
   * Due voci e non una perche' il solo seno grave suona come una nota, non come
   * un peso. E' lo scoppio di rumore chiuso a 900 Hz sopra il seno a dare la
   * materia — la stessa ragione per cui un tonfo vero non e' mai puro.
   */
  place: {
    minGapMs: 90,
    voices: [
      { tone: 'sine', at: 0, duration: 0.19, gain: 0.20, from: 180, to: 85 },
      { tone: 'noise', at: 0, duration: 0.10, gain: 0.11, from: 900, to: 260 },
    ],
  },

  /** La demolizione: tre scoppi di rumore che si chiudono, su una coda grave. */
  demolish: {
    minGapMs: 110,
    voices: [
      { tone: 'noise', at: 0, duration: 0.22, gain: 0.14, from: 2200, to: 400 },
      { tone: 'noise', at: 0.07, duration: 0.18, gain: 0.10, from: 1100, to: 260 },
      { tone: 'noise', at: 0.15, duration: 0.16, gain: 0.07, from: 620, to: 180 },
      { tone: 'sine', at: 0.02, duration: 0.28, gain: 0.12, from: 130, to: 55 },
    ],
  },

  /**
   * Il rifiuto: due blat corti, gravi e squadrati.
   *
   * Due e non uno: un colpo solo si confonde con il tonfo di una posa riuscita,
   * mentre la ripetizione a distanza breve e' universalmente «no».
   */
  refuse: {
    minGapMs: 200,
    voices: [
      { tone: 'square', at: 0, duration: 0.075, gain: 0.055, from: 200, to: 170 },
      { tone: 'square', at: 0.1, duration: 0.09, gain: 0.055, from: 170, to: 130 },
    ],
  },

  /**
   * La soglia superata: una triade maggiore che sale, con le note che restano.
   *
   * Le code lunghe si sovrappongono di proposito — arrivate una alla volta
   * sarebbero tre suoni, sovrapposte sono un accordo, ed e' l'accordo a dire
   * «e' successo qualcosa di buono» senza bisogno di leggere il toast.
   */
  milestone: {
    minGapMs: 700,
    voices: [
      { tone: 'triangle', at: 0, duration: 0.55, gain: 0.10, from: 523.25, attack: 0.01 },
      { tone: 'triangle', at: 0.09, duration: 0.50, gain: 0.09, from: 659.25, attack: 0.01 },
      { tone: 'triangle', at: 0.18, duration: 0.62, gain: 0.09, from: 783.99, attack: 0.01 },
      { tone: 'sine', at: 0.18, duration: 0.70, gain: 0.05, from: 1046.5, attack: 0.02 },
    ],
  },
};

export const CUE_IDS = Object.keys(CUES) as readonly CueId[];

/** L'attacco di una voce, con il default applicato: lo leggono board e test. */
export function voiceAttack(voice: CueVoice): number {
  return voice.attack ?? ATTACK;
}

/** Quanto dura un cue per intero, coda dell'ultima voce compresa. */
export function cueLength(cue: AudioCue): number {
  let end = 0;
  for (const voice of cue.voices) {
    const stop = voice.at + voice.duration;
    if (stop > end) end = stop;
  }
  return end;
}
