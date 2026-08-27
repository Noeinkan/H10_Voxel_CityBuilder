import { describe, expect, it } from 'vitest';
import { SCALE } from '../scale';
import { AERIAL, DECK_HEIGHT } from './config';
import {
  AERIAL_FACE,
  AERIAL_FACES,
  faceRuns,
  planTerrace,
  type AerialSupport,
} from './terracePlan';
import { TestGround } from './testProbe';

/**
 * L'aggetto, verificato sul fatto che lo rende nuovo: **sporge oltre
 * l'impronta**.
 *
 * Fino a qui nessuna fascia poteva uscire dal riquadro dichiarato, ed e' scritto
 * nella grammatica degli edifici. La mensola e' la prima cosa che lo fa, e i test
 * qui sotto guardano proprio quel voxel: quanti ce ne sono oltre il filo, e a che
 * quota si attaccano.
 */

const HOST: AerialSupport = { id: 7, x: 20, y: 20, sizeX: 8, sizeY: 8, baseZ: 4, height: 32 };

/** Una torre a due fasce: la seconda rientra di uno, e la sua base e' una terrazza. */
function city(recess = 1): TestGround {
  return new TestGround(4).tower(20, 20, 8, 4, 20, 36, recess, HOST.id);
}

describe('faceRuns — dove una facciata offre un piano', () => {
  it('trova la sommita della fascia bassa, dove quella sopra si e ritirata', () => {
    const runs = faceRuns(city(), HOST, AERIAL_FACE.east);

    expect(runs.length).toBeGreaterThan(0);
    // La fascia bassa finisce a 19 (arriva fino a `mid` escluso), e li' sopra c'e'
    // aria sul filo dell'impronta: e' la terrazza che la grammatica produce gia'.
    expect(runs[0].z).toBe(19);
    expect(runs[0].wall).toBe(27);
    expect(runs[0].to - runs[0].from + 1).toBe(8);
  });

  it('non si attacca a una fascia troppo rientrata: sarebbe un cappello', () => {
    // Rientro di quattro per lato, oltre `maxRecess`: la parete sta nel mezzo
    // dell'edificio, e una mensola attaccata li' uscirebbe da tutti e due i lati.
    const runs = faceRuns(
      new TestGround(4).box(20, 20, 8, 8, 4, 20, HOST.id).box(24, 24, 1, 1, 20, 36, HOST.id),
      HOST,
      AERIAL_FACE.east,
    );
    expect(runs.every((run) => 27 - run.wall <= AERIAL.terrace.maxRecess)).toBe(true);
  });
});

describe('faceRuns — la quota su facciata piena', () => {
  /** Una torre a prisma: nessuna fascia rientra, quindi nessuna quota e' un fatto. */
  function prism(height = HOST.height): { ground: TestGround; host: AerialSupport } {
    const host: AerialSupport = { ...HOST, height };
    return {
      ground: new TestGround(4).box(20, 20, 8, 8, host.baseZ, host.baseZ + height, host.id),
      host,
    };
  }

  it('non appiccica il balcone al marciapiede: comincia in facciata', () => {
    const { ground, host } = prism();
    const runs = faceRuns(ground, host, AERIAL_FACE.east);

    expect(runs.length).toBeGreaterThan(0);
    // **E' il difetto visibile a schermo.** Dove non c'e' una fascia da
    // continuare la quota non la detta nessuno, e la piu' bassa possibile e'
    // `minRise` — tre cubi sopra la strada, cioe' una pensilina.
    expect(runs[0].z).toBeGreaterThan(host.baseZ + AERIAL.minRise);
    expect(runs[0].z).toBe(
      host.baseZ + Math.round(host.height * AERIAL.terrace.facadeRise),
    );
  });

  it('distribuisce le quote sul fronte invece di impilarle', () => {
    // Un ospite ne porta fino a `maxPerHost`: a quote consecutive erano una pila
    // alta nove voxel su una torre di sessanta.
    const { ground, host } = prism(60);
    const runs = faceRuns(ground, host, AERIAL_FACE.east);

    expect(runs.length).toBeGreaterThan(1);
    expect(runs[1].z - runs[0].z).toBeGreaterThan(DECK_HEIGHT);
  });

  it('dove una fascia rientra la quota resta quella della fascia', () => {
    // La regola che fa esistere la rete non si tocca: li' la quota e' un fatto
    // dell'ospite, e la prima corsa e' la sommita' del basamento condiviso.
    expect(faceRuns(city(), HOST, AERIAL_FACE.east)[0].z).toBe(19);
  });
});

describe('planTerrace — la mensola', () => {
  it('sporge oltre l impronta dell ospite, alla quota di una fascia', () => {
    const result = planTerrace({ host: HOST, faces: [AERIAL_FACE.east], ...city() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { rect, deckZ } = result.plan.deck;
    expect(deckZ).toBe(19);
    // **Il voxel del fatto nuovo**: il riquadro comincia oltre il filo est
    // dell'impronta, che sta a 27.
    expect(rect.x).toBe(28);
    expect(rect.x + rect.sizeX).toBeGreaterThan(HOST.x + HOST.sizeX);
    expect(result.plan.face).toBe(AERIAL_FACE.east);
    expect(result.plan.host).toBe(HOST.id);
  });

  it('una mensola profonda si fa le gambe: non e una regola, e la conseguenza', () => {
    const result = planTerrace({ host: HOST, faces: [AERIAL_FACE.east], ...city() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { rect, piers } = result.plan.deck;
    // Lo sporto oltre `reach` chiede un appoggio, e `planDeck` glielo pianta.
    expect(rect.sizeX).toBeGreaterThan(AERIAL.reach);
    expect(piers.length).toBeGreaterThan(0);
  });

  it('non riempie la corsa: sta dentro il fronte a cui si appende', () => {
    // **E' il vincolo che sostituisce «quanto e' larga, tanto e' profonda».** Il
    // riquadro puo' essere piu' corto della corsa e scorrere lungo di lei, ma non
    // puo' uscirne: oltre i due capi non c'e' piu' parete a cui appendersi.
    const runs = faceRuns(city(), HOST, AERIAL_FACE.east);
    const result = planTerrace({ host: HOST, faces: [AERIAL_FACE.east], ...city() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { rect } = result.plan.deck;
    expect(rect.y).toBeGreaterThanOrEqual(runs[0].from);
    expect(rect.y + rect.sizeY).toBeLessThanOrEqual(runs[0].to + 1);
  });

  it('le facce non danno quattro volte lo stesso riquadro', () => {
    // Il difetto che la forma esiste per togliere: con lo sporto legato alla sola
    // lunghezza della corsa, un edificio a impronta quadrata usciva con quattro
    // mensole identiche a meno di una rotazione.
    const drawn = new Set<string>();
    for (const face of AERIAL_FACES) {
      const result = planTerrace({ host: HOST, faces: [face], ...city() });
      if (!result.ok) continue;
      const { rect } = result.plan.deck;
      drawn.add(`${Math.min(rect.sizeX, rect.sizeY)}x${Math.max(rect.sizeX, rect.sizeY)}`);
    }
    expect(drawn.size).toBeGreaterThan(1);
  });

  it('funziona su tutte e quattro le facce, e ognuna esce dalla propria', () => {
    for (const face of AERIAL_FACES) {
      const result = planTerrace({ host: HOST, faces: [face], ...city() });
      expect(result.ok, `faccia ${face}`).toBe(true);
      if (!result.ok) continue;

      const { rect } = result.plan.deck;
      if (face === AERIAL_FACE.east) expect(rect.x).toBeGreaterThan(HOST.x + HOST.sizeX - 1);
      if (face === AERIAL_FACE.west) expect(rect.x + rect.sizeX).toBeLessThanOrEqual(HOST.x);
      if (face === AERIAL_FACE.north) expect(rect.y).toBeGreaterThan(HOST.y + HOST.sizeY - 1);
      if (face === AERIAL_FACE.south) expect(rect.y + rect.sizeY).toBeLessThanOrEqual(HOST.y);
    }
  });

  it('rifiuta un fronte senza una corsa di parete abbastanza lunga', () => {
    // Una torre sottile: il fronte esiste ma non arriva a `minRun`.
    const thin: AerialSupport = { ...HOST, sizeX: 3, sizeY: 3 };
    const result = planTerrace({
      host: thin,
      faces: [AERIAL_FACE.east],
      ...new TestGround(4).box(20, 20, 3, 3, 4, 36, thin.id),
    });
    expect(result).toEqual({ ok: false, refusal: 'noRun' });
  });

  it('e deterministico: lo stesso ospite da la stessa mensola', () => {
    const a = planTerrace({ host: HOST, faces: AERIAL_FACES, ...city() });
    const b = planTerrace({ host: HOST, faces: AERIAL_FACES, ...city() });
    expect(a).toEqual(b);
  });
});

describe('planTerrace — il balcone e il mensolone', () => {
  /**
   * Un ospite all'ingombro della megastruttura.
   *
   * **E' l'unico fronte su cui le due fasi divergono**, e il perche' e' in
   * `overhangOf`: lo sporto non supera mai la corsa, quindi su un fronte da otto
   * il mensolone esce identico al balcone. Serve un fronte da megastruttura
   * (`megaFootprint`) perche' il salto di fase abbia una corsa da aprire.
   */
  const WIDE: AerialSupport = {
    id: 9,
    x: 40,
    y: 40,
    sizeX: SCALE.megaFootprint,
    sizeY: SCALE.megaFootprint,
    baseZ: 4,
    height: 32,
  };

  function wideCity(): TestGround {
    return new TestGround(4).tower(
      WIDE.x, WIDE.y, WIDE.sizeX, WIDE.baseZ, 20, WIDE.baseZ + WIDE.height, 1, WIDE.id,
    );
  }

  /** La profondita' dell'aggetto che questo fronte porta, con il tetto dato. */
  function depthOf(maxOverhang?: number): number {
    const result = planTerrace({
      host: WIDE,
      faces: [AERIAL_FACE.east],
      maxOverhang,
      ...wideCity(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.refusal);
    return result.plan.deck.rect.sizeX;
  }

  it('senza fase resta un balcone, anche su un fronte al modulo', () => {
    // **E' la regressione scritta come test.** Con lo sporto legato al modulo, un
    // fronte da sedici dava una loggia profonda sedici — un altopiano verde
    // grande quanto l'isolato — e la dava dal primo minuto di gioco.
    expect(depthOf()).toBeLessThanOrEqual(AERIAL.terrace.maxOverhang);
  });

  it('con le megastrutture lo stesso fronte porta il mensolone', () => {
    const mega = depthOf(AERIAL.terrace.megaOverhang);
    expect(mega).toBeLessThanOrEqual(AERIAL.terrace.megaOverhang);
    // Le due manopole divergono finche' il modulo sta sopra la profondita' del
    // balcone: sotto, la fase non ha niente da aprire ed e' giusto che coincidano.
    if (AERIAL.terrace.megaOverhang > AERIAL.terrace.maxOverhang) {
      expect(mega).toBeGreaterThan(depthOf());
    }
  });
});
