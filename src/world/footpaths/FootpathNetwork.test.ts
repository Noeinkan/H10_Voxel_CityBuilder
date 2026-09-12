import { describe, expect, it } from 'vitest';
import { BIOME } from '../terrain/config';
import { FootpathNetwork, type FootpathGround } from './FootpathNetwork';

/**
 * Un luogo finto per le prove: una griglia di caratteri letta come mappa.
 *
 * `.` prato, `#` edificio, `=` carreggiata, `~` battigia, e una cifra la quota
 * in cubi di terreno. Cio' che sta fuori dalla griglia e' mondo non generato.
 */
function place(rows: readonly string[]): {
  readonly ground: FootpathGround;
  readonly occupied: (x: number, y: number) => boolean;
  readonly paved: (x: number, y: number) => boolean;
} {
  const at = (x: number, y: number): string | null => rows[y]?.[x] ?? null;

  return {
    ground: {
      has: (x, y) => at(x, y) !== null,
      heightAt: (x, y) => {
        const cell = at(x, y);
        return cell !== null && cell >= '0' && cell <= '9' ? Number(cell) * 2 : 0;
      },
      biomeAt: (x, y) => (at(x, y) === '~' ? BIOME.beach : BIOME.plain),
      slopeAt: () => 0,
    },
    occupied: (x, y) => at(x, y) === '#',
    paved: (x, y) => at(x, y) === '=',
  };
}

function networkOn(rows: readonly string[]): FootpathNetwork {
  const { ground, occupied, paved } = place(rows);
  return new FootpathNetwork(ground, occupied, paved);
}

describe('FootpathNetwork', () => {
  it('non tira niente da un portone gia sulla carreggiata', () => {
    const paths = networkOn(['==...', '.....']);
    expect(paths.connect(1, 0)).toEqual([]);
    expect(paths.cells).toBe(0);
  });

  it('tira il vicolo fino alla carreggiata senza ridipingerla', () => {
    const paths = networkOn([
      '=....',
      '.....',
    ]);
    const cells = paths.connect(4, 0);

    expect(cells.length).toBeGreaterThan(0);
    // La colonna di carreggiata non e' sua da dipingere: li' vince la strada.
    expect(cells.some((cell) => cell.x === 0 && cell.y === 0)).toBe(false);
    // E il lastricato le arriva accanto, senza lasciare un varco.
    expect(cells.some((cell) => cell.x === 1 && cell.y === 0)).toBe(true);
    expect(paths.has(4, 0)).toBe(true);
  });

  it('innesta il secondo vicolo sul primo invece di rifare la stessa corsa', () => {
    const paths = networkOn([
      '=.....',
      '......',
      '......',
    ]);
    const first = paths.connect(5, 0);
    expect(first.length).toBeGreaterThan(0);

    // La seconda casa sta sopra il vicolo appena posato: gli basta scendere di
    // una riga, e le colonne gia' lastricate non tornano indietro.
    const second = paths.connect(4, 1);
    expect(second.length).toBeGreaterThan(0);
    expect(second.length).toBeLessThan(first.length);
    for (const cell of second) {
      expect(first.some((other) => other.x === cell.x && other.y === cell.y)).toBe(false);
    }
  });

  it('non attraversa mai una colonna occupata', () => {
    // Una fila di case fra il portone e la carreggiata: il vicolo gira sotto.
    const paths = networkOn([
      '=####',
      '.....',
      '.....',
    ]);
    const cells = paths.connect(4, 1);

    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const built = cell.y === 0 && cell.x > 0 && cell.x < 5;
      expect(built).toBe(false);
    }
  });

  it('non parte da dentro un edificio', () => {
    // Capita quando `doorstepOf` ripiega sull'ancora del lotto: li' non c'e'
    // niente da lastricare, e una prima colonna che la coda scarterebbe in
    // silenzio e' peggio di nessun vicolo.
    const paths = networkOn([
      '=....',
      '..##.',
      '..##.',
    ]);
    expect(paths.connect(2, 1)).toEqual([]);
  });

  it('non scende sulla battigia, dove il lastricato finirebbe sott acqua', () => {
    // L'unica via verso la carreggiata passa per il bassofondo: meglio nessun
    // vicolo che un vicolo sul fondale.
    const paths = networkOn([
      '=~~~~',
      '~~~~~',
      '....#',
    ]);
    expect(paths.connect(4, 2)).toEqual([]);
  });

  it('rinuncia quando il primo suolo pubblico e oltre la portata', () => {
    // La carreggiata sta a piu' di `FOOTPATHS.reach` colonne: a quella distanza
    // non serve un vicolo ma un capillare carrabile, e quello lo tira `roads/`.
    const wide = ['='.padEnd(40, '.'), '.'.repeat(40)];
    const paths = networkOn(wide);
    expect(paths.connect(39, 1)).toEqual([]);
  });

  it('sale una scalinata che una carreggiata non risalirebbe', () => {
    // Due cubi di terreno per colonna: `ROADS.maxRise` ne concede uno solo.
    const paths = networkOn([
      '=1234',
    ]);
    const cells = paths.connect(4, 0);
    expect(cells.map((cell) => cell.level)).toEqual([8, 6, 4, 2]);
  });
});
