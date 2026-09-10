import { CUES, voiceAttack, type AudioCue, type CueId, type CueVoice } from './cues';

/**
 * Chi trasforma un cue in aria mossa.
 *
 * Tre vincoli hanno deciso la forma di questa classe:
 *
 * 1. **Il contesto audio nasce tardi.** I browser rifiutano di suonare finche'
 *    non c'e' stato un gesto dell'utente, e crearlo all'avvio produce solo un
 *    contesto sospeso piu' un avviso in console. Qui il contesto si crea al
 *    primo cue davvero suonato — che per costruzione viene da un click.
 * 2. **Chi parte in muto non deve creare niente.** `play` esce prima di toccare
 *    il contesto, quindi una partita silenziosa non alloca nemmeno il grafo.
 * 3. **I test girano in `node`, dove `AudioContext` non esiste.** Il costruttore
 *    accetta una fabbrica di contesti: in produzione e' il browser, nel test e'
 *    un doppio che registra cosa e' stato schedulato.
 */

/** Il minimo di grafo audio che serve alla board. Il browser lo soddisfa. */
export interface SoundBoardOptions {
  /** Restituisce `null` dove l'audio non esiste: la board diventa inerte. */
  readonly createContext?: () => AudioContext | null;
  /** Orologio monotono in millisecondi, per la soglia anti-raffica. */
  readonly now?: () => number;
  /** Volume generale, 0..1. E' il posto dove passera' un eventuale cursore. */
  readonly volume?: number;
  readonly muted?: boolean;
}

/**
 * Il fondo della rampa esponenziale.
 *
 * `exponentialRampToValueAtTime` rifiuta lo zero — un esponenziale non ci arriva
 * mai — e con un valore troppo alto la nota si tronca invece di spegnersi.
 */
const SILENCE = 0.0001;

/** Mezzo secondo di rumore bianco, generato una volta e riusato da ogni voce. */
const NOISE_SECONDS = 0.5;

/** Ampiezza della variazione d'intonazione fra due emissioni: ±2%. */
const DETUNE_SPREAD = 0.04;

function browserContext(): AudioContext | null {
  const Ctor: typeof AudioContext | undefined =
    typeof globalThis.AudioContext === 'function' ? globalThis.AudioContext : undefined;
  if (Ctor === undefined) return null;
  try {
    return new Ctor();
  } catch {
    // Un contesto negato (policy, dispositivo assente) spegne il suono e basta:
    // non e' un errore di gioco e non deve fermare l'avvio.
    return null;
  }
}

export class SoundBoard {
  private readonly createContext: () => AudioContext | null;
  private readonly now: () => number;
  private readonly volume: number;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private mutedState: boolean;
  /** Quando ogni cue e' stato emesso l'ultima volta, per la soglia anti-raffica. */
  private readonly lastPlayed = new Map<CueId, number>();
  /**
   * Lo stato del generatore pseudocasuale della variazione d'intonazione.
   *
   * Uno xorshift e non `Math.random()`: il repo evita il caso non riproducibile
   * anche dove non e' strettamente il percorso deterministico, e cosi' un test
   * puo' affermare quale frequenza e' stata schedulata invece di accontentarsi
   * di un intervallo.
   */
  private noise32 = 0x9e3779b9;

  constructor(options: SoundBoardOptions = {}) {
    this.createContext = options.createContext ?? browserContext;
    this.now = options.now ?? (() => performance.now());
    this.volume = options.volume ?? 0.7;
    this.mutedState = options.muted ?? false;
  }

  get muted(): boolean {
    return this.mutedState;
  }

  /**
   * Accende o spegne il suono.
   *
   * Spegnendo abbassa anche il volume generale, invece di limitarsi a smettere
   * di schedulare: un accordo di soglia dura sette decimi di secondo, e un muto
   * che lascia finire la nota gia' partita sembra un bottone che non ha preso.
   */
  setMuted(muted: boolean): void {
    if (muted === this.mutedState) return;
    this.mutedState = muted;
    const master = this.master;
    const context = this.context;
    if (master === null || context === null) return;
    const at = context.currentTime;
    master.gain.cancelScheduledValues(at);
    master.gain.setValueAtTime(master.gain.value, at);
    // Una rampa corta e non un salto: il taglio netto di un'onda a meta' ciclo
    // e' un click, cioe' esattamente il rumore che si stava chiedendo di togliere.
    master.gain.linearRampToValueAtTime(muted ? 0 : this.volume, at + 0.02);
  }

  /**
   * Emette un cue. Risponde `false` se non e' uscito suono, e il perche' non
   * interessa a chi chiama: muto, contesto assente o raffica sono tutti «no».
   */
  play(id: CueId): boolean {
    if (this.mutedState) return false;
    const cue: AudioCue = CUES[id];
    const stamp = this.now();
    const previous = this.lastPlayed.get(id);
    if (previous !== undefined && stamp - previous < cue.minGapMs) return false;
    if (!this.ensureContext()) return false;
    this.lastPlayed.set(id, stamp);

    const context = this.context;
    if (context === null) return false;
    // Un filo di ritardo sull'orologio del contesto: schedulare esattamente su
    // `currentTime` significa chiedere al thread audio un evento che, fra il
    // calcolo e la consegna, e' gia' passato — ed e' il classico primo suono che
    // manca.
    const start = context.currentTime + 0.005;
    const detune = 1 + (this.random() - 0.5) * DETUNE_SPREAD;
    for (const voice of cue.voices) this.scheduleVoice(voice, start, detune);
    return true;
  }

  /** Chiude il contesto: serve allo smontaggio della scena, non al muto. */
  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.lastPlayed.clear();
  }

  private ensureContext(): boolean {
    if (this.context === null) {
      const context = this.createContext();
      if (context === null) return false;
      const master = context.createGain();
      master.gain.value = this.volume;
      master.connect(context.destination);
      this.context = context;
      this.master = master;
    }
    // Il contesto nasce sospeso finche' il browser non ha visto un gesto, e
    // torna sospeso quando la scheda va in secondo piano. Ogni cue passa di qui,
    // quindi il risveglio non ha bisogno di un posto suo.
    if (this.context.state === 'suspended') void this.context.resume();
    return true;
  }

  private scheduleVoice(voice: CueVoice, start: number, detune: number): void {
    const context = this.context;
    const master = this.master;
    if (context === null || master === null) return;

    const at = start + voice.at;
    const end = at + voice.duration;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(voice.gain, at + voiceAttack(voice));
    envelope.gain.exponentialRampToValueAtTime(SILENCE, end);
    envelope.connect(master);

    if (voice.tone === 'noise') {
      const source = context.createBufferSource();
      source.buffer = this.ensureNoise(context);
      // Il taglio del passa-basso e' cio' che rende «detriti» o «tonfo» lo
      // stesso rumore bianco: e' li' che vive la differenza fra le due voci.
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(voice.from, at);
      if (voice.to !== undefined) filter.frequency.exponentialRampToValueAtTime(voice.to, end);
      source.connect(filter);
      filter.connect(envelope);
      source.start(at);
      source.stop(end);
      return;
    }

    const oscillator = context.createOscillator();
    oscillator.type = voice.tone;
    oscillator.frequency.setValueAtTime(voice.from * detune, at);
    if (voice.to !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(voice.to * detune, end);
    }
    oscillator.connect(envelope);
    oscillator.start(at);
    oscillator.stop(end);
  }

  private ensureNoise(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer !== null) return this.noiseBuffer;
    const frames = Math.floor(context.sampleRate * NOISE_SECONDS);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) channel[i] = this.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  /** Xorshift32 in [0, 1): riproducibile, e costa quanto una moltiplicazione. */
  private random(): number {
    let x = this.noise32;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noise32 = x >>> 0;
    return this.noise32 / 0x1_0000_0000;
  }
}
