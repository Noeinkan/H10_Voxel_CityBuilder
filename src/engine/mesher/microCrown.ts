import { FACE_NEIGHBOUR_OFFSETS, FACE_NZ, FACE_PX, FACE_PY } from '../../world/chunkCoords';
import { blockPalette, blockSurface, SURFACE_KIND, type SurfaceKind } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { roofInset } from './carveMarks';
import { MESH_UNITS_PER_VOXEL } from './meshTypes';
import {
  LATERAL_FACES,
  blockAt,
  emitPoints,
  emitRuns,
  interiorRoof,
  openRoof,
  propRoll,
  type ChunkOrigin,
  type MicroGeometryWriter,
} from './microGeometry';

/**
 * Come un edificio **finisce contro il cielo**: il filo del tetto e cio' che ci
 * sta sopra.
 *
 * **E' un modulo suo per la regola gia' applicata due volte in questa cartella**
 * — una responsabilita' nuova, un file nuovo — e la responsabilita' si nomina in
 * una riga. `microStreet.ts` veste il retro, `microDetail.ts` veste cio' che la
 * crescita aggiunge a facciata e tetto; qui si veste il **bordo**, che e' la
 * linea con cui un volume si stacca dallo sfondo. In isometrica quella linea e'
 * meta' di cio' che si legge di un edificio, e finora la portava il solo
 * parapetto di `emitRoofTech`, uguale su una casa, un capannone e un municipio.
 *
 * **Il segnale nuovo e' `facadeUnder`, e vale piu' di tutti gli emettitori che
 * lo usano.** Il mesher non sa che edificio ha sotto un tetto: `roofTech` e' un
 * cappello che non porta l'uso di cio' che copre, e per questo **tutti i tetti
 * della citta' erano identici**. Guardare quattro celle in giu' lungo la stessa
 * colonna costa quattro letture su celle gia' filtrate, e in cambio separa tre
 * linguaggi di coronamento: la gronda di una casa, il gocciolatoio di lamiera di
 * un capannone, il cornicione di un civico. Di notte fa lo stesso: una lanterna
 * sopra il civico, un fumaiolo sopra l'industria, un lucernario sopra l'abitato.
 *
 * **Nessun linguaggio di superficie nuovo e nessuno slot nuovo** (invarianti 4 e
 * 5): l'uso si legge da `SurfaceKind` gia' esistenti, e i prismi escono `utility`
 * tranne quelli che devono accendersi, che prendono `luminous` come l'insegna.
 *
 * **Due export perche' i due gruppi hanno gravita' diverse.** Il filo del tetto
 * e' **struttura** — sta nella sequenza sopra le tende, perche' e' la silhouette
 * e non un oggetto — mentre lanterne, ciminiere e comignoli sono **prop**, e
 * cadono con gli altri prop se il tetto dei quad arriva.
 */

const U = MESH_UNITS_PER_VOXEL;

// Sali: ogni domanda la sua moneta. Vedi `propRoll`.
const CHIMNEY_SALT = 0x2c7b_41e9;
const LANTERN_SALT = 0x6f13_a85d;
const STACK_SALT = 0xb428_5d31;
const SKYLIGHT_SALT = 0x37e6_9b04;

/** Comignoli sugli angoli di tetto abitati. Alto: l'aggancio e' gia' raro. */
const CHIMNEY_CHANCE = 0.2;

/** Coronamenti notturni, uno per uso. Bassi: pescano in mezzo al tetto. */
const LANTERN_CHANCE = 0.08;
const STACK_CHANCE = 0.06;
const SKYLIGHT_CHANCE = 0.1;

/**
 * Fin dove si cerca l'uso che sostiene un tetto.
 *
 * Quattro celle e non una: fra il cappello `roofTech` e la facciata ci possono
 * stare un'altra riga di cappello e una fascia d'accento, e fermarsi alla prima
 * direbbe «nessun uso» proprio sugli edifici piu' costruiti. Piu' in giu' non ha
 * senso: a quel punto il tetto galleggia su qualcosa che non lo sostiene.
 */
const USE_REACH = 4;

/**
 * L'uso che sostiene questo tetto, o `SURFACE_KIND.plain` se non ce n'e' uno.
 *
 * **Attraversa cio' che non e' un uso e si ferma nel vuoto.** Un secondo strato
 * di `roofTech`, una fascia `luminous`, un `utility` di impianto: sono tutti
 * cappelli o rivestimenti, e la domanda e' cosa c'e' **sotto** di loro. L'aria
 * invece e' una risposta: un impalcato in quota non ha un edificio sotto, e non
 * deve prendersi il cornicione di uno.
 *
 * L'acqua porta `WATER_CLASS` in questi stessi bit — bassofondo e canale
 * coincidono con `habitat` e `industrial` — e si riconosce dalla palette, come fa
 * gia' `facadeAt`.
 */
export function facadeUnder(padded: Uint8Array, x: number, y: number, z: number): number {
  for (let d = 1; d <= USE_REACH; d++) {
    if (z - d < -1) return SURFACE_KIND.plain;
    const block = blockAt(padded, x, y, z - d);
    if (block === 0) return SURFACE_KIND.plain;
    const surface = blockSurface(block);
    if (surface !== SURFACE_KIND.habitat && surface !== SURFACE_KIND.industrial &&
      surface !== SURFACE_KIND.civic) {
      continue;
    }
    const palette = blockPalette(block);
    if (palette === PALETTE_SLOTS.water || palette === PALETTE_SLOTS.waterDeep) {
      return SURFACE_KIND.plain;
    }
    return surface;
  }
  return SURFACE_KIND.plain;
}

/**
 * La quota da cui parte un prop di tetto. Vedi la nota gemella in
 * `microDetail.ts`: sopra un vassoio il calpestio e' sceso, e partire da
 * `(z + 1) * U` lascerebbe il prisma sospeso di sei sedicesimi.
 */
function roofBase(marks: Uint8Array, x: number, y: number, z: number): number {
  return (z + 1) * U - roofInset(marks, x, y, z);
}

/** Il profilo del filo del tetto: quanto scende sotto la linea, e quanto sporge. */
interface EdgeProfile {
  readonly drop: number;
  readonly jut: number;
  readonly palette: number;
}

/**
 * Un profilo per uso, ed e' l'intero contenuto informativo del gruppo.
 *
 * Le tre voci non differiscono per gusto ma per **come si leggono da lontano**:
 * la gronda e' bassa e sporgente, quindi fa una riga d'ombra spessa sotto il
 * tetto; il gocciolatoio industriale e' sottile e corto, quindi taglia il volume
 * senza ammorbidirlo; il cornicione civico e' alto e moderato, che e' la
 * proporzione del coronamento monumentale. Tre numeri, tre edifici diversi.
 */
const EDGE_PROFILES: readonly (readonly [SurfaceKind, EdgeProfile])[] = [
  [SURFACE_KIND.habitat, { drop: 4, jut: 5, palette: PALETTE_SLOTS.roofPale }],
  [SURFACE_KIND.civic, { drop: 6, jut: 4, palette: PALETTE_SLOTS.stoneWarm }],
  [SURFACE_KIND.industrial, { drop: 3, jut: 3, palette: PALETTE_SLOTS.metalRust }],
];

/**
 * I tetti scoperti, divisi per l'uso che li sostiene.
 *
 * **Non e' una comodita', e' il costo del gruppo** — la stessa mossa, e per la
 * stessa ragione, del secchiello per marchio di `carvePlan.ts`. Senza, ogni
 * emettitore chiede `facadeUnder` a ogni cella che visita: il filo del tetto fa
 * dodici passate — tre profili per quattro direzioni — e i prop altre cinque,
 * quindi una cella di tetto pagherebbe fino a diciassette discese da quattro
 * letture l'una. Diviso qui, dove le celle si stanno gia' visitando una volta,
 * ogni passata vede solo le proprie e nessuno rifa' la domanda.
 *
 * Vive a livello di modulo come `plan` e `lifted`: il worker mesha un chunk alla
 * volta, e riallocare tre liste per chunk sarebbe la sola allocazione del gruppo.
 * L'indice e' il `SurfaceKind`, quindi bastano otto caselle.
 */
const byUse: number[][] = Array.from({ length: 8 }, () => [] as number[]);

/** Riempie `byUse`. Chiamata da entrambi gli ingressi: costa una passata. */
function partitionRoofs(padded: Uint8Array, roofs: readonly number[]): void {
  for (const list of byUse) list.length = 0;
  for (const cell of roofs) {
    const x = cell & 31;
    const y = (cell >>> 5) & 31;
    const z = (cell >>> 10) & 31;
    // `bySurface` e' volumetrica: contiene anche i voxel di tetto tecnico
    // sepolti sotto un altro piano, che non sono un tetto ma un solaio.
    if (!openRoof(padded, x, y, z)) continue;
    const use = facadeUnder(padded, x, y, z);
    if (use !== SURFACE_KIND.plain) byUse[use].push(cell);
  }
}

/**
 * Il filo del tetto: gronda, cornicione o gocciolatoio, secondo cio' che c'e'
 * sotto.
 *
 * **Sta sotto e fuori, dove il parapetto sta sopra e dentro**, ed e' per questo
 * che i due non si contendono niente: `emitRoofTech` cresce da `(z + 1) * U` in
 * su e rientra di un sedicesimo, questo scende da un sedicesimo sotto quella
 * linea e sporge oltre il filo del voxel. La distanza di un sedicesimo dal piano
 * del tetto non e' un dettaglio di gusto: complanare, la faccia superiore del
 * prisma e quella del tetto si contenderebbero lo stesso z.
 *
 * Il vassoio non entra: la sua ricetta chiede tetto scoperto su **tutti e due**
 * gli assi, e una cella di filo non ce l'ha. La linea da cui questo prisma pende
 * e' percio' sempre quella vera.
 */
function emitRoofEdges(padded: Uint8Array, writer: MicroGeometryWriter): boolean {
  for (const [use, profile] of EDGE_PROFILES) {
    const cells = byUse[use];
    if (cells.length === 0) continue;
    for (const direction of LATERAL_FACES) {
      const edgeAxis = direction < 2 ? 0 : 1;
      const runAxis = edgeAxis === 0 ? 1 : 0;
      const positive = direction === FACE_PX || direction === FACE_PY;
      const offset = FACE_NEIGHBOUR_OFFSETS[direction];

      if (!emitRuns(writer, cells, {
        runAxis,
        palette: profile.palette,
        // Il fianco interno e' dentro il voxel di tetto che regge il prisma.
        hiddenFace: direction ^ 1,
        // Tetto scoperto e uso sono gia' stati chiesti da `partitionRoofs`; qui
        // resta solo la domanda che cambia da una direzione all'altra. Ma la
        // corsa interroga anche i vicini **fuori** dalla lista — e' cosi' che
        // `emitRuns` la estende — e quelli vanno riqualificati per intero.
        has: (x, y, z) => openRoof(padded, x, y, z) &&
          blockAt(padded, x + offset[0], y + offset[1], z) === 0 &&
          facadeUnder(padded, x, y, z) === use,
        box: (x, y, z, length) => {
          const base: [number, number, number] = [x * U, y * U, 0];
          const line = (z + 1) * U;
          const min: [number, number, number] = [base[0], base[1], line - profile.drop];
          const max: [number, number, number] = [base[0] + U, base[1] + U, line - 1];
          min[edgeAxis] = positive ? base[edgeAxis] + U - 2 : base[edgeAxis] - profile.jut;
          max[edgeAxis] = positive ? base[edgeAxis] + U + profile.jut : base[edgeAxis] + 2;
          max[runAxis] = base[runAxis] + length * U;
          return { min, max };
        },
      })) {
        return false;
      }
    }
  }
  return true;
}

/**
 * true se questo tetto e' un **angolo**: gli manca un vicino su tutti e due gli
 * assi in piano.
 *
 * E' il complemento esatto di `roofOnBothAxes`, che il vassoio usa per il motivo
 * opposto — la' serve un calpestio, qui serve uno spigolo. Ed e' un aggancio che
 * nessun altro prop occupa: `emitFinials` vuole **zero** vicini, antenne e vasche
 * ne vogliono **quattro**. In mezzo, l'angolo era libero.
 */
function roofCorner(padded: Uint8Array, x: number, y: number, z: number): boolean {
  const alongX = !openRoof(padded, x - 1, y, z) || !openRoof(padded, x + 1, y, z);
  const alongY = !openRoof(padded, x, y - 1, z) || !openRoof(padded, x, y + 1, z);
  return alongX && alongY;
}

/**
 * Comignoli sugli angoli dei tetti abitati.
 *
 * **Il tessuto basso non aveva niente contro il cielo.** Il vocabolario maturo di
 * `microDetail.ts` si accende alle soglie alte — vasche, gruppi HVAC, balconi — e
 * una casa di sei livelli restava un parallelepipedo con un bordino. Il comignolo
 * e' l'accento **asimmetrico** che ne rompe la sagoma, e sta sull'angolo perche'
 * e' li' che sta davvero: in mezzo al tetto ci si mette una canna, sull'angolo un
 * camino.
 */
function emitChimneys(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  return emitPoints(writer, byUse[SURFACE_KIND.habitat], {
    runAxis: 0,
    palette: PALETTE_SLOTS.brick,
    hiddenFace: FACE_NZ,
    // Tetto scoperto e uso li ha gia' chiesti `partitionRoofs`, e qui — a
    // differenza di una corsa — nessuno interroga i vicini: `emitPoints` chiama
    // il predicato sulle sole celle della lista. Resta il tiro **dopo**
    // `roofCorner`, che e' la stessa scelta di costo di tende e nicchie.
    has: (x, y, z) => roofCorner(padded, x, y, z) &&
      propRoll(origin, x, y, z, CHIMNEY_SALT) < CHIMNEY_CHANCE,
    box: (x, y, z) => ({
      min: [x * U + 4, y * U + 4, roofBase(marks, x, y, z)],
      max: [x * U + 11, y * U + 11, (z + 1) * U + 10],
    }),
  });
}

/**
 * Un prop che pesca in mezzo al calpestio, su una lista gia' divisa per uso.
 *
 * Restano due domande e non quattro: `interiorRoof` — che vuole il tetto
 * scoperto su tutti e quattro i vicini, quindi tiene i prop lontani dal filo dove
 * ci sono gia' parapetto e cornicione — e il tiro.
 */
function interiorProp(
  padded: Uint8Array,
  origin: ChunkOrigin,
  salt: number,
  chance: number,
): (x: number, y: number, z: number) => boolean {
  return (x, y, z) => interiorRoof(padded, x, y, z) &&
    propRoll(origin, x, y, z, salt) < chance;
}

/**
 * Il coronamento notturno, un linguaggio per uso.
 *
 * **E' la voce che giustifica `facadeUnder` da sola.** Una lanterna accesa sopra
 * un civico, un fumaiolo spento sopra un capannone e un lucernario a filo sopra
 * una casa dicono di che citta' si tratta **guardando lo skyline al buio**, che
 * e' l'unico momento in cui la palette delle facciate non si vede. Lanterna e
 * lucernario escono `luminous` e passano dal ramo che il fragment ha gia'; la
 * ciminiera resta spenta, ed e' proprio il contrasto a fare la lettura.
 *
 * La ciminiera non si confonde con l'antenna di `emitRoofMasts`: quella e' larga
 * due sedicesimi e sale di ventidue, questa e' larga quattro e sale di diciotto.
 * Sottile e alta contro grassa e bassa e' la stessa distinzione che in una
 * silhouette separa un ripetitore da uno sfiato.
 */
function emitCrownProps(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  const civic = byUse[SURFACE_KIND.civic];
  const industrial = byUse[SURFACE_KIND.industrial];
  const habitat = byUse[SURFACE_KIND.habitat];
  const lantern = interiorProp(padded, origin, LANTERN_SALT, LANTERN_CHANCE);
  // Il tamburo e il suo cappello: due prismi perche' uno solo non ha due colori,
  // ed e' il cappello a farlo leggere come una lanterna invece che come un cubo
  // di vetro. Stessa mossa della vasca d'acqua in `microDetail.ts`.
  if (!emitPoints(writer, civic, {
    runAxis: 0,
    palette: PALETTE_SLOTS.glassPale,
    hiddenFace: FACE_NZ,
    surface: SURFACE_KIND.luminous,
    has: lantern,
    box: (x, y, z) => ({
      min: [x * U + 5, y * U + 5, roofBase(marks, x, y, z)],
      max: [x * U + 11, y * U + 11, roofBase(marks, x, y, z) + 7],
    }),
  })) {
    return false;
  }
  if (!emitPoints(writer, civic, {
    runAxis: 0,
    palette: PALETTE_SLOTS.metalBrass,
    hiddenFace: FACE_NZ,
    has: lantern,
    box: (x, y, z) => ({
      min: [x * U + 4, y * U + 4, roofBase(marks, x, y, z) + 7],
      max: [x * U + 12, y * U + 12, roofBase(marks, x, y, z) + 8],
    }),
  })) {
    return false;
  }

  const stack = interiorProp(padded, origin, STACK_SALT, STACK_CHANCE);
  if (!emitPoints(writer, industrial, {
    runAxis: 0,
    palette: PALETTE_SLOTS.metalDark,
    hiddenFace: FACE_NZ,
    has: stack,
    box: (x, y, z) => ({
      min: [x * U + 6, y * U + 6, roofBase(marks, x, y, z)],
      max: [x * U + 10, y * U + 10, (z + 1) * U + 18],
    }),
  })) {
    return false;
  }
  // Il collarino: la fascia che spezza il fusto e gli da' una scala. Senza, una
  // ciminiera e un palo si somigliano troppo.
  if (!emitPoints(writer, industrial, {
    runAxis: 0,
    palette: PALETTE_SLOTS.metalRust,
    hiddenFace: FACE_NZ,
    has: stack,
    box: (x, y, z) => ({
      min: [x * U + 5, y * U + 5, (z + 1) * U + 13],
      max: [x * U + 11, y * U + 11, (z + 1) * U + 15],
    }),
  })) {
    return false;
  }

  // Il lucernario resta **un sedicesimo sopra** il calpestio: complanare al fondo
  // di un vassoio, le due facce si contenderebbero lo stesso z.
  return emitPoints(writer, habitat, {
    runAxis: 0,
    palette: PALETTE_SLOTS.glassPale,
    hiddenFace: FACE_NZ,
    surface: SURFACE_KIND.luminous,
    has: interiorProp(padded, origin, SKYLIGHT_SALT, SKYLIGHT_CHANCE),
    box: (x, y, z) => ({
      min: [x * U + 4, y * U + 4, roofBase(marks, x, y, z) + 1],
      max: [x * U + 12, y * U + 12, roofBase(marks, x, y, z) + 2],
    }),
  });
}

/**
 * Il filo del tetto, in una chiamata sola. **E' struttura**: nella sequenza sta
 * sopra i prop, perche' e' la silhouette e non un oggetto posato sopra.
 */
export function appendCrownEdges(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  roofs: readonly number[],
): boolean {
  partitionRoofs(padded, roofs);
  return emitRoofEdges(padded, writer);
}

/**
 * Cio' che sta **sopra** il filo del tetto, in una chiamata sola. Sono prop, e
 * cadono con i prop. L'ordine interno va dal piu' economico al piu' caro.
 */
export function appendCrownProps(
  padded: Uint8Array,
  writer: MicroGeometryWriter,
  roofs: readonly number[],
  origin: ChunkOrigin,
  marks: Uint8Array,
): boolean {
  // **Ripartisce invece di fidarsi della chiamata gemella.** I due ingressi
  // stanno in due punti diversi della sequenza — struttura e prop — e in mezzo
  // ci passano nove emettitori: dare per buona la divisione fatta prima sarebbe
  // uno stato nascosto fra due funzioni pubbliche, e basterebbe che qualcuno
  // chiamasse solo questa per avere liste vuote e nessun prop. Costa una passata
  // sulle celle di tetto, che sono poche.
  partitionRoofs(padded, roofs);
  if (!emitChimneys(padded, writer, origin, marks)) return false;
  return emitCrownProps(padded, writer, origin, marks);
}
