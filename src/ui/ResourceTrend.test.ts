import { describe, expect, it } from 'vitest';
import { ResourceTrend, TREND_WINDOW } from './ResourceTrend';

/** Riempie la finestra con una rampa da `from` a `to`. */
function ramp(trend: ResourceTrend, id: string, from: number, to: number, steps: number): void {
  for (let step = 0; step < steps; step += 1) {
    const t = steps === 1 ? 1 : step / (steps - 1);
    trend.sample(step, [[id, from + (to - from) * t]]);
  }
}

describe('ResourceTrend', () => {
  it('ignora un secondo campione sullo stesso tick', () => {
    // L'HUD ridipinge ogni 150 ms e la simulazione fa dieci tick al secondo:
    // senza l'ancora sul tick la stessa lettura entrerebbe due volte, e la
    // finestra coprirebbe meno storia di quanta ne dichiara.
    const trend = new ResourceTrend();

    expect(trend.sample(7, [['funds', 100]])).toBe(true);
    expect(trend.sample(7, [['funds', 100]])).toBe(false);
    expect(trend.window('funds')).toHaveLength(1);
  });

  it('tiene solo gli ultimi campioni, e in ordine', () => {
    const trend = new ResourceTrend(4);
    for (let tick = 0; tick < 10; tick += 1) trend.sample(tick, [['food', tick]]);

    expect(trend.window('food')).toEqual([6, 7, 8, 9]);
  });

  it('legge la direzione sulla finestra, non sull ultimo passo', () => {
    // E' la ragione per cui la finestra esiste: l'ultimo passo e' gia' `delta`,
    // e una freccia che lo ripete cambia verso a ogni tick storto.
    const rising = new ResourceTrend();
    ramp(rising, 'funds', 100, 400, 20);
    expect(rising.direction('funds')).toBe('up');

    const falling = new ResourceTrend();
    ramp(falling, 'funds', 400, 100, 20);
    expect(falling.direction('funds')).toBe('down');
  });

  it('una risorsa ferma non muove la freccia', () => {
    const trend = new ResourceTrend();
    for (let tick = 0; tick < 20; tick += 1) trend.sample(tick, [['materials', 250]]);

    expect(trend.direction('materials')).toBe('flat');
    expect(trend.magnitude('materials')).toBe(0);
  });

  it('un solo campione non e ancora una tendenza', () => {
    const trend = new ResourceTrend();
    trend.sample(0, [['funds', 100]]);

    expect(trend.direction('funds')).toBe('flat');
  });

  it('la magnitudine e relativa, cosi le cinque scale si confrontano', () => {
    // +30 di denaro e +30 di abitanti sono due notizie diverse: una soglia in
    // unita' assolute direbbe il falso su almeno una delle due.
    const trend = new ResourceTrend();
    ramp(trend, 'funds', 1_000, 1_030, 20);
    ramp(trend, 'population', 10, 40, 20);

    expect(trend.magnitude('funds')).toBeLessThan(trend.magnitude('population'));
  });

  it('la magnitudine resta in 0..1 anche su una crescita enorme', () => {
    const trend = new ResourceTrend();
    ramp(trend, 'funds', 1, 1_000_000, 20);

    expect(trend.magnitude('funds')).toBeLessThanOrEqual(1);
    expect(trend.magnitude('funds')).toBeGreaterThan(0);
  });

  it('un tick che torna indietro e una partita nuova', () => {
    // Non e' un caso di scuola: ricaricare o ripartire azzera `tickCount`, e
    // senza questo la citta' nuova erediterebbe la tendenza di quella vecchia.
    const trend = new ResourceTrend();
    ramp(trend, 'funds', 100, 900, 20);
    trend.sample(0, [['funds', 100]]);

    expect(trend.window('funds')).toEqual([100]);
  });

  it('la finestra di default copre circa cinque secondi di gioco', () => {
    expect(TREND_WINDOW).toBe(48);
  });
});
