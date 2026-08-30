import { FACE_NEIGHBOUR_OFFSETS, FACE_NZ } from '../../world/chunkCoords';
import { SURFACE_KIND } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { facadeInset } from './carveMarks';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import {
  LATERAL_FACES,
  blockAt,
  emitRuns,
  facadeAt,
  facadeBox,
  facadeHorizontalAxis,
  hasSurfaceFace,
  type MicroGeometryWriter,
  type SurfaceCells,
} from './microGeometry';

/**
 * Come un edificio **tocca la strada**: la soglia e l'insegna di fronte.
 *
 * **La responsabilita' e' l'attacco a terra**, e sta accanto a `microCrown.ts`
 * come il basso sta all'alto: quello disegna la linea con cui un volume finisce
 * contro il cielo, questo la linea con cui comincia sul marciapiede. In mezzo
 * ci sono i tre moduli che gia' c'erano.
 *
 * **L'unico segnale di commercio che il mesher ha e' il portale**, e vale la pena
 * dirlo per intero: il commerciale riusa `SURFACE_KIND.habitat` — i tre bit alti
 * sono pieni, e `classSurface` mappa quattro usi su tre linguaggi — quindi «qui
 * c'e' un negozio» non e' una superficie che si possa leggere. Si legge la
 * **posizione**: la colonna dell'ingresso, larga una cella come `onPortal` la
 * scrive, e la riga subito sopra. Tutto in questo modulo e' ancorato li'.
 *
 * **Nessuno dei due tira un dado.** Una soglia e un cassonetto insegna stanno
 * dove sta la porta, sempre; e' l'ingresso a essere raro, non l'oggetto. Sono
 * percio' **struttura** e non prop, e nella sequenza stanno sopra le tende.
 *
 * **Legge la maschera degli scavi, e non e' facoltativo.** La cella del portale
 * e' quasi sempre scavata da `threshold`, cioe' arretrata di tre sedicesimi: una
 * lastra tirata dal filo del muro resterebbe a mezz'aria davanti alla bocca del
 * vano invece di posarsi sul suo fondo. E' la stessa cura che `microStreet.ts`
 * prende per le calate.
 */

const U = MESH_UNITS_PER_VOXEL;

/**
 * Il gradino d'ingresso: la lastra su cui la porta poggia.
 *
 * **L'aggancio e' il piede del portale** — cella di portale con sotto qualcosa
 * che portale non e' — quindi ne compare **uno per ingresso** e non uno per
 * cella di ingresso, e corre lungo la larghezza della bocca. Senza, una porta
 * galleggia sul marciapiede: il vano di `threshold` la arretra, e l'occhio cerca
 * il piano su cui quel vano si appoggia.
 */
function emitDoorSteps(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  portals: readonly number[],
  marks: Uint8Array,
): boolean {
  for (const face of LATERAL_FACES) {
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    if (!emitRuns(writer, portals, {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.stone,
      hiddenFace: face ^ 1,
      // Il sottofaccia e' sepolto: la lastra e' spessa due sedicesimi e poggia
      // sul marciapiede, che il predicato pretende. Nasconderlo non e' un
      // risparmio opportunista — e' la faccia che nessuno puo' vedere.
      alsoHidden: 1 << FACE_NZ,
      has: (x, y, z) => hasSurfaceFace(padded, x, y, z, SURFACE_KIND.portal, face) &&
        !hasSurfaceFace(padded, x, y, z - 1, SURFACE_KIND.portal, face) &&
        // Le serve aria davanti: sporge oltre il filo, e sotto un volume non ci sta.
        blockAt(padded, x + normal[0], y + normal[1], z) === 0 &&
        // E le serve un marciapiede sotto. Un ingresso con l'aria davanti e
        // sotto e' una botola in quota, non una porta: la' un gradino
        // resterebbe sospeso, ed e' il difetto che `emitBalconies` evita
        // chiedendo la terrazza invece dell'aria.
        blockAt(padded, x + normal[0], y + normal[1], z - 1) !== 0,
      // Parte dal fondo del vano — di qui l'`inset` — e arriva tre sedicesimi
      // oltre il filo della parete: e' la lastra che raccorda i due piani.
      box: (x, y, z, length) => facadeBox(
        x, y, z, face, 0, length * U, 0, 2, 6, facadeInset(marks, x, y, z, face),
      ),
    })) {
      return false;
    }
  }
  return true;
}

/**
 * Il cassonetto insegna: la lama accesa **parallela** al muro, sopra la porta.
 *
 * **Non duplica `emitSigns`, lo completa.** Quella e' l'insegna a bandiera —
 * ortogonale alla facciata, sporgente di otto sedicesimi, tirata a dado su una
 * cella su sei — e da sola dice «qui c'e' un'attivita'» ma non disegna un fronte.
 * Questa e' la fascia orizzontale che corre sopra la vetrina, compare **su ogni**
 * ingresso, e sta a `v 1..6`: sotto la frangia della tenda, che occupa da sei in
 * su. Le tre insieme sono un negozio; una sola e' un cartello su un muro.
 *
 * Esce `luminous`, quindi di notte si accende passando dal ramo che il fragment
 * ha gia': nessun materiale nuovo, nessuno slot nuovo.
 */
function emitShopFascias(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  facade: readonly number[][],
  marks: Uint8Array,
): boolean {
  for (let i = 0; i < LATERAL_FACES.length; i++) {
    const face = LATERAL_FACES[i];
    const normal = FACE_NEIGHBOUR_OFFSETS[face];
    if (!emitRuns(writer, facade[i], {
      runAxis: facadeHorizontalAxis(face),
      palette: PALETTE_SLOTS.metalBrass,
      hiddenFace: face ^ 1,
      surface: SURFACE_KIND.luminous,
      // La riga **subito sopra** il portale, non `frontage`: quello scandisce
      // cinque celle in giu' e risponde vero per tutto il piano terra, dove una
      // fascia accesa a ogni quota sarebbe una lanterna, non un'insegna.
      has: (x, y, z) => facadeAt(padded, x, y, z, face) === SURFACE_KIND.habitat &&
        hasSurfaceFace(padded, x, y, z - 1, SURFACE_KIND.portal, face) &&
        blockAt(padded, x + normal[0], y + normal[1], z) === 0,
      box: (x, y, z, length) => facadeBox(
        x, y, z, face, 0, length * U, 1, 6, 2, facadeInset(marks, x, y, z, face),
      ),
    })) {
      return false;
    }
  }
  return true;
}

/**
 * L'attacco a terra, in una chiamata sola. **E' struttura**, come il filo del
 * tetto: nella sequenza sta sopra i prop.
 */
export function appendThresholdDetail(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  cells: SurfaceCells,
  marks: Uint8Array,
): boolean {
  if (!emitDoorSteps(padded, writer, cells.bySurface[SURFACE_KIND.portal], marks)) return false;
  return emitShopFascias(padded, writer, cells.facadeByFace, marks);
}
