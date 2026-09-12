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
 * Fasce che il coronamento piu' articolato aggiunge sopra il corpo.
 *
 * Tre, ed e' la falda: `gable` rientra tre volte di fila sullo stesso asse. Sta
 * dichiarato qui — accanto alle cime, non presso chi le conta — perche' chi
 * misura uno stamp dall'esterno non ha modo di sapere dove finisce il corpo, e
 * finora quel confine era il numero **2** scritto a mano in due test: uno solo
 * per il coronamento piu' uno per il pennone. Reggeva finche' ogni tipologia
 * aveva una cima sola e quasi tutte l'avevano a una fascia; con il repertorio
 * (`CROWN_SET`) e' diventato falso in silenzio.
 */
export const MAX_CROWN_BANDS = 3;

/**
 * Lato sotto cui un gradone di coronamento non e' piu' un gradone.
 *
 * Un passo intero: sul modulo di partenza e' un voxel di edificio, cioe' meta'
 * cubo di terreno, e a distanza isometrica legge come un'antenna e non come un
 * piano. Non e' il `minBandSide` del corpo — la cima puo' e deve assottigliarsi
 * oltre quello, e' il suo mestiere — ma il pavimento sotto cui *un gradino* ha
 * smesso di essere una superficie.
 */
const MIN_CROWN_SIDE = 2 * STEP;

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
 * repertorio del corpo — non si puo' pescare `lantern` a meta' di una torre.
 */

/**
 * Quale cima, fra quelle che la tipologia ammette.
 *
 * **Il tiro si consuma sempre, anche su un repertorio di una voce sola.** E' la
 * stessa disciplina delle candidate scartate in `nextRect`, e serve alla stessa
 * cosa: la sequenza del PRNG non deve dipendere da quante cime una riga di
 * catalogo elenca, o pinzare il coronamento di una tipologia cambierebbe anche
 * la posizione del pennone e l'altezza del prisma — cioe' cose che non hanno
 * niente a che vedere con la scelta della cima.
 *
 * Un repertorio vuoto non e' un caso da gestire ma un errore di catalogo: qui
 * ripiega su `taper`, che e' la cima che un edificio prende quando nessuno ha
 * detto niente di piu' preciso.
 */
export function pickCrownKind(kinds: readonly CrownKind[], random: () => number): CrownKind {
  // `random()` diretto e non `pickInt`: quello torna il minimo **senza pescare**
  // quando l'intervallo e' vuoto, che e' proprio il caso del repertorio a una
  // voce sola — cioe' quello in cui il tiro deve consumarsi comunque.
  const roll = random();
  if (kinds.length === 0) return CROWN_KIND.taper;
  return kinds[Math.min(kinds.length - 1, Math.floor(roll * kinds.length))];
}

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
    case CROWN_KIND.stepped: {
      // Due gradini, il secondo piu' basso: la cima si legge come una scala e
      // non come una punta, ed e' la sola forma che continua verso l'alto il
      // racconto degli arretramenti sotto.
      //
      // **Il secondo gradino si prende solo se ci sta, e non e' prudenza.** Su
      // un corpo largo quanto il minimo di fascia — cioe' la stragrande
      // maggioranza delle case, dove impronta e `minBandSide` coincidono a
      // quattro — `shrink` due volte lascia un lato di un voxel: una punta, che
      // e' esattamente cio' che questa cima esiste per non essere. Finche' la
      // riga stava su poche tipologie a impronta larga il caso non si vedeva;
      // da quando `CROWN_SET.taper` la mette in mano al tessuto ordinario e'
      // diventato il caso comune. Quando non ci sta, i due gradini diventano un
      // gradino solo piu' alto: una scala corta resta una scala.
      const first = shrink(top, STEP);
      const second = shrink(first, STEP);
      if (second.w < MIN_CROWN_SIDE || second.h < MIN_CROWN_SIDE) {
        // I gradini restano due: si sposta in **basso** il punto di partenza,
        // invece di togliere quello in cima. Il primo prende il filo del corpo —
        // e' il cornicione — e il secondo il cappello rientrato. Collassare
        // invece a una fascia sola darebbe la stessa sagoma di `taper`, cioe'
        // due cime di catalogo indistinguibili a schermo.
        return {
          bands: [
            { rect: top, height: GRAMMAR.flatCrownHeight },
            { rect: first, height: GRAMMAR.flatCrownHeight + bonus },
          ],
          roofProp: false,
        };
      }
      return {
        bands: [
          { rect: first, height: GRAMMAR.flatCrownHeight },
          { rect: second, height: GRAMMAR.flatCrownHeight + bonus },
        ],
        roofProp: false,
      };
    }
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
