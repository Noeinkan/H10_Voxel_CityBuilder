import { funnelOf, TRAFFIC, type VehicleFunnel } from './config';
import { poseAt } from './poses';
import type { TrafficRoute } from './routes';

/**
 * Il fumo che esce da una ciminiera, a un certo istante.
 *
 * **Uno sbuffo non e' una particella.** Non c'e' nessun sistema che nasce, si
 * integra e muore: uno sbuffo e' la **stessa posa letta nel passato** — dov'era
 * il traghetto `age` secondi fa, che `poseAt` sa gia' rispondere — piu' una
 * salita e una deriva lineari. Ne discende cio' che discendeva dalle pose, e
 * gratis: in pausa il fumo si ferma, a 4x accelera, due partite identiche fanno
 * lo stesso fumo negli stessi punti, e un frame perso non lascia un buco nella
 * scia.
 *
 * E' anche la ragione per cui la scia e' *giusta* invece che verosimile: uno
 * sbuffo resta dove la nave l'ha lasciato perche' li' la nave c'era davvero, non
 * perche' qualcuno ha ricordato di scriverlo.
 */

export interface SmokePuff {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Lato del cubetto, in voxel: cresce con l'eta'. */
  readonly size: number;
  /** Quanto e' ancora denso: `TRAFFIC.plume.peak` appena uscito, 0 alla fine. */
  readonly density: number;
}

const PLUME = TRAFFIC.plume;

/**
 * Gli sbuffi vivi di tutte le rotte, dal piu' giovane al piu' vecchio.
 *
 * L'ordine e' quello delle rotte, come per le pose, e per la stessa ragione: chi
 * disegna riempie un buffer solo, e due partite identiche devono riempirlo
 * uguale.
 */
export function puffsAt(
  routes: readonly TrafficRoute[],
  seconds: number,
): readonly SmokePuff[] {
  const out: SmokePuff[] = [];
  for (const route of routes) {
    const funnel = funnelOf(route.kind);
    if (funnel !== undefined) appendPlume(out, route, funnel, seconds);
  }
  return out;
}

/**
 * Gli sbuffi di una ciminiera sola.
 *
 * I tempi di uscita sono i multipli di `every`, non «l'ultimo piu' un delta»:
 * e' cio' che tiene la scia ferma nel mondo mentre il tempo scorre — uno sbuffo
 * non scivola all'indietro di frame in frame, resta esattamente dove la nave
 * l'ha lasciato finche' non svanisce.
 */
function appendPlume(
  out: SmokePuff[],
  route: TrafficRoute,
  funnel: VehicleFunnel,
  seconds: number,
): void {
  const every = Math.max(0.05, PLUME.every);
  const newest = Math.floor(seconds / every);

  for (let i = 0; ; i++) {
    const born = (newest - i) * every;
    const age = seconds - born;
    if (age >= PLUME.life) return;

    const pose = poseAt(route, born);
    // Chi era fuori dal mondo non ha fumato qui. Il resto della scia pero'
    // resta: gli sbuffi lasciati prima di sparire continuano a salire e a
    // diradarsi sul bordo, che e' esattamente cio' che lascia una nave partita.
    if (pose === null) continue;
    // La bocca sta nel sistema del mezzo: `+x` e' la prua, quindi l'offset gira
    // con la rotta. Un traghetto che inverte la marcia sposta la ciminiera
    // dall'altra parte della tuga, ed e' giusto cosi': e' la nave ad aver girato.
    const cos = Math.cos(pose.heading);
    const sin = Math.sin(pose.heading);
    const fade = age / PLUME.life;

    out.push({
      // Lo scarto laterale cresce con l'eta' invece di valere subito: appena
      // uscito lo sbuffo sta **sulla bocca** del fumaiolo, e a sbandare e' la
      // parte di colonna che si e' gia' allontanata.
      x: pose.x + funnel.along * cos + PLUME.windX * age + PLUME.wobble * fade * Math.sin(born * 1.7),
      y: pose.y + funnel.along * sin + PLUME.windY * age + PLUME.wobble * fade * Math.cos(born * 2.3),
      z: pose.z + funnel.mouth + PLUME.rise * age,
      size: PLUME.size + PLUME.growth * age,
      // Quadratica e non lineare: uno sbuffo si dirada in fretta appena uscito e
      // poi svanisce piano, che e' il verso opposto a quello di una dissolvenza
      // uniforme — la quale lascia l'ultimo cubetto sparire ancora ben visibile.
      density: PLUME.peak * (1 - fade) * (1 - fade),
    });
  }
}
