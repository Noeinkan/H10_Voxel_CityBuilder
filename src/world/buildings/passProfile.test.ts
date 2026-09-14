import { describe, expect, it } from 'vitest';
import { formatPassTable, PassProfile } from './passProfile';

/** Un orologio che avanza solo quando lo si dice: i millisecondi diventano dati. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('PassProfile', () => {
  it('attribuisce a ogni passata il lavoro e il tempo che ha prodotto', () => {
    const time = clock();
    const profile = new PassProfile(time.now);
    let columns = 0;
    profile.addCounter('columns', () => columns);

    profile.measure('build', () => { columns += 40; time.advance(3); });
    profile.measure('spans', () => { time.advance(1); });
    profile.measure('build', () => { columns += 10; time.advance(5); });

    const [build, spans] = profile.readings();
    expect(build).toMatchObject({ name: 'build', calls: 2, totalMs: 8, maxMs: 5, lastMs: 5 });
    expect(build.work).toEqual({ columns: 50 });
    // Il massimo e' della chiamata piu' pesante, non della somma.
    expect(build.maxWork).toEqual({ columns: 40 });
    expect(spans.work).toEqual({ columns: 0 });
  });

  it('non attribuisce a nessuno il lavoro fatto fuori dalle passate', () => {
    const profile = new PassProfile(clock().now);
    let scans = 0;
    profile.addCounter('scans', () => scans);

    scans += 100;
    profile.measure('coach', () => { scans += 1; });
    scans += 100;

    expect(profile.readings()[0].work).toEqual({ scans: 1 });
  });

  it('un contatore che riparte da capo vale quanto ha contato da nuovo', () => {
    // E' il campo che un caricamento rifa' da zero: la differenza negativa
    // direbbe che la passata ha *tolto* lavoro.
    const profile = new PassProfile(clock().now);
    let cells = 900;
    profile.addCounter('cells', () => cells);

    profile.measure('restore', () => { cells = 25; });

    expect(profile.readings()[0].work).toEqual({ cells: 25 });
  });

  it('annota anche la passata che lancia', () => {
    const time = clock();
    const profile = new PassProfile(time.now);
    expect(() => profile.measure('broken', () => {
      time.advance(2);
      throw new Error('boom');
    })).toThrow('boom');
    expect(profile.readings()[0]).toMatchObject({ calls: 1, totalMs: 2 });
  });

  it('un contatore aggiunto dopo compare a zero nelle passate gia viste', () => {
    const profile = new PassProfile(clock().now);
    profile.measure('tick', () => undefined);
    let reads = 0;
    profile.addCounter('reads', () => reads);
    profile.measure('tick', () => { reads += 3; });

    expect(profile.readings()[0].work).toEqual({ reads: 3 });
    profile.reset();
    expect(profile.readings()).toEqual([]);
    expect(profile.counters).toEqual(['reads']);
  });

  it('la tabella mette prima la passata piu cara e tace i contatori fermi', () => {
    const time = clock();
    const profile = new PassProfile(time.now);
    let columns = 0;
    profile.addCounter('columns', () => columns);
    profile.addCounter('idle', () => 0);

    profile.measure('coach', () => { time.advance(1); });
    profile.measure('build', () => { columns += 700; time.advance(9); });

    const lines = formatPassTable(profile.readings(), profile.counters).split('\n');
    expect(lines[0]).toContain('columns');
    expect(lines[0]).not.toContain('idle');
    expect(lines[1].startsWith('build')).toBe(true);
    expect(lines[1]).toContain('700 / 700');
    expect(lines[2].startsWith('coach')).toBe(true);
  });
});
