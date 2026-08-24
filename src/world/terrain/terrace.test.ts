import { describe, expect, it } from 'vitest';
import { TERRACE, TERRAIN } from './config';
import {
  cellFloor,
  isCliff,
  terraceAt,
  terraceOf,
  terraceScheduleAt,
  terraceStepAt,
} from './terrace';

/** Tutte le quote intere che l'isola sappia produrre. */
const HEIGHTS = Array.from({ length: TERRAIN.maxHeight + 1 }, (_, z) => z);

/** Tutte le stratificazioni. */
const BEDDINGS = Array.from({ length: TERRACE.beddings }, (_, b) => b);

describe('le scale delle quote', () => {
  it('sono monotone: salire nel campo non fa mai scendere il terreno', () => {
    for (const bedding of BEDDINGS) {
      for (let z = 1; z <= TERRAIN.maxHeight; z++) {
        expect(terraceOf(z, bedding)).toBeGreaterThanOrEqual(terraceOf(z - 1, bedding));
      }
    }
  });

  it('posano sempre su un multiplo della cella, e mai sopra la quota vera', () => {
    for (const bedding of BEDDINGS) {
      for (const z of HEIGHTS) {
        const posed = terraceOf(z, bedding);
        expect(posed % TERRAIN.cellSize).toBe(0);
        expect(posed).toBeLessThanOrEqual(z);
        expect(z - posed).toBeLessThan(TERRACE.maxStep);
      }
    }
  });

  /**
   * La garanzia di edificabilita', e la ragione per cui `fromHeight` coincide
   * con `beachMaxHeight`: sotto la spiaggia le scale non si distinguono, quindi
   * la pianura non dipende da quale stratificazione le tocchi e resta quella di
   * sempre — la citta' cresce li', e un dirupo in mezzo a un isolato sarebbe un
   * dispetto.
   */
  it('coincidono tutte sotto la spiaggia: la pianura non si terrazza', () => {
    for (let z = 0; z < TERRACE.fromHeight; z++) {
      for (const bedding of BEDDINGS) {
        expect(terraceOf(z, bedding)).toBe(cellFloor(z));
        expect(terraceStepAt(z, bedding)).toBe(TERRAIN.cellSize);
      }
    }
  });

  it('hanno alzate fra una cella e il tetto, e multiple della cella', () => {
    expect(TERRACE.maxStep % TERRAIN.cellSize).toBe(0);
    for (const bedding of BEDDINGS) {
      for (const z of HEIGHTS) {
        const step = terraceStepAt(z, bedding);
        expect(step).toBeGreaterThanOrEqual(TERRAIN.cellSize);
        expect(step).toBeLessThanOrEqual(TERRACE.maxStep);
        expect(step % TERRAIN.cellSize).toBe(0);
      }
    }
  });

  /**
   * `spread` e' dichiarato rispetto allo schedule, e qui si verifica il verso che
   * conta: **il terreno non diventa mai piu' grosso di quanto promesso**. Verso
   * il basso il ventaglio puo' scendere di piu', perche' si appoggia al tetto
   * quando la tacca ci arriva vicino — sopra la fascia rocciosa la tacca vale gia'
   * `maxStep`, e senza quell'appoggio due stratificazioni su tre ci finirebbero
   * schiacciate sopra, cioe' tornerebbero la stessa scala.
   *
   * L'altra meta' del contratto e' la larghezza del ventaglio: le
   * stratificazioni di una stessa pedata stanno dentro `beddings` celle, quindi
   * sono gradi contigui della stessa grana e non fianchi diversi.
   */
  it('l’alzata non supera mai la propria tacca di piu’ di `spread` celle', () => {
    const reach = TERRACE.spread * TERRAIN.cellSize;
    const fan = (TERRACE.beddings - 1) * TERRAIN.cellSize;
    for (const z of HEIGHTS) {
      const risers = BEDDINGS.map((bedding) => terraceStepAt(z, bedding));
      const notches = BEDDINGS.map((bedding) => terraceScheduleAt(terraceOf(z, bedding)));
      for (const bedding of BEDDINGS) {
        expect(risers[bedding], `stratificazione ${bedding} a quota ${z}`)
          .toBeLessThanOrEqual(notches[bedding] + reach);
      }
      expect(Math.max(...risers) - Math.min(...risers), `ventaglio a quota ${z}`)
        .toBeLessThanOrEqual(fan);
    }
  });

  /**
   * **La proprieta' su cui si regge il terreno a celle**, e la sola cosa che
   * autorizza scale diverse in pianta. Il campo continuo tiene il dislivello fra
   * due celle contigue sotto i due voxel (`heightField.test.ts` misura meno di
   * 0,8 per colonna, quindi meno di 1,6 su due), e ogni scala posa entro
   * `maxStep` sotto la quota vera su un multiplo di cella: due quote cosi'
   * vicine non possono percio' distare piu' di `maxStep`, **comunque siano
   * scelte le due scale**.
   *
   * Verificarlo qui e non solo sull'isola e' il punto: e' una proprieta' delle
   * scale, vale per **qualunque** campo che rispetti il vincolo di Lipschitz, e
   * non dipende dal seed di riferimento.
   */
  it('due quote vicine non distano piu’ del tetto, su qualunque coppia di scale', () => {
    const reach = TERRAIN.cellSize;
    for (const here of BEDDINGS) {
      for (const there of BEDDINGS) {
        for (const z of HEIGHTS) {
          for (let delta = 0; delta <= reach; delta += 0.1) {
            const next = Math.min(TERRAIN.maxHeight, z + delta);
            const gap = Math.abs(terraceOf(z, here) - terraceOf(next, there));
            expect(gap, `da ${z} (${here}) a ${z + delta} (${there})`)
              .toBeLessThanOrEqual(TERRACE.maxStep);
          }
        }
      }
    }
  });

  it('la montagna sale davvero: in fascia rocciosa l’alzata arriva al tetto', () => {
    // Non e' un dettaglio di taratura ma cio' che si e' chiesto al terreno: sopra
    // la soglia della roccia il gradone deve valere quattro cubi da qualche
    // parte, e da nessuna parte deve tornare quello della pianura.
    const rock = BEDDINGS.map((bedding) => terraceStepAt(TERRAIN.rockMinHeight, bedding));
    expect(Math.max(...rock)).toBe(TERRACE.maxStep);
    expect(Math.min(...rock)).toBeGreaterThan(TERRAIN.cellSize);
    expect(terraceScheduleAt(TERRAIN.hillMinHeight)).toBeGreaterThan(TERRAIN.cellSize);
    expect(terraceScheduleAt(TERRAIN.beachMaxHeight - TERRAIN.cellSize)).toBe(TERRAIN.cellSize);
  });

  /**
   * Se tutte le scale avessero le stesse pedate, il campo in pianta non
   * cambierebbe niente e la parete tornerebbe alta uguale ovunque.
   */
  it('non sono la stessa scala scritta tre volte', () => {
    const differing = HEIGHTS.filter((z) => {
      const posed = BEDDINGS.map((bedding) => terraceOf(z, bedding));
      return new Set(posed).size > 1;
    });
    expect(differing.length).toBeGreaterThan(TERRAIN.maxHeight / 4);
  });
});

describe('la quota posata in pianta', () => {
  /**
   * Il dislivello massimo fra due celle contigue: meno di 0,8 per colonna
   * (`heightField.test.ts`), quindi meno di 1,6 su due.
   */
  const CELL_DELTA = 1.6;

  it('in pianura non cambia niente: il terreno resta quello di prima', () => {
    for (let z = 0; z < TERRACE.fromHeight; z++) {
      for (let cell = 0; cell < 40; cell++) {
        expect(terraceAt(1337, cell, cell * 3, z)).toBe(cellFloor(z));
      }
    }
  });

  it('e’ una funzione pura di (seed, cella): due blocchi ne leggono la stessa', () => {
    for (let cell = 0; cell < 32; cell++) {
      expect(terraceAt(1337, cell, 7, 52.3)).toBe(terraceAt(1337, cell, 7, 52.3));
    }
    // Seed diverso, isola diversa: la stratificazione non e' una tabella fissa.
    // Su piu' quote e non su una sola: le tre scale si ritrovano ogni tanto sulla
    // stessa pedata — a quota 52 ci cadono tutte — e li' cambiare seed non puo'
    // cambiare niente, il che direbbe della quota e non del seed.
    let differences = 0;
    for (let z = TERRACE.fromHeight; z < TERRAIN.maxHeight; z += 2) {
      for (let cell = 0; cell < 64; cell++) {
        if (terraceAt(1337, cell, 7, z) !== terraceAt(1338, cell, 7, z)) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  /**
   * **L'invariante del terreno a celle**, letto attraverso il campo in pianta
   * invece che sulle scale nude: due celle contigue non si spezzano piu' del
   * tetto dichiarato, qualunque stratificazione tocchi a ciascuna. Vale per
   * qualunque campo che rispetti Lipschitz, non solo per il seed di riferimento.
   */
  it('due celle contigue non si spezzano piu’ del tetto', () => {
    for (const seed of [1337, 7, 99991]) {
      for (let base = 0; base <= TERRAIN.maxHeight; base += 0.5) {
        for (let cell = 0; cell < 24; cell++) {
          const here = terraceAt(seed, cell, 3, Math.min(TERRAIN.maxHeight, base));
          for (const delta of [-CELL_DELTA, 0, CELL_DELTA]) {
            const next = Math.max(0, Math.min(TERRAIN.maxHeight, base + delta));
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
              const there = terraceAt(seed, cell + dx, 3 + dy, next);
              expect(Math.abs(here - there), `da ${base} a ${next} sulla cella ${cell}`)
                .toBeLessThanOrEqual(TERRACE.maxStep);
            }
          }
        }
      }
    }
  });

  /**
   * E' il difetto che il campo in pianta esiste per togliere: con una scala sola
   * il ciglio cade dove il campo attraversa una quota tonda, cioe' su una curva
   * di livello esatta. Su un fianco a pendenza costante quella curva e' una
   * retta, e la scarpata si legge come disegnata col compasso.
   */
  it('sul fianco il ciglio non cade sulla stessa colonna', () => {
    // Un versante che sale di mezzo voxel per cella, in fascia rocciosa.
    const heightAt = (cell: number): number => 50 + cell * 0.5;
    const edges: number[] = [];
    for (let row = 0; row < 24; row++) {
      let previous = terraceAt(1337, 0, row, heightAt(0));
      for (let cell = 1; cell < 40; cell++) {
        const here = terraceAt(1337, cell, row, heightAt(cell));
        if (here !== previous) edges.push(cell);
        previous = here;
      }
    }
    // Con una scala sola il ciglio cadrebbe sulla stessa cella in ogni riga.
    expect(new Set(edges).size).toBeGreaterThan(2);
  });

  /**
   * **La ragione per cui le scale sono piu' di una, ed e' la richiesta scritta
   * come test.** Con una scala sola due celle contigue cadono su pedate contigue,
   * quindi il salto vale *esattamente un'alzata*: a parita' di quota del ciglio
   * c'e' **un solo** salto possibile, e ogni parete di quella fascia esce alta
   * uguale ovunque e per tutto il suo sviluppo.
   *
   * Si guarda percio' il salto raggruppato per quota del ciglio, e si chiede che
   * a qualche quota ne esista piu' d'uno. Su tutta la scarpata e non su una
   * finestra scelta: le tre scale si ritrovano ogni tanto sulla stessa pedata, e
   * chiedere la varieta' proprio li' misurerebbe la fortuna della finestra.
   */
  it('a parita’ di quota il ciglio non ha una sola altezza', () => {
    // Un versante a pendenza costante che scende verso -x, per tutto il rilievo.
    const heightAt = (cell: number): number => TERRACE.fromHeight + cell * 0.5;
    const perTop = new Map<number, Set<number>>();
    for (let row = 0; row < 120; row++) {
      for (let cell = 1; cell < 112; cell++) {
        const here = terraceAt(1337, cell, row, heightAt(cell));
        const below = terraceAt(1337, cell - 1, row, heightAt(cell - 1));
        if (here - below <= TERRAIN.cellSize) continue;
        let seen = perTop.get(here);
        if (seen === undefined) perTop.set(here, (seen = new Set()));
        seen.add(here - below);
      }
    }

    const varied = [...perTop.values()].filter((seen) => seen.size > 1);
    expect(perTop.size).toBeGreaterThan(4);
    expect(varied.length).toBeGreaterThan(0);
  });
});

describe('il ciglio', () => {
  it('e’ il salto che supera un cubo, non quello che lo raggiunge', () => {
    expect(isCliff(0)).toBe(false);
    expect(isCliff(TERRAIN.cellSize)).toBe(false);
    expect(isCliff(TERRAIN.cellSize + 1)).toBe(true);
    expect(isCliff(TERRACE.maxStep)).toBe(true);
  });
});
