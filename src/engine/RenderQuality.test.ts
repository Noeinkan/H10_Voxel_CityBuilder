import { describe, expect, it } from 'vitest';
import type { FrameTimingSnapshot } from './FrameTiming';
import { parseQualityMode, RenderQualityController } from './RenderQuality';

const stable: FrameTimingSnapshot = {
  fps: 60,
  fpsLow: 60,
  p95Ms: 16.7,
  p99Ms: 16.7,
  jankRatio: 0,
  sampleCount: 600,
};
const slow: FrameTimingSnapshot = { ...stable, fps: 52, fpsLow: 48, jankRatio: 0.08 };

describe('RenderQualityController', () => {
  it('risolve i preset e limita il DPR del dispositivo', () => {
    expect(parseQualityMode('high')).toBe('high');
    expect(parseQualityMode('sconosciuto')).toBe('auto');
    expect(new RenderQualityController('high', 3).pixelRatio).toBe(2);
    expect(new RenderQualityController('balanced', 2).pixelRatio).toBe(1.5);
    expect(new RenderQualityController('performance', 2).pixelRatio).toBe(1);
  });

  it('scende solo dopo due finestre lente e rispetta il minimo', () => {
    const quality = new RenderQualityController('auto', 2);
    expect(quality.observe(slow, 2_000).changed).toBe(false);
    expect(quality.observe(slow, 4_000)).toMatchObject({ changed: true, pixelRatio: 1.25 });
    quality.observe(slow, 10_000);
    quality.observe(slow, 12_000);
    expect(quality.pixelRatio).toBe(1);
    quality.observe(slow, 18_000);
    quality.observe(slow, 20_000);
    expect(quality.pixelRatio).toBe(1);
  });

  it('risale soltanto dopo dieci secondi stabili', () => {
    const quality = new RenderQualityController('auto', 2);
    quality.observe(slow, 2_000);
    quality.observe(slow, 4_000);
    quality.observe(stable, 10_000);
    expect(quality.observe(stable, 18_000).changed).toBe(false);
    expect(quality.observe(stable, 20_000)).toMatchObject({ changed: true, pixelRatio: 1.5 });
  });

  it('i modi fissi hanno un profilo di effetti fisso', () => {
    expect(new RenderQualityController('high', 2).profile).toMatchObject({
      shadowSize: 2048,
      bloom: true,
      tilt: true,
      grade: true,
      godRays: true,
      outline: true,
    });
    expect(new RenderQualityController('balanced', 2).profile).toMatchObject({
      shadowSize: 1024,
      shadowSoftness: 1,
      bloom: true,
      grade: true,
    });
    // `performance` e' l'unico che spegne del tutto le pass aggiuntive.
    expect(new RenderQualityController('performance', 2).profile).toMatchObject({
      shadowSize: 0,
      bloom: false,
      tilt: false,
      grade: false,
      godRays: false,
      outline: false,
    });
  });

  it('in auto gli effetti scendono insieme al pixel ratio', () => {
    const quality = new RenderQualityController('auto', 2);
    // Su uno schermo 2x 'auto' parte comunque a 1.5, ed e' una scelta, non un
    // degrado: deve nascere con tutti gli effetti accesi.
    expect(quality.pixelRatio).toBe(1.5);
    expect(quality.profile).toMatchObject({ shadowSize: 2048, bloom: true, tilt: true });

    quality.observe(slow, 2_000);
    quality.observe(slow, 4_000);
    expect(quality.pixelRatio).toBe(1.25);
    // Meta' mappa, ma il filtro resta: scendere di un gradino non deve far
    // ricomparire la scaletta sul bordo delle ombre.
    expect(quality.profile).toMatchObject({ shadowSize: 1024, shadowSoftness: 1 });

    quality.observe(slow, 10_000);
    quality.observe(slow, 12_000);
    expect(quality.pixelRatio).toBe(1);
    expect(quality.profile).toMatchObject({ shadowSize: 0, bloom: false, tilt: false });

    // E risalendo tornano: il profilo si deriva dallo stato, non e' un
    // interruttore che una volta spento resta spento.
    quality.observe(stable, 18_000);
    quality.observe(stable, 30_000);
    quality.observe(stable, 42_000);
    expect(quality.pixelRatio).toBe(1.5);
    expect(quality.profile.shadowSize).toBe(2048);
  });

  it('la vista ferma sale sopra la densita’ dello schermo, cioe’ supersampling', () => {
    // A DPR 1 il tetto normale e' 1: senza il boost non ci sarebbe **nessun**
    // margine da giocare proprio sulla macchina che ne ha piu' bisogno.
    const quality = new RenderQualityController('auto', 1);
    expect(quality.pixelRatio).toBe(1);

    const boosted = quality.enterBoost(0);
    expect(boosted).toMatchObject({ changed: true, reason: 'boost', pixelRatio: 2 });
    expect(quality.boosted).toBe(true);
    // Con il pixel ratio sopra la linea di partenza il profilo torna al gradino
    // pieno da solo: si deriva dallo stato, non e' un secondo interruttore.
    expect(boosted.profile).toMatchObject({ shadowSize: 2048, bloom: true, bloomScale: 1 });
  });

  it('all’uscita rimette il livello che la misura aveva raggiunto, non il default', () => {
    // Quel livello era una misura e non un default: ricavarlo di nuovo vorrebbe
    // dire far ricominciare dieci secondi di isteresi a chi e' appena risalito.
    const quality = new RenderQualityController('auto', 2);
    quality.observe(slow, 2_000);
    quality.observe(slow, 4_000);
    expect(quality.pixelRatio).toBe(1.25);
    const degraded = quality.profile;

    quality.enterBoost(10_000);
    expect(quality.pixelRatio).toBe(2);

    expect(quality.exitBoost(20_000)).toMatchObject({ changed: true, pixelRatio: 1.25 });
    expect(quality.boosted).toBe(false);
    expect(quality.profile).toEqual(degraded);
  });

  it('il boost sposta il punto di partenza dell’isteresi, non la scavalca', () => {
    // E' il contratto del file: la qualita' si deriva dalla misura, e non da chi
    // sta guardando. Se il frame non tiene, da terra si scende come altrove.
    const quality = new RenderQualityController('auto', 2);
    quality.enterBoost(0);
    expect(quality.pixelRatio).toBe(2);

    // Il cooldown appena riavviato protegge la prima finestra, poi si scende.
    quality.observe(slow, 4_000);
    quality.observe(slow, 8_000);
    quality.observe(slow, 10_000);
    expect(quality.pixelRatio).toBeLessThan(2);
  });

  it('un modo fisso alza la risoluzione ma non disfa la scelta del giocatore', () => {
    // `?quality=performance` e' una scelta esplicita: un modo di vista non e' un
    // buon motivo per riaccendere pass che qualcuno ha chiesto di spegnere.
    const quality = new RenderQualityController('performance', 1);
    const boosted = quality.enterBoost(0);
    expect(boosted.pixelRatio).toBe(2);
    expect(boosted.profile).toMatchObject({ shadowSize: 0, bloom: false, godRays: false });
  });

  it('un secondo ingresso non si sovrascrive lo stato da restituire', () => {
    const quality = new RenderQualityController('auto', 2);
    quality.observe(slow, 2_000);
    quality.observe(slow, 4_000);
    quality.enterBoost(10_000);
    quality.enterBoost(11_000);
    expect(quality.exitBoost(20_000).pixelRatio).toBe(1.25);
  });

  it('uscire senza essere entrati non cambia niente', () => {
    const quality = new RenderQualityController('auto', 2);
    expect(quality.exitBoost(0)).toMatchObject({ changed: false });
    expect(quality.pixelRatio).toBe(1.5);
  });

  it('ogni decisione porta con se’ il profilo corrente', () => {
    const quality = new RenderQualityController('auto', 2);
    for (const decision of [quality.initial(), quality.observe(stable, 100)]) {
      expect(decision.profile).toBe(quality.profile);
    }
  });

  it('su un display a densita 1 degrada gli effetti invece del pixel ratio', () => {
    // A DPR 1 il pixel ratio e' gia' al minimo: il gating non deve restare
    // inerte con tutti gli effetti accesi, come succedeva.
    const quality = new RenderQualityController('auto', 1);
    expect(quality.pixelRatio).toBe(1);
    expect(quality.profile).toMatchObject({ shadowSize: 2048, bloom: true });

    quality.observe(slow, 2_000);
    quality.observe(slow, 4_000);
    expect(quality.pixelRatio).toBe(1);
    // Primo gradino: meta' shadow map, effetti di luce ancora accesi.
    expect(quality.profile).toMatchObject({ shadowSize: 1024, shadowSoftness: 1, bloom: true });

    quality.observe(slow, 10_000);
    quality.observe(slow, 12_000);
    expect(quality.profile).toMatchObject({ shadowSize: 0, bloom: false, godRays: false });

    // Al fondo della scala non scende oltre.
    quality.observe(slow, 18_000);
    expect(quality.observe(slow, 20_000)).toMatchObject({ changed: false });
    expect(quality.profile.shadowSize).toBe(0);
  });

  it('su DPR 1 risale per gradi quando il frame torna stabile', () => {
    const quality = new RenderQualityController('auto', 1);
    quality.observe(slow, 2_000);
    quality.observe(slow, 4_000);
    quality.observe(slow, 10_000);
    quality.observe(slow, 12_000);
    expect(quality.profile.shadowSize).toBe(0);

    quality.observe(stable, 18_000);
    expect(quality.observe(stable, 30_000)).toMatchObject({ changed: true });
    expect(quality.profile).toMatchObject({ shadowSize: 1024 });
    expect(quality.observe(stable, 42_000)).toMatchObject({ changed: true });
    expect(quality.profile.shadowSize).toBe(2048);
  });

  it('su display densi il pixel ratio copre la scala e gli effetti restano fermi', () => {
    const quality = new RenderQualityController('auto', 2);
    quality.observe(slow, 2_000);
    quality.observe(slow, 4_000);
    quality.observe(slow, 10_000);
    quality.observe(slow, 12_000);
    expect(quality.pixelRatio).toBe(1);

    // A pixel ratio gia' esaurito la manopola effetti non si muove: la scala
    // e' gia' al fondo, e un gradino fantasma avvelenerebbe la risalita.
    quality.observe(slow, 18_000);
    expect(quality.observe(slow, 20_000)).toMatchObject({ changed: false, effectsLevel: 0 });
    expect(quality.profile.shadowSize).toBe(0);
  });
});
