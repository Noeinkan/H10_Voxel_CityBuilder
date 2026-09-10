/**
 * Sonda: la V della scia si apre davvero, e si vede?
 *
 * Due domande diverse. La prima e' geometria e sta in `wake.ts`; la seconda e'
 * la trasparenza che il fragment calcola, e li' entrano il granello e la soglia
 * di scarto. Un traghetto che attraversa lungo +x: la rotta e' l'asse y = 0,
 * quindi lo scostamento laterale di un segno **e' la sua y**.
 */
import { TRAFFIC, VEHICLE, type VehicleKind } from './src/world/traffic/config';
import { shuttle } from './src/world/traffic/routePath';
import { wakeAt } from './src/world/traffic/wake';

const WAKE = TRAFFIC.wake;
/** La soglia di `discard` scritta nel fragment. */
const DISCARD = 0.004;

function straightRoute(kind: VehicleKind, speed: number) {
  return shuttle(
    kind,
    [
      { x: 0, y: 0, z: TRAFFIC.waterZ },
      { x: 400, y: 0, z: TRAFFIC.waterZ },
    ],
    speed,
    TRAFFIC.ferryDwell,
    0,
    0,
  );
}

const route = straightRoute(VEHICLE.ferry, TRAFFIC.ferrySpeed);
const T = route.period * 0.25;
const marks = wakeAt([route], T);

console.log('=== 1. la V si apre? (traghetto, 4 voxel/s) ===');
console.log('  eta(s)      y   semilarg   schiuma   alpha min   alpha max   visibile?');
for (let i = 0; i < marks.length; i += 3) {
  const m = marks[i];
  const age = (i / 3) * WAKE.every;
  // Il fragment: alpha = foam * band * (0.4 + 0.8 * speck), band = 1 in mezzo
  // al rettangolo. Il granello fa oscillare il fattore fra 0,4 e 1,2.
  const lo = m.foam * 0.4;
  const hi = m.foam * 1.2;
  const verdict = hi < DISCARD ? 'scartata' : lo < DISCARD ? 'a chiazze' : 'piena';
  console.log(
    age.toFixed(2).padStart(8),
    m.y.toFixed(2).padStart(7),
    m.halfWidth.toFixed(2).padStart(9),
    m.foam.toFixed(4).padStart(10),
    lo.toFixed(4).padStart(12),
    hi.toFixed(4).padStart(12),
    '  ' + verdict,
  );
}

const ys = marks.map((m) => m.y);
console.log('\napertura massima della V:', (Math.max(...ys) - Math.min(...ys)).toFixed(2), 'voxel');

// Quanto della V si vede davvero: il segno piu' vecchio la cui schiuma non
// finisce sotto la soglia anche col granello al massimo.
let lastVisible = 0;
for (let i = 0; i < marks.length; i += 3) {
  if (marks[i].foam * 1.2 >= DISCARD) lastVisible = (i / 3) * WAKE.every;
}
const visibleSpread = 2 * (TRAFFIC.hull[VEHICLE.ferry].width / 2 + WAKE.spread * lastVisible);
console.log('eta dell ultimo segno visibile:', lastVisible.toFixed(2), 's di', WAKE.life, 's di vita');
console.log('apertura a quella eta:', visibleSpread.toFixed(2), 'voxel');

console.log('\n=== 2. l angolo della V, mezzo per mezzo ===');
console.log('Il codice apre la V di `spread` voxel al secondo, non per angolo:');
console.log('l angolo scende quindi con la velocita, mentre una scia di Kelvin');
console.log('vera ha ~19,47 gradi per **qualunque** velocita.\n');
console.log('  mezzo      velocita   semiangolo');
for (const [name, speed] of [
  ['traghetto', TRAFFIC.ferrySpeed],
  ['carico   ', TRAFFIC.cargoSpeed],
  ['yacht    ', TRAFFIC.yachtSpeed],
] as const) {
  const deg = (Math.atan(WAKE.spread / speed) * 180) / Math.PI;
  console.log(' ', name, String(speed).padStart(8), deg.toFixed(1).padStart(11), 'gradi');
}
console.log('\n`spread` per 19,47 gradi:');
for (const [name, speed] of [
  ['traghetto', TRAFFIC.ferrySpeed],
  ['carico   ', TRAFFIC.cargoSpeed],
  ['yacht    ', TRAFFIC.yachtSpeed],
] as const) {
  console.log(' ', name, 'vorrebbe spread =', (speed * Math.tan((19.47 * Math.PI) / 180)).toFixed(2));
}
console.log('  (oggi e uno solo per tutti:', WAKE.spread, ')');
