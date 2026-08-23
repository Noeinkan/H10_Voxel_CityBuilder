import type { ReadonlyBuildingRegistry } from '../world/buildings/BuildingRegistry';
import type { BlockRect } from '../world/streets/streetGrid';
import type { StreetNetwork } from '../world/streets/StreetNetwork';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import {
  INSPECT,
  INSPECT_MODE,
  INSPECT_NAMES,
  clampSliceZ,
  inspectGuide,
  inspectUniforms,
  modeHasLevel,
  sectionAxis,
  type InspectBox,
  type InspectMode,
  type InspectState,
  type InspectUniforms,
} from './inspect';
import type { InspectGuides } from './InspectGuides';
import type { IsoCameraController, IsoCameraState } from './IsoCameraController';
import type { VoxelMaterialHandle } from './VoxelMaterial';

/**
 * Una colonna a fuoco, ridotta a cio' che la vista ne usa.
 *
 * Strutturale e non `SurfaceCell`: `src/engine/` non importa da `src/game/`, e
 * `InspectOverlayFrame` aveva gia' fatto la stessa scelta per la stessa ragione.
 */
export interface FocusCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Quanti pixel di trascinamento separano un clic da una pennellata di camera.
 *
 * Serve perche' il tasto sinistro fa gia' pan (`isPanButton` li accetta tutti e
 * tre) e in orbita fa girare: senza una soglia, ogni rotazione finirebbe con
 * l'agganciare o mollare un isolato. Sei pixel passano il tremolio della mano
 * senza lasciar passare un trascinamento vero.
 */
const STUDY_CLICK_SLOP = 6;

export interface InspectViewOptions {
  readonly world: VoxelWorld;
  readonly camera: IsoCameraController;
  readonly paletteHandle: VoxelMaterialHandle;
  readonly guides: InspectGuides | null;
  readonly streets: StreetNetwork | null;

  /** La mappa del terreno, o null nelle scene che non ne hanno una. */
  readonly map: () => TerrainMap | null;

  /** Il registro degli edifici, quando una scena di crescita e' viva. */
  readonly registry: () => ReadonlyBuildingRegistry | undefined;

  /** Cosa c'e' sotto un pixel: il gioco lo risolve, la vista lo chiede. */
  readonly pointedCellAt: (clientX: number, clientY: number) => FocusCell | null;

  /** Vero quando uno strumento di piazzamento e' in mano: il clic e' suo, non dello studio. */
  readonly toolActive: () => boolean;

  readonly mode: InspectMode;
  readonly sliceZ: number;

  /** `?slice=` e' una quota chiesta esplicitamente, e resta fissa fra un'apertura e l'altra. */
  readonly sliceFromUrl: boolean;

  /** Cablaggio verso l'HUD, che l'engine non conosce. */
  readonly onStudy?: (blockKey: string) => void;
}

export interface InspectView {
  readonly mode: InspectMode;
  readonly sliceZ: number;
  readonly focus: FocusCell | null;
  readonly blockKey: string | null;
  readonly locked: boolean;
  readonly payload: InspectUniforms;

  /** Estremo alto della barra dei livelli: la citta' cresce, e con lei la quota utile. */
  readonly maxZ: number;

  setMode(mode: InspectMode): void;
  setSliceZ(z: number): void;

  /** Aggiorna la vista una volta per frame, dalla direzione di sguardo corrente. */
  apply(view: readonly [number, number, number]): void;

  onPointerMove(clientX: number, clientY: number): void;
  onPointerLeave(): void;
  onPointerDown(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;

  lockBlock(cell: FocusCell | null): void;
  unlockBlock(): void;
}

/**
 * Le viste di ispezione: raggi X, sezione, fetta e isolato.
 *
 * Nasce dividendo il bootstrap, dove le sue quattordici variabili di stato
 * stavano fra le altre quaranta. Sono sue e di nessun altro — il focus, il
 * riquadro dell'isolato, l'aggancio, l'inquadratura da restituire uscendo — ed
 * e' quella disgiunzione a rendere il confine reale invece che decorativo.
 *
 * Qui non si decide **come** si disegna: la traduzione in numeri per il
 * materiale sta in `inspect.ts`, che e' puro e testato in node. Questo modulo fa
 * da raccordo fra il mondo — cursore, camera, rete stradale, registro — e
 * quello.
 */
export function createInspectView(options: InspectViewOptions): InspectView {
  const { world, camera, paletteHandle, guides, streets } = options;

  let mode = options.mode;
  let sliceZ = options.sliceZ;

  /** Vero da quando la quota e' stata scelta: solo allora smette di seguire il suolo. */
  let sliceChosen = options.sliceFromUrl;

  /**
   * Ultima posizione nota del puntatore, in pixel di pagina.
   *
   * Si memorizza il pixel e non la colonna: risolvere la colonna costa una
   * marcia sulla heightmap, e farla a ogni `pointermove` significherebbe pagarla
   * decine di volte per frame. La colonna si risolve una volta per frame in
   * `apply`, e **solo** se il modo attivo la chiede — cosi' la vista segue anche
   * la rotazione della camera, senza che il mouse si muova.
   */
  let pointerX = 0;
  let pointerY = 0;
  let pointerInside = false;

  let focus: FocusCell | null = null;
  let blockKey: string | null = null;
  let blockRect: BlockRect | null = null;

  /**
   * Il volume che i raggi X stanno guardando, quando sotto il cursore c'e' un
   * edificio.
   *
   * E' l'unico pezzo di questa vista che deve sapere che gli edifici esistono,
   * ed e' il motivo per cui sta qui e non in `inspect.ts`: quel modulo resta
   * puro e riceve una scatola, non un registro. Senza — suolo nudo, scene senza
   * crescita — la lente ripiega sulla colonna e si allarga da sola.
   */
  let subject: InspectBox | null = null;

  /**
   * L'isolato **scelto**, quando c'e'.
   *
   * Finche' e' null, Block focus insegue il cursore come sempre. Da qui in poi
   * smette: il riquadro e' questo e non si rilegge piu' il puntatore, che e'
   * esattamente cio' che permette di girare attorno a un isolato invece di
   * perderlo al primo movimento del mouse. L'inquadratura di partenza si tiene
   * da parte perche' uscendo va restituita: la camera l'ha mossa lo strumento,
   * non il giocatore.
   */
  let lockedRect: BlockRect | null = null;
  let lockedKey: string | null = null;
  let cameraBeforeStudy: IsoCameraState | null = null;

  let studyPointerX = 0;
  let studyPointerY = 0;
  let studyPointerDown = false;

  // Zero come il `Vector3` che teneva questo valore nel bootstrap: il payload
  // iniziale non arriva mai a schermo — `apply` lo riscrive nel primo frame,
  // prima del render — ma partire da un altro vettore renderebbe l'estrazione
  // fedele "quasi ovunque", che e' il genere di quasi che si paga piu' tardi.
  let viewDirection: readonly [number, number, number] = [0, 0, 0];

  /** I modi che hanno bisogno di sapere dove sta il cursore. */
  function needsCursor(current: InspectMode): boolean {
    return current === INSPECT_MODE.xray
      || current === INSPECT_MODE.section
      || current === INSPECT_MODE.block;
  }

  function stateOf(): InspectState {
    const axis = sectionAxis([viewDirection[0], viewDirection[1], viewDirection[2]]);
    return {
      mode,
      sliceZ,
      // Il centro della colonna, non il suo spigolo: il piano deve passare per
      // quello che si sta guardando, non mezzo voxel piu' in la'.
      focus: focus === null ? null : { x: focus.x + 0.5, y: focus.y + 0.5, z: focus.z },
      view: [viewDirection[0], viewDirection[1], viewDirection[2]],
      block: blockRect,
      subject,
      section: focus === null || streets === null
        ? null
        : { axis, at: streets.nearestLine(axis, axis === 0 ? focus.x : focus.y) },
      locked: lockedRect !== null,
    };
  }

  let payload: InspectUniforms = inspectUniforms(stateOf());

  /**
   * La colonna su cui la vista si concentra.
   *
   * Tre risposte in ordine, e l'ordine e' tutto il comportamento:
   *
   * 1. **sotto il cursore**, finche' il cursore e' sulla canvas;
   * 2. **l'ultima vista**, appena il puntatore esce. E' l'aggancio: senza,
   *    portare il mouse sul dock per cambiare vista — o vedersi aprire una carta
   *    evento — farebbe saltare l'inquadratura a meta' citta', e il giocatore
   *    perderebbe proprio l'isolato che stava guardando;
   * 3. il **centro dell'inquadratura**, solo se non c'e' ancora niente di
   *    agganciato. Serve a una vista aperta da URL, che deve mostrare qualcosa
   *    prima che il mouse entri nella canvas — cioe' mai, in uno strumento di
   *    cattura.
   */
  function focusColumn(): FocusCell | null {
    if (pointerInside) {
      // `pointedCellAt` e non la superficie: chi guarda indica una cosa, non una
      // terra, e sopra una torre le due risposte distano quanto la torre e' alta.
      const picked = options.pointedCellAt(pointerX, pointerY);
      if (picked !== null) return picked;
    }
    if (focus !== null) return focus;
    const map = options.map();
    if (map === null) return null;
    const x = Math.floor(camera.targetPosition.x);
    const y = Math.floor(camera.targetPosition.y);
    const column = map.columnAt(x, y);
    return column === null ? null : { x, y, z: column.height };
  }

  /**
   * Il volume da guardare, sulla colonna a fuoco.
   *
   * Il registro sa gia' tutto quello che serve — angolo, impronta, base, altezza
   * — e questo e' l'unico punto in cui i raggi X vengono a saperlo. Fra piu'
   * record sulla stessa colonna si prende il piu' alto: e' quello che il raggio
   * ha incontrato, perche' e' quello che copre gli altri.
   *
   * `null` dove un registro non c'e' — scene `city` e `diorama`, crescita spenta
   * — o dove sotto il cursore c'e' solo terra: la lente sa ripiegare sulla
   * colonna.
   */
  function subjectAt(cell: FocusCell | null): InspectBox | null {
    const registry = options.registry();
    if (cell === null || registry === undefined) return null;

    let best: InspectBox | null = null;
    let top = -Infinity;
    for (const record of registry.at(cell.x, cell.y)) {
      const above = record.baseZ + record.height;
      if (above <= top) continue;
      top = above;
      best = {
        x0: record.x,
        y0: record.y,
        z0: record.baseZ,
        x1: record.x + record.footprint,
        y1: record.y + (record.footprintY ?? record.footprint),
        z1: above,
      };
    }
    return best;
  }

  /**
   * Cima dell'isolato, in voxel.
   *
   * `BlockRect` e' solo XY — dice quali colonne appartengono all'isolato, non fin
   * dove salgono — e senza una quota l'inquadratura taglierebbe le torri a meta'.
   * Il registro degli edifici ce l'ha gia': si tengono i record il cui isolato
   * coincide, e la cima e' il loro `baseZ + height` massimo. Dove il registro non
   * c'e' — crescita spenta, scene `city` e `diorama` — resta il terreno, che e'
   * comunque la risposta giusta per un isolato senza edifici.
   */
  function blockTopZ(rect: BlockRect): number {
    let top = 0;
    const registry = options.registry();
    if (registry !== undefined && streets !== null) {
      for (const record of registry.all) {
        if (record.x < rect.x0 || record.x > rect.x1) continue;
        if (record.y < rect.y0 || record.y > rect.y1) continue;
        top = Math.max(top, record.baseZ + record.height);
      }
    }
    if (top > 0) return top;

    const map = options.map();
    if (map === null) return INSPECT.defaultSliceZ;
    for (const [x, y] of [
      [rect.x0, rect.y0],
      [rect.x1, rect.y0],
      [rect.x0, rect.y1],
      [rect.x1, rect.y1],
    ] as const) {
      const column = map.columnAt(x, y);
      if (column !== null) top = Math.max(top, column.height);
    }
    return top;
  }

  /** Molla l'isolato e restituisce l'inquadratura che c'era prima. */
  function unlockBlock(): void {
    if (lockedRect === null) return;
    lockedRect = null;
    lockedKey = null;
    camera.setOrbitMode(false);
    if (cameraBeforeStudy !== null) {
      camera.restoreState(cameraBeforeStudy);
      cameraBeforeStudy = null;
    }
  }

  /**
   * Sceglie l'isolato sotto il cursore e ci si mette attorno.
   *
   * Le due meta' del gesto sono inseparabili, ed e' il motivo per cui stanno
   * nella stessa funzione: senza il taglio la camera si avvicinerebbe a un
   * isolato ancora sepolto nella citta', senza l'inquadratura il taglio
   * lascerebbe un modellino grande dieci pixel in mezzo al vuoto.
   */
  function lockBlock(cell: FocusCell | null): void {
    if (streets === null || mode !== INSPECT_MODE.block) return;
    const target = cell ?? focusColumn();
    if (target === null) return;

    const block = streets.blockAt(target.x, target.y);
    const rect = streets.blockRect(block);
    lockedRect = rect;
    lockedKey = streets.keyOf(block);
    focus = target;

    // Solo la prima volta: passando da un isolato all'altro l'inquadratura a cui
    // tornare resta quella della citta', non quella dello studio precedente.
    cameraBeforeStudy ??= camera.captureState();
    camera.setOrbitMode(true);

    const centreX = (rect.x0 + rect.x1 + 1) * 0.5;
    const centreY = (rect.y0 + rect.y1 + 1) * 0.5;
    const top = blockTopZ(rect);
    const base = Math.min(target.z, top);
    // Il perno a mezza altezza: girando attorno alla base, una torre oscillerebbe
    // in cima allo schermo invece di restare al centro.
    camera.setTarget(centreX, centreY, (base + top) * 0.5);
    camera.frameRegion(
      centreX,
      centreY,
      rect.x1 - rect.x0 + 1 + INSPECT.studyMargin,
      rect.y1 - rect.y0 + 1 + INSPECT.studyMargin,
      Math.max(1, top - base),
    );

    options.onStudy?.(lockedKey);
  }

  return {
    get mode() {
      return mode;
    },
    get sliceZ() {
      return sliceZ;
    },
    get focus() {
      return focus;
    },
    get blockKey() {
      return blockKey;
    },
    get locked() {
      return lockedRect !== null;
    },
    get payload() {
      return payload;
    },
    get maxZ() {
      return world.bounds.empty ? INSPECT.defaultSliceZ : world.bounds.maxZ;
    },

    lockBlock,
    unlockBlock,

    setMode(next: InspectMode): void {
      if (next === mode) return;
      // Cambiando vista l'isolato scelto non ha piu' un modo che lo sappia
      // leggere: lasciarlo bloccato terrebbe la camera in orbita su un soggetto
      // che nessuno sta piu' isolando.
      unlockBlock();
      mode = next;
      // L'aggancio non sopravvive al cambio di vista: rientrando in un modo ci si
      // ritroverebbe puntati sull'isolato di dieci minuti prima, senza capire
      // perche' la finestra si e' aperta la'.
      focus = null;
      subject = null;
      // Uscendo da Levels la quota si ri-arma, e una fetta riaperta riparte dal
      // suolo che si sta guardando invece che da una quota scelta mezz'ora fa,
      // che nel frattempo puo' essere finita sottoterra. Vale per ogni uscita e
      // non solo per il ritorno alla citta' intera: passando da Levels a un'altra
      // vista dal picker si saltava il ri-armo, ed era l'unico modo di ritrovarsi
      // una fetta dentro la collina. Solo `?slice=` resta fisso: li' la quota e'
      // stata chiesta esplicitamente.
      if (!modeHasLevel(next)) sliceChosen = options.sliceFromUrl;
      console.info(`[inspect] ${INSPECT_NAMES[next]}`);
    },

    setSliceZ(z: number): void {
      sliceZ = clampSliceZ(z);
      sliceChosen = true;
    },

    apply(view: readonly [number, number, number]): void {
      viewDirection = view;

      // Con un isolato scelto il cursore non ha piu' voce in capitolo: il
      // riquadro e' quello, e rileggere il puntatore lo farebbe saltare
      // all'isolato accanto ogni volta che si trascina per girare.
      if (lockedRect !== null) {
        blockRect = lockedRect;
        blockKey = lockedKey;
        const locked = stateOf();
        payload = inspectUniforms(locked);
        paletteHandle.setInspect(payload);
        guides?.update(inspectGuide(locked, payload));
        return;
      }

      focus = needsCursor(mode) ? focusColumn() : null;

      // Finche' la quota non e' stata scelta, la fetta segue il suolo che si sta
      // guardando. Una quota assoluta di default cadrebbe dentro la collina — la
      // citta' sta a quaranta voxel sul mare — e il primo colpo d'occhio sarebbe
      // l'interno della terra invece del piano di un edificio. Al primo tasto o
      // al primo trascinamento diventa assoluta e smette di seguire.
      if (mode === INSPECT_MODE.slice && !sliceChosen) {
        const ground = focusColumn();
        if (ground !== null) sliceZ = clampSliceZ(ground.z + INSPECT.sliceCoarse);
      }
      blockKey = null;
      blockRect = null;
      subject = mode === INSPECT_MODE.xray ? subjectAt(focus) : null;

      if (focus !== null && streets !== null) {
        const block = streets.blockAt(focus.x, focus.y);
        blockKey = streets.keyOf(block);
        if (mode === INSPECT_MODE.block) blockRect = streets.blockRect(block);
      }

      const state = stateOf();
      payload = inspectUniforms(state);
      paletteHandle.setInspect(payload);
      // Le guide leggono le uniform gia' composte, non lo stato: il contorno che
      // si vede e' per costruzione il rettangolo che il fragment sta usando.
      guides?.update(inspectGuide(state, payload));
    },

    onPointerMove(clientX: number, clientY: number): void {
      pointerX = clientX;
      pointerY = clientY;
      pointerInside = true;
    },

    onPointerLeave(): void {
      pointerInside = false;
    },

    onPointerDown(event: PointerEvent): void {
      if (event.button !== 0) return;
      studyPointerDown = true;
      studyPointerX = event.clientX;
      studyPointerY = event.clientY;
    },

    /**
     * Il clic che sceglie un isolato, e quello che lo molla.
     *
     * Sta su `pointerup` e non su `pointerdown` perche' fino al rilascio non si
     * sa ancora se il gesto fosse un clic o l'inizio di una rotazione.
     */
    onPointerUp(event: PointerEvent): void {
      if (!studyPointerDown || event.button !== 0) return;
      studyPointerDown = false;
      if (mode !== INSPECT_MODE.block) return;
      if (options.toolActive()) return;
      const moved = Math.abs(event.clientX - studyPointerX)
        + Math.abs(event.clientY - studyPointerY);
      if (moved > STUDY_CLICK_SLOP) return;

      // La colonna si risolve **prima** di toccare la camera: il raggio deve
      // partire dall'inquadratura in cui il giocatore ha visto quello che ha
      // cliccato, non da quella in cui lo si sta per portare. E si risolve su
      // cio' che si vede, non sul terreno: cliccando una torre si sceglie il
      // **suo** isolato.
      const cell = options.pointedCellAt(event.clientX, event.clientY);
      if (cell === null) return;

      // Un clic dentro lo studio sceglie un **altro** isolato invece di mollare e
      // basta: mollare ha gia' il suo tasto, e dover uscire per cambiare soggetto
      // farebbe perdere l'inquadratura a ogni confronto fra due isolati. L'angolo
      // di orbita resta dov'e', cosi' i due isolati si guardano dallo stesso lato.
      lockBlock(cell);
    },
  };
}
