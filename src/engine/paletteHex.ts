import paletteJson from './palette.json';

/**
 * I colori grezzi della palette, senza niente attorno.
 *
 * Stanno **fuori da `palette.ts`** per la stessa ragione per cui ci stanno gia'
 * i nomi degli slot: quel modulo importa Three per convertire gli esadecimali in
 * spazio lineare, e chi vuole solo leggere un colore non deve tirarsi dietro il
 * renderer. Da quando i temi passano di qui, `THEMES` e' importabile anche dalla
 * schermata del titolo — che vive prima del mondo e deve restare leggera.
 *
 * `palette.ts` li riespone: per chi carica la scena non e' cambiato niente.
 */
export const paletteHex: readonly string[] = paletteJson;
