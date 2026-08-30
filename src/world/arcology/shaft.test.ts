import { describe, expect, it } from 'vitest';
import type { VoxelStamp } from '../buildings/stamp';
import { shaftOf, type ShaftRule } from './shaft';

/**
 * Il pozzo contro tutto cio' che gli somiglia.
 *
 * Le asserzioni sono scritte contro i casi che `window.ts` elenca come
 * insidiosi, letti al contrario: li' il nemico e' il cavedio che si spaccia per
 * finestra, qui e' la rientranza del fianco che si spaccia per pozzo.
 */

const RULE: ShaftRule = { minColumns: 9, minDepth: 4 };

/**
 * Uno stamp scritto a mano da una mappa per quota.
 *
 * Ogni riga e' una fila `y`, ogni carattere una colonna `x`: `#` pieno, `.`
 * vuoto. Si legge dal basso, cioe' `layers[0]` e' `z = 0`.
 */
function stampOf(layers: readonly (readonly string[])[]): VoxelStamp {
  const sizeZ = layers.length;
  const sizeY = layers[0].length;
  const sizeX = layers[0][0].length;
  const voxels = new Uint8Array(sizeX * sizeY * sizeZ);
  layers.forEach((layer, z) => {
    layer.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === '#') voxels[x + sizeX * (y + sizeY * z)] = 1;
      });
    });
  });
  return {
    sizeX,
    sizeY,
    sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces: new Uint8Array(voxels.length),
    bandStarts: [0, sizeZ],
  };
}

/** Un anello pieno 7x7 con un vuoto 3x3 in mezzo. */
const RING = [
  '#######',
  '#######',
  '##...##',
  '##...##',
  '##...##',
  '#######',
  '#######',
];

const SOLID = ['#######', '#######', '#######', '#######', '#######', '#######', '#######'];
const OPEN = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];

describe('shaftOf', () => {
  it('trova il pozzo: un vuoto che scende dal piano, cieco sui fianchi', () => {
    // Cinque quote di anello sotto il piano finito, e sopra il cielo aperto.
    const stamp = stampOf([SOLID, RING, RING, RING, RING, RING, OPEN]);
    const shaft = shaftOf(stamp, RULE, 5);

    expect(shaft).not.toBeNull();
    expect(shaft!.columns).toBe(9);
    expect(shaft!.z1).toBe(5);
    expect(shaft!.z0).toBe(1);
    expect(shaft!.openColumns).toBe(9);
  });

  it('una passerella sulla bocca lo attraversa senza chiuderlo', () => {
    // La traversa copre la fila centrale del vuoto: restano sei colonne che
    // vedono il cielo, e il pozzo resta un pozzo. E' il caso che la ricetta
    // vera produce, ed e' anche il piu' facile da rompere per eccesso di zelo.
    const bridge = ['.......', '.......', '.......', '#######', '.......', '.......', '.......'];
    const stamp = stampOf([SOLID, RING, RING, RING, RING, RING, bridge]);
    const shaft = shaftOf(stamp, RULE, 5);

    expect(shaft).not.toBeNull();
    expect(shaft!.columns).toBe(9);
    expect(shaft!.openColumns).toBe(6);
  });

  it('un pozzo tappato non conta, per quanto sia profondo', () => {
    const stamp = stampOf([SOLID, RING, RING, RING, RING, RING, SOLID]);
    expect(shaftOf(stamp, RULE, 5)).toBeNull();
  });

  it('una rientranza del fianco non e un pozzo: il vuoto tocca il bordo', () => {
    // E' il caso opposto a quello che `window.ts` chiama «sbalzo dal fianco»:
    // li' il vuoto sotto e' il cielo di fuori, qui il vuoto di lato e' il fuori
    // e basta. Un pozzo sta **dentro** il costruito su tutti e quattro i lati.
    const notch = [
      '#######',
      '#######',
      '....###',
      '....###',
      '....###',
      '#######',
      '#######',
    ];
    const stamp = stampOf([SOLID, notch, notch, notch, notch, notch, OPEN]);
    expect(shaftOf(stamp, RULE, 5)).toBeNull();
  });

  it('un vuoto troppo corto non conta: e un lucernario, non un pozzo', () => {
    const stamp = stampOf([SOLID, SOLID, SOLID, SOLID, RING, RING, OPEN]);
    expect(shaftOf(stamp, RULE, 5)).toBeNull();
  });

  it('un vuoto troppo stretto non conta', () => {
    const narrow = [
      '#######',
      '#######',
      '###.###',
      '###.###',
      '###.###',
      '#######',
      '#######',
    ];
    const stamp = stampOf([SOLID, narrow, narrow, narrow, narrow, narrow, OPEN]);
    expect(shaftOf(stamp, RULE, 5)).toBeNull();
  });

  it('misura la sezione piu stretta, non la bocca', () => {
    // **E' la differenza che fa di questo il controllo giusto per un imbuto.**
    // La bocca di una piramide invertita e' larghissima e profonda pochissimo;
    // a dire «ci si vede dentro fino in fondo» e' la strozzatura, e contare la
    // bocca avrebbe promosso qualunque conca.
    const wide = [
      '#######',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#######',
    ];
    const stamp = stampOf([SOLID, RING, RING, RING, RING, wide, OPEN]);
    const shaft = shaftOf(stamp, RULE, 5);

    // Solo le nove colonne che scendono fino in fondo reggono `minDepth`.
    expect(shaft!.columns).toBe(9);
  });

  it('non risponde sopra un piano che non esiste', () => {
    const stamp = stampOf([SOLID, RING, OPEN]);
    expect(shaftOf(stamp, RULE, -1)).toBeNull();
    expect(shaftOf(stamp, RULE, 3)).toBeNull();
  });
});
