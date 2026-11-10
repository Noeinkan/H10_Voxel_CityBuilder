import { BufferGeometry, Float32BufferAttribute } from 'three';
import { BALANCE, distAt, falloff, reachAt, type ReachField } from '../sim';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { TERRAIN } from '../world/terrain/config';
import type { ReachSummary } from './InfluenceOverlay';

const REACH_STEPS: readonly number[] = [0.25, 0.5, 0.75];
const FILL_STEP = 2;
const FILL_MIN = 0.05;
const FILL_PEAK = 0.6;

/**
 * Quante celle la portata raggiunge, e quanto sono rispetto a un entroterra
 * piatto e libero.
 *
 * Il paragone **non** e' con il raggio nominale: fuori strada ogni passo costa
 * `reach.land`, quindi nemmeno il sito perfetto arriverebbe mai al raggio pieno,
 * e misurare contro quello darebbe a ogni posto dell'isola la stessa bocciatura.
 * Cosi' invece l'uno e' l'entroterra buono, sopra c'e' il sito servito bene
 * dalle strade, e sotto ci sono la costa, il dirupo e la penisola.
 */
export function coverageOf(field: ReachField): ReachSummary {
  const { cx, cy, radius } = field;
  let cells = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (distAt(field, x, y) < radius) cells++;
    }
  }
  const side = 2 * (radius / BALANCE.reach.land) - 1;
  return { cells, ratio: cells / (side * side) };
}

/** true se la cella sta entro la distanza data. Fuori dal quadrato e' sempre false. */
function inside(field: ReachField, x: number, y: number, level: number): boolean {
  return distAt(field, x, y) < level;
}

/**
 * La velatura sotto al contorno, una cella per quad e il peso nell'opacita'.
 *
 * E' il campo stesso reso visibile: l'alpha di ogni cella e' il suo `falloff`,
 * quindi cio' che si vede e' esattamente cio' che la simulazione somma. Un quad
 * per cella con una quota sola la tiene appoggiata al terrazzamento invece che
 * sospesa a cavallo di un salto, come faceva la fascia che ha sostituito.
 */
export function fillGeometry(map: TerrainMap, field: ReachField): BufferGeometry {
  const { cx, cy, radius } = field;
  const positions: number[] = [];
  const colors: number[] = [];
  const half = FILL_STEP * 0.5;

  for (let y = cy - radius; y <= cy + radius; y += FILL_STEP) {
    for (let x = cx - radius; x <= cx + radius; x += FILL_STEP) {
      const d = distAt(field, x, y);
      if (d >= radius) continue;

      const z = surfaceZ(map, x, y);
      const t = falloff(d / radius);
      const alpha = FILL_MIN + (FILL_PEAK - FILL_MIN) * t;
      // L'intensita' del verde segue il decadimento come l'opacita': con il
      // colore bianco dei vertici la velatura era di un verde uniforme e l'occhio
      // poteva leggere soltanto l'alpha; scalando anche la luminosita' il
      // gradiente si vede pure dove il terreno sotto e' scuro.
      const bright = FILL_MIN + (1 - FILL_MIN) * t;
      const x0 = x - half;
      const x1 = x + half;
      const y0 = y - half;
      const y1 = y + half;
      positions.push(x0, y0, z, x1, y0, z, x1, y1, z);
      positions.push(x0, y0, z, x1, y1, z, x0, y1, z);
      for (let vertex = 0; vertex < 6; vertex++) colors.push(bright, bright, bright, alpha);
    }
  }

  const result = geometry(new Float32Array(positions));
  result.setAttribute('color', new Float32BufferAttribute(new Float32Array(colors), 4));
  return result;
}

/** Velatura discreta della zona in cui entrambi i ruoli superano la soglia. */
export function pairingGeometry(map: TerrainMap, candidate: ReachField, partner: ReachField): BufferGeometry {
  const threshold = BALANCE.districts.overlapThreshold;
  const minX = Math.max(candidate.cx - candidate.radius, partner.cx - partner.radius);
  const maxX = Math.min(candidate.cx + candidate.radius, partner.cx + partner.radius);
  const minY = Math.max(candidate.cy - candidate.radius, partner.cy - partner.radius);
  const maxY = Math.min(candidate.cy + candidate.radius, partner.cy + partner.radius);
  const positions: number[] = [];
  const half = FILL_STEP * 0.5;
  for (let y = minY; y <= maxY; y += FILL_STEP) {
    for (let x = minX; x <= maxX; x += FILL_STEP) {
      if (reachAt(candidate, x, y) < threshold || reachAt(partner, x, y) < threshold) continue;
      const z = surfaceZ(map, x, y) + 0.08;
      positions.push(x - half, y - half, z, x + half, y - half, z, x + half, y + half, z);
      positions.push(x - half, y - half, z, x + half, y + half, z, x - half, y + half, z);
    }
  }
  return geometry(new Float32Array(positions));
}

/** Le isolinee interne, tutte in una geometria sola: hanno lo stesso materiale. */
export function ringsGeometry(map: TerrainMap, field: ReachField): BufferGeometry {
  const points: number[] = [];
  for (const step of REACH_STEPS) {
    contourPoints(map, field, field.radius * (1 - step), points);
  }
  return geometry(new Float32Array(points));
}

/**
 * Il bordo della portata a una distanza data, con marching squares sui punti
 * medi dei lati.
 *
 * Escono segmenti sciolti e non un anello: un canale che taglia la forma in due
 * produce piu' contorni, e un `LineLoop` li chiuderebbe con un segmento
 * fantasma da una sponda all'altra. Al livello esterno il quadrato non ha
 * bisogno di un bordo di guardia perche' la sua cornice e' gia' fuori portata
 * per costruzione — a distanza pari al raggio il peso e' zero.
 */
export function contourGeometry(map: TerrainMap, field: ReachField, level: number): BufferGeometry {
  const points: number[] = [];
  contourPoints(map, field, level, points);
  return geometry(new Float32Array(points));
}

function contourPoints(
  map: TerrainMap,
  field: ReachField,
  level: number,
  out: number[],
): void {
  const { cx, cy, radius } = field;
  // La geodetica non scende mai sotto la Chebyshev — e' il vincolo `>= 1` sul
  // costo di passo — quindi oltre `level` celle in linea d'aria non c'e' niente
  // dentro, e le isolinee interne costano una frazione del quadrato intero.
  const span = Math.min(radius, Math.ceil(level));

  const edge = (px: number, py: number): void => {
    out.push(px, py, surfaceZ(map, px, py));
  };

  for (let y = cy - span; y < cy + span; y++) {
    for (let x = cx - span; x < cx + span; x++) {
      const code =
        (inside(field, x, y, level) ? 1 : 0) |
        (inside(field, x + 1, y, level) ? 2 : 0) |
        (inside(field, x + 1, y + 1, level) ? 4 : 0) |
        (inside(field, x, y + 1, level) ? 8 : 0);
      if (code === 0 || code === 15) continue;

      // Punti medi dei quattro lati del quadrato di campionamento.
      const top: readonly [number, number] = [x + 0.5, y];
      const right: readonly [number, number] = [x + 1, y + 0.5];
      const bottom: readonly [number, number] = [x + 0.5, y + 1];
      const left: readonly [number, number] = [x, y + 0.5];

      for (const [a, b] of segmentsOf(code, top, right, bottom, left)) {
        edge(a[0], a[1]);
        edge(b[0], b[1]);
      }
    }
  }
}

type Midpoint = readonly [number, number];

/**
 * I segmenti di un quadrato di marching squares.
 *
 * I due casi ambigui — angoli opposti dentro, gli altri due fuori — sono
 * risolti tenendo separate le due diagonali. Qui non serve una scelta coerente
 * fra celle vicine: si disegnano segmenti, non si ricostruisce una topologia.
 */
function segmentsOf(
  code: number,
  top: Midpoint,
  right: Midpoint,
  bottom: Midpoint,
  left: Midpoint,
): readonly (readonly [Midpoint, Midpoint])[] {
  switch (code) {
    case 1:
    case 14:
      return [[left, top]];
    case 2:
    case 13:
      return [[top, right]];
    case 3:
    case 12:
      return [[left, right]];
    case 4:
    case 11:
      return [[right, bottom]];
    case 6:
    case 9:
      return [[top, bottom]];
    case 7:
    case 8:
      return [[left, bottom]];
    case 5:
      return [
        [left, top],
        [right, bottom],
      ];
    case 10:
      return [
        [top, right],
        [left, bottom],
      ];
    default:
      return [];
  }
}

export function rectGeometry(map: TerrainMap, region: Region): BufferGeometry {
  const corners = [
    [region.minX, region.minY],
    [region.minX + region.sizeX, region.minY],
    [region.minX + region.sizeX, region.minY + region.sizeY],
    [region.minX, region.minY + region.sizeY],
  ] as const;
  const positions = new Float32Array(corners.length * 3);
  corners.forEach(([x, y], index) => writePoint(positions, index, x, y, surfaceZ(map, x, y)));
  return geometry(positions);
}

function surfaceZ(map: TerrainMap, x: number, y: number): number {
  return Math.max(TERRAIN.seaLevel, map.heightAt(Math.floor(x), Math.floor(y))) + 0.35;
}

function writePoint(out: Float32Array, index: number, x: number, y: number, z: number): void {
  out[index * 3] = x;
  out[index * 3 + 1] = y;
  out[index * 3 + 2] = z;
}

function geometry(positions: Float32Array): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return result;
}

