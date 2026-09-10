import { Group, type Mesh } from 'three';
import { DOOMED_COLOR, PROTECTED_COLOR } from './DemolitionOverlay';
import { carpetLayer, writeCarpet, type CarpetBox } from './roofCarpet';

/**
 * I riquadri gia' presi, mentre un monumento e' in mano.
 *
 * **Il rifiuto c'era, e non si vedeva.** Un monumento non ne sostituisce un
 * altro: il cursore lo diceva da sempre in una riga di scheda — «A landmark
 * already stands here» — e in mezzo a una citta' matura quella riga non dice
 * *quale*, ne' dove sia il prossimo posto libero. Si finiva a spazzolare
 * l'isola col puntatore finche' il rosso non diventava verde.
 *
 * **Tre strati, due colori, un'unica domanda.** I colori sono quelli della
 * gomma, che pone la stessa domanda dal lato opposto — rosso cio' che si
 * potrebbe togliere solo demolendo, ambra cio' che non si toglie affatto — e
 * l'opacita' separa il fioco dal pieno: fioco su ogni monumento gia' in piedi,
 * per vedere le caselle occupate senza doverle cercare col cursore; pieno su
 * quello che il riquadro sotto il puntatore sta davvero toccando.
 *
 * Come l'anteprima della gomma non tocca nessuna mesh voxel: sono pavimenti in
 * aria sopra la scena, e spariscono quando lo strumento si molla.
 */
export class OccupancyOverlay {
  readonly group = new Group();

  /** Ogni monumento gia' fondato a terra: il rosso fioco delle caselle prese. */
  private readonly taken: Mesh = carpetLayer(DOOMED_COLOR, 0.24, 24);
  /**
   * Chi ferma il riquadro sotto il puntatore.
   *
   * Sopra il fioco di proposito: sono complanari, e con la profondita' spenta a
   * decidere e' l'ordine di disegno. Chi disegna gli strati toglie comunque dal
   * fioco cio' che sta qui, cosi' il pieno non e' la somma di due velature ma
   * il colore che dichiara.
   */
  private readonly blocking: Mesh = carpetLayer(DOOMED_COLOR, 0.6, 26);
  /** Cio' che nessun piazzamento toglie: arcologie e citta' in quota. */
  private readonly immovable: Mesh = carpetLayer(PROTECTED_COLOR, 0.5, 26);

  constructor() {
    this.group.add(this.taken, this.blocking, this.immovable);
    this.group.visible = false;
  }

  show(
    taken: readonly CarpetBox[],
    blocking: readonly CarpetBox[],
    immovable: readonly CarpetBox[],
  ): void {
    writeCarpet(this.taken, taken);
    writeCarpet(this.blocking, blocking);
    writeCarpet(this.immovable, immovable);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }
}
