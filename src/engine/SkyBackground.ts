import { Color, DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace } from 'three';
import type { Atmosphere } from './themes';

const SKY_WIDTH = 2;
const SKY_HEIGHT = 96;

export interface SkyBackgroundHandle {
  readonly texture: DataTexture;
  setAtmosphere(atmosphere: Atmosphere): void;
  dispose(): void;
}

/** Piccola texture verticale: il renderer la disegna come un solo fondo globale. */
export function createSkyBackground(atmosphere: Atmosphere): SkyBackgroundHandle {
  const data = new Uint8Array(SKY_WIDTH * SKY_HEIGHT * 4);
  const texture = new DataTexture(data, SKY_WIDTH, SKY_HEIGHT, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;

  const horizon = new Color();
  const top = new Color();
  const sample = new Color();
  const encoded = new Color();

  const setAtmosphere = (next: Atmosphere): void => {
    horizon.setStyle(next.skyHorizon ?? next.background, SRGBColorSpace);
    top.setStyle(next.skyTop ?? next.background, SRGBColorSpace);

    for (let y = 0; y < SKY_HEIGHT; y++) {
      const t = y / (SKY_HEIGHT - 1);
      sample.copy(horizon).lerp(top, t);
      encoded.copy(sample).convertLinearToSRGB();
      const r = Math.round(encoded.r * 255);
      const g = Math.round(encoded.g * 255);
      const b = Math.round(encoded.b * 255);
      for (let x = 0; x < SKY_WIDTH; x++) {
        const i = (x + y * SKY_WIDTH) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    texture.needsUpdate = true;
  };

  setAtmosphere(atmosphere);
  return {
    texture,
    setAtmosphere,
    dispose(): void {
      texture.dispose();
    },
  };
}
