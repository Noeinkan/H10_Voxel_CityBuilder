import { CROWN_KIND, GRAMMAR, type CrownKind } from './config';
import { shrink, shrinkAxis, type BandRect } from './bandRect';
import { bandStepOf } from '../scale';

/**
 * Il passo delle rientranze del coronamento.
 *
 * Le rientranze `shrink`/`shrinkAxis` qui sotto seguono lo stesso passo degli
 * scarti di fascia (`bandStepOf`): un coronamento sul modulo raddoppiato rientra
 * il doppio, cosi' la cima resta leggibile come cima invece di diventare un
 * puntino in mezzo a una facciata larga il doppio.
 */
const STEP = bandStepOf();

/**
 * Come si chiude la silhouette.
 *
 * **La cima e' una riga di catalogo, non un ramo.** Il coronamento era un
 * booleano — piatto o no — e produceva due sole cime per tutta la citta'. Qui
 * ogni voce di `CROWN_KIND` e' una geometria diversa applicata all'ultima fascia
 * del corpo, e chi sceglie e' il catalogo delle tipologie: i ripieghi per uso ne
 * portano una ciascuno, e le righe con `minLevel` la distinguono per livello.
 *
 * Vive fuori da `bandOps.ts` perche' risponde a un'altra domanda. Quello dice
 * come sale un corpo; questo come finisce, e le sue trasformazioni non sono nel
 * repertorio di nessuno — non si puo' pescare `lantern` a meta' di una torre.
 */

/**
 * Fasce del coronamento e presenza del dettaglio verticale.
 *
 * Il tiro dell'altezza arriva gia' fatto da fuori, cosi' resta consumato anche
 * dalle voci che non lo usano: e' la stessa disciplina delle candidate scartate
 * in `nextRect`, e serve alla stessa cosa — due tipologie sullo stesso seme
 * restano confrontabili, perche' la cima sceglie la forma e non la sequenza.
 *
 * `bonus` e' il premio delle soglie visuali (torre e skyline): si somma alla
 * fascia piu' alta di ogni cima, cosi' **ogni** coronamento cresce con il
 * livello e non solo quelli che pescano il tiro. Vive fuori dal tiro apposta —
 * e' una quota dichiarata dal livello, non una moneta del canale del tetto.
 */
export function crownBands(
  kind: CrownKind,
  top: BandRect,
  height: number,
  bonus = 0,
): { bands: readonly { rect: BandRect; height: number }[]; roofProp: boolean } {
  switch (kind) {
    case CROWN_KIND.flat:
      // Non rientra affatto: su un'impronta stretta `shrink` lascerebbe un
      // cappello minuscolo, cioe' proprio la guglia che una tipologia a tetto
      // piano non deve avere. Un capannone finisce largo quanto lui.
      return { bands: [{ rect: top, height: GRAMMAR.flatCrownHeight + bonus }], roofProp: false };
    case CROWN_KIND.stepped:
      // Due gradini, il secondo piu' basso: la cima si legge come una scala e
      // non come una punta, ed e' la sola forma che continua verso l'alto il
      // racconto degli arretramenti sotto.
      return {
        bands: [
          { rect: shrink(top, STEP), height: GRAMMAR.flatCrownHeight },
          { rect: shrink(shrink(top, STEP), STEP), height: GRAMMAR.flatCrownHeight + bonus },
        ],
        roofProp: false,
      };
    case CROWN_KIND.ridge:
      // Rientra su un asse solo, e sul lato lungo resta larga quanto il corpo:
      // e' la copertura di un mercato o di un deposito vista di fianco.
      return {
        bands: [{ rect: shrinkAxis(top, STEP), height: GRAMMAR.flatCrownHeight + bonus }],
        roofProp: false,
      };
    case CROWN_KIND.gable: {
      // Tre rientranze di fila sullo stesso asse: `shrinkAxis` sceglie sempre il
      // lato corto, quindi la falda sale sempre verso il colmo lungo — anche
      // sulle impronte non quadrate, e senza che questa funzione sappia quale
      // asse sia. Su un'impronta stretta l'ultimo gradone degenera in una linea,
      // ed e' la cosa giusta: quello *e'* il colmo.
      const first = shrinkAxis(top, STEP);
      const second = shrinkAxis(first, STEP);
      return {
        bands: [
          { rect: first, height: GRAMMAR.flatCrownHeight },
          { rect: second, height: GRAMMAR.flatCrownHeight },
          { rect: shrinkAxis(second, STEP), height: GRAMMAR.flatCrownHeight + bonus },
        ],
        roofProp: false,
      };
    }
    case CROWN_KIND.lantern:
      // L'unica cima che sale invece di chiudere. Rientra di due passi per lato e
      // si porta dietro il supplemento: senza, resterebbe un cappello basso e
      // stretto, cioe' il contrario di una torretta.
      return {
        bands: [{ rect: shrink(shrink(top, STEP), STEP), height: height + GRAMMAR.lanternRise + bonus }],
        roofProp: true,
      };
    default:
      return { bands: [{ rect: shrink(top, STEP), height: height + bonus }], roofProp: true };
  }
}
