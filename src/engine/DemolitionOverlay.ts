import { Group, type Mesh } from 'three';
import { carpetLayer, writeCarpet, type CarpetBox } from './roofCarpet';

/**
 * Rosso e ambra: chi cade e chi resta.
 *
 * Il rosso e' il segnale della rimozione; l'ambra dice «questa sta in mezzo» —
 * la rete in quota, un'arcologia, chi la porta — e non e' un rifiuto generico,
 * e' l'unica cosa che la gomma non puo' toccare. Sono gli stessi due colori che
 * il cursore del monumento riusa in [OccupancyOverlay]: due strumenti diversi,
 * ma la domanda del giocatore e' la stessa — «cosa di questo posso togliere?».
 */
export const DOOMED_COLOR = 0xff5a4a;
export const PROTECTED_COLOR = 0xffb23a;

/**
 * L'anteprima della gomma: un tappeto colorato sul tetto di ogni edificio che
 * sta per cadere, e uno ambra su cio' che la ferma.
 *
 * Nessuna mesh voxel viene toccata: e' un overlay come il contorno di selezione,
 * e sparisce appena il gesto si chiude. Il disegno del singolo tappeto sta in
 * [roofCarpet], che non e' piu' roba della gomma da quando il piazzamento di un
 * monumento accende gli stessi pavimenti in aria.
 */
export class DemolitionOverlay {
  readonly group = new Group();

  private readonly doomed: Mesh = carpetLayer(DOOMED_COLOR, 0.52, 25);
  private readonly protectedBoxes: Mesh = carpetLayer(PROTECTED_COLOR, 0.4, 25);

  constructor() {
    this.group.add(this.doomed, this.protectedBoxes);
    this.group.visible = false;
  }

  show(doomed: readonly CarpetBox[], protectedBoxes: readonly CarpetBox[]): void {
    writeCarpet(this.doomed, doomed);
    writeCarpet(this.protectedBoxes, protectedBoxes);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }
}
