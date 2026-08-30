import { describe, expect, it } from 'vitest';
import { columnKey } from '../chunkCoords';
import { MAX_FOOTPRINT } from './config';
import { BlockMemo, LotMemo } from './lotMemo';

/**
 * Il memo e' una struttura senza mondo: qui si verifica che ricordi cio' che
 * deve, che dimentichi quando glielo si chiede, e soprattutto che due domande
 * diverse non si scambino la risposta. L'ultima e' l'unica che possa produrre un
 * difetto invisibile — una chiave che collide toglie un lotto buono a un altro
 * isolato, e la citta' resta legale mentre smette di essere quella giusta.
 */

describe('LotMemo — colonne bocciate', () => {
  it('non ricorda niente finche non gli si dice niente', () => {
    const memo = new LotMemo();
    expect(memo.refuses(columnKey(4, 7))).toBe(false);
  });

  it('ricorda la colonna bocciata e nessun altra', () => {
    const memo = new LotMemo();
    memo.refuse(columnKey(4, 7));

    expect(memo.refuses(columnKey(4, 7))).toBe(true);
    expect(memo.refuses(columnKey(7, 4))).toBe(false);
    expect(memo.refuses(columnKey(5, 7))).toBe(false);
    expect(memo.refuses(columnKey(4, 8))).toBe(false);
  });

  it('dimentica tutto al reset', () => {
    const memo = new LotMemo();
    memo.refuse(columnKey(-3, 12));
    memo.reset();

    expect(memo.refuses(columnKey(-3, 12))).toBe(false);
  });
});

describe('BlockMemo — rettangoli esauriti', () => {
  it('vale per l isolato e il lato insieme, non per uno dei due', () => {
    const memo = new BlockMemo();
    memo.exhaust(3, 5, 4);

    expect(memo.isExhausted(3, 5, 4)).toBe(true);
    // Stesso isolato, altro lato: un lotto piu' stretto ci sta ancora.
    expect(memo.isExhausted(3, 5, 3)).toBe(false);
    expect(memo.isExhausted(3, 5, 5)).toBe(false);
    // Stesso lato, altro isolato: e' un altro rettangolo.
    expect(memo.isExhausted(4, 5, 4)).toBe(false);
    expect(memo.isExhausted(3, 6, 4)).toBe(false);
    expect(memo.isExhausted(5, 3, 4)).toBe(false);
  });

  it('regge le coordinate negative', () => {
    const memo = new BlockMemo();
    memo.exhaust(-7, -2, 8);

    expect(memo.isExhausted(-7, -2, 8)).toBe(true);
    expect(memo.isExhausted(7, 2, 8)).toBe(false);
    expect(memo.isExhausted(-2, -7, 8)).toBe(false);
  });

  it('nessuna coppia isolato-lato ne scavalca un altra', () => {
    // La chiave impacchetta tre interi in uno: il modo di sbagliarla e' che il
    // lato trabocchi nell'isolato accanto. Si prova invece di fidarsi.
    const memo = new BlockMemo();
    const claimed: string[] = [];

    for (let kx = -3; kx <= 3; kx++) {
      for (let ky = -3; ky <= 3; ky++) {
        for (let side = 1; side <= MAX_FOOTPRINT; side++) claimed.push(`${kx},${ky},${side}`);
      }
    }

    for (const one of claimed) {
      const [kx, ky, side] = one.split(',').map(Number);
      const fresh = new BlockMemo();
      fresh.exhaust(kx, ky, side);
      const hits = claimed.filter((other) => {
        const [ox, oy, oside] = other.split(',').map(Number);
        return fresh.isExhausted(ox, oy, oside);
      });
      expect(hits, one).toEqual([one]);
    }

    expect(memo.isExhausted(0, 0, 1)).toBe(false);
  });
});

/**
 * L'epoca e' la sola cosa che separa questo memo da un difetto silenzioso: un
 * rettangolo dichiarato pieno che resta pieno dopo che un cantiere ha portato via
 * un edificio toglie alla citta' un lotto che c'e', e la partita continua senza
 * dire niente. Qui si verifica che la memoria cada quando deve — e, altrettanto
 * importante, che **non** cada quando nulla e' cambiato: un memo che si azzera a
 * ogni domanda e' un memo che non c'e'.
 */
describe('BlockMemo — l epoca del mondo', () => {
  it('tiene finche l epoca non cambia', () => {
    const memo = new BlockMemo();
    memo.observe(7);
    memo.exhaust(2, 2, 4);
    memo.observe(7);

    expect(memo.isExhausted(2, 2, 4)).toBe(true);
  });

  it('cade tutto appena l epoca cambia', () => {
    const memo = new BlockMemo();
    memo.observe(7);
    memo.exhaust(2, 2, 4);
    memo.exhaust(3, 1, 6);
    memo.observe(8);

    expect(memo.isExhausted(2, 2, 4)).toBe(false);
    expect(memo.isExhausted(3, 1, 6)).toBe(false);
    expect(memo.size).toBe(0);
  });

  it('un mondo appena nato ha epoca zero e non e un cambiamento', () => {
    // Il caso che l'epoca iniziale a -1 esiste per coprire: senza, la prima
    // ricerca dell'infornata zero butterebbe via cio' che ha appena imparato.
    const memo = new BlockMemo();
    memo.observe(0);
    memo.exhaust(0, 0, 3);
    memo.observe(0);

    expect(memo.isExhausted(0, 0, 3)).toBe(true);
  });

  it('clear dimentica senza toccare l epoca', () => {
    const memo = new BlockMemo();
    memo.observe(4);
    memo.exhaust(1, 1, 2);
    memo.clear();
    memo.exhaust(1, 1, 2);
    // L'epoca non e' cambiata: cio' che si e' imparato dopo il `clear` resta.
    memo.observe(4);

    expect(memo.isExhausted(1, 1, 2)).toBe(true);
  });
});
