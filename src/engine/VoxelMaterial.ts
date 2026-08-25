import {
  Color,
  DoubleSide,
  FrontSide,
  Matrix4,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  type DepthTexture,
} from 'three';
import { toPaletteArray } from './palette';
import { isActive, needsCap, type InspectUniforms } from './inspect';
import { FACE_NORMALS, sunDirection } from './lighting';
import type { Atmosphere } from './themes/theme';
import { vertexShader } from './shaders/voxel.vert';
import { buildFragmentShader } from './shaders/voxel.frag';

/**
 * Unico ShaderMaterial condiviso da tutti i chunk.
 *
 * Il colore arriva esclusivamente dalla palette: gli attributi di vertice
 * portano l'indice (`aPalette`) e la direzione della faccia (`aFace`), mai un
 * colore RGB. Nessun materiale PBR, nessuna texture, nessuna luce di Three.
 *
 * La luce si calcola nel **fragment shader**, non nel vertex: serve cosi' per
 * l'ombra proiettata e per il jitter per voxel, che sono entrambi per-pixel. Lo
 * shading resta comunque piatto, perche' indice di palette e di faccia sono
 * costanti sui quattro vertici di un quad e i varying non interpolano nulla.
 *
 * La normale non e' un attributo di vertice: si legge da `uFaceNormal[aFace]`.
 * E' il motivo per cui aggiungere un sole vero non ha richiesto di toccare il
 * mesher ne' di ricostruire una sola geometria.
 *
 * Cambiare tema riscrive solo uniform.
 *
 * L'unica cosa che compone un sorgente diverso sono le **viste di ispezione**
 * dell'harness, e lo fanno una volta sola per sessione, alla prima attivazione:
 * il `discard` del retino non deve esistere nel programma di chi non le accende.
 */


export interface VoxelMaterialHandle {
  readonly material: ShaderMaterial;
  /**
   * Riscrive i colori nell'uniform. Le geometrie non vengono toccate: gli indici
   * di palette nei vertici restano validi.
   */
  setPalette(hexColors: readonly string[]): void;
  /**
   * Riscrive luce, nebbia, cielo e forza dell'AO. Come `setPalette`, e' un
   * aggiornamento di soli uniform.
   */
  setAtmosphere(atmosphere: Atmosphere): void;
  /** Aggiorna la sola fase di acqua ed emissivi; non invalida geometrie. */
  setTime(seconds: number): void;
  /**
   * Quanto e' notte, 0..1. Governa la sola luce che esce dalle facciate accese:
   * di giorno il sole la coprirebbe comunque, e pagarla vorrebbe dire slavare
   * le facciate a mezzogiorno.
   */
  setNight(night: number): void;
  /**
   * Accende o spegne lo strato di nuvole, senza dimenticare com'era tarato.
   *
   * E' un interruttore del giocatore come il modo del ciclo solare, non un
   * livello di qualita': un tema che le nuvole non le ha resta identico in
   * entrambe le posizioni.
   */
  setClouds(on: boolean): void;
  /**
   * Quante finestre sono accese e quanto sono accese le insegne, 0..1.
   *
   * Sono due numeri e non una struttura perche' e' tutto cio' che il fragment
   * puo' distinguere: la grammatica `habitat` copre residenziale e commerciale
   * insieme, e non esiste un canale che dica a quale **edificio** appartenga un
   * voxel. La lettura e' quindi per citta' e per uso, mai per singolo edificio —
   * un quartiere vuoto in mezzo a una citta' piena non si spegne da solo.
   *
   * Il contrasto fra una torre e l'altra il frammento se lo **fabbrica** da un
   * gruppo di colonne, e non arriva da qui: vedi `nightWindows.ts`.
   */
  setVitality(homes: number, commerce: number): void;
  /**
   * Direzione di vista, per lo scattering della nebbia verso il sole.
   *
   * E' un uniform e non una derivata per-pixel perche' la camera e' ortografica:
   * tutti i raggi di vista sono paralleli, quindi un solo vettore per frame e'
   * esatto e non un'approssimazione.
   */
  setViewDirection(x: number, y: number, z: number): void;
  /** Dimensione del target, per ancorare il gradiente di nebbia al cielo. */
  setResolution(width: number, height: number): void;
  /**
   * Aggancia la shadow map. `strength` a 0 spegne il campionamento senza
   * ricompilare il programma: e' cosi' che il gating di qualita' puo' togliere
   * le ombre a runtime.
   */
  setShadow(options: {
    texture: DepthTexture | null;
    matrix: Matrix4;
    strength: number;
    texelSize: number;
    normalBias: number;
    softness: number;
  }): void;
  /**
   * Vista di ispezione: i tre numeri che escono da `inspectUniforms`.
   *
   * La prima attivazione compone la variante del fragment che contiene il
   * `discard`, e da li' in poi non si torna indietro: spegnere una vista
   * significa riscrivere il payload neutro, non ricompilare. Un taglio porta
   * `side` a `DoubleSide`, che e' stato del renderer letto a ogni draw e non
   * un define — quindi nemmeno quello ricompila.
   */
  setInspect(uniforms: InspectUniforms): void;
}

/**
 * Tinta e forza della luce urbana, quando il tema non le dichiara.
 *
 * Un ambra caldo: e' il colore che una finestra accesa e un'insegna hanno in
 * comune, e sulle facciate fredde di notte e' anche quello che le stacca dal
 * cielo. La forza e' bassa apposta — questa e' luce di rimbalzo, non un faro.
 */
const DEFAULT_SPILL = '#ffb469';

/**
 * Misurata a schermo, non scelta a tavolino: a 0,55 lo spill valeva tre volte
 * l'ambiente notturno e la facciata diventava una lampada. A 0,22 sta appena
 * sopra l'ambiente, che e' quello che si chiede a una luce di rimbalzo.
 */
const DEFAULT_SPILL_INTENSITY = 0.22;

export function createVoxelMaterial(hexColors: readonly string[], voxelSize: number): VoxelMaterialHandle {
  const paletteArray = toPaletteArray(hexColors);
  const faceNormals = FACE_NORMALS.map(([x, y, z]) => new Vector3(x, y, z));

  const sunDir = new Vector3(0, 0, 1);
  const sunColor = new Color(1, 1, 1);
  const skyColor = new Color(1, 1, 1);
  const bounceColor = new Color(1, 1, 1);
  const fogColor = new Color(1, 1, 1);
  const skyTopColor = new Color(1, 1, 1);
  const skyHorizonColor = new Color(1, 1, 1);
  const glassTint = new Color(1, 1, 1);
  const waterHighlight = new Color(1, 1, 1);
  const waterShallowTint = new Color(1, 1, 1);
  const cloudTint = new Color(1, 1, 1);
  const spillColor = new Color(1, 1, 1);
  const viewDirection = new Vector3(0, 0, -1);
  const resolution = new Vector2(1, 1);
  const shadowMatrix = new Matrix4();
  const inspectPlane = new Vector4(0, 0, 0, 1);
  const inspectRect = new Vector4(-1e9, -1e9, 1e9, 1e9);
  const inspectLensMin = new Vector4(0, 0, 0, 0);
  const inspectLensMax = new Vector3(0, 0, 0);
  const inspectGlowMin = new Vector3(0, 0, 0);
  const inspectGlowMax = new Vector3(0, 0, 0);
  /** Vero da quando la variante con il `discard` e' stata composta. */
  let inspectCompiled = false;

  /**
   * Lo strato di nuvole del tema in vigore, e se il giocatore lo vuole vedere.
   *
   * Due variabili e non una perche' sono due fatti indipendenti: il tema dice
   * quanto e' fitto un banco, l'interruttore se ce n'e' uno. Tenendo il primo da
   * parte, riaccendere non deve rileggere il tema — e spegnere non lo perde.
   */
  let deckAmount = 0;
  let cloudsOn = true;

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader: buildFragmentShader(false),
    uniforms: {
      uPalette: { value: paletteArray },
      uFaceNormal: { value: faceNormals },
      uVoxelSize: { value: voxelSize },

      uSunDirection: { value: sunDir },
      uSunColor: { value: sunColor },
      uSunWrap: { value: 0.3 },
      uSkyColor: { value: skyColor },
      uBounceColor: { value: bounceColor },
      uSkyOcclusion: { value: 0 },
      uColorJitter: { value: 0 },

      uFogColor: { value: fogColor },
      uFogDensity: { value: 0 },
      uFogSkyBlend: { value: 0 },
      uFogHeightBase: { value: 0 },
      uFogHeightFalloff: { value: 0 },
      uFogAltitudeLift: { value: 0 },
      uFogSunTint: { value: 0 },
      uSkyTopColor: { value: skyTopColor },
      uSkyHorizonColor: { value: skyHorizonColor },
      uViewDirection: { value: viewDirection },
      uResolution: { value: resolution },

      uCloudHeight: { value: 0 },
      uCloudThickness: { value: 1 },
      // Zero: lo strato non esiste finche' un tema non lo dichiara, e il
      // fragment esce dal ramo sul primo confronto.
      uCloudAmount: { value: 0 },
      uCloudCoverage: { value: 0 },
      uCloudCellSize: { value: 1 },
      uCloudScale: { value: 1 },
      uCloudSpeed: { value: 0 },
      uCloudTint: { value: cloudTint },
      uCloudTintBlend: { value: 0 },

      uShadowMap: { value: null },
      uShadowMatrix: { value: shadowMatrix },
      uShadowStrength: { value: 0 },
      uShadowTexel: { value: 1 / 2048 },
      uShadowNormalBias: { value: 0 },
      uShadowSoftness: { value: 1 },

      // Forza dell'occlusione ambientale per-vertice, controllata dal tema.
      uAoStrength: { value: 0 },
      uGlassTint: { value: glassTint },
      uGlassLift: { value: 0 },
      uTime: { value: 0 },
      uWaterHighlight: { value: waterHighlight },
      uWaterShallowTint: { value: waterShallowTint },
      uWaterStrength: { value: 0 },
      uWaterScale: { value: 0.1 },
      uWaterSpeed: { value: 0 },
      uWaterCalm: { value: 0 },
      uWaterGlitter: { value: 0 },
      uEmissiveStrength: { value: 0.35 },
      uSpillColor: { value: spillColor },
      uNight: { value: 0 },
      // I default valgono per chi non ha una simulazione dietro — il diorama,
      // le scene di misura — e sono il comportamento che il materiale aveva
      // prima che l'economia potesse accendere le luci.
      uLitHomes: { value: 0.28 },
      uLitSigns: { value: 1 },

      uInspectPlane: { value: inspectPlane },
      uInspectRect: { value: inspectRect },
      uInspectVeil: { value: 0 },
      uInspectInside: { value: 1 },
      uInspectLensMin: { value: inspectLensMin },
      uInspectLensMax: { value: inspectLensMax },
      uInspectGlowMin: { value: inspectGlowMin },
      uInspectGlowMax: { value: inspectGlowMax },
    },
    side: FrontSide,
    transparent: false,
  });

  return {
    material,
    setPalette(next: readonly string[]): void {
      // Scrittura in place: Three confronta con la propria cache e ricarica
      // l'uniform, senza ricompilare il programma ne toccare le geometrie.
      paletteArray.set(toPaletteArray(next));
    },
    setAtmosphere(atmosphere: Atmosphere): void {
      const [sx, sy, sz] = sunDirection(atmosphere.sun.azimuth, atmosphere.sun.elevation);
      sunDir.set(sx, sy, sz);

      // setStyle con SRGBColorSpace porta il colore in spazio lineare, come i
      // colori della palette: la miscela nel fragment shader avviene li'.
      // L'intensita' e' premoltiplicata nel colore, cosi' lo shader ha un solo
      // vettore per termine invece di un colore piu' uno scalare.
      sunColor.setStyle(atmosphere.sun.color, SRGBColorSpace).multiplyScalar(atmosphere.sun.intensity);
      skyColor
        .setStyle(atmosphere.skyLight.color, SRGBColorSpace)
        .multiplyScalar(atmosphere.skyLight.intensity);
      bounceColor
        .setStyle(atmosphere.bounceLight.color, SRGBColorSpace)
        .multiplyScalar(atmosphere.bounceLight.intensity);
      material.uniforms['uSunWrap'].value = atmosphere.sun.wrap;
      material.uniforms['uSkyOcclusion'].value = atmosphere.skyOcclusion;
      material.uniforms['uColorJitter'].value = atmosphere.colorJitter;

      fogColor.setStyle(atmosphere.fog.color, SRGBColorSpace);
      skyTopColor.setStyle(atmosphere.sky.top, SRGBColorSpace);
      skyHorizonColor.setStyle(atmosphere.sky.horizon, SRGBColorSpace);
      material.uniforms['uFogDensity'].value = atmosphere.fog.density;
      material.uniforms['uFogSkyBlend'].value = atmosphere.fog.skyBlend;
      material.uniforms['uFogHeightBase'].value = atmosphere.fog.heightBase;
      material.uniforms['uFogHeightFalloff'].value = atmosphere.fog.heightFalloff;
      material.uniforms['uFogAltitudeLift'].value = atmosphere.fog.altitudeLift;
      material.uniforms['uFogSunTint'].value = atmosphere.fog.sunTint;

      // Lo strato di nuvole. Il tema che non lo dichiara scrive `amount: 0`, che
      // nel fragment e' il ramo che esce subito: il resto dei numeri non viene
      // nemmeno letto, e non serve un secondo programma per farne a meno.
      deckAmount = atmosphere.cloudDeck?.amount ?? 0;
      const deck = atmosphere.cloudDeck;
      material.uniforms['uCloudHeight'].value = deck?.height ?? 0;
      material.uniforms['uCloudThickness'].value = deck?.thickness ?? 1;
      material.uniforms['uCloudAmount'].value = cloudsOn ? deckAmount : 0;
      material.uniforms['uCloudCoverage'].value = deck?.coverage ?? 0;
      material.uniforms['uCloudCellSize'].value = Math.max(1e-3, deck?.cellSize ?? 1);
      // Mai zero: e' un divisore del punto di attraversamento.
      material.uniforms['uCloudScale'].value = Math.max(1e-3, deck?.scale ?? 1);
      material.uniforms['uCloudSpeed'].value = deck?.speed ?? 0;
      cloudTint.setStyle(deck?.tint ?? '#ffffff', SRGBColorSpace);
      material.uniforms['uCloudTintBlend'].value = deck?.tint === undefined ? 0 : 1;

      glassTint.setStyle(atmosphere.glassTint ?? '#ffffff', SRGBColorSpace);
      waterHighlight.setStyle(atmosphere.water?.highlight ?? atmosphere.fog.color, SRGBColorSpace);
      // Il fondale sfuma verso la riva: senza una tinta propria il bassofondo
      // resterebbe il mare aperto con un'onda piu' corta, che non e' la stessa
      // cosa. In mancanza si ripiega sul riflesso, e il bassofondo si spegne.
      waterShallowTint.setStyle(
        atmosphere.water?.shallowTint ?? atmosphere.water?.highlight ?? atmosphere.fog.color,
        SRGBColorSpace,
      );
      material.uniforms['uAoStrength'].value = atmosphere.aoStrength;
      material.uniforms['uGlassLift'].value = atmosphere.glassLift ?? 0;
      material.uniforms['uWaterStrength'].value = atmosphere.water?.strength ?? 0;
      material.uniforms['uWaterScale'].value = atmosphere.water?.scale ?? 0.1;
      material.uniforms['uWaterSpeed'].value = atmosphere.water?.speed ?? 0;
      material.uniforms['uWaterCalm'].value = atmosphere.water?.calm ?? 0.5;
      material.uniforms['uWaterGlitter'].value = atmosphere.water?.glitter ?? 0;
      material.uniforms['uEmissiveStrength'].value = atmosphere.emissiveStrength ?? 0.35;

      // La tinta con cui una facciata accesa schiarisce quello che ha attorno.
      // E' del tema e **non** dell'emettitore: il frammento che riceve la luce
      // non sa chi gliela manda, e dirglielo costerebbe bit che non ci sono.
      // Un'insegna rossa e una cyan schiariscono quindi il muro con lo stesso
      // colore, ed e' un limite dichiarato, non una svista.
      spillColor
        .setStyle(atmosphere.nightSpill?.color ?? DEFAULT_SPILL, SRGBColorSpace)
        .multiplyScalar(atmosphere.nightSpill?.intensity ?? DEFAULT_SPILL_INTENSITY);
    },
    setNight(night: number): void {
      material.uniforms['uNight'].value = night;
    },
    setClouds(on: boolean): void {
      cloudsOn = on;
      // Un uniform a zero, non un programma diverso: spegnere le nuvole non deve
      // ricompilare niente, come non lo fa spegnere le ombre.
      material.uniforms['uCloudAmount'].value = on ? deckAmount : 0;
    },
    setVitality(homes: number, commerce: number): void {
      material.uniforms['uLitHomes'].value = homes;
      material.uniforms['uLitSigns'].value = commerce;
    },
    setTime(seconds: number): void {
      material.uniforms['uTime'].value = seconds;
    },
    setViewDirection(x: number, y: number, z: number): void {
      viewDirection.set(x, y, z);
    },
    setResolution(width: number, height: number): void {
      resolution.set(width, height);
    },
    setShadow(options): void {
      material.uniforms['uShadowMap'].value = options.texture;
      shadowMatrix.copy(options.matrix);
      material.uniforms['uShadowStrength'].value = options.strength;
      material.uniforms['uShadowTexel'].value = options.texelSize;
      material.uniforms['uShadowNormalBias'].value = options.normalBias;
      material.uniforms['uShadowSoftness'].value = options.softness;
    },
    setInspect(uniforms: InspectUniforms): void {
      if (!inspectCompiled && isActive(uniforms)) {
        inspectCompiled = true;
        material.fragmentShader = buildFragmentShader(true);
        material.needsUpdate = true;
      }

      inspectPlane.set(uniforms.plane[0], uniforms.plane[1], uniforms.plane[2], uniforms.plane[3]);
      inspectRect.set(uniforms.rect[0], uniforms.rect[1], uniforms.rect[2], uniforms.rect[3]);
      inspectLensMin.set(
        uniforms.lensMin[0],
        uniforms.lensMin[1],
        uniforms.lensMin[2],
        uniforms.lensMin[3],
      );
      inspectLensMax.set(uniforms.lensMax[0], uniforms.lensMax[1], uniforms.lensMax[2]);
      inspectGlowMin.set(uniforms.glowMin[0], uniforms.glowMin[1], uniforms.glowMin[2]);
      inspectGlowMax.set(uniforms.glowMax[0], uniforms.glowMax[1], uniforms.glowMax[2]);
      material.uniforms['uInspectVeil'].value = uniforms.veil;
      material.uniforms['uInspectInside'].value = uniforms.inside;

      // Un taglio che **apre** i volumi ha bisogno delle back-face per tapparsi;
      // una vista che vela no, e nemmeno un taglio di solo rettangolo, che toglie
      // per intero cio' che sta fuori senza sezionare niente. Tenerle accese li'
      // costerebbe overdraw per niente.
      material.side = needsCap(uniforms) ? DoubleSide : FrontSide;
    },
  };
}
