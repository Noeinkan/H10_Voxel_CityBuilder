import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { computeReach, distAt, type Catalyst, type ReachCache, type ReachField } from '../sim';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { TERRAIN } from '../world/terrain/config';

/** Larghezza in celle della fascia sotto il contorno del cursore. */
const CURSOR_BAND = 1.6;

/** Un colore per uso urbano, in ordine di `BUILDING_CLASS`. */
const CLASS_COLORS: readonly number[] = [0x5f8f7f, 0xd8886a, 0xd9b45f, 0xe99a72];

/** Gli stessi due stati del segnaposto: verde valido, rosso rifiutato. */
const CURSOR_VALID = 0x2ff08d;
const CURSOR_INVALID = 0xff5a4a;

/**
 * Contorni di influenza e perimetri dei settori, separati dalle mesh voxel.
 *
 * **Il contorno e' tracciato, non disegnato.** Finche' l'influenza era un raggio
 * in linea retta bastava un cerchio di `cos` e `sin`; ma il cerchio era euclideo
 * mentre il campo misurava in Chebyshev, e sulla diagonale l'influenza vera
 * arrivava il 41 percento oltre la linea promessa. Ora la portata e' geodetica —
 * l'acqua la ferma, una strada la porta piu' lontano — e non ha nessuna forma
 * chiusa da disegnare: l'unico contorno onesto e' quello estratto dai dati che
 * il campo usa davvero, con marching squares sul bordo della portata.
 */
export class InfluenceOverlay {
  readonly group = new Group();
  private readonly existing = new Group();
  private readonly sectors = new Group();
  // Il contorno del cursore e' una fascia piena piu' il suo bordo: una linea da
  // un pixel si perde sul terreno chiaro, e la larghezza non e' regolabile.
  private readonly cursorMaterial = lineMaterial(CURSOR_VALID, 1);
  private readonly bandMaterial = new MeshBasicMaterial({
    color: CURSOR_VALID,
    transparent: true,
    opacity: 0.3,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly cursor = new LineSegments(new BufferGeometry(), this.cursorMaterial);
  private readonly band = new Mesh(new BufferGeometry(), this.bandMaterial);

  // Il catalizzatore sotto al cursore non e' ancora piazzato, quindi la sua
  // portata non sta nella cache della simulazione. Una voce sola basta: il
  // cursore si muove per celle intere, e fermo su una cella non ricalcola.
  private lastCursor: ReachField | null = null;

  constructor(private readonly map: TerrainMap) {
    this.group.add(this.existing, this.sectors, this.band, this.cursor);
    this.cursor.visible = false;
    this.band.visible = false;
    this.band.renderOrder = 20;
    this.cursor.renderOrder = 21;
    // Fuori dalla profondita' come il segnaposto: il contorno resta leggibile
    // anche quando passa dietro a una collina.
    this.cursorMaterial.depthTest = false;
  }

  refreshCatalysts(catalysts: readonly Catalyst[], reach: ReachCache): void {
    clearLines(this.existing);
    for (const catalyst of catalysts) {
      const field = reach.get(catalyst.x, catalyst.y, catalyst.radius);
      const line = new LineSegments(
        contourGeometry(this.map, field),
        lineMaterial(CLASS_COLORS[catalyst.class], 0.42),
      );
      line.renderOrder = 18;
      this.existing.add(line);
    }
  }

  showCursor(x: number, y: number, radius: number, valid: boolean, reach: ReachCache): void {
    const field = this.cursorField(x, y, radius, reach);

    this.cursor.geometry.dispose();
    this.cursor.geometry = contourGeometry(this.map, field);
    this.band.geometry.dispose();
    this.band.geometry = bandGeometry(this.map, field, CURSOR_BAND);
    const color = valid ? CURSOR_VALID : CURSOR_INVALID;
    this.cursorMaterial.color.setHex(color);
    this.bandMaterial.color.setHex(color);
    this.cursor.visible = true;
    this.band.visible = true;
  }

  hideCursor(): void {
    this.cursor.visible = false;
    this.band.visible = false;
  }

  addSector(region: Region): void {
    const line = new LineLoop(rectGeometry(this.map, region), lineMaterial(0x70b7d0, 0.9));
    line.renderOrder = 19;
    this.sectors.add(line);
  }

  private cursorField(x: number, y: number, radius: number, reach: ReachCache): ReachField {
    const cached = this.lastCursor;
    if (cached !== null && cached.cx === x && cached.cy === y && cached.radius === radius) {
      return cached;
    }
    const field = computeReach(x, y, radius, reach.cost);
    this.lastCursor = field;
    return field;
  }
}

/** true se la cella e' dentro la portata. Fuori dal quadrato e' sempre false. */
function inside(field: ReachField, x: number, y: number): boolean {
  return distAt(field, x, y) < field.radius;
}

/**
 * Il bordo della portata, con marching squares sui punti medi dei lati.
 *
 * Escono segmenti sciolti e non un anello: un canale che taglia la forma in due
 * produce piu' contorni, e un `LineLoop` li chiuderebbe con un segmento
 * fantasma da una sponda all'altra. Il quadrato non ha bisogno di un bordo di
 * guardia perche' la sua cornice e' gia' fuori portata per costruzione — a
 * distanza pari al raggio il peso e' zero.
 */
function contourGeometry(map: TerrainMap, field: ReachField): BufferGeometry {
  const { cx, cy, radius } = field;
  const points: number[] = [];

  const edge = (px: number, py: number): void => {
    points.push(px, py, surfaceZ(map, px, py));
  };

  for (let y = cy - radius; y < cy + radius; y++) {
    for (let x = cx - radius; x < cx + radius; x++) {
      const code =
        (inside(field, x, y) ? 1 : 0) |
        (inside(field, x + 1, y) ? 2 : 0) |
        (inside(field, x + 1, y + 1) ? 4 : 0) |
        (inside(field, x, y + 1) ? 8 : 0);
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

  return geometry(new Float32Array(points));
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

/**
 * La fascia interna al contorno, una cella per quad.
 *
 * E' spessa in **distanza geodetica** e non in linea d'aria, quindi segue il
 * bordo dovunque vada senza giunti da cucire: dove la portata gira attorno a un
 * dirupo, gira anche la fascia. Un quad per cella con una quota sola la tiene
 * anche appoggiata al terrazzamento, invece che sospesa a cavallo di un salto.
 */
function bandGeometry(map: TerrainMap, field: ReachField, width: number): BufferGeometry {
  const { cx, cy, radius } = field;
  const inner = radius - width;
  const positions: number[] = [];

  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const d = distAt(field, x, y);
      if (d < inner || d >= radius) continue;

      const z = surfaceZ(map, x, y);
      const x0 = x - 0.5;
      const x1 = x + 0.5;
      const y0 = y - 0.5;
      const y1 = y + 0.5;
      positions.push(x0, y0, z, x1, y0, z, x1, y1, z);
      positions.push(x0, y0, z, x1, y1, z, x0, y1, z);
    }
  }

  return geometry(new Float32Array(positions));
}

function rectGeometry(map: TerrainMap, region: Region): BufferGeometry {
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

function lineMaterial(color: number, opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

function clearLines(group: Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof LineSegments || child instanceof LineLoop) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
  }
}
