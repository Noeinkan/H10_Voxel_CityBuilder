import { describe, expect, it } from 'vitest';
import { CHUNK, PADDED_VOL, paddedIdx } from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { greedyMesh } from './greedyMesher';
import {
  MAX_DETAIL_QUADS_PER_CHUNK,
  collectSurfaceCells,
  type FixedBox,
  type MicroGeometryWriter,
} from './microGeometry';
import { appendStreetDetail } from './microStreet';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';

/**
 * Il dettaglio del retro.
 *
 * Le tre voci si verificano dalla stessa parte da cui si vedono: **quanto costa**
 * e **dove si aggancia**. La forma esatta di un tubo non e' un contratto — la si
 * guarda a schermo — mentre «non compare sul fronte strada» e «non costa un
 * prisma per voxel» lo sono, ed e' li' che un ritocco distratto fa danno.
 */

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

/** Quote sotto cui `frontage` risponde ancora di si' con l'ingresso a `z < 4`. */
const FRONTAGE_LIMIT = 9;

/**
 * Una torre sola, con o senza il piano terra **interamente** a ingresso.
 *
 * **Il portico su tutto il perimetro non e' un edificio, e' una sonda.**
 * `frontage` guarda in giu' nella **stessa colonna**: un ingresso da un modulo
 * copre la sua colonna e nessun'altra, quindi con quattro moduli per lato la
 * differenza fra le due varianti si perde nel rumore dei tiri. Aprendo tutto il
 * fronte la domanda diventa netta — *sotto la quota franca del retro non deve
 * esserci niente* — e si misura invece di stimarla.
 */
function tower(fullFrontage: boolean): Uint8Array {
  const padded = volume();
  const side = 12;
  for (let z = 0; z < CHUNK - 4; z++) {
    const surface = z === CHUNK - 5 ? SURFACE_KIND.roofTech : SURFACE_KIND.habitat;
    for (let y = 4; y < 4 + side; y++) {
      for (let x = 4; x < 4 + side; x++) {
        const onEdge = x === 4 || y === 4 || x === 4 + side - 1 || y === 4 + side - 1;
        const doorway = fullFrontage && z < 4 && onEdge;
        setLocal(padded, x, y, z, packVisualBlock(
          PALETTE_SLOTS.concrete,
          doorway ? SURFACE_KIND.portal : surface,
        ));
      }
    }
  }
  return padded;
}

/**
 * Quanti prismi emette il **solo** gruppo del retro.
 *
 * Passare da `greedyMesh` misurerebbe tutto il dettaglio del chunk, e su questa
 * domanda darebbe la risposta sbagliata: un ingresso porta con se' montanti,
 * architrave e pensilina, quindi una torre con le porte ha piu' dettaglio *in
 * totale* proprio mentre ne ha **meno** sul retro. Chiamare il gruppo da solo con
 * un writer che conta e' l'unico modo di isolare la voce che si sta verificando.
 */
function streetBoxes(
  padded: Uint8Array,
  origin: readonly [number, number, number],
): readonly (FixedBox & { readonly palette: number })[] {
  const { facadeByFace, bySurface } = collectSurfaceCells(padded);
  const boxes: (FixedBox & { palette: number })[] = [];
  const writer: MicroGeometryWriter = {
    get remainingQuads() {
      return MAX_DETAIL_QUADS_PER_CHUNK;
    },
    emitBox: (box, palette) => {
      boxes.push({ ...box, palette });
      return true;
    },
  };
  appendStreetDetail(padded, writer, facadeByFace, bySurface[SURFACE_KIND.roofTech], origin);
  return boxes;
}

/** La quota piu' bassa toccata dal dettaglio del retro, in unita' di mesh. */
function lowest(boxes: readonly FixedBox[]): number {
  return Math.min(...boxes.map((box) => box.min[2]));
}

/** Quota del solo piano di tetto della torre: e' li' che si aggancia la pergola. */
const ROOF_Z = CHUNK - 5;

describe('il dettaglio del retro', () => {
  it('compare, e non e a costo zero', () => {
    // Il primo controllo e' che la macchina sia accesa: un emettitore che non
    // emette mai passa ogni altro test di questo file.
    expect(streetBoxes(tower(false), [0, 0, 0]).length).toBeGreaterThan(0);
  });

  it('su una parete cieca scende fino a terra', () => {
    // Il riferimento del test qui sotto: senza ingressi il retro comincia in
    // basso, ed e' cosi' che deve essere.
    expect(lowest(streetBoxes(tower(false), [0, 0, 0])))
      .toBeLessThan(FRONTAGE_LIMIT * MESH_UNITS_PER_VOXEL);
  });

  it('sopra un ingresso non scende sotto la quota franca', () => {
    // **E' la regola della fase.** `frontage` dice se sotto una faccia c'e' un
    // ingresso, e li' tubi e scale non devono comparire: su un fronte pulito una
    // calata di scarico legge come sciatteria. Si misura sulla quota piu' bassa
    // toccata e non sul conto dei prismi, perche' il conto quasi non cambia — una
    // calata piu' corta resta **un** prisma, ed e' la sua base a doversi alzare.
    expect(lowest(streetBoxes(tower(true), [0, 0, 0])))
      .toBeGreaterThanOrEqual(FRONTAGE_LIMIT * MESH_UNITS_PER_VOXEL);
  });

  it('la pergola sta sopra il voxel di tetto, non dentro', () => {
    // **La trappola di questo gruppo, e ci e' gia' caduto.** L'aggancio di
    // facciata sporge dal piano da se', perche' `facadeBox` prende una
    // profondita'; l'aggancio di tetto no — `openRoof` risponde sul voxel
    // **solido**, quindi un prisma steso da `z * U` finisce sepolto dentro il
    // pieno e non lo vede nessuno. Costa i suoi quad e non rende un pixel, che e'
    // il difetto che nessun conto di prismi puo' segnalare: erano tutti li'.
    const roofTop = (ROOF_Z + 1) * MESH_UNITS_PER_VOXEL;
    const pergola = streetBoxes(tower(false), [0, 0, 0])
      .filter((box) => box.palette === PALETTE_SLOTS.wood);

    expect(pergola.length, 'la pergola non e stata emessa affatto').toBeGreaterThan(0);
    expect(Math.min(...pergola.map((box) => box.min[2])), 'quota piu bassa della pergola')
      .toBeGreaterThanOrEqual(roofTop);
  });

  it('e deterministico', () => {
    // I prop si seminano su coordinate di **mondo**, non su un PRNG a sequenza:
    // due passate sullo stesso chunk devono dare lo stesso conto, o la cucitura
    // fra due chunk cambierebbe a ogni rebuild.
    expect(streetBoxes(tower(false), [0, 0, 0]).length)
      .toBe(streetBoxes(tower(false), [0, 0, 0]).length);
  });

  it('segue le coordinate di mondo, non quelle locali', () => {
    // Stessa torre, origine diversa: il conto cambia — sono altre colonne, quindi
    // altri tiri — ma resta dello stesso ordine. Se **non** cambiasse, il tiro
    // dipenderebbe dalle coordinate locali e due chunk adiacenti metterebbero il
    // tubo nello stesso posto, con la cucitura in mezzo.
    const here = streetBoxes(tower(false), [0, 0, 0]).length;
    const far = streetBoxes(tower(false), [512, -256, 0]).length;
    expect(far).toBeGreaterThan(here / 4);
    expect(far).toBeLessThan(here * 4);
  });

  it('resta dentro il tetto dei quad', () => {
    const mesh = greedyMesh(tower(false));
    expect(mesh.detailQuadCount).toBeLessThan(MAX_DETAIL_QUADS_PER_CHUNK);
  });

  it('senza facciate d uso non emette niente', () => {
    // Un chunk di solo terreno — nessun linguaggio di facciata — non deve
    // produrre un tubo. E' il caso che copre l'errore piu' facile: agganciarsi a
    // `plain`, che `collectSurfaceCells` scarta apposta.
    const padded = volume();
    for (let z = 0; z < 8; z++) {
      for (let y = 0; y < CHUNK; y++) {
        for (let x = 0; x < CHUNK; x++) {
          setLocal(padded, x, y, z, packVisualBlock(PALETTE_SLOTS.stone, SURFACE_KIND.plain));
        }
      }
    }
    expect(greedyMesh(padded).detailQuadCount).toBe(0);
  });
});
