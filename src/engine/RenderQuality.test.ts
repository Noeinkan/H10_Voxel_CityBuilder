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
    });
    expect(new RenderQualityController('balanced', 2).profile).toMatchObject({
      shadowSize: 1024,
      shadowSoftness: 0,
      bloom: true,
    });
    // `performance` e' l'unico che spegne del tutto le pass aggiuntive.
    expect(new RenderQualityController('performance', 2).profile).toMatchObject({
      shadowSize: 0,
      bloom: false,
      tilt: false,
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
    expect(quality.profile).toMatchObject({ shadowSize: 1024, shadowSoftness: 0 });

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

  it('ogni decisione porta con se’ il profilo corrente', () => {
    const quality = new RenderQualityController('auto', 2);
    for (const decision of [quality.initial(), quality.observe(stable, 100)]) {
      expect(decision.profile).toBe(quality.profile);
    }
  });
});
