import {
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import {
  catalystById,
  computeReach,
  previewDistrict,
  type Catalyst,
  type CatalystId,
  type DistrictPreview,
  type ReachCache,
  type ReachField,
  type UrbanSources,
} from '../sim';
import type { CoachSuggestion } from '../game/coach';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import {
  contourGeometry,
  coverageOf,
  fillGeometry,
  pairingGeometry,
  rectGeometry,
  ringsGeometry,
} from './influenceGeometry';

/** Quanti campi di cursore tenere a memoria. */
const CURSOR_CACHE_MAX = 16;

/** Un colore per uso urbano, in ordine di `BUILDING_CLASS`. */
const CLASS_COLORS: readonly number[] = [0x5f8f7f, 0xd8886a, 0xd9b45f, 0xe99a72];

/** Il colore dedicato al coach: diverso dagli usi urbani e dal cursore. */
const COACH_GROW_COLOR = 0x3ddc84;

/** Il colore del «metti qui»: distinto dal verde di «fai crescere» e dal cursore. */
const COACH_PLACE_COLOR = 0xf0b34b;

/** Gli stessi due stati del segnaposto: verde valido, rosso rifiutato. */
const CURSOR_VALID = 0x2ff08d;
const CURSOR_INVALID = 0xff5a4a;
const PAIRING_COLOR = 0xffcb69;

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
  private readonly pairing = new Mesh(new BufferGeometry(), new MeshBasicMaterial({
    color: PAIRING_COLOR,
    transparent: true,
    opacity: 0.42,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  }));
  private readonly existingLines: LineSegments[] = [];
  private highlightedPairing: DistrictPreview | null = null;
  private pairingKey: string | null = null;
  private previewKey: string | null = null;
  private previewSources: readonly Catalyst[] | null = null;
  private lastPairing: DistrictPreview | null = null;
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
    this.group.add(this.existing, this.sectors, this.fill, this.rings, this.cursor, this.pairing, this.coach);
    this.hideCursor();
    this.fill.renderOrder = 20;
    this.rings.renderOrder = 21;
    this.cursor.renderOrder = 22;
    this.pairing.renderOrder = 23;
    // Fuori dalla profondita' come il segnaposto: il contorno resta leggibile
    // anche quando passa dietro a una collina.
    this.cursorMaterial.depthTest = false;
    this.ringMaterial.depthTest = false;
  }

  refreshCatalysts(catalysts: readonly Catalyst[], reach: ReachCache): void {
    this.catalysts = catalysts;
    clearLines(this.existing);
    this.existingLines.length = 0;
    this.highlightedPairing = null;
    this.pairingKey = null;
    this.previewKey = null;
    this.previewSources = null;
    for (const catalyst of catalysts) {
      const field = reach.get(catalyst.x, catalyst.y, catalyst.radius);
      const line = new LineSegments(
        contourGeometry(this.map, field, field.radius),
        lineMaterial(CLASS_COLORS[catalyst.class], 0.42),
      );
      line.renderOrder = 18;
      this.existing.add(line);
      this.existingLines.push(line);
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
    kind?: CatalystId,
    sources?: UrbanSources,
  ): ReachSummary & { readonly pairing: DistrictPreview | null } {
    const field = this.cursorField(x, y, radius, reach);
    const summary = this.showField(field, valid ? CURSOR_VALID : CURSOR_INVALID);
    const previewKey = `${x},${y},${radius}:${kind}`;
    if (valid && kind !== undefined && sources !== undefined) {
      if (this.previewKey !== previewKey || this.previewSources !== sources.catalysts) {
        this.lastPairing = previewDistrict(sources, kind, field);
        this.previewKey = previewKey;
        this.previewSources = sources.catalysts;
      }
    }
    const pairing = valid && kind !== undefined && sources !== undefined ? this.lastPairing : null;
    this.showPairing(field, pairing, reach);
    return { ...summary, pairing };
  }

  /** La coppia utile si accende sul bordo esistente e nella zona comune. */
  private showPairing(field: ReachField, pairing: DistrictPreview | null, reach: ReachCache): void {
    this.highlightPairingPartners(pairing);
    if (pairing?.status !== 'formed') {
      this.pairing.visible = false;
      return;
    }
    const key = `${field.cx},${field.cy},${field.radius}:` +
      `${pairing.partner.x},${pairing.partner.y},${pairing.partner.radius}`;
    if (key !== this.pairingKey) {
      this.pairingKey = key;
      this.pairing.geometry.dispose();
      const other = reach.get(pairing.partner.x, pairing.partner.y, pairing.partner.radius);
      this.pairing.geometry = pairingGeometry(this.map, field, other);
    }
    this.pairing.visible = true;
  }

  private highlightPairingPartners(pairing: DistrictPreview | null): void {
    if (this.highlightedPairing === pairing) return;
    this.highlightedPairing = pairing;
    for (let index = 0; index < this.catalysts.length; index++) {
      const catalyst = this.catalysts[index];
      const line = this.existingLines[index];
      const material = line.material as LineBasicMaterial;
      const selected = pairing?.partner === catalyst;
      const nearby = pairing?.partners.includes(catalyst) ?? false;
      material.color.setHex(nearby ? PAIRING_COLOR : CLASS_COLORS[catalyst.class]);
      material.opacity = selected ? 1 : nearby ? 0.7 : 0.42;
      line.renderOrder = selected ? 23 : nearby ? 19 : 18;
    }
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
    this.highlightPairingPartners(null);
    this.pairing.visible = false;
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
