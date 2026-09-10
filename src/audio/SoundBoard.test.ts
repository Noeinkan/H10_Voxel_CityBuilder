import { describe, expect, it } from 'vitest';
import { SoundBoard } from './SoundBoard';

/**
 * Il grafo audio finto.
 *
 * In `node` non esiste `AudioContext`, e non e' un limite da aggirare: e' cio'
 * che rende provabile la board. Questi oggetti registrano **cosa e' stato
 * schedulato** — quanti oscillatori, a che frequenza, fra quali istanti — che e'
 * l'unica cosa affermabile su un suono senza ascoltarlo.
 */
class FakeParam {
  value = 0;
  readonly events: { kind: string; value: number; at: number }[] = [];

  setValueAtTime(value: number, at: number): this {
    this.events.push({ kind: 'set', value, at });
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, at: number): this {
    this.events.push({ kind: 'linear', value, at });
    this.value = value;
    return this;
  }

  exponentialRampToValueAtTime(value: number, at: number): this {
    this.events.push({ kind: 'exponential', value, at });
    this.value = value;
    return this;
  }

  cancelScheduledValues(at: number): this {
    this.events.push({ kind: 'cancel', value: 0, at });
    return this;
  }
}

class FakeNode {
  target: unknown = null;

  connect(target: unknown): unknown {
    this.target = target;
    return target;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  readonly frequency = new FakeParam();
  startedAt = -1;
  stoppedAt = -1;

  start(at: number): void {
    this.startedAt = at;
  }

  stop(at: number): void {
    this.stoppedAt = at;
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  startedAt = -1;
  stoppedAt = -1;

  start(at: number): void {
    this.startedAt = at;
  }

  stop(at: number): void {
    this.stoppedAt = at;
  }
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam();
}

class FakeContext {
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly sampleRate = 48_000;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly sources: FakeSource[] = [];
  readonly filters: FakeFilter[] = [];
  resumes = 0;
  closed = false;

  createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }

  createOscillator(): FakeOscillator {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }

  createBufferSource(): FakeSource {
    const node = new FakeSource();
    this.sources.push(node);
    return node;
  }

  createBiquadFilter(): FakeFilter {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }

  createBuffer(channels: number, frames: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(frames * channels);
    return { getChannelData: () => data };
  }

  resume(): Promise<void> {
    this.resumes += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
}

/** Una board con contesto finto e orologio in mano al test. */
function harness(muted = false) {
  const context = new FakeContext();
  let created = 0;
  let clock = 0;
  const board = new SoundBoard({
    createContext: () => {
      created += 1;
      return context as unknown as AudioContext;
    },
    now: () => clock,
    muted,
  });
  return {
    board,
    context,
    contexts: () => created,
    advance: (ms: number) => {
      clock += ms;
      context.currentTime += ms / 1000;
    },
  };
}

describe('SoundBoard', () => {
  /**
   * I browser rifiutano di suonare finche' non c'e' stato un gesto: un contesto
   * creato all'avvio e' un contesto sospeso piu' un avviso in console, e va
   * evitato anche quando il suono e' acceso.
   */
  it('non crea nessun contesto finche non deve suonare davvero', () => {
    const { board, contexts } = harness();
    expect(contexts()).toBe(0);
    board.play('click');
    expect(contexts()).toBe(1);
  });

  it('partendo in muto non alloca niente e non suona', () => {
    const { board, contexts, context } = harness(true);
    expect(board.play('place')).toBe(false);
    expect(contexts()).toBe(0);
    expect(context.oscillators).toHaveLength(0);
  });

  it('un cue di sole note schedula un oscillatore per voce', () => {
    const { board, context } = harness();
    expect(board.play('milestone')).toBe(true);
    expect(context.oscillators).toHaveLength(4);
    expect(context.sources).toHaveLength(0);
    for (const oscillator of context.oscillators) {
      expect(oscillator.stoppedAt).toBeGreaterThan(oscillator.startedAt);
    }
  });

  /**
   * Le tre note dell'accordo entrano **scalate**: se partissero insieme sarebbe
   * un blocco, non un arpeggio, ed e' la differenza che si sente.
   */
  it('le voci ritardate partono dopo quelle in testa', () => {
    const { board, context } = harness();
    board.play('milestone');
    const starts = context.oscillators.map((oscillator) => oscillator.startedAt);
    expect(starts[1]).toBeGreaterThan(starts[0]);
    expect(starts[2]).toBeGreaterThan(starts[1]);
  });

  it('il rumore passa da un passa basso, la nota no', () => {
    const { board, context } = harness();
    board.play('place');
    // `place` e' un seno grave piu' uno scoppio di rumore: una voce per tipo.
    expect(context.oscillators).toHaveLength(1);
    expect(context.sources).toHaveLength(1);
    expect(context.filters).toHaveLength(1);
    expect(context.filters[0].type).toBe('lowpass');
    expect(context.sources[0].buffer).not.toBeNull();
  });

  it('il buffer di rumore si genera una volta sola e si riusa', () => {
    const { board, context, advance } = harness();
    board.play('place');
    advance(500);
    board.play('place');
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0].buffer).toBe(context.sources[1].buffer);
  });

  /**
   * Quattro edifici nati nello stesso tick darebbero quattro tonfi sovrapposti,
   * che non e' un suono piu' forte: e' un impasto.
   */
  it('la soglia anti raffica lascia cadere la ripetizione troppo vicina', () => {
    const { board, advance } = harness();
    expect(board.play('place')).toBe(true);
    advance(30);
    expect(board.play('place')).toBe(false);
    advance(80);
    expect(board.play('place')).toBe(true);
  });

  it('la soglia e per cue, non per la board', () => {
    const { board } = harness();
    expect(board.play('place')).toBe(true);
    expect(board.play('click')).toBe(true);
  });

  it('risveglia il contesto che il browser aveva sospeso', () => {
    const { board, context } = harness();
    board.play('click');
    expect(context.resumes).toBe(1);
    expect(context.state).toBe('running');
  });

  /**
   * Il muto non si limita a smettere di schedulare: un accordo di soglia dura
   * sette decimi di secondo, e lasciarlo finire farebbe sembrare che il bottone
   * non abbia preso.
   */
  it('il muto abbassa il volume generale su cio che sta gia suonando', () => {
    const { board, context } = harness();
    board.play('milestone');
    const master = context.gains[0];
    expect(master.gain.value).toBeGreaterThan(0);
    board.setMuted(true);
    expect(board.muted).toBe(true);
    expect(master.gain.events.at(-1)).toMatchObject({ kind: 'linear', value: 0 });
    expect(board.play('click')).toBe(false);
  });

  it('togliendo il muto il volume torna dov era', () => {
    const { board, context, advance } = harness();
    board.play('click');
    const master = context.gains[0];
    const volume = master.gain.value;
    board.setMuted(true);
    board.setMuted(false);
    expect(master.gain.events.at(-1)).toMatchObject({ kind: 'linear', value: volume });
    advance(500);
    expect(board.play('click')).toBe(true);
  });

  it('senza AudioContext la board resta inerte invece di sollevare', () => {
    const board = new SoundBoard({ createContext: () => null, now: () => 0 });
    expect(() => board.play('demolish')).not.toThrow();
    expect(board.play('demolish')).toBe(false);
  });

  it('dispose chiude il contesto e riparte pulita', () => {
    const { board, context, contexts } = harness();
    board.play('click');
    board.dispose();
    expect(context.closed).toBe(true);
    // La soglia se ne va con il contesto: dopo uno smontaggio lo stesso cue
    // deve poter suonare subito, senza aspettare il proprio intervallo.
    expect(board.play('click')).toBe(true);
    expect(contexts()).toBe(2);
  });
});
