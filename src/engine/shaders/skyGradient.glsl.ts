import { SKY_ELEVATION_GAIN } from '../atmosphere';

/**
 * Il gradiente del cielo, scritto **una volta** per i due programmi che lo usano.
 *
 * `SkyBackground` lo disegna sul quad di fondo e `scene.glsl` ci fa sciogliere la
 * distanza: si toccano esattamente all'orizzonte, dove il fondo e la geometria
 * lontana confinano, e finche' erano due copie i due file si limitavano ad
 * avvertirsi a vicenda per commento — «se ne tocchi una tocca anche l'altra».
 * `src/engine/AGENTS.md` lo mette fra le regole. Una copia sola e' la forma
 * forte della stessa promessa, ed e' la mossa di `cloudDeck.glsl.ts`, che una
 * nuvola sola la disegna gia' su due programmi.
 *
 * **`isOrthographic` non e' un interruttore di modo.** E' un uniform che Three
 * scrive da se' a ogni draw, e dice l'unica cosa che serve sapere: se i raggi di
 * vista convergono in un punto. Con i raggi paralleli il gradiente segue
 * l'altezza di schermo, e non e' una scorciatoia — tutti i raggi hanno la stessa
 * elevazione, quindi un cielo "fisico" darebbe una tinta piatta e nient'altro.
 * Quando convergono, l'elevazione torna a essere una quantita' per pixel, ed e'
 * li' che l'orizzonte esiste.
 */
export const skyGradientHelpers = /* glsl */ `
float skyGradientT(vec3 rayDir, float screenY) {
  float elevation = clamp(rayDir.z * ${SKY_ELEVATION_GAIN.toFixed(2)} * 0.5 + 0.5, 0.0, 1.0);
  return smoothstep(0.0, 1.0, isOrthographic ? clamp(screenY, 0.0, 1.0) : elevation);
}
`;
