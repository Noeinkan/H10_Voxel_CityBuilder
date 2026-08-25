import { floats, TRAFFIC } from './config';
import { poseAt } from './poses';
import type { TrafficRoute } from './routes';

/**
 * La schiuma che uno scafo lascia dietro di se', a un certo istante.
 *
 * **E' `plume.ts` girato in orizzontale.** Non c'e' nessun sistema di particelle
 * che nasce, si integra e muore: un segno di scia e' la **stessa posa letta nel
 * passato** — dov'era la nave `age` secondi fa, che `poseAt` sa gia' rispondere —
 * piu' un'apertura laterale lineare. Ne discende quello che discendeva dal fumo,
 * e gratis: in pausa la scia si ferma, a 4x si allunga con la nave, due partite
 * identiche lasciano gli stessi segni negli stessi punti, e un frame perso non
 * apre un buco nella traccia.
 *
 * **Perche' esiste.** Uno scafo che scivola su un mare intatto non e' *dentro*
 * l'acqua: e' una figurina appoggiata sopra, e nessun dettaglio di sagoma
 * corregge quella lettura. La fascia di galleggiamento da' il bordo inferiore,
 * la scia da' il fatto che l'acqua si accorga del passaggio.
 *
 * **Un segno e' un rettangolo lungo un intervallo**, non un punto: due pose
 * consecutive dicono da dove a dove la nave e' andata in quel tratto, quindi i
 * segni si toccano invece di lasciare una fila di macchie. E' anche il motivo per
 * cui la velocita' e' un dato e non una stima — la distanza fra le due pose la
 * contiene gia', ed e' cio' che spegne la scia di una barca all'ormeggio senza
 * un secondo meccanismo da tenere in vita.
 */

export interface WakeMark {
  /** Centro del segno, appena sopra il pelo dell'acqua. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Verso del segno nel mondo, in radianti: e' la prua di allora. */
  readonly heading: number;
  /** Mezza lunghezza lungo la rotta, in voxel: mezzo tratto percorso. */
  readonly half: number;
  /** Mezza larghezza trasversale, in voxel: la bava si allarga con l'eta'. */
  readonly halfWidth: number;
  /** Quanto e' ancora bianco, 0..1. Zero a fine vita e per chi sta fermo. */
  readonly foam: number;
}

const WAKE = TRAFFIC.wake;

/**
 * I segni vivi di tutte le rotte, dal piu' giovane al piu' vecchio.
 *
 * L'ordine e' quello delle rotte, come per pose e sbuffi, e per la stessa
 * ragione: chi disegna riempie un buffer solo, e due partite identiche devono
 * riempirlo uguale.
 */
export function wakeAt(
  routes: readonly TrafficRoute[],
  seconds: number,
): readonly WakeMark[] {
  const out: WakeMark[] = [];
  for (const route of routes) {
    if (floats(route.kind)) appendWake(out, route, seconds);
  }
  return out;
}

/**
 * I segni di uno scafo solo: la V di prua e la rimestata dell'elica.
 *
 * I tempi sono i multipli di `every` e non «l'ultimo piu' un delta», come per il
 * pennacchio: e' cio' che tiene la traccia ferma nel mondo mentre il tempo
 * scorre — un segno non scivola all'indietro di frame in frame, resta dove la
 * nave l'ha lasciato finche' non svanisce.
 *
 * Un segno copre il tratto **gia' percorso** fra due istanti di campionamento,
 * mai quello in corso: il piu' giovane chiude sull'ultimo multiplo di `every`
 * passato, cosi' la traccia non corre mai davanti alla prua. La posa di quel capo
 * e' quella che il giro precedente ha gia' calcolato — scendendo indietro nel
 * tempo si riusa, e il costo resta una `poseAt` per segno invece di due.
 */
function appendWake(out: WakeMark[], route: TrafficRoute, seconds: number): void {
  const every = Math.max(0.05, WAKE.every);
  const newest = Math.floor(seconds / every);
  const beam = TRAFFIC.hull[route.kind].width;

  let ahead = poseAt(route, newest * every);

  for (let i = 0; ; i++) {
    const born = (newest - i) * every;
    const age = seconds - born;
    if (age >= WAKE.life) return;

    const to = ahead;
    const from = poseAt(route, born - every);
    ahead = from;

    // Chi era fuori dal mondo non ha lasciato niente qui. Il resto della traccia
    // pero' resta: i segni aperti prima di sparire continuano ad allargarsi e a
    // sbiadire sul bordo, che e' esattamente cio' che lascia una nave partita.
    if (from === null || to === null) continue;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const run = Math.hypot(dx, dy);
    // Una nave all'ormeggio ripete la stessa posa: senza questa soglia i segni
    // si impilerebbero nello stesso punto e la barca ferma sarebbe la cosa piu'
    // bianca del porto. E' una rampa e non un interruttore, o la scia
    // comparirebbe di colpo al primo metro di manovra.
    const moving = Math.min(1, run / every / WAKE.minSpeed);
    if (moving <= 0) continue;

    const fade = age / WAKE.life;
    // Quadratica come la densita' di uno sbuffo, e per la stessa ragione: la
    // schiuma si spegne in fretta appena aperta e poi svanisce piano, mentre una
    // dissolvenza uniforme fa sparire l'ultimo segno ancora ben visibile.
    const foam = moving * (1 - fade) * (1 - fade);
    const heading = Math.atan2(dy, dx);
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const x = (from.x + to.x) / 2;
    const y = (from.y + to.y) / 2;
    const z = from.z + WAKE.lift;
    const half = run / 2;

    // La V si apre dal fianco: a eta' zero i due rami stanno sul bordo dello
    // scafo, non sull'asse. Partendo dall'asse la scia uscirebbe da **sotto** la
    // chiglia, che e' il posto da cui l'onda di prua non esce mai.
    const spread = beam / 2 + WAKE.spread * age;
    const halfWidth = (WAKE.width + WAKE.growth * age) / 2;
    for (const side of [1, -1]) {
      out.push({
        x: x - sin * side * spread,
        y: y + cos * side * spread,
        z,
        heading,
        half,
        halfWidth,
        foam: foam * WAKE.peak,
      });
    }

    // La rimestata dell'elica: sull'asse, piu' larga e piu' debole. Senza,
    // restano due righe parallele che leggono come un binario, e il mezzo pare
    // passare **fra** le due invece che lasciarle entrambe.
    out.push({
      x,
      y,
      z,
      heading,
      half,
      halfWidth: halfWidth * WAKE.washWidth,
      foam: foam * WAKE.washPeak,
    });
  }
}
