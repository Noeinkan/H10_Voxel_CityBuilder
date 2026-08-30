/**
 * Il segnale che dice «il mondo c'e'», fra chi lo carica e chi lo aspetta.
 *
 * `boot.ts` tiene la schermata del titolo davanti finche' l'isola non e' nata:
 * senza un segnale toglierebbe il velo sul primo frame, cioe' su un mare vuoto
 * con i chunk ancora in coda. Passa per un evento sulla finestra e non per una
 * funzione esportata perche' `main.ts` e' un modulo con effetti, caricato a
 * import dinamico: chi lo importa riceve il suo `Promise`, non i suoi handle.
 *
 * **L'attesa ha sempre un tetto.** Un segnale che non arriva — un errore nel
 * ciclo di frame, un worker che non risponde — non deve lasciare il giocatore
 * davanti a una pagina ferma per sempre: scaduto il tempo si entra comunque, e
 * l'isola finisce di comparire sotto i suoi occhi.
 */

export const WORLD_READY_EVENT = 'h10:world-ready';

/** Lo chiama la radice quando la prima scena e' completa. */
export function signalWorldReady(): void {
  window.dispatchEvent(new Event(WORLD_READY_EVENT));
}

export function whenWorldReady(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener(WORLD_READY_EVENT, finish);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    window.addEventListener(WORLD_READY_EVENT, finish);
  });
}
