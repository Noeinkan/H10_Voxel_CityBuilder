import { describe, expect, it } from 'vitest';
import { TERRAIN } from './config';
import { HeightField } from './heightField';
import { shapeFromRegion, withCoastalExtension } from './region';

// La calibrazione verticale di `TERRAIN` e' tarata su un'isola di lato 512:
// e' quella la dimensione su cui i criteri qui sotto devono valere.
const ISLAND = { minX: 0, minY: 0, sizeX: 512, sizeY: 512 };
const SHAPE = shapeFromRegion(ISLAND);

/** Otto seed sparsi: la calibrazione deve reggere per un seed qualunque. */
const SEEDS = [1337, 7, 42, 99991, 2024, 65535, 314159, 8675309];

/** Campiona il campo su `[-1, size]^2` e restituisce il reticolo paddato. */
function sampleGrid(field: HeightField, size: number): Float64Array {
  const side = size + 2;
  const grid = new Float64Array(side * side);
  for (let y = -1; y <= size; y++) {
    for (let x = -1; x <= size; x++) grid[(y + 1) * side + (x + 1)] = field.heightAt(x, y);
  }
  return grid;
}

describe('HeightField — determinismo', () => {
  it('e’ una funzione pura di (seed, shape, x, y)', () => {
    const a = new HeightField(1337, SHAPE);
    const b = new HeightField(1337, SHAPE);

    // Ordine di visita opposto: se ci fosse stato accumulato si vedrebbe qui.
    const forward: number[] = [];
    for (let i = 0; i < 512; i++) forward.push(a.heightAt(i % 97, Math.floor(i / 97)));
    const backward: number[] = [];
    for (let i = 511; i >= 0; i--) backward.unshift(b.heightAt(i % 97, Math.floor(i / 97)));

    expect(backward).toEqual(forward);
  });

  /**
   * Un settore costiero comprato a partita in corso allarga la maschera, e non
   * deve poter spostare niente altrove: le colonne gia' generate non si
   * rigenerano, quindi una collina che si muovesse lascerebbe un gradino sulla
   * cucitura. E' il motivo per cui lobi, rilievi e conche si derivano dalla sola
   * ellisse base e ignorano `extensions`.
   */
  it('aggiungere un’estensione costiera non muove il resto dell’isola', () => {
    const base = new HeightField(1337, SHAPE);
    const grown = new HeightField(
      1337,
      withCoastalExtension(SHAPE, { minX: 384, minY: 192, sizeX: 128, sizeY: 128 }, 'settore'),
    );

    for (let y = 0; y < 384; y += 3) {
      for (let x = 0; x < 320; x += 3) {
        expect(grown.heightAt(x, y)).toBe(base.heightAt(x, y));
        expect(grown.waterLevelAt(x, y)).toBe(base.waterLevelAt(x, y));
      }
    }
  });

  it('seed diversi danno isole diverse', () => {
    const a = new HeightField(1337, SHAPE);
    const b = new HeightField(1338, SHAPE);
    let differences = 0;
    for (let i = 0; i < 512; i++) {
      if (a.heightAt(i, 256) !== b.heightAt(i, 256)) differences++;
    }
    expect(differences).toBeGreaterThan(200);
  });
});

describe('HeightField — regolarita’', () => {
  /**
   * Il criterio "due colonne adiacenti non differiscono di piu' di 1" e' un
   * vincolo di Lipschitz sul campo continuo, non una proprieta' delle cuciture
   * fra region: se il campo lo rispetta ovunque, lo rispetta anche al confine.
   * Questo test e' quindi la rete di sicurezza della calibrazione in `config.ts`.
   */
  it('il dislivello fra colonne adiacenti resta sotto 1 voxel, per ogni seed', () => {
    const size = 512;
    const side = size + 2;
    let worst = 0;

    for (const seed of SEEDS) {
      const grid = sampleGrid(new HeightField(seed, SHAPE), size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y + 1) * side + (x + 1);
          const h = grid[i];
          const delta = Math.max(
            Math.abs(grid[i + 1] - h),
            Math.abs(grid[i - 1] - h),
            Math.abs(grid[i + side] - h),
            Math.abs(grid[i - side] - h),
          );
          if (delta > worst) worst = delta;
        }
      }
    }

    // Il margine conta quanto il valore: serve spazio per ritoccare le frequenze
    // senza far cadere il criterio di continuita'.
    expect(worst).toBeLessThan(1);
    expect(worst).toBeLessThan(0.8);
  });

  /**
   * Il gradiente del campo scala come rilievo diviso raggio, quindi una region
   * piccola con lo stesso rilievo avrebbe pendenze doppie e il criterio di
   * continuita' cadrebbe. `maxReliefSlope` esiste per questo: qui si verifica
   * che il tetto morda davvero.
   */
  it('il dislivello resta sotto 1 anche su region molto piu’ piccole', () => {
    for (const size of [128, 192, 256]) {
      const shape = shapeFromRegion({ minX: 0, minY: 0, sizeX: size, sizeY: size });
      const field = new HeightField(1337, shape);
      const side = size + 2;
      const grid = sampleGrid(field, size);

      let worst = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y + 1) * side + (x + 1);
          const h = grid[i];
          const delta = Math.max(
            Math.abs(grid[i + 1] - h),
            Math.abs(grid[i - 1] - h),
            Math.abs(grid[i + side] - h),
            Math.abs(grid[i - side] - h),
          );
          if (delta > worst) worst = delta;
        }
      }
      expect(worst, `region ${size}x${size}`).toBeLessThan(0.8);
    }
  });

  it('un’isola piccola e’ piu’ bassa, non piu’ ripida', () => {
    const big = new HeightField(1337, shapeFromRegion(ISLAND));
    const small = new HeightField(1337, shapeFromRegion({ minX: 0, minY: 0, sizeX: 128, sizeY: 128 }));

    const peakOf = (field: HeightField, size: number): number => {
      let peak = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) peak = Math.max(peak, field.heightAt(x, y));
      }
      return peak;
    };

    // Raggio 64 contro 256: il tetto di pendenza taglia il rilievo a un quarto.
    expect(peakOf(small, 128)).toBeLessThan(peakOf(big, 512) / 2);
    expect(peakOf(small, 128)).toBeGreaterThan(TERRAIN.seaLevel);
  });

  it('resta nei limiti di quota dichiarati', () => {
    const field = new HeightField(1337, SHAPE);
    for (let y = -64; y < 576; y += 5) {
      for (let x = -64; x < 576; x += 5) {
        const h = field.heightAt(x, y);
        expect(h).toBeGreaterThanOrEqual(TERRAIN.oceanFloor);
        expect(h).toBeLessThanOrEqual(TERRAIN.maxHeight);
      }
    }
  });

  it('la maschera radiale porta il bordo della region sotto il livello del mare', () => {
    for (const seed of SEEDS) {
      const field = new HeightField(seed, SHAPE);
      for (let x = 0; x < 512; x += 1) {
        expect(field.heightAt(x, 0)).toBeLessThan(TERRAIN.seaLevel);
        expect(field.heightAt(x, 511)).toBeLessThan(TERRAIN.seaLevel);
        expect(field.heightAt(0, x)).toBeLessThan(TERRAIN.seaLevel);
        expect(field.heightAt(511, x)).toBeLessThan(TERRAIN.seaLevel);
      }
    }
  });

  /**
   * L'acqua ha smesso di essere un piano solo, e questa e' la proprieta' che
   * tiene la cosa sotto controllo: lo specchio e' il mare **dappertutto** tranne
   * dentro una conca, dove sta piu' in alto. Una quota d'acqua sotto il livello
   * del mare non esiste, e non deve poter comparire per un seed sfortunato.
   */
  it('lo specchio e’ il mare ovunque, tranne piu’ in alto dentro un lago', () => {
    for (const seed of SEEDS) {
      const field = new HeightField(seed, SHAPE);
      let lake = 0;
      for (let y = 0; y < 512; y += 2) {
        for (let x = 0; x < 512; x += 2) {
          const level = field.waterLevelAt(x, y);
          expect(level).toBeGreaterThanOrEqual(TERRAIN.seaLevel);
          if (level === TERRAIN.seaLevel) continue;
          // Dentro un lago il fondo sta sotto il pelo, e di poco: e' quel poco a
          // tenerlo dentro `shallowDepth`, cioe' a farlo leggere come pozza.
          lake++;
          expect(level % TERRAIN.cellSize).toBe(0);
          expect(level - field.heightAt(x, y)).toBeLessThanOrEqual(TERRAIN.shallowDepth);
        }
      }
      // Non ogni isola ha un lago — serve una spianata larga quanto la conca —
      // ma il seed di riferimento del progetto ce l'ha.
      if (seed === 1337) expect(lake).toBeGreaterThan(0);
    }
  });

  /**
   * E' il difetto da cui nasce `outline.ts`, misurato dove si vedeva: sullo
   * specchio. L'acqua e' l'unica superficie dell'isola senza grana ne'
   * terrazzamento, quindi il suo bordo e' l'unica curva che si legga per
   * intero — e una circonferenza esatta si riconosce da qualunque distanza.
   */
  it('il bordo di un lago non e’ una circonferenza', () => {
    const field = new HeightField(1337, SHAPE);
    const columns: { x: number; y: number }[] = [];
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const level = field.waterLevelAt(x, y);
        if (level > TERRAIN.seaLevel && field.heightAt(x, y) < level) columns.push({ x, y });
      }
    }
    expect(columns.length).toBeGreaterThan(256);

    let sumX = 0;
    let sumY = 0;
    for (const column of columns) {
      sumX += column.x;
      sumY += column.y;
    }
    const centreX = sumX / columns.length;
    const centreY = sumY / columns.length;

    // Il raggio dello specchio in sedici direzioni: se fosse un cerchio
    // sarebbero sedici numeri uguali.
    const sectors = new Array<number>(16).fill(0);
    for (const column of columns) {
      const dx = column.x - centreX;
      const dy = column.y - centreY;
      const angle = Math.atan2(dy, dx) + Math.PI;
      const sector = Math.min(15, Math.floor((angle / (Math.PI * 2)) * 16));
      sectors[sector] = Math.max(sectors[sector], Math.sqrt(dx * dx + dy * dy));
    }
    expect(Math.min(...sectors)).toBeGreaterThan(0);
    expect(Math.max(...sectors) / Math.min(...sectors)).toBeGreaterThan(1.15);
  });

  it('la quota massima dell’isola arriva in fascia rocciosa, per ogni seed', () => {
    for (const seed of SEEDS) {
      const field = new HeightField(seed, SHAPE);
      let peak = 0;
      for (let y = 32; y < 224; y++) {
        for (let x = 32; x < 224; x++) {
          const h = field.heightAt(x, y);
          if (h > peak) peak = h;
        }
      }
      expect(peak).toBeGreaterThanOrEqual(TERRAIN.rockMinHeight);
    }
  });
});
