import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { PART, box, type Part } from '../landmarks/parts';
import { hashCoords, unitAt } from '../rng';
import { SURFACE_KIND, type SurfaceKind } from '../visualBlock';
import type { ArcologyRecipe } from './config';

/**
 * Spezza i corpi delle arcologie in corsi, senza toccarne un voxel.
 *
 * **Il difetto che risolve si vede solo a schermo.** Una ricetta scrive un corpo
 * come *una* shell alta settanta o centotrenta quote, con una palette e un
 * linguaggio soli: a distanza di gioco quel corpo e' un blocco: la stessa tinta
 * dal podio alla corona, e nessuna riga orizzontale che dica dove sta un piano.
 * Il caso peggiore e' il vetro — `glassDeep` con `luminous` mescola verso il blu
 * profondo su tutta la faccia e ci aggiunge la sua fascia: un parallelepipedo
 * azzurro uniforme, che e' esattamente cio' che una megastruttura non deve
 * sembrare.
 *
 * **La variazione e' di colore, mai di geometria, e non e' un ripiego.** Le celle
 * che questo modulo produce sono le stesse identiche di prima — stesso perimetro,
 * stessa quota, stesso conto di voxel — quindi finestra di cielo, riempimento,
 * connessione, snellezza e tetto di chunk restano quelli misurati sulla ricetta
 * originale. Cambia solo cio' che il fragment shader legge: la palette del corso,
 * il linguaggio di facciata e la riga di cornice in cima a ciascuno.
 *
 * **Sta qui e non nelle ricette perche' e' una regola, non una forma.** I due
 * cataloghi — le otto storiche e le quattro variazioni — restano tabelle di
 * quote leggibili: chi ne scrive una nuova continua a dichiarare un corpo solo,
 * e l'articolazione gliela mette questo modulo. Il verso opposto — la cornice
 * scritta a mano corso per corso — moltiplicherebbe per sei le righe di ogni
 * ricetta e divergerebbe alla prima che qualcuno tocca.
 */

export const ARCOLOGY_FACADE = {
  /** Separa questi tiri da ogni altro hash sulla stessa ricetta. */
  salt: 0x51a7_c3d9,

  /**
   * Sotto questa altezza un corpo si legge gia' come un elemento solo.
   *
   * Non e' una taratura di gusto: sotto le venticinque quote circa il corpo sta
   * dentro un colpo d'occhio, e spezzarlo darebbe un retino invece di una scala.
   * Sopra, la faccia e' abbastanza lunga che l'occhio cerca un riferimento e non
   * lo trova.
   */
  minBodyHeight: 26,

  /** Altezza nominale di un corso; il numero di corsi si deriva da questa. */
  courseHeight: 15,

  /** Nessun corso scende sotto questa altezza, nemmeno assorbendo il resto. */
  minCourse: 6,

  /**
   * Scarto massimo, in quote, dall'altezza media di un corso.
   *
   * **E' la meta' del punto.** Corsi tutti uguali sono un righello, e un righello
   * si legge come una texture ripetuta invece che come piani veri. Lo scarto
   * rende irregolare il ritmo delle cornici, che e' cio' che a distanza dice
   * «edificio» invece di «pattern».
   */
  drift: 3,

  /**
   * Quanto spesso un corso resta sulla tinta della ricetta.
   *
   * La maggioranza resta, e non per timidezza: la ricetta ha gia' scelto il tono
   * del corpo, e questo modulo non sta ridipingendola. I due toni vicini servono
   * a rompere la superficie, non a sostituirla.
   */
  toneShare: { body: 0.52, near: 0.8 },

  /** Quota di corsi che chiudono con una riga di cornice. */
  corniceShare: 0.55,

  /** Quota di corsi abitati che diventano un piano nobile in vetro. */
  lobbyShare: 0.18,
} as const;

/**
 * I toni con cui un corpo puo' variare, per slot di partenza.
 *
 * Il primo di ogni terna e' **la tinta della ricetta**: e' quella che la
 * maggioranza dei corsi conserva. Gli altri due sono i due vicini piu' prossimi
 * nella stessa famiglia, cioe' la variazione piu' piccola che la palette sappia
 * esprimere. Uno slot che non compare qui non varia affatto — metallo, tetti e
 * asfalto non sono corpi di facciata e un loro cambio di tono sarebbe rumore.
 */
const TONE_FAMILY: Readonly<Record<number, readonly [number, number, number]>> = {
  [PALETTE_SLOTS.glass]: [PALETTE_SLOTS.glass, PALETTE_SLOTS.glassDeep, PALETTE_SLOTS.glassPale],
  [PALETTE_SLOTS.glassDeep]: [PALETTE_SLOTS.glassDeep, PALETTE_SLOTS.glass, PALETTE_SLOTS.glassDark],
  [PALETTE_SLOTS.glassPale]: [PALETTE_SLOTS.glassPale, PALETTE_SLOTS.glass, PALETTE_SLOTS.concreteWhite],
  [PALETTE_SLOTS.glassDark]: [PALETTE_SLOTS.glassDark, PALETTE_SLOTS.glassDeep, PALETTE_SLOTS.glass],
  [PALETTE_SLOTS.concrete]: [PALETTE_SLOTS.concrete, PALETTE_SLOTS.concreteLight, PALETTE_SLOTS.stone],
  [PALETTE_SLOTS.concreteLight]: [PALETTE_SLOTS.concreteLight, PALETTE_SLOTS.concretePale, PALETTE_SLOTS.concrete],
  [PALETTE_SLOTS.concretePale]: [PALETTE_SLOTS.concretePale, PALETTE_SLOTS.concreteWhite, PALETTE_SLOTS.concreteLight],
  [PALETTE_SLOTS.concreteWhite]: [PALETTE_SLOTS.concreteWhite, PALETTE_SLOTS.concretePale, PALETTE_SLOTS.concreteLight],
  [PALETTE_SLOTS.stone]: [PALETTE_SLOTS.stone, PALETTE_SLOTS.stoneWarm, PALETTE_SLOTS.concrete],
  [PALETTE_SLOTS.stoneDeep]: [PALETTE_SLOTS.stoneDeep, PALETTE_SLOTS.stoneDark, PALETTE_SLOTS.stone],
};

/**
 * Il colore della riga che chiude un corso.
 *
 * E' il solaio visto di taglio, ed e' il dettaglio che a distanza di gioco toglie
 * piu' «blocco» di qualunque variazione di tinta: su una torre di vetro serve
 * chiara e opaca, sul cemento chiaro serve piu' scura della parete, o la riga
 * sparirebbe proprio dove il volume e' piu' piatto.
 */
const CORNICE: Readonly<Record<number, number>> = {
  [PALETTE_SLOTS.glass]: PALETTE_SLOTS.concretePale,
  [PALETTE_SLOTS.glassDeep]: PALETTE_SLOTS.concretePale,
  [PALETTE_SLOTS.glassPale]: PALETTE_SLOTS.concrete,
  [PALETTE_SLOTS.glassDark]: PALETTE_SLOTS.concretePale,
  [PALETTE_SLOTS.concrete]: PALETTE_SLOTS.concreteWhite,
  [PALETTE_SLOTS.concreteLight]: PALETTE_SLOTS.concreteWhite,
  [PALETTE_SLOTS.concretePale]: PALETTE_SLOTS.concrete,
  [PALETTE_SLOTS.concreteWhite]: PALETTE_SLOTS.concrete,
  [PALETTE_SLOTS.stone]: PALETTE_SLOTS.concretePale,
  [PALETTE_SLOTS.stoneDeep]: PALETTE_SLOTS.stoneDark,
};

/**
 * Un tiro in `[0, 1)` che dipende dalla parte e da nient'altro.
 *
 * Deve restare una funzione pura della parte, non dell'ordine di visita: le
 * ricette si costruiscono una volta sola all'import, ma i test confrontano la
 * stessa sagoma generata piu' volte e su quattro versi, e un contatore
 * condiviso li farebbe divergere.
 */
function unitOf(part: Part, salt: number): number {
  const base = hashCoords(ARCOLOGY_FACADE.salt + salt, part.x, part.y);
  return unitAt(base, part.z, part.height * 32 + part.palette);
}

/**
 * Le altezze dei corsi, che sommano esattamente a quella del corpo.
 *
 * La somma esatta non e' un dettaglio di comodo: e' cio' che rende questa
 * trasformazione a geometria invariata, e quindi cio' che lascia validi il
 * riempimento, la finestra di cielo e il tetto di chunk gia' misurati.
 */
function courseHeights(part: Part): readonly number[] {
  const count = Math.max(2, Math.round(part.height / ARCOLOGY_FACADE.courseHeight));
  const out: number[] = [];
  let left = part.height;

  for (let i = 0; i < count; i++) {
    const remaining = count - i;
    if (remaining === 1) {
      out.push(left);
      break;
    }
    const even = Math.round(left / remaining);
    const drift = Math.round((unitOf(part, 101 + i * 7) - 0.5) * ARCOLOGY_FACADE.drift * 2);
    // Il soffitto lascia comunque il minimo a ogni corso che deve ancora venire:
    // senza, un tiro generoso in basso spingerebbe l'ultimo sotto il minimo.
    const ceiling = left - (remaining - 1) * ARCOLOGY_FACADE.minCourse;
    const height = Math.max(ARCOLOGY_FACADE.minCourse, Math.min(ceiling, even + drift));
    out.push(height);
    left -= height;
  }

  return out;
}

/** La tinta di un corso: quella della ricetta, o uno dei due vicini di famiglia. */
function courseTone(part: Part, index: number): number {
  const family = TONE_FAMILY[part.palette];
  if (family === undefined) return part.palette;
  const roll = unitOf(part, 3 + index * 17);
  if (roll < ARCOLOGY_FACADE.toneShare.body) return family[0];
  if (roll < ARCOLOGY_FACADE.toneShare.near) return family[1];
  return family[2];
}

/**
 * Il linguaggio di facciata di un corso.
 *
 * **`luminous` scende a un corso solo, e questa e' la riga che toglie il blu.**
 * Quel linguaggio e' nato per un'insegna: mescola la faccia verso `glassDeep` e
 * ci accende sopra una fascia. Su una fascia funziona; steso su centotrenta
 * quote di corpo da' il parallelepipedo azzurro. Gli altri corsi passano a
 * `habitat`, che e' l'unico linguaggio con dei vetri veri — finestre piu' alte
 * che larghe, e di notte accese secondo l'occupazione.
 *
 * Un corso abitato ogni tanto diventa `civic`: e' il piano nobile, una lastra di
 * vetro continua invece della griglia di finestre, e a distanza e' la seconda
 * riga orizzontale che un corpo alto sa dare.
 */
function courseSurface(part: Part, index: number, accent: number): SurfaceKind {
  if (part.surface === SURFACE_KIND.luminous) {
    return index === accent ? SURFACE_KIND.luminous : SURFACE_KIND.habitat;
  }
  if (part.surface !== SURFACE_KIND.habitat) return part.surface;
  return unitOf(part, 53 + index * 29) < ARCOLOGY_FACADE.lobbyShare
    ? SURFACE_KIND.civic
    : part.surface;
}

/** La cornice di un corso, se gli tocca; l'ultimo conserva quella della ricetta. */
function corniceOf(part: Part, index: number, last: boolean): number | undefined {
  const slot = CORNICE[part.palette];
  if (slot === undefined || (last && part.cap !== undefined)) return part.cap;
  return unitOf(part, 31 + index * 13) < ARCOLOGY_FACADE.corniceShare ? slot : part.cap;
}

/**
 * Un corpo diventa i suoi corsi; tutto il resto passa invariato.
 *
 * Solo `shell` viene spezzata, e non per prudenza: e' la primitiva con cui le
 * ricette scrivono i corpi abitati, cioe' l'unica che porti davvero una facciata.
 * Montanti, impalcati, portici e podi sono elementi singoli, e un corso a meta'
 * di una guglia 3x3 sarebbe una tacca, non un piano.
 */
export function facadeCourses(part: Part): readonly Part[] {
  if (part.kind !== PART.shell) return [part];
  if (part.height < ARCOLOGY_FACADE.minBodyHeight) return [part];

  const heights = courseHeights(part);
  const accent = Math.min(heights.length - 1, Math.floor(unitOf(part, 7) * heights.length));
  const out: Part[] = [];
  let z = part.z;

  for (let i = 0; i < heights.length; i++) {
    const extra: { step?: number; chamfer?: number; cap?: number } = {};
    if (part.step !== undefined) extra.step = part.step;
    if (part.chamfer !== undefined) extra.chamfer = part.chamfer;
    const cap = corniceOf(part, i, i === heights.length - 1);
    if (cap !== undefined) extra.cap = cap;

    out.push(box(
      part.kind,
      part.x,
      part.y,
      part.w,
      part.h,
      z,
      heights[i],
      courseTone(part, i),
      courseSurface(part, i, accent),
      extra,
    ));
    z += heights[i];
  }

  return out;
}

/**
 * Lo stesso catalogo, con le facciate articolate.
 *
 * L'ordine delle chiavi si conserva — `Object.values` sui due cataloghi e' cio'
 * che definisce l'ordine di `ARCOLOGY_RECIPES`, e un test lo confronta.
 */
export function withFacadeCourses<K extends string>(
  recipes: Record<K, ArcologyRecipe>,
): Record<K, ArcologyRecipe> {
  const out = {} as Record<K, ArcologyRecipe>;
  for (const key of Object.keys(recipes) as K[]) {
    const recipe = recipes[key];
    out[key] = {
      ...recipe,
      parts: recipe.parts.map((stage) => stage.flatMap((part) => facadeCourses(part))),
    };
  }
  return out;
}
