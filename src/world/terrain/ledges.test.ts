import { describe, expect, it } from 'vitest';
import { CHUNK } from '../chunkCoords';
import { VoxelWorld } from '../VoxelWorld';
import { CELL_STEPS } from './cellGrid';
import { LEDGE, TERRAIN } from './config';
import { HeightField } from './heightField';
import { generateColumnBlock } from './IslandGenerator';
import { LEDGE_RECORD_SIZE, LEDGE_MIN_DROP, ledgeAt, ledgeSpec, ledgeTop, writeLedge } from './ledges';
import { shapeFromRegion } from './region';

const SEED = 1337;
const ISLAND = { minX: 0, minY: 0, sizeX: 512, sizeY: 512 };

/** Cerca la prima cella che accetta una sporgenza, per non dipendere dal sale. */
function firstLedge(rimZ: number, floorZ: number): { cellX: number; cellY: number } | null {
  for (let cellY = 0; cellY < 64; cellY++) {
    for (let cellX = 0; cellX < 64; cellX++) {
      if (ledgeAt(SEED, cellX, cellY, rimZ, floorZ, 0) !== null) return { cellX, cellY };
    }
  }
  return null;
}

describe('sporgenze — quando esistono', () => {
  it('il salto minimo e’ la somma di cio’ che ci sta sopra e sotto', () => {
    expect(LEDGE_MIN_DROP).toBe(LEDGE.clearance + LEDGE.thickness + TERRAIN.cellSize);
  });

  it('un ciglio troppo basso non ne regge nessuna, per nessuna cella', () => {
    // Un voxel meno del minimo: la lastra arriverebbe a filo del ciglio, e da
    // sotto si leggerebbe come un errore di quantizzazione invece che come una
    // cengia. Il rifiuto non dipende dal sorteggio, quindi vale per ogni cella.
    const floorZ = 20;
    for (let cellX = 0; cellX < 200; cellX++) {
      expect(ledgeAt(SEED, cellX, 3, floorZ + LEDGE_MIN_DROP - 1, floorZ, 0)).toBeNull();
    }
  });

  it('un ciglio alto abbastanza ne regge, e sempre la stessa', () => {
    const found = firstLedge(40, 40 - LEDGE_MIN_DROP);
    expect(found).not.toBeNull();
    if (found === null) return;

    const a = ledgeAt(SEED, found.cellX, found.cellY, 40, 40 - LEDGE_MIN_DROP, 0);
    const b = ledgeAt(SEED, found.cellX, found.cellY, 40, 40 - LEDGE_MIN_DROP, 0);
    expect(a).toEqual(b);
    // L'aria sotto e' esattamente quella dichiarata, e sopra resta parete.
    expect(a?.baseZ).toBe(40 - LEDGE_MIN_DROP + LEDGE.clearance);
    expect(ledgeTop(a?.baseZ ?? 0)).toBeLessThanOrEqual(40 - TERRAIN.cellSize);
  });

  it('senza un verso di caduta non c’e’ niente da cui sporgere', () => {
    expect(ledgeAt(SEED, 5, 5, 40, 20, -1)).toBeNull();
  });
});

describe('sporgenze — cosa scrivono', () => {
  /**
   * Il criterio vero del dominio: sotto la lastra c'e' aria. Se non ce ne fosse
   * non sarebbe una sporgenza ma un pezzo di terreno, e il generatore lo saprebbe
   * gia' scrivere come colonna.
   */
  it('la lastra ha aria sotto di se’ e si assottiglia allontanandosi dalla parete', () => {
    const world = new VoxelWorld();
    const spec = ledgeSpec(8, 8, 0, 30);
    const written = writeLedge(world, spec, 0, 0, 32, 32);
    expect(written).toBeGreaterThan(0);

    const [dx] = CELL_STEPS[spec.dir];
    const near = spec.x + TERRAIN.cellSize;
    for (let along = 0; along < TERRAIN.cellSize; along++) {
      const y = spec.y + along;
      // Filare attaccato alla parete: spessore pieno, e sotto il vuoto.
      expect(world.getBlock(near, y, spec.baseZ - 1)).toBe(0);
      for (let k = 0; k < LEDGE.thickness; k++) {
        expect(world.getBlock(near, y, spec.baseZ + k)).not.toBe(0);
      }
      // Filare esterno: un voxel di meno, ed e' il cuneo.
      const far = near + dx * (TERRAIN.cellSize - 1);
      expect(world.getBlock(far, y, spec.baseZ)).not.toBe(0);
      expect(world.getBlock(far, y, spec.baseZ + LEDGE.thickness - 1)).toBe(0);
    }
  });

  it('non esce mai dal rettangolo che le viene dato', () => {
    // Sporgenza tutta oltre il bordo: chi la scrive non tocca un voxel, ed e'
    // cio' che rende indipendente dall'ordine il blocco confinante che la
    // scrivera' per intero con lo stesso identico calcolo.
    const outside = new VoxelWorld();
    expect(writeLedge(outside, ledgeSpec(CHUNK - TERRAIN.cellSize, 4, 0, 30), 0, 0, CHUNK, CHUNK))
      .toBe(0);
    expect(outside.chunks.size).toBe(0);

    // Ancorata appena fuori, ricade dentro: si scrive la sola meta' interna.
    const inside = new VoxelWorld();
    expect(writeLedge(inside, ledgeSpec(-TERRAIN.cellSize, 4, 0, 30), 0, 0, CHUNK, CHUNK))
      .toBeGreaterThan(0);
    expect(inside.getBlock(-1, 4, 30)).toBe(0);
  });
});

describe('sporgenze — sull’isola vera', () => {
  it('il rilievo del seed di riferimento ne produce, e stanno tutte in quota', () => {
    const field = new HeightField(SEED, shapeFromRegion(ISLAND));

    // I blocchi centrali: e' dove sta il rilievo, ed e' l'unico posto in cui un
    // ciglio puo' essere alto abbastanza. Generarli tutti e sedici per sedici
    // direbbe la stessa cosa al costo di un'isola intera.
    let total = 0;
    let lowest = Number.POSITIVE_INFINITY;
    for (let ccy = 5; ccy < 11; ccy++) {
      for (let ccx = 5; ccx < 11; ccx++) {
        const block = generateColumnBlock(field, ccx, ccy);
        total += block.ledges.length / LEDGE_RECORD_SIZE;
        for (let i = 0; i < block.ledges.length; i += LEDGE_RECORD_SIZE) {
          lowest = Math.min(lowest, block.ledges[i + 3]);
        }
      }
    }

    expect(total).toBeGreaterThan(0);
    // Nessuna sporgenza sott'acqua: la quota minima possibile e' quella di un
    // ciglio che si affaccia sul pelo del mare, piu' l'aria che ci sta sotto.
    expect(lowest).toBeGreaterThanOrEqual(TERRAIN.seaLevel);
  });
});
