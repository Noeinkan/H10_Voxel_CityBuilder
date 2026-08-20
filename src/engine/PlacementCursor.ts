import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
} from 'three';

/** Verde e rosso del cursore: gli stessi due stati dell'HUD, ma saturi. */
const VALID = 0x2ff08d;
const INVALID = 0xff5a4a;

const CELL = 1;
// Il fascio e' l'unica parte che si vede da lontano, quando la cella e' pochi
// pixel; mirino e onda sono piu' larghi della cella perche' devono restare
// leggibili con la camera arretrata sull'isola intera.
const BEAM_HEIGHT = 12;
const BEAM_WIDTH = 0.5;
const BRACKET_SPAN = 2.8;
const BRACKET_ARM = 0.7;
const HALO_INNER = 1.32;
const HALO_OUTER = 1.58;
/** Un respiro lento: abbastanza da attirare l'occhio, non da distrarre. */
const PULSE_PERIOD = 1.5;

/**
 * Il segnaposto sotto il puntatore mentre si piazza qualcosa.
 *
 * Disegna sempre sopra la scena (`depthTest` spento): un cursore che sparisce
 * dietro una collina o un edificio smette di dire dove sta il click, ed e' il
 * motivo per cui la vecchia scatola semitrasparente si perdeva sul terreno.
 * Le parti sono quattro perche' rispondono a distanze diverse: il fascio si
 * vede da lontano, il mirino inquadra la cella, l'onda dice che il cursore e'
 * vivo, la base dice esattamente quale colonna verra' toccata.
 */
export class PlacementCursor {
  readonly group = new Group();
  private readonly tinted: Array<MeshBasicMaterial | LineBasicMaterial> = [];
  private readonly halo: Mesh;
  private readonly haloMaterial: MeshBasicMaterial;
  private readonly brackets: LineSegments;
  private readonly color = new Color();
  private valid: boolean | null = null;
  private phase = 0;

  constructor() {
    const plate = new Mesh(new PlaneGeometry(CELL, CELL), this.tint(surfaceMaterial(0.22)));
    plate.position.z = 0.02;

    const outline = new LineLoop(squareGeometry(CELL), this.tint(lineMaterial(1)));
    outline.position.z = 0.04;

    this.brackets = new LineSegments(
      bracketGeometry(BRACKET_SPAN, BRACKET_ARM),
      this.tint(lineMaterial(0.9)),
    );
    this.brackets.position.z = 0.05;

    this.haloMaterial = this.tint(surfaceMaterial(0.5));
    this.halo = new Mesh(new RingGeometry(HALO_INNER, HALO_OUTER, 48), this.haloMaterial);
    this.halo.position.z = 0.03;

    const beam = new Mesh(beamGeometry(BEAM_WIDTH, BEAM_HEIGHT), this.tint(beamMaterial()));

    this.group.add(plate, outline, this.brackets, this.halo, beam);
    // Sopra i cerchi di influenza, che sono gia' fuori dalla profondita'.
    this.group.renderOrder = 30;
    for (const child of this.group.children) child.renderOrder = 30;
    this.group.visible = false;
  }

  /** `z` e' la quota della superficie: la cella e' quella sotto il puntatore. */
  show(x: number, y: number, z: number, valid: boolean): void {
    this.group.position.set(x + 0.5, y + 0.5, z);
    if (valid !== this.valid) {
      this.valid = valid;
      this.color.setHex(valid ? VALID : INVALID);
      for (const material of this.tinted) material.color.copy(this.color);
    }
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  /** L'animazione avanza solo quando il cursore e' a schermo. */
  update(dt: number): void {
    if (!this.group.visible) return;
    this.phase = (this.phase + dt / PULSE_PERIOD) % 1;
    const spread = 1 + this.phase * 0.85;
    this.halo.scale.set(spread, spread, 1);
    this.haloMaterial.opacity = 0.5 * (1 - this.phase) ** 1.6;
    const breath = 1 + Math.sin(this.phase * Math.PI * 2) * 0.035;
    this.brackets.scale.set(breath, breath, 1);
  }

  private tint<T extends MeshBasicMaterial | LineBasicMaterial>(material: T): T {
    this.tinted.push(material);
    return material;
  }
}

function surfaceMaterial(opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
}

function lineMaterial(opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({ transparent: true, opacity, depthTest: false, depthWrite: false });
}

/** L'alfa del fascio sta nei vertici: sfuma verso l'alto invece di tagliarsi. */
function beamMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    vertexColors: true,
  });
}

function squareGeometry(size: number): BufferGeometry {
  const h = size / 2;
  return positionGeometry(
    new Float32Array([-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0]),
  );
}

/** Quattro angoli a L: inquadrano la cella senza nasconderla. */
function bracketGeometry(span: number, arm: number): BufferGeometry {
  const h = span / 2;
  const points: number[] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    points.push(sx * h, sy * h, 0, sx * (h - arm), sy * h, 0);
    points.push(sx * h, sy * h, 0, sx * h, sy * (h - arm), 0);
  }
  return positionGeometry(new Float32Array(points));
}

function beamGeometry(width: number, height: number): BufferGeometry {
  const h = width / 2;
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]] as const;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  corners.forEach(([ax, ay], side) => {
    const [bx, by] = corners[(side + 1) % corners.length];
    positions.push(ax, ay, 0, bx, by, 0, bx, by, height, ax, ay, height);
    colors.push(1, 1, 1, 0.55, 1, 1, 1, 0.55, 1, 1, 1, 0, 1, 1, 1, 0);
    const base = side * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const result = positionGeometry(new Float32Array(positions));
  result.setAttribute('color', new Float32BufferAttribute(new Float32Array(colors), 4));
  result.setIndex(indices);
  return result;
}

function positionGeometry(positions: Float32Array): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return result;
}
