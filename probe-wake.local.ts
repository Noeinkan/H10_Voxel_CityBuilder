/**
 * Sonda: la V della scia si apre allo stesso angolo per tutti gli scafi?
 *
 * L'angolo non si legge dalla config ma **dai segni**: una traversata dritta
 * lungo +x, e la pendenza fra due segni consecutivi dello stesso ramo e' la
 * tangente del semiangolo. E' la stessa misura del test, stampata.
 */
import { TRAFFIC, VEHICLE, type VehicleKind } from './src/world/traffic/config';
import { shuttle } from './src/world/traffic/routePath';
import { wakeAt } from './src/world/traffic/wake';

const WAKE = TRAFFIC.wake;
/** La soglia di `discard` scritta nel fragment. */
const DISCARD = 0.004;

function crossing(kind: VehicleKind, speed: number) {
  return shuttle(
    kind,
    [
      { x: 0, y: 0, z: TRAFFIC.waterZ },
      { x: 400, y: 0, z: TRAFFIC.waterZ },
    ],
    speed,
    0,
    0,
    0,
  );
}

const BOATS = [
  ['traghetto', VEHICLE.ferry, TRAFFIC.ferrySpeed],
  ['carico   ', VEHICLE.cargo, TRAFFIC.cargoSpeed],
  ['yacht    ', VEHICLE.yacht, TRAFFIC.yachtSpeed],
] as const;

console.log('semiangolo dichiarato in config:', WAKE.spreadAngle, 'gradi\n');
console.log('  mezzo      velocita   semiangolo misurato   apertura a fine vita');
for (const [name, kind, speed] of BOATS) {
  const marks = wakeAt([crossing(kind, speed)], 30);
  const branch = marks.filter((_, i) => i % 3 === 0);

  // La pendenza fra due segni consecutivi: rise / run = tan(semiangolo).
  const slopes: number[] = [];
  for (let i = 1; i < branch.length; i++) {
    const rise = Math.abs(branch[i].y) - Math.abs(branch[i - 1].y);
    const run = branch[i - 1].x - branch[i].x;
    slopes.push(rise / run);
  }
  const deg = (Math.atan(slopes[0]) * 180) / Math.PI;
  const spanTip = 2 * Math.abs(branch[branch.length - 1].y);

  console.log(
    ' ', name,
    String(speed).padStart(8),
    (deg.toFixed(2) + ' gradi').padStart(21),
    (spanTip.toFixed(1) + ' voxel').padStart(23),
  );
}

// Quanto della V si vede davvero: oltre la soglia di scarto non resta niente.
console.log('\n--- il traghetto segno per segno (era il caso peggiore) ---');
console.log('  eta(s)      y   schiuma   visibile?');
const ferry = wakeAt([crossing(VEHICLE.ferry, TRAFFIC.ferrySpeed)], 30);
for (let i = 0; i < ferry.length; i += 3) {
  const m = ferry[i];
  const age = (i / 3) * WAKE.every;
  const hi = m.foam * 1.2;
  const lo = m.foam * 0.4;
  console.log(
    age.toFixed(2).padStart(8),
    m.y.toFixed(2).padStart(7),
    m.foam.toFixed(4).padStart(10),
    '  ' + (hi < DISCARD ? 'scartata' : lo < DISCARD ? 'a chiazze' : 'piena'),
  );
}
