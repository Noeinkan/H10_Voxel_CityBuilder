import { describe, expect, it } from 'vitest';
import { TERRAIN } from './config';
import { HeightField } from './heightField';
import { shapeFromRegion, withCoastalExtension } from './region';

// La calibrazione verticale di `TERRAIN` e' tarata su un'isola di lato 512:
// e' quella la dimensione su cui i criteri qui sotto devono valere.
const ISLAND = { minX: 0, minY: 0, sizeX: 512, sizeY: 512 };
const SHAPE = shapeFromRegion(ISLAND);

/**
 * Seed sparsi: la calibrazione deve reggere per un seed qualunque.
 *
 * Gli ultimi tre non sono sparsi affatto — sono i **casi estremi del carattere**,
 * trovati scandendone qualche decina. Il 1 pesca insieme la miscela a creste piu'
 * alta e quasi tutta l'espansione della vetta, cioe' il seed piu' ripido che il
 * generatore sa produrre; il 30 ha la vetta piu' alta; il 20 sta in mezzo con
 * entrambi i numeri alti. Senza di loro il criterio di continuita' verrebbe
 * verificato solo su isole di carattere medio, ed e' esattamente dove non serve.
 */
const SEEDS = [1337, 7, 42, 99991, 2024, 65535, 314159, 8675309, 1, 20, 30];

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

  /**
   * L'espansione della vetta porta l'elevazione **sopra** 1, e non c'e' nessun
   * clamp a fermarla: a tenere le colonne sotto il tetto assoluto e' questa
   * disuguaglianza fra costanti, e nient'altro. Se cade, il generatore non
   * lancia niente — il terreno si appiattisce in cima dentro `cellGrid`, che e'
   * il difetto piu' difficile da vedere di tutti.
   */
  it('il tetto assoluto contiene l’espansione piu’ alta', () => {
    const relief = Math.min(
      TERRAIN.maxHeight - TERRAIN.oceanFloor,
      Math.min(SHAPE.radiusX, SHAPE.radiusY) * TERRAIN.maxReliefSlope,
    );
    const maxLift = TERRAIN.summitLift[0] + TERRAIN.summitLift[1];
    const knee = TERRAIN.summitKnee;
    const topElevation = knee + (1 + maxLift) * (1 - knee);
    expect(TERRAIN.oceanFloor + relief * topElevation).toBeLessThanOrEqual(TERRAIN.maxHeight);
  });

  /**
   * La miscela a creste sostituisce un rumore a media nulla con uno a media
   * positiva, e la costante che lo ricentra e' **misurata**: se scivola, l'isola
   * si alza o si abbassa tutta insieme — e il primo posto in cui si vedrebbe e'
   * la costa, che e' anche l'ultimo in cui la si guarda.
   */
  it('la miscela a creste resta centrata su mezzo', () => {
    // **La media si prende su tutti i seed, non su uno.** L'ottava di base ha
    // una lunghezza d'onda di 440 voxel e l'isola ne misura 512: su una finestra
    // larga poco piu' di un'onda la media campionaria vaga di qualche punto
    // percentuale per conto suo, e un seed solo direbbe piu' cosa gli e' capitato
    // sotto che se la costante e' giusta. Sull'insieme quella deriva si cancella,
    // e resta lo scarto sistematico — l'unico che `crestBias` puo' introdurre.
    let total = 0;
    let samples = 0;
    for (const seed of SEEDS) {
      const field = new HeightField(seed, SHAPE);
      let sum = 0;
      let count = 0;
      for (let y = 0; y < 512; y += 3) {
        for (let x = 0; x < 512; x += 3) {
          sum += field.noiseAt(x, y);
          count++;
        }
      }
      total += sum;
      samples += count;
      expect(Math.abs(sum / count - 0.5), `seed ${seed}`).toBeLessThan(0.09);
    }
    expect(Math.abs(total / samples - 0.5)).toBeLessThan(0.02);
  });

  /**
   * Il punto di `summitLift`: due isole non hanno la stessa vetta. Prima, il
   * rilievo era lo stesso per tutti i seed e la quota raggiunta dipendeva solo da
   * dove cadevano le creste — una lotteria stretta, che dava a ogni isola piu' o
   * meno la stessa montagna.
   */
  it('due seed danno due montagne di altezza diversa', () => {
    const peakOf = (seed: number): number => {
      const field = new HeightField(seed, SHAPE);
      let peak = 0;
      for (let y = 0; y < 512; y += 2) {
        for (let x = 0; x < 512; x += 2) peak = Math.max(peak, field.heightAt(x, y));
      }
      return peak;
    };

    // Il 30 espande la vetta quasi al massimo, il 1337 la comprime: sono i due
    // estremi del carattere, non due seed qualunque.
    const alpine = peakOf(30);
    const gentle = peakOf(1337);
    expect(alpine - gentle).toBeGreaterThan(14);
    expect(gentle).toBeGreaterThanOrEqual(TERRAIN.rockMinHeight);
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
