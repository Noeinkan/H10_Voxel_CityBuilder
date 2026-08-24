import { BERTH } from '../landmarks/config';
import type { WorldMooring } from '../landmarks/generate';
import { TRAFFIC, VEHICLE } from './config';
import { loop, phaseOf, shuttle, type TrafficRoute, type TrafficWaypoint } from './routePath';
import type { CeilingProbe, TrafficStructure } from './routes';

/**
 * Le rotte che stanno in aria, e l'unica cosa che le accomuna: **passano sopra
 * la citta' invece che dentro**.
 *
 * **Perche' e' un file suo.** Una rotta di mare cerca l'acqua e una in quota
 * scavalca i tetti: sono due domande diverse fatte allo stesso mondo, e da
 * quando il circuito di volo non e' piu' una quota fissa la seconda ha una
 * regola tutta sua — il sondaggio del profilo sotto la spezzata — che al mare
 * non serve e che nessuno vuole leggere mentre guarda una nave da carico.
 *
 * **La quota di crociera non e' un numero, e' un massimo.** Con `maxLevel` a
 * dodici una torre supera i centoquaranta voxel e un circuito a
 * `planeCruise` fisso passava dritto dentro il centro: qui la quota dichiarata
 * e' il **minimo**, e sopra una citta' alta la rotta sale. E' l'unica cosa in
 * questo dominio che dipende da cosa e' stato costruito, e ci arriva come un
 * predicato — `CeilingProbe` — esattamente come l'acqua arriva alle rotte di
 * mare: niente registry, niente `TerrainMap`, niente Three.js.
 */

/** Un punto in pianta: la spezzata prima che le si dia una quota. */
interface Plan {
  readonly x: number;
  readonly y: number;
}

/**
 * Il circuito di volo attorno a una pista: decollo, salita, giro, finale.
 *
 * E' una spezzata chiusa con la quota dentro, quindi la salita e la discesa sono
 * la stessa interpolazione della posizione e non un secondo meccanismo. Le due
 * soglie le dichiara la ricetta (`BERTH.runway`): sono l'unica cosa che di una
 * pista serve sapere, e prenderle da li' invece che dai numeri della tabella
 * tiene il circuito allineato alla pista anche quando la pista si sposta.
 *
 * **Le quote sono frazioni della salita, non voxel.** Cosi' quando il profilo
 * della citta' alza la crociera, salgono con lei anche il punto di fine salita e
 * quello del finale: irrigidirli in voxel darebbe un aereo che sale in quota e
 * poi rientra passando dentro la torre che aveva appena scavalcato.
 */
export function flightCircuit(
  structure: TrafficStructure,
  moorings: readonly WorldMooring[],
  ceiling: CeilingProbe,
): TrafficRoute | null {
  const ends = moorings.filter((mooring) => mooring.berth === BERTH.runway);
  if (ends.length < 2) return null;

  const [head, tail] = ends;
  const dx = tail.x - head.x;
  const dy = tail.y - head.y;
  const run = Math.hypot(dx, dy);
  if (run < 1) return null;

  const ax = dx / run;
  const ay = dy / run;
  // La perpendicolare decide da che parte si gira. Sempre la stessa, cosi' due
  // aeroporti affiancati non fanno volare gli aerei l'uno contro l'altro.
  const px = -ay;
  const py = ax;

  const pad = structure.z;
  const half = TRAFFIC.planeCircuit / 2;
  const wide = TRAFFIC.planeCircuit;

  const at = (origin: WorldMooring, along: number, across: number): Plan => ({
    x: origin.x + ax * along + px * across,
    y: origin.y + ay * along + py * across,
  });

  const plan: readonly Plan[] = [
    at(head, 0, 0),
    at(head, TRAFFIC.planeRoll, 0),
    at(tail, 0, 0),
    at(tail, half, 0),
    at(tail, half, wide),
    at(head, -half, wide),
    at(head, -half, 0),
  ];

  const lift = Math.max(
    TRAFFIC.planeCruise,
    ceilingOver(plan, ceiling, true) - pad + TRAFFIC.planeClearance,
  );
  const height = [1, 1, lift * 0.45, lift, lift, lift, lift * 0.5];

  return loop(
    VEHICLE.plane,
    plan.map((point, i) => ({ ...point, z: pad + height[i] })),
    TRAFFIC.planeSpeed,
    phaseOf(structure.id),
  );
}

/**
 * Il giro lento di un dirigibile attorno al proprio scalo in quota.
 *
 * Uno solo per struttura, e non uno per pilone: due dirigibili in orbita sulla
 * stessa circonferenza si inseguono, e a schermo si legge come un errore. Gli
 * altri piloni tengono i loro ormeggiati, che e' cio' che un pilone fa.
 */
export function airshipOrbit(
  structure: TrafficStructure,
  moorings: readonly WorldMooring[],
  ceiling: CeilingProbe,
): TrafficRoute | null {
  const mast = moorings.find((mooring) => mooring.berth === BERTH.airship);
  if (mast === undefined) return null;

  const plan = ring(mast, TRAFFIC.airshipOrbit, 8, 0);
  const z = Math.max(
    structure.z + mast.z + TRAFFIC.airshipCruise,
    ceilingOver(plan, ceiling, true) + TRAFFIC.aloftClearance,
  );
  return loop(
    VEHICLE.airship,
    plan.map((point) => ({ ...point, z })),
    TRAFFIC.airshipSpeed,
    phaseOf(structure.id + 7),
  );
}

/**
 * Il giro di un eVTOL che **si posa davvero** sulla propria piazzola.
 *
 * E' l'unica rotta chiusa che tocca terra fuori da una pista, ed e' il punto:
 * un pilone tiene fermo cio' che ci sta appeso e una pista serve a chi rulla,
 * mentre uno scalo in quota deve poter mostrare qualcosa che arriva e riparte
 * su otto colonne di tetto. La quota del primo vertice e' la piazzola; tutti gli
 * altri stanno in crociera, quindi la discesa e la salita sono i due lati che li
 * uniscono — la stessa interpolazione del circuito di volo, senza corsa a terra.
 *
 * **Il giro parte dal verso della piazzola** e non da est: il vertice
 * dell'avvicinamento e' l'ultimo prima di quello a terra, e la ricetta punta la
 * piazzola verso il lato libero del tetto proprio per tenere quel lato sgombero
 * dai piloni.
 */
export function padCircuit(
  structure: TrafficStructure,
  moorings: readonly WorldMooring[],
  ceiling: CeilingProbe,
): TrafficRoute | null {
  const pad = moorings.find((mooring) => mooring.berth === BERTH.pad);
  if (pad === undefined) return null;

  const base = structure.z + pad.z;
  // Il vertice zero **e'** la piazzola, non un punto sopra di essa: e' cosi'
  // che il giro si legge come un atterraggio invece che come un sorvolo basso.
  // Gli altri cinque stanno sul giro, quindi il vertice del giro che cadrebbe
  // sul verso della piazzola si perde: partenza e avvicinamento restano a
  // sessanta gradi da quel verso, cioe' tutt'e due dal lato libero del tetto.
  const plan: readonly Plan[] = [pad, ...ring(pad, TRAFFIC.evtolCircuit, 6, pad.heading).slice(1)];
  const lift = Math.max(
    TRAFFIC.evtolCruise,
    ceilingOver(plan, ceiling, true) - base + TRAFFIC.aloftClearance,
  );

  const path: TrafficWaypoint[] = plan.map((point, i) => ({
    x: point.x,
    y: point.y,
    z: base + (i === 0 ? 0.5 : lift),
  }));
  return loop(VEHICLE.evtol, path, TRAFFIC.evtolSpeed, phaseOf(structure.id + 3));
}

/**
 * La mongolfiera che si stacca dal pilone, prende quota e rientra.
 *
 * **Va e torna, non gira**, e la differenza e' tutta la sagoma: un pallone non
 * ha un verso di marcia, quindi un giro chiuso lo farebbe ruotare su se' stesso
 * senza motivo. Un pendolo con la sosta ai due capi racconta invece cio' che un
 * pallone fa davvero — sta ormeggiato, sale, si allontana, rientra.
 *
 * **Si allontana lungo il verso del proprio ormeggio**, e non sottovento. La
 * deriva del pennacchio e' una costante del mondo, mentre un ormeggio e' una
 * coordinata canonica che ruota con la struttura: legare il pallone al vento
 * manderebbe meta' dei palloni della citta' dritti dentro il proprio scalo,
 * perche' su due versi su quattro il lato libero del tetto sta dalla parte
 * opposta. Il verso lo sceglie quindi la ricetta, che il proprio tetto lo
 * conosce.
 */
export function balloonFlight(
  structure: TrafficStructure,
  moorings: readonly WorldMooring[],
  ceiling: CeilingProbe,
): TrafficRoute | null {
  const tether = moorings.find((mooring) => mooring.berth === BERTH.balloon);
  if (tether === undefined) return null;

  const base = structure.z + tether.z;
  const dx = Math.cos(tether.heading);
  const dy = Math.sin(tether.heading);
  // Tre punti e non due: il pallone sale **prima** di allontanarsi, e senza il
  // punto di mezzo la salita sarebbe spalmata su tutta la deriva, cioe' un
  // pallone che striscia sui tetti per il primo terzo di ogni corsa.
  const lead: Plan = { x: tether.x + dx * TRAFFIC.balloonLead, y: tether.y + dy * TRAFFIC.balloonLead };
  const far: Plan = { x: tether.x + dx * TRAFFIC.balloonDrift, y: tether.y + dy * TRAFFIC.balloonDrift };

  const top = Math.max(
    base + TRAFFIC.balloonRise,
    ceilingOver([tether, lead, far], ceiling, false) + TRAFFIC.aloftClearance,
  );

  return shuttle(
    VEHICLE.balloon,
    [
      { x: tether.x, y: tether.y, z: base },
      { ...lead, z: top },
      { ...far, z: top },
    ],
    TRAFFIC.balloonSpeed,
    TRAFFIC.balloonDwell,
    tether.heading,
    phaseOf(structure.id + 11),
    false,
    TRAFFIC.balloonBob,
  );
}

/** Un poligono attorno a un punto: l'orbita di un dirigibile, il giro di un eVTOL. */
function ring(centre: Plan, radius: number, sides: number, from: number): readonly Plan[] {
  const out: Plan[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = from + (i / sides) * Math.PI * 2;
    out.push({
      x: centre.x + Math.cos(angle) * radius,
      y: centre.y + Math.sin(angle) * radius,
    });
  }
  return out;
}

/**
 * La cosa piu' alta sotto una spezzata, sondata a passo costante.
 *
 * **Il massimo e non un profilo**, ed e' quello che tiene onesto il costo: la
 * rotta e' un giro solo a una quota sola, quindi di tutta la citta' sotto di se'
 * le serve sapere un numero. Sondare per segmenti invece che per vertici non e'
 * pignoleria — due vertici a ottantaquattro voxel l'uno dall'altro saltano
 * qualunque torre ci sia in mezzo, che e' esattamente cio' che si voleva vedere.
 */
function ceilingOver(
  plan: readonly Plan[],
  ceiling: CeilingProbe,
  closed: boolean,
): number {
  let top = 0;
  const last = closed ? plan.length : plan.length - 1;
  for (let i = 0; i < last; i++) {
    const from = plan[i];
    const to = plan[(i + 1) % plan.length];
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(span / TRAFFIC.ceilingStep));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const probe = ceiling(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      if (probe > top) top = probe;
    }
  }
  return top;
}
