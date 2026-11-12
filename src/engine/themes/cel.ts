import { natural } from './natural';
import type { Theme } from './theme';

/** Paesaggio vivido e torri dipinte con intonaco caldo e vetro salvia. */
export const cel: Theme = {
  id: 'cel',
  name: 'Cel Shaded',
  colors: [
    '#000000',
    '#566c78', '#6d8490', '#3c5563',
    '#688495', '#8ea5b0', '#ddd9c9', '#f6eedb',
    '#e4d6aa', '#c9bd8c', '#8a805d', '#52606a',
    '#9bb9b6', '#a9bcb0', '#d5e3d8', '#536f76',
    '#bd795b', '#8d5d4e', '#d89d79',
    '#9a7655',
    '#56b520', '#2b6936', '#78cb30', '#afe05b',
    '#2a9d9a', '#206d85',
    '#f0cc55', '#ead78a', '#b16c4d', '#52606a',
    '#dfd6bf', '#f5eddb',
  ],
  atmosphere: {
    ...natural.atmosphere,
    background: '#8bcfe1',
    sun: { ...natural.atmosphere.sun, color: '#fff2c9', intensity: 0.94, wrap: 0.14 },
    skyLight: { color: '#b1def0', intensity: 0.44 },
    bounceLight: { color: '#88a663', intensity: 0.22 },
    colorJitter: 0.12,
    fog: {
      ...natural.atmosphere.fog,
      color: '#abd8dc',
      density: 0.0001,
      skyBlend: 0.5,
    },
    sky: {
      ...natural.atmosphere.sky,
      top: '#299bd4',
      horizon: '#a8dfdf',
      cloudTint: '#f3f6e9',
    },
    water: {
      ...natural.atmosphere.water!,
      highlight: '#83c7c3',
      shallowTint: '#d8dfab',
    },
    glassTint: '#e8ddc5',
    glassLift: 0.12,
    grade: { saturation: 1.32, contrast: 0.12, vignette: 0.08 },
    shadow: { strength: 0.95, softness: 0.75 },
    tilt: { strength: 0.12, focus: 0.5, width: 0.5 },
    outline: { strength: 0.95, ink: true, threshold: 0.006, width: 1.5 },
    rim: { strength: 0.12, power: 3.5, color: '#fff1d6' },
    cel: { strength: 1 },
    exposure: 0.94,
  },
};
