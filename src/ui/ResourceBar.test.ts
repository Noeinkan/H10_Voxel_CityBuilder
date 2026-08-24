import { describe, expect, it } from 'vitest';
import { sparkPoints } from './ResourceBar';

/**
 * Solo la funzione pura della barra.
 *
 * Il resto di `ResourceBar` e' DOM, e i test girano in `node`: la sparkline e'
 * pero' l'unico pezzo che fa un **calcolo**, ed e' quello che puo' sbagliare in
 * silenzio — una polilinea storta si vede solo se qualcuno la guarda.
 */
describe('sparkPoints', () => {
  it('non disegna niente con meno di due campioni', () => {
    expect(sparkPoints([])).toBe('');
    expect(sparkPoints([42])).toBe('');
  });

  it('stende i campioni sull intera larghezza', () => {
    const points = sparkPoints([0, 1, 2]).split(' ');

    expect(points).toHaveLength(3);
    expect(points[0]?.startsWith('0.0,')).toBe(true);
    expect(points[2]?.startsWith('48.0,')).toBe(true);
  });

  it('sale verso l alto: in SVG la y cresce verso il basso', () => {
    // E' l'errore di segno che rende una crescita indistinguibile da un crollo,
    // e a occhio si nota solo confrontandola con la freccia.
    const [first, last] = sparkPoints([0, 10]).split(' ');
    const y = (point: string | undefined): number => Number(point?.split(',')[1]);

    expect(y(last)).toBeLessThan(y(first));
  });

  it('autoscala sul proprio minimo e massimo', () => {
    // Una serie che oscilla fra 900 e 910 su un asse ancorato a zero e' una riga
    // piatta che non dice niente: quello che interessa e' la forma dell'ultimo
    // tratto, non la distanza dall'origine.
    expect(sparkPoints([900, 905, 910])).toBe(sparkPoints([0, 5, 10]));
  });

  it('una serie ferma sta a meta altezza, non sul bordo', () => {
    // Appoggiarla in basso farebbe leggere "fermo" come "al minimo", che e' una
    // notizia molto diversa.
    for (const point of sparkPoints([7, 7, 7]).split(' ')) {
      expect(Number(point.split(',')[1])).toBe(7);
    }
  });
});
