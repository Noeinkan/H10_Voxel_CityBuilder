import { describe, expect, it } from 'vitest';
import { INSPECT, INSPECT_MODE, INSPECT_MODES } from '../engine/inspect';
import { buildViewMenuModel, viewAfterToolPicked } from './ViewMenuModel';

describe('buildViewMenuModel', () => {
  it('elenca tutte le viste nell’ordine in cui `V` le cicla', () => {
    const model = buildViewMenuModel(INSPECT_MODE.off, 40, 90);

    expect(model.options.map((option) => option.mode)).toEqual([...INSPECT_MODES]);
    // Il ciclo del tasto e l'ordine del menu sono la stessa sequenza: chi impara
    // l'uno sa gia' l'altro.
    expect(model.options[0].label).toBe('Normal');
    expect(model.options.map((option) => option.label)).toEqual([
      'Normal',
      'X-ray',
      'Levels',
      'Cutaway',
      'Block focus',
    ]);
  });

  it('segna attiva una sola vista, e ne riporta etichetta e riga', () => {
    const model = buildViewMenuModel(INSPECT_MODE.section, 40, 90);

    expect(model.options.filter((option) => option.active)).toHaveLength(1);
    expect(model.options.find((option) => option.active)?.mode).toBe(INSPECT_MODE.section);
    expect(model.activeLabel).toBe('Cutaway');
    expect(model.activeDescription).toContain('street');
    // Il toast di `V` legge etichetta, descrizione e gesto: e' l'unico percorso
    // in cui il picker non e' aperto davanti.
    expect(model.activeGesture.length).toBeGreaterThan(0);
  });

  it('ogni vista dice cosa si va a vedere', () => {
    const model = buildViewMenuModel(INSPECT_MODE.off, 40, 90);
    for (const option of model.options) {
      expect(option.description.length).toBeGreaterThan(0);
      expect(option.description.endsWith('.')).toBe(true);
    }
  });

  it('ogni vista che si punta dice anche come si punta', () => {
    const model = buildViewMenuModel(INSPECT_MODE.off, 40, 90);
    for (const option of model.options) {
      // Normal non si punta; tutte le altre hanno un cursore o un tasto dietro,
      // ed era la meta' che il menu non diceva.
      if (option.mode === INSPECT_MODE.off) expect(option.gesture).toBe('');
      else expect(option.gesture.length).toBeGreaterThan(0);
    }
    // Il gesto dei raggi X non porta piu' una misura: la finestra e' la sagoma
    // del soggetto, e una riga che avvisa di avvicinarsi descriverebbe il
    // difetto di prima invece della vista di adesso.
    const xray = model.options.find((option) => option.mode === INSPECT_MODE.xray);
    expect(xray?.gesture).toContain('Point at a building');
    expect(xray?.gesture).not.toMatch(/\d/);
  });

  it('la barra dei livelli compare solo dove c’e’ una quota da muovere', () => {
    for (const mode of INSPECT_MODES) {
      const model = buildViewMenuModel(mode, 40, 90);
      // **Non** «dove taglia»: Cutaway taglia e non ha quota, e la barra li' si
      // trascinava a vuoto.
      expect(model.levelVisible).toBe(mode === INSPECT_MODE.slice);
    }
    expect(buildViewMenuModel(INSPECT_MODE.section, 40, 90).options
      .find((option) => option.mode === INSPECT_MODE.section)?.cuts).toBe(true);
  });

  it('l’estremo della barra segue la citta’ senza uscire dagli estremi ammessi', () => {
    expect(buildViewMenuModel(INSPECT_MODE.slice, 40, 90.2).levelMax).toBe(91);
    expect(buildViewMenuModel(INSPECT_MODE.slice, 40, 1e6).levelMax).toBe(INSPECT.maxSliceZ);
    // Mondo appena generato: la barra resta trascinabile invece di collassare.
    expect(buildViewMenuModel(INSPECT_MODE.slice, 0, 0).levelMax).toBeGreaterThan(INSPECT.minSliceZ);
  });
});

describe('la targa della vista attiva', () => {
  it('sta a schermo solo mentre si guarda dentro', () => {
    expect(buildViewMenuModel(INSPECT_MODE.off, 40, 90).bar.visible).toBe(false);
    for (const mode of INSPECT_MODES) {
      if (mode === INSPECT_MODE.off) continue;
      expect(buildViewMenuModel(mode, 40, 90).bar.visible).toBe(true);
    }
  });

  it('nomina la vista e ripete il gesto, con le stesse parole del picker', () => {
    const model = buildViewMenuModel(INSPECT_MODE.xray, 40, 90);

    // Il picker si chiude subito dopo la scelta e il toast si spegne da solo:
    // se la targa riscrivesse le sue frasi, il giocatore leggerebbe due nomi per
    // la stessa vista a un secondo di distanza.
    expect(model.bar.label).toBe(model.activeLabel);
    expect(model.bar.gesture).toBe(model.activeGesture);
  });

  it('elenca i tasti che valgono in questa vista e non altrove', () => {
    const keysOf = (mode: (typeof INSPECT_MODES)[number]): string[] =>
      buildViewMenuModel(mode, 40, 90).bar.keys.flatMap((hint) => [...hint.keys]);

    // La quota vive in Levels e la rotazione del taglio in Cutaway: elencarle
    // sempre riporterebbe il difetto della card d'aiuto, che pubblicizzava `[`
    // come scorciatoia globale dove non muoveva niente.
    expect(keysOf(INSPECT_MODE.slice)).toContain('[');
    expect(keysOf(INSPECT_MODE.section)).not.toContain('[');
    expect(keysOf(INSPECT_MODE.section)).toContain('Q');
    expect(keysOf(INSPECT_MODE.xray)).not.toContain('Q');
  });

  it('dice sempre come si esce', () => {
    // E' il difetto che la targa esiste per chiudere: si entrava in una vista e
    // non c'era, in nessun punto dello schermo, una parola su come uscirne.
    for (const mode of INSPECT_MODES) {
      const model = buildViewMenuModel(mode, 40, 90);
      if (!model.bar.visible) continue;
      const exit = model.bar.keys.find((hint) => hint.keys.includes('Esc'));
      expect(exit?.action).toContain('city');
      expect(model.bar.keys.some((hint) => hint.keys.includes('V'))).toBe(true);
    }
  });
});

describe('l’isolato scelto', () => {
  it('cambia il gesto senza cambiare il nome della vista', () => {
    const pointing = buildViewMenuModel(INSPECT_MODE.block, 40, 90);
    const studying = buildViewMenuModel(INSPECT_MODE.block, 40, 90, true);

    // Il nome resta: e' la stessa vista in un momento diverso del gesto, e
    // rinominarla farebbe credere di aver cambiato strumento.
    expect(studying.bar.label).toBe(pointing.bar.label);
    expect(studying.blockLocked).toBe(true);
    expect(pointing.blockLocked).toBe(false);

    // Il gesto invece cambia, perche' la mano ora fa un'altra cosa.
    expect(pointing.bar.gesture).not.toBe(studying.bar.gesture);
    expect(studying.bar.gesture.toLowerCase()).toContain('drag');
    expect(studying.bar.gesture).toBe(studying.activeGesture);
  });

  it('dice che Esc molla l’isolato, non che riporta la citta’', () => {
    const model = buildViewMenuModel(INSPECT_MODE.block, 40, 90, true);
    const exit = model.bar.keys.find((hint) => hint.keys.includes('Esc'));

    // Due righe su `Esc` che promettono cose diverse sarebbero peggio di nessuna:
    // qui il tasto molla il soggetto, e la citta' intera arriva col colpo dopo.
    expect(exit?.action).not.toContain('city');
    expect(exit?.action.toLowerCase()).toContain('block');
    expect(model.bar.keys.filter((hint) => hint.keys.includes('Esc'))).toHaveLength(1);
  });

  it('vale solo dentro Block focus', () => {
    // Chiedere di un isolato scelto mentre si guarda una fetta e' una domanda
    // senza senso, e accendere i suoi gesti prometterebbe tasti che non esistono.
    for (const mode of INSPECT_MODES) {
      if (mode === INSPECT_MODE.block) continue;
      const model = buildViewMenuModel(mode, 40, 90, true);
      expect(model.blockLocked).toBe(false);
      expect(model.bar.gesture).toBe(buildViewMenuModel(mode, 40, 90).bar.gesture);
    }
  });
});

describe('viewAfterToolPicked', () => {
  it('prendere uno strumento chiude una vista che taglia', () => {
    // Con la citta' tagliata si piazzerebbe su un terreno che non si vede.
    expect(viewAfterToolPicked(INSPECT_MODE.slice)).toBe(INSPECT_MODE.off);
    expect(viewAfterToolPicked(INSPECT_MODE.section)).toBe(INSPECT_MODE.off);
  });

  it('le viste a velo sopravvivono allo strumento', () => {
    // Sotto il retino il suolo si legge ancora, e spegnerle toglierebbe proprio
    // il contesto che serviva a decidere dove costruire.
    expect(viewAfterToolPicked(INSPECT_MODE.xray)).toBe(INSPECT_MODE.xray);
    expect(viewAfterToolPicked(INSPECT_MODE.block)).toBe(INSPECT_MODE.block);
    expect(viewAfterToolPicked(INSPECT_MODE.off)).toBe(INSPECT_MODE.off);
  });
});
