import { Color, SRGBColorSpace } from 'three';
import paletteJson from './palette.json';
import { PALETTE_SIZE } from './paletteSlots';

/**
 * Palette dei colori, unica fonte di colore del renderer.
 *
 * I colori vivono solo in un uniform: gli attributi di vertice portano l'indice.
 * Cambiare `palette.json` e ricaricare aggiorna la scena senza rigenerare le mesh.
 */

export { PALETTE_SIZE, PALETTE_SLOTS } from './paletteSlots';

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Converte i colori esadecimali in un `Float32Array(96)` pronto per l'uniform
 * `vec3[32]`. I valori escono in spazio lineare, coerenti con
 * `renderer.outputColorSpace = SRGBColorSpace`.
 */
export function toPaletteArray(hexColors: readonly string[]): Float32Array {
  if (hexColors.length !== PALETTE_SIZE) {
    throw new Error(
      `palette.json deve contenere esattamente ${PALETTE_SIZE} colori, trovati ${hexColors.length}`,
    );
  }

  const out = new Float32Array(PALETTE_SIZE * 3);
  const color = new Color();
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const hex = hexColors[i];
    if (!HEX.test(hex)) {
      throw new Error(`palette.json: colore non valido all'indice ${i}: ${JSON.stringify(hex)}`);
    }
    color.setStyle(hex, SRGBColorSpace);
    out[i * 3] = color.r;
    out[i * 3 + 1] = color.g;
    out[i * 3 + 2] = color.b;
  }
  return out;
}

/** I colori grezzi come stanno nel file, per validazione e per la UI di debug. */
export const paletteHex: readonly string[] = paletteJson;

/** true se la stringa e' un colore esadecimale nella forma attesa dal loader. */
export function isValidHexColor(value: string): boolean {
  return HEX.test(value);
}

type PaletteListener = (hexColors: readonly string[]) => void;
const listeners = new Set<PaletteListener>();

/**
 * Notifica i cambi di palette a caldo. Restituisce la funzione per disiscriversi.
 *
 * Serve solo alla comodita' dello sviluppo: anche senza HMR un semplice reload
 * aggiorna i colori, perche' le geometrie contengono indici e non colori.
 */
export function onPaletteChanged(listener: PaletteListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (import.meta.hot) {
  // Questo modulo importa palette.json direttamente, quindi puo' accettarne
  // l'aggiornamento e riscrivere l'uniform senza rigenerare una sola mesh.
  import.meta.hot.accept('./palette.json', (updated) => {
    const next: unknown = updated?.default;
    if (!Array.isArray(next)) return;
    const hexColors = next as string[];
    for (const listener of listeners) listener(hexColors);
  });
}
