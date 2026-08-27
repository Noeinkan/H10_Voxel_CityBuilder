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
import {
  BALANCE,
  catalystById,
  computeReach,
  distAt,
  falloff,
  type Catalyst,
  type ReachCache,
  type ReachField,
} from '../sim';
import type { CoachSuggestion } from '../game/coach';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { TERRAIN } from '../world/terrain/config';

/**
 * Livelli di portata su cui il cursore traccia una isolinea, oltre al bordo.
 *
 * Sono le curve di livello di una carta topografica, applicate a un campo che
 * il giocatore non puo' vedere: il bordo dice *dove finisce*, e da solo lascia
 * credere che dentro sia tutto uguale. Tre passi bastano a far leggere il
 * gradiente e non affollano la mappa — con uno solo non si vede una pendenza,
 * con sei si vede solo un bersaglio.
 */
const REACH_STEPS: readonly number[] = [0.25, 0.5, 0.75];

/** Quanti campi di cursore tenere a memoria: abbastanza per i ritorni, non di piu'. */
const CURSOR_CACHE_MAX = 16;

/**
 * Passo di campionamento della velatura, in celle.
 *
 * Il cursore e' un'anteprima, non il campo vero: la fedelta' per-cella del
 * gradiente non vale il quadrato intero di un landmark a raggio 92. Un quad ogni
 * due celle riduce di un quarto i vertici della velatura senza che l'occhio
 * perda il gradiente, e i quad allargati si accostano senza cuciture.
 */
const FILL_STEP = 2;

/**
 * Opacita' della velatura al bordo della portata e al centro.
 *
 * L'intensita' segue il decadimento: il centro e' il verde pieno della portata,
 * il bordo sfuma quasi a niente. Il minimo non e' zero di proposito — una
 * velatura che sfuma del tutto lascia il bordo appeso a una linea da un pixel,
 * che sul terreno chiaro si perde, ed e' la stessa ragione per cui prima del
 * gradiente qui c'era una fascia piena. Il salto fra minimo e picco e' largo:
 * con un raggio da landmark (fino a 92) un picco appena sopra il minimo
 * tornerebbe a leggersi come una fascia uniforme, non come il campo.
 */
const FILL_MIN = 0.05;
const FILL_PEAK = 0.6;

/** Un colore per uso urbano, in ordine di `BUILDING_CLASS`. */
const CLASS_COLORS: readonly number[] = [0x5f8f7f, 0xd8886a, 0xd9b45f, 0xe99a72];

/** Il colore dedicato al coach: diverso dagli usi urbani e dal cursore. */
const COACH_GROW_COLOR = 0x3ddc84;

/** Il colore del «metti qui»: distinto dal verde di «fai crescere» e dal cursore. */
const COACH_PLACE_COLOR = 0xf0b34b;

/** Gli stessi due stati del segnaposto: verde valido, rosso rifiutato. */
const CURSOR_VALID = 0x2ff08d;
const CURSOR_INVALID = 0xff5a4a;

/** Quanto terreno la portata tocca davvero da un sito, e quanto le manca. */
export interface ReachSummary {
  /** Celle raggiunte. */
  readonly cells: number;
  /** Frazione di quelle che raggiungerebbe da un entroterra piatto e libero. */
  readonly ratio: number;
}

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
 *
 * **Il cursore pero' mostra il campo, non il suo bordo.** Un perimetro solo dice
 * dove l'influenza finisce e tace su tutto il resto, mentre cio' che decide dove
 * conviene posare un catalizzatore e' *quanto* pesa dove arriva. Sotto al
 * contorno c'e' quindi una velatura che segue `falloff` cella per cella, e sopra
 * tre isolinee ai quarti di portata: il gradiente si legge a colpo d'occhio, i
 * quarti danno la misura, e la forma resta quella vera anche quando l'acqua la
 * taglia a meta'.
 */
export class InfluenceOverlay {
  readonly group = new Group();
  private readonly existing = new Group();
  private readonly sectors = new Group();
  private readonly cursorMaterial = lineMaterial(CURSOR_VALID, 1);
  private readonly ringMaterial = lineMaterial(CURSOR_VALID, 0.3);
  // Il colore sta nel materiale e l'intensita' nei vertici: cosi' passare da
  // valido a rifiutato e' un `setHex`, e non ricostruisce la mesh.
  private readonly fillMaterial = new MeshBasicMaterial({
    color: CURSOR_VALID,
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly cursor = new LineSegments(new BufferGeometry(), this.cursorMaterial);
  private readonly rings = new LineSegments(new BufferGeometry(), this.ringMaterial);
  private readonly fill = new Mesh(new BufferGeometry(), this.fillMaterial);
  /** Artefatti del coach: contorno di portata e anello sul landmark da crescere. */
  private readonly coach = new Group();

  // Il catalizzatore sotto al cursore non e' ancora piazzato, quindi la sua
  // portata non sta nella cache della simulazione. I raggi dei landmark sono
  // larghi (fino a 92) e rifare il Dijkstra a ogni ritorno del cursore su una
  // cella gia' visitata e' un lusso: qui sta una cache delimitata, separata dal
  // `ReachCache` della simulazione che resta illimitato.
  private readonly cursorCache = new Map<string, ReachField>();
  private lastSummary: ReachSummary = { cells: 0, ratio: 0 };
  // Quale portata e' gia' disegnata, per centro e raggio e non per identita'
  // dell'oggetto. Il puntatore manda eventi molto piu' fitti delle celle che
  // attraversa: senza questo, ogni pixel di movimento ricostruirebbe da capo
  // qualche decina di migliaia di triangoli. La chiave e' la coordinata perche'
  // `cursorField` restituisce un `ReachField` nuovo a ogni cella anche quando la
  // cella e' la stessa di un passaggio precedente.
  private drawnKey: string | null = null;
  /** I catalizzatori di `refreshCatalysts`, per risolvere l'evidenza del coach. */
  private catalysts: readonly Catalyst[] = [];
  /** Id del suggerimento gia' disegnato, per non ricostruire la geometria. */
  private coachId: string | null = null;
  /** true quando l'evidenza del coach riusa `showSelection`, che scrive sul cursore. */
  private coachHighlighted = false;

  constructor(private readonly map: TerrainMap) {
    this.group.add(this.existing, this.sectors, this.fill, this.rings, this.cursor, this.coach);
    this.hideCursor();
    this.fill.renderOrder = 20;
    this.rings.renderOrder = 21;
    this.cursor.renderOrder = 22;
    // Fuori dalla profondita' come il segnaposto: il contorno resta leggibile
    // anche quando passa dietro a una collina.
    this.cursorMaterial.depthTest = false;
    this.ringMaterial.depthTest = false;
  }

  refreshCatalysts(catalysts: readonly Catalyst[], reach: ReachCache): void {
    this.catalysts = catalysts;
    clearLines(this.existing);
    for (const catalyst of catalysts) {
      const field = reach.get(catalyst.x, catalyst.y, catalyst.radius);
      const line = new LineSegments(
        contourGeometry(this.map, field, field.radius),
        lineMaterial(CLASS_COLORS[catalyst.class], 0.42),
      );
      line.renderOrder = 18;
      this.existing.add(line);
    }
  }

  /** Mostra per intero il campo del landmark scelto, non soltanto il suo bordo. */
  showSelection(catalyst: Catalyst, reach: ReachCache): ReachSummary {
    const field = reach.get(catalyst.x, catalyst.y, catalyst.radius);
    return this.showField(field, CLASS_COLORS[catalyst.class] ?? CURSOR_VALID);
  }

  /** Mostra la portata del sito puntato, e ne restituisce la misura per l'HUD. */
  showCursor(
    x: number,
    y: number,
    radius: number,
    valid: boolean,
    reach: ReachCache,
  ): ReachSummary {
    const field = this.cursorField(x, y, radius, reach);
    return this.showField(field, valid ? CURSOR_VALID : CURSOR_INVALID);
  }

  private showField(field: ReachField, color: number): ReachSummary {
    const key = `${field.cx},${field.cy},${field.radius}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.cursor.geometry.dispose();
      this.cursor.geometry = contourGeometry(this.map, field, field.radius);
      this.rings.geometry.dispose();
      this.rings.geometry = ringsGeometry(this.map, field);
      this.fill.geometry.dispose();
      this.fill.geometry = fillGeometry(this.map, field);
      this.lastSummary = coverageOf(field);
    }

    this.cursorMaterial.color.setHex(color);
    this.ringMaterial.color.setHex(color);
    this.fillMaterial.color.setHex(color);
    this.cursor.visible = true;
    this.rings.visible = true;
    this.fill.visible = true;
    return this.lastSummary;
  }

  hideCursor(): void {
    this.cursor.visible = false;
    this.rings.visible = false;
    this.fill.visible = false;
  }

  /**
   * Disegna gli artefatti del coach: il contorno del landmark da crescere, o
   * l'evidenza del catalizzatore da toccare.
   *
   * **La geometria si ricostruisce solo quando cambia l'id.** La valutazione del
   * coach gira una volta per tick, ma il refresh dell'HUD e' piu' fitto: senza
   * questa memoria il contorno verrebbe rifatto a ogni giro, e il costo del
   * marching-squares non e' da pagare sessanta volte al secondo.
   */
  showCoach(suggestion: CoachSuggestion, reach: ReachCache): void {
    if (this.coachId === suggestion.id) return;
    this.hideCoach();
    this.coachId = suggestion.id;

    if (suggestion.grow !== null) {
      const radius = catalystById(suggestion.grow.kind).radius;
      const field = reach.get(suggestion.grow.x, suggestion.grow.y, radius);
      this.drawCoachGrow(field);
    }

    if (suggestion.highlight !== null) {
      const { x, y } = suggestion.highlight;
      const catalyst = this.catalysts.find((entry) => entry.x === x && entry.y === y);
      if (catalyst !== undefined) {
        this.coachHighlighted = true;
        this.showSelection(catalyst, reach);
      }
    }

    if (suggestion.place != null) {
      const { x, y, radius } = suggestion.place;
      this.drawCoachPlace(this.cursorField(x, y, radius, reach));
    }
  }

  /** Svuota gli artefatti del coach, compresa l'evidenza riusata dal cursore. */
  hideCoach(): void {
    clearObjects(this.coach);
    if (this.coachHighlighted) {
      this.hideCursor();
      this.coachHighlighted = false;
    }
    this.coachId = null;
  }

  /**
   * Il contorno e la velatura della portata del landmark da crescere, nel colore
   * del coach. Mostra dove i nuovi edifici farebbero avanzare lo stadio, senza
   * passare dai voxel: come il resto dell'overlay, e' sopra la scena.
   */
  private drawCoachGrow(field: ReachField): void {
    const contour = new LineSegments(
      contourGeometry(this.map, field, field.radius),
      lineMaterial(COACH_GROW_COLOR, 0.9),
    );
    contour.renderOrder = 19;
    this.coach.add(contour);

    const rings = new LineSegments(
      ringsGeometry(this.map, field),
      lineMaterial(COACH_GROW_COLOR, 0.35),
    );
    rings.renderOrder = 19;
    this.coach.add(rings);

    const fill = new Mesh(fillGeometry(this.map, field), coachFillMaterial());
    fill.renderOrder = 18;
    this.coach.add(fill);
  }

  /**
   * L'anello del landmark da posare, centrato sul «metti qui» del coach.
   *
   * Stessa geometria di `drawCoachGrow` ma con la tinta del piazzamento: mostra
   * dove va il catalizzatore e quanto terreno il suo campo coprirebbe, senza
   * pretendere che il landmark esista gia'.
   */
  private drawCoachPlace(field: ReachField): void {
    const contour = new LineSegments(
      contourGeometry(this.map, field, field.radius),
      lineMaterial(COACH_PLACE_COLOR, 0.9),
    );
    contour.renderOrder = 19;
    this.coach.add(contour);

    const rings = new LineSegments(
      ringsGeometry(this.map, field),
      lineMaterial(COACH_PLACE_COLOR, 0.35),
    );
    rings.renderOrder = 19;
    this.coach.add(rings);
  }

  addSector(region: Region): void {
    const line = new LineLoop(rectGeometry(this.map, region), lineMaterial(0x70b7d0, 0.9));
    line.renderOrder = 19;
    this.sectors.add(line);
  }

  private cursorField(x: number, y: number, radius: number, reach: ReachCache): ReachField {
    const key = `${x},${y},${radius}`;
    const hit = this.cursorCache.get(key);
    if (hit !== undefined) return hit;
    const field = computeReach(x, y, radius, reach.cost);
    if (this.cursorCache.size >= CURSOR_CACHE_MAX) {
      const oldest = this.cursorCache.keys().next().value;
      if (oldest !== undefined) this.cursorCache.delete(oldest);
    }
    this.cursorCache.set(key, field);
    return field;
  }
}

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
function coverageOf(field: ReachField): ReachSummary {
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
function fillGeometry(map: TerrainMap, field: ReachField): BufferGeometry {
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

/** Le isolinee interne, tutte in una geometria sola: hanno lo stesso materiale. */
function ringsGeometry(map: TerrainMap, field: ReachField): BufferGeometry {
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
function contourGeometry(map: TerrainMap, field: ReachField, level: number): BufferGeometry {
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

/** La velatura del coach: stessi pesi della portata, tinta dedicata. */
function coachFillMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: COACH_GROW_COLOR,
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** Svuota un gruppo smaltendo geometria e materiale di ogni figlio. */
function clearObjects(group: Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof Mesh || child instanceof LineSegments || child instanceof LineLoop) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
  }
}
