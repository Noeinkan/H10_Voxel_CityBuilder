import { describe, expect, it } from 'vitest';
import { ALL_CLASSES, BALANCE, BUILDING_CLASS, CATALYSTS, catalystById } from '../sim';
import { closestUse, siteAdvice, type AdviceQuery } from './siteAdvice';

/**
 * Le prove del consiglio, e sono tutte **strutturali**.
 *
 * Nessuna nomina il ruolo che dovrebbe vincere: quale sia dipende da
 * `balance.ts`, e un test che scrivesse «Park» diventerebbe rosso alla prima
 * ritaratura senza che niente si sia rotto — la stessa ragione per cui le
 * tabelle di misura di `README.md` si rimisurano invece di indovinarle. Cio' che
 * deve restare vero e' l'ordine, il filtro di sito e il fatto che un consiglio a
 * resa nulla non compaia mai.
 */

function query(extra: Partial<AdviceQuery> = {}): AdviceQuery {
  return {
    cls: BUILDING_CLASS.residential,
    missing: 18,
    coastal: false,
    flat: true,
    nearby: [],
    ...extra,
  };
}

describe('siteAdvice', () => {
  it('fra i ruoli che chiudono il divario vince il piu\' economico', () => {
    // Ordinare per sola resa consigliava il monumento da 440 dove il parco da
    // 200 chiudeva lo stesso divario: la desiderabilita' oltre soglia non compra
    // un secondo livello, quindi in eccesso non conta niente.
    const advice = siteAdvice(query({ cls: BUILDING_CLASS.civic, missing: 15 }));
    if (advice === null) throw new Error('consiglio atteso');

    const enough = advice.options.filter((option) => option.enough);
    expect(enough.length).toBe(advice.options.length);
    const costs = enough.map((option) => option.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('dove nessuno basta, torna a contare la resa', () => {
    const advice = siteAdvice(query({ missing: 100000 }));
    if (advice === null) throw new Error('consiglio atteso');

    expect(advice.options.every((option) => !option.enough)).toBe(true);
    const gains = advice.options.map((option) => option.gain);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
  });

  it('non ne mostra piu\' di tre, e la barra e\' relativa alla resa migliore', () => {
    const advice = siteAdvice(query());
    if (advice === null) throw new Error('consiglio atteso');

    expect(advice.options.length).toBeGreaterThan(0);
    expect(advice.options.length).toBeLessThanOrEqual(3);
    for (const option of advice.options) {
      expect(option.share).toBeGreaterThan(0);
      expect(option.share).toBeLessThanOrEqual(1);
    }
  });

  it('la resa e\' quella che il campo applica davvero al centro', () => {
    // Stessa aritmetica di `influenceSummary` su un landmark gia' posato: se le
    // due divergessero, la scheda prometterebbe un numero e ne mostrerebbe un
    // altro appena il catalizzatore fosse in terra.
    const advice = siteAdvice(query({ cls: BUILDING_CLASS.industrial }));
    if (advice === null) throw new Error('consiglio atteso');

    for (const option of advice.options) {
      const entry = catalystById(option.id);
      expect(option.gain).toBe(Math.round(entry.strength * entry.influence[BUILDING_CLASS.industrial]));
      expect(option.cost).toBe(entry.cost);
    }
  });

  it('un ruolo che il sito rifiuta non entra mai nell\'elenco', () => {
    const inland = siteAdvice(query({ coastal: false, flat: false }));
    if (inland === null) throw new Error('consiglio atteso');

    for (const option of inland.options) {
      expect(catalystById(option.id).site).toBe('any');
    }

    // Sulla costa i ruoli d'acqua tornano ammissibili, quindi il catalogo da cui
    // si sceglie e' piu' largo: la prova e' che il filtro dipenda dal sito e non
    // che uno di loro vinca.
    const shore = siteAdvice(query({ coastal: true, flat: true }));
    expect(shore).not.toBeNull();
    expect(shore!.options.every((option) => option.gain > 0)).toBe(true);
  });

  it('dichiara i ruoli che stanno gia\' in portata invece di nasconderli', () => {
    const labels = CATALYSTS.map((entry) => entry.label);
    const advice = siteAdvice(query({ nearby: labels }));
    if (advice === null) throw new Error('consiglio atteso');

    // Un secondo mercato versa quanto il primo: restano consigliabili, ma il
    // nome che il giocatore ha appena letto fra le fonti si deve riconoscere.
    expect(advice.options.every((option) => option.present)).toBe(true);
  });

  it('nessun ruolo versa sull\'uso, nessun consiglio', () => {
    // Un uso che nessun catalizzatore favorisce non produce una carta vuota: il
    // vuoto e' un fatto, come `growth: null` nella scheda.
    const barren = ALL_CLASSES.filter((cls) => CATALYSTS.every((entry) => entry.influence[cls] <= 0));
    for (const cls of barren) expect(siteAdvice(query({ cls }))).toBeNull();
  });
});

describe('closestUse', () => {
  it('sceglie l\'uso che manca di meno, non quello che vale di piu\'', () => {
    // E' l'unico che un catalizzatore solo puo' davvero portare sopra soglia, e
    // un consiglio che non chiude il divario e' un consiglio che non si vede
    // funzionare.
    const thresholds = BALANCE.desirability.siteThreshold;
    const desirability = ALL_CLASSES.map((cls) => (thresholds[cls] ?? 0) - (cls === BUILDING_CLASS.civic ? 3 : 30));

    const closest = closestUse(desirability, ALL_CLASSES);
    expect(closest).toMatchObject({ cls: BUILDING_CLASS.civic, missing: 3 });
  });

  it('se un uso e\' gia\' sopra soglia non manca niente', () => {
    const thresholds = BALANCE.desirability.siteThreshold;
    const desirability = ALL_CLASSES.map((cls) => (thresholds[cls] ?? 0) + 1);

    expect(closestUse(desirability, ALL_CLASSES)).toBeNull();
  });
});
