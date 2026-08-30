import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CameraInput, type CameraCommands } from '../CameraInput';
import {
  FOV_STEP,
  MAX_FOV,
  MAX_PITCH,
  MIN_FOV,
  MIN_PITCH,
  REST_FOV,
  STREET_NEAR,
  YAW_STEP,
} from './streetEye';

/**
 * La camera all'altezza degli occhi: prospettica, ferma, con la sola testa libera.
 *
 * **E' un secondo controller, e non un modo di `IsoCameraController`.** Quel file
 * non si limita a dire che l'orbita e' una manovra: ne da' la prova, ed e'
 * «tutto il resto — proiezione, zoom, near e far — e' lo stesso codice». Applicata
 * qui, quella prova fallisce su ogni riga. La proiezione e' un'altra; lo zoom non
 * e' `camera.zoom` ma il campo visivo; near e far non possono restare generosi,
 * perche' in prospettiva la profondita' e' iperbolica e paga il loro rapporto;
 * l'inclinazione deve **attraversare lo zero**, che e' precisamente il valore che
 * `MIN_PITCH = 12°` vieta la'; e non c'e' nessun pan, nessuno scatto di novanta
 * gradi, nessun target da vincolare all'AABB. Non e' una manovra, e' un'altra
 * camera con i vestiti della prima.
 *
 * **Cio' che invece si riusa per intero e' l'input**, e non e' un risparmio ma la
 * cosa giusta: `CameraInput` sceglie fra girare e panare guardando
 * `commands.orbitMode`, e dichiarandolo `true` il trascinamento gira su ogni
 * tasto e `panByPixels` non viene mai chiamato. E' la stessa frase che quel file
 * scrive per lo studio di un soggetto — «li' non c'e' un pan da cui distinguerlo»
 * — e a terra non c'e' nemmeno.
 *
 * Dove si possa stare non lo decide questo file: lo decide `streetEye.ts`, che e'
 * puro e non conosce Three. Qui c'e' solo come la camera guarda.
 */

export interface StreetCameraOptions {
  readonly voxelSize?: number;
  /**
   * Il piano lontano, in voxel.
   *
   * Arriva da fuori perche' la sola cosa che lo determina e' quanto e' grande il
   * mondo, e il mondo questo file non lo conosce. Non e' una manopola di
   * distanza di disegno: la nebbia dei temi e' cosi' rada che il velo si chiude
   * dopo migliaia di voxel, quindi tagliare prima della diagonale dell'isola
   * mostrerebbe il taglio invece di nasconderlo. A limitare il costo c'e' il
   * campo visivo, piu' il culling per chunk che gira gia' sul frustum.
   */
  readonly far?: number;
}

export class StreetCameraController implements CameraCommands {
  readonly camera: PerspectiveCamera;

  private readonly voxelSize: number;
  private readonly input = new CameraInput(this);

  /** Il punto d'occhio, in coordinate di mondo. Lo sposta solo `setEye`. */
  private readonly eye = new Vector3();
  private readonly forward = new Vector3();
  private readonly focus = new Vector3();

  private yaw = 0;
  private pitch = 0;

  constructor(viewportWidth: number, viewportHeight: number, options: StreetCameraOptions = {}) {
    this.voxelSize = options.voxelSize ?? 1;
    const aspect = viewportWidth / Math.max(1, viewportHeight);

    this.camera = new PerspectiveCamera(
      REST_FOV,
      aspect,
      STREET_NEAR * this.voxelSize,
      (options.far ?? 1024) * this.voxelSize,
    );
    this.camera.up.set(0, 0, 1); // mondo Z-up
    this.applyTransform();
  }

  attach(element: HTMLElement): void {
    this.input.attach(element);
  }

  detach(element: HTMLElement): void {
    this.input.detach(element);
  }

  setViewport(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Posa l'occhio e gli da' una direzione di partenza.
   *
   * Lo `yaw` arriva da fuori perche' e' quello dell'isometrica da cui si sta
   * scendendo: continuare a guardare dalla stessa parte e' cio' che rende il
   * passaggio un cambio di scala invece di un teletrasporto. L'inclinazione
   * riparte dall'orizzonte, che e' dove guarda chi si e' appena fermato in mezzo
   * a una strada.
   */
  setEye(x: number, y: number, z: number, yaw: number): void {
    this.eye.set(x * this.voxelSize, y * this.voxelSize, z * this.voxelSize);
    this.yaw = yaw;
    this.pitch = 0;
    this.applyTransform();
  }

  /**
   * Sempre `true`, ed e' l'unica riga che serve perche' `CameraInput` faccia la
   * cosa giusta: ogni tasto del mouse gira, nessuno pana.
   */
  get orbitMode(): boolean {
    return true;
  }

  /**
   * Gira la testa.
   *
   * Lo yaw non si normalizza e non si clampa: gli servirebbe solo per essere
   * mostrato, e nessuno lo mostra. L'inclinazione si ferma cinque gradi prima
   * dello zenit e del nadir, dove `lookAt` degenera perche' la direzione di
   * vista diventa parallela a `up` — lo stesso scoglio di `MAX_PITCH`
   * nell'isometrica e di `FALLBACK_UP` in `SunShadow`, ma qui e' l'**unico**:
   * sotto non c'e' nessun `1 / sin(pitch)` da far esplodere, ed e' per questo
   * che di la' l'orizzonte era vietato e qui e' il punto di partenza.
   *
   * **Il verso verticale e' opposto a quello dell'orbita, e non per svista.**
   * `CameraInput` passa `dPitch` con il segno dei pixel perche' girando attorno
   * a un soggetto si tira il *soggetto*: tirando verso il basso ci si aspetta di
   * salire sopra di lui. Qui non si gira attorno a niente — si muove una testa —
   * e la stessa regola diventa il contrario di quello che la mano si aspetta:
   * trascinando in basso si guarda **in basso**. Non e' una preferenza sui gusti
   * di chi gioca, e' che i due gesti hanno due oggetti diversi.
   */
  orbitBy(dYaw: number, dPitch: number): void {
    // La sensibilita' segue il campo visivo perche' cio' che si percepisce non
    // sono i gradi girati ma i **pixel** percorsi dalla scena: a campo stretto
    // lo stesso angolo spazza piu' schermo, e senza la correzione mirare col
    // teleobiettivo diventa impossibile. Il fattore e' relativo al campo di
    // riposo, quindi a riposo la sensibilita' e' quella che `CameraInput` ha
    // gia' scelto.
    const gain = this.camera.fov / REST_FOV;
    this.yaw += dYaw * gain;
    this.pitch = MathUtils.clamp(this.pitch - dPitch * gain, MIN_PITCH, MAX_PITCH);
    this.applyTransform();
  }

  /**
   * `Q`/`E`: un passo di rotazione fisso.
   *
   * Non c'e' nessuna griglia di scatti a cui agganciarsi — quella teneva la
   * citta' sulle sue diagonali, e da terra non significa niente — quindi e' un
   * passo e basta, come lo e' in orbita.
   */
  rotate(direction: number): void {
    this.orbitBy((direction > 0 ? 1 : -1) * YAW_STEP, 0);
  }

  /**
   * La rotella cambia il **campo visivo**, non la posizione.
   *
   * Non e' lo zoom dell'ortografica travestito: li' si stringe l'inquadratura
   * senza toccare la prospettiva, qui stringere il campo appiattisce la scena —
   * e' l'effetto teleobiettivo, e a campo molto stretto si torna a vedere la
   * citta' come la vedeva la camera da cui si e' appena scesi.
   */
  zoomBy(steps: number): void {
    const next = this.camera.fov * Math.pow(FOV_STEP, -steps);
    this.camera.fov = MathUtils.clamp(next, MIN_FOV, MAX_FOV);
    this.camera.updateProjectionMatrix();
  }

  /**
   * `F`: rimette l'orizzonte in piano.
   *
   * E' la stessa domanda che `frameAll` risolve di sopra — «rimetti a posto la
   * vista» — con l'unica risposta che qui ha senso: l'occhio non si sposta,
   * perche' e' stato scelto, e non c'e' niente da inquadrare. Uscire e' mestiere
   * di `Esc`, non di questo tasto: `F` a terra deve poter raddrizzare senza
   * buttare via il punto in cui ci si e' messi.
   */
  frameAll(): void {
    this.pitch = 0;
    this.applyTransform();
  }

  /**
   * Irraggiungibile finche' `orbitMode` e' `true`, ed e' per questo che c'e': la
   * firma di `CameraCommands` la pretende, e un corpo vuoto senza spiegazione
   * sembrerebbe una dimenticanza invece di una conseguenza.
   */
  panByPixels(): void {}

  /**
   * Il punto di terra sotto al cursore serviva a ruotare attorno a cio' che si
   * guarda; qui non si ruota attorno a niente e non c'e' un piano di terra su
   * cui invertire la proiezione. Il cursore lo legge chi posa l'occhio, e lo
   * legge dagli eventi, non da qui.
   */
  setHover(): void {}

  clearHover(): void {}

  get fov(): number {
    return this.camera.fov;
  }

  get yawDegrees(): number {
    return MathUtils.radToDeg(this.yaw);
  }

  get pitchDegrees(): number {
    return MathUtils.radToDeg(this.pitch);
  }

  /** Il punto d'occhio in coordinate di mondo: lo legge la scatola dell'ombra. */
  get eyePosition(): Vector3 {
    return this.eye;
  }

  private applyTransform(): void {
    const cosPitch = Math.cos(this.pitch);
    this.forward.set(
      Math.cos(this.yaw) * cosPitch,
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
    );
    this.camera.position.copy(this.eye);
    // Un punto a un voxel davanti basta: `lookAt` normalizza, e tenerlo vicino
    // evita che la distanza entri nella precisione dell'orientamento.
    this.focus.copy(this.eye).add(this.forward);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
}
