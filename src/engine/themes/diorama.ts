import type { Theme } from './theme';

/**
 * Look principale: un modellino urbano caldo, leggibile e con ombre fredde.
 * Tutti gli effetti restano nel materiale condiviso e non cambiano le mesh.
 */
export const diorama: Theme = {
  id: 'diorama',
  name: 'Diorama caldo',
  colors: [
    '#000000',
    '#59626a', '#68727a', '#424a50',
    '#b59f85', '#d0bba0', '#ead7ba', '#fff1d5',
    '#d1b67f', '#b9945c', '#806a4b', '#564638',
    '#6bb7c7', '#347e93', '#b8e2e7', '#24566c',
    '#d7684a', '#a94435', '#ef9470',
    '#79543b',
    '#73a85b', '#4f7e45', '#95c979', '#c6dfa2',
    '#48a9c2', '#266d91',
    '#e5b857', '#f4d68a', '#c27645', '#624f43',
    '#e8dfce', '#fff9e9',
  ],
  atmosphere: {
    background: '#b9dced',
    skyTop: '#78b7dd',
    skyHorizon: '#f4dec1',
    fogColor: '#eadcc7',
    fogDensity: 0.00016,
    faceLight: [0.98, 0.64, 0.82, 0.55, 1.0, 0.42],
    aoStrength: 0.6,
    lightTint: '#ffe2b0',
    shadowTint: '#a8c8dc',
    heightTint: '#fff1d6',
    heightStart: 8,
    heightEnd: 48,
    heightStrength: 0.12,
    glassTint: '#bdeaf2',
    glassLift: 0.18,
    waterHighlight: '#c7f3ea',
    waterStrength: 0.18,
    waterScale: 0.12,
    waterSpeed: 0.55,
    toneMapping: 'aces',
    exposure: 1,
  },
};
