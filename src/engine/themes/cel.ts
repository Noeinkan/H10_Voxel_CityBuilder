import { natural } from './natural';
import type { Theme } from './theme';

/** Variante illustrata del tema naturale, con masse leggibili e bordi decisi. */
export const cel: Theme = {
  id: 'cel',
  name: 'Cel Shaded',
  colors: natural.colors,
  atmosphere: {
    ...natural.atmosphere,
    background: '#c8e4ee',
    sun: { ...natural.atmosphere.sun, wrap: 0.22 },
    colorJitter: 0.14,
    shadow: { strength: 0.95, softness: 0.75 },
    tilt: { strength: 0.12, focus: 0.5, width: 0.5 },
    outline: { strength: 0.82 },
    rim: { strength: 0.22, power: 3.5, color: '#fff1d6' },
    cel: { strength: 0.8 },
  },
};
