import type { CueId } from './cues';
import type { SoundBoard } from './SoundBoard';

/**
 * Il punto unico da cui l'interfaccia chiede un suono.
 *
 * E' una variabile di modulo, ed e' una deroga consapevole alla regola per cui
 * la radice passa tutto per le mani: il click sta in `onActivate`, cioe' nel
 * mattone DOM che **ogni** bottone dell'HUD attraversa, e farci arrivare una
 * dipendenza dall'alto avrebbe voluto dire un parametro in piu' in ogni
 * costruttore di ogni pannello — un costo sparso su venti file per una cosa che
 * non ha stato di gioco.
 *
 * Le due proprieta' che rendono la deroga innocua:
 *
 * - **Prima dell'installazione e' un `no-op`.** I test in `node` importano l'HUD
 *   senza che nessuno abbia mai chiesto un `AudioContext`.
 * - **L'import e' di solo tipo.** `src/ui/` non trascina dentro il grafo audio:
 *   chi costruisce la board resta `src/main.ts`, come per tutto il resto.
 */

let installed: SoundBoard | null = null;

/** La radice installa la board una volta; `null` la disinstalla. */
export function installSoundBoard(board: SoundBoard | null): void {
  installed = board;
}

/** La board in vigore: serve a chi deve leggerne o cambiarne il muto. */
export function soundBoard(): SoundBoard | null {
  return installed;
}

/**
 * Suona un cue, se c'e' qualcosa che lo suoni.
 *
 * Non risponde niente di proposito: chi chiama sta gia' facendo altro — sta
 * dipingendo un bottone o applicando un'azione — e il suono non deve diventare
 * una condizione da controllare.
 */
export function playCue(id: CueId): void {
  installed?.play(id);
}
