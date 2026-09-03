import { ARCH } from './config/arch';
import type { BuildingArch } from './archPlan';
import { STAMP_EMPTY, stampIndex, type VoxelAnchor, type VoxelStamp } from './stamp';

/**
 * Il braccio scritto nei voxel: dalla sagoma del corpo alla sagoma con l'arco.
 *
 * **Il braccio si aggiunge dopo, e non e' un dettaglio di ordine.** Se entrasse
 * in `generateBuilding` consumerebbe tiri dei quattro canali e la stessa
 * coppia `(seme, livello)` darebbe due corpi diversi a seconda che l'arco ci
 * sia o no: un edificio che getta una campata cambierebbe *anche* i piani
 * bassi, e l'invariante che rende un upgrade leggibile come crescita cadrebbe.
 * Qui il corpo e' gia' disegnato e l'arco e' una chirurgia sopra, quindi la
 * sagoma senza arco resta esattamente quella di prima.
 *
 * **La materia del braccio e' quella del muro da cui esce.** Non c'e' un colore
 * dell'arco e non c'e' una voce di catalogo: si legge lo slot di palette e la
 * superficie del voxel d'imposta e si ripetono. E' cio' che fa leggere la
 * campata come *lo stesso edificio che continua* invece che come un pezzo
 * appoggiato — che e' la sola cosa che la distingue da un ponte.
 */

/** Un braccio pronto per la coda di comparsa: dove sta, e cosa scrive. */
export interface ArchArm {
  readonly anchor: VoxelAnchor;
  readonly stamp: VoxelStamp;
}

/** Cio' che serve a collocare un braccio rispetto al proprio record. */
export interface ArchHost {
  readonly x: number;
  readonly y: number;
  readonly baseZ: number;
  readonly footprint: number;
  readonly footprintY?: number;
  /**
   * Fronte e sbalzo: **dove la sagoma del corpo esce gia' dall'impronta**.
   *
   * Servono a una domanda sola, e non si possono dedurre dallo stamp: di quanto
   * il riquadro deve ancora crescere per contenere il braccio. Leggendo
   * `sizeX - footprint` la risposta sarebbe giusta finche' sbalzo e arco stanno
   * dalla stessa parte e sbagliata per difetto appena stanno sulle due facce
   * opposte dello stesso asse — lo spazio ci sarebbe, ma dal lato sbagliato.
   */
  readonly facing?: number;
  readonly overhang?: number;
}

/** Una colonna del braccio: coordinata sull'asse del verso e sprofondo del rinfianco. */
interface ArmColumn {
  readonly at: number;
  readonly drop: number;
}

function depthOf(host: ArchHost): number {
  return host.footprintY ?? host.footprint;
}

/** true se la faccia guarda lungo x. */
function alongX(face: number): boolean {
  return face <= 1;
}

/** Verso in cui il braccio esce: +1 sulle facce 0 e 2, -1 sulle altre. */
function stepOf(face: number): number {
  return face === 0 || face === 2 ? 1 : -1;
}

/**
 * La colonna piu' esterna dell'impronta sulla faccia del braccio.
 *
 * E' il filo da cui si contano sia `inset`, che rientra, sia `reach`, che esce:
 * le due misure hanno la stessa origine, ed e' cio' che permette a
 * `envelopeOf` di leggerne una sola senza sapere niente dell'altra.
 */
function edgeOf(host: ArchHost, face: number): number {
  switch (face) {
    case 0: return host.x + host.footprint - 1;
    case 1: return host.x;
    case 2: return host.y + depthOf(host) - 1;
    default: return host.y;
  }
}

/**
 * Le colonne del braccio, dall'imposta alla punta.
 *
 * Il rinfianco scende di un voxel per colonna e si esaurisce dopo `ARCH.haunch`:
 * l'estradosso resta piano e l'intradosso sale, che di taglio e' la spalla di
 * una campata. Fuori dal rinfianco il corso e' spesso `rise` e basta.
 */
function armColumns(arch: BuildingArch, host: ArchHost): readonly ArmColumn[] {
  const edge = edgeOf(host, arch.face);
  const step = stepOf(arch.face);
  const last = arch.inset + arch.reach;
  // **Senza un dirimpettaio il rinfianco si specchia.** `mate` a zero vuol dire
  // che il braccio non incontra il braccio di un altro ma un secondo sedime di
  // questo stesso record: l'arco e' intero e non piu' mezzo, quindi la spalla
  // deve allargarsi a tutti e due i capi. Con un dirimpettaio la seconda meta'
  // la disegna lui, ed e' proprio quel raccordo a farne una campata.
  const mirrored = arch.mate === 0;
  const out: ArmColumn[] = [];
  for (let k = 0; k <= last; k++) {
    const near = ARCH.haunch - k;
    const far = mirrored ? ARCH.haunch - (last - k) : 0;
    out.push({ at: edge + step * (k - arch.inset), drop: Math.max(0, near, far) });
  }
  return out;
}

/** Il voxel del corpo in quella colonna di mondo, o `null` se li' non c'e' niente. */
function sampleBody(
  body: VoxelStamp,
  host: ArchHost,
  wx: number,
  wy: number,
  wz: number,
): { id: number; surface: number } | null {
  const sx = wx - host.x + body.anchorX;
  const sy = wy - host.y + body.anchorY;
  const sz = wz - host.baseZ + body.anchorZ;
  if (sx < 0 || sy < 0 || sz < 0) return null;
  if (sx >= body.sizeX || sy >= body.sizeY || sz >= body.sizeZ) return null;
  const index = stampIndex(body, sx, sy, sz);
  const id = body.voxels[index];
  return id === STAMP_EMPTY ? null : { id, surface: body.surfaces[index] };
}

/**
 * La materia con cui il braccio si scrive: quella del muro d'imposta.
 *
 * Si cerca sulla colonna dell'imposta partendo dalla quota del corso e
 * scendendo: alla quota esatta il muro c'e' quasi sempre — la regola l'ha
 * verificato prima di concedere l'arco — e scendere copre il caso in cui il
 * rinfianco parta un voxel sotto il pieno. Senza nessun campione il braccio non
 * si scrive: dipingerlo con un colore di ripiego lo farebbe leggere come un
 * pezzo di un altro edificio.
 */
function archMaterial(
  body: VoxelStamp,
  host: ArchHost,
  arch: BuildingArch,
): { id: number; surface: number } | null {
  const edge = edgeOf(host, arch.face);
  const step = stepOf(arch.face);
  const wall = edge - step * arch.inset;
  for (let z = arch.z + arch.rise - 1; z >= arch.z - ARCH.haunch; z--) {
    for (let j = 0; j < arch.width; j++) {
      const across = arch.across + j;
      const found = alongX(arch.face)
        ? sampleBody(body, host, wall, across, z)
        : sampleBody(body, host, across, wall, z);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Il braccio da solo, gia' ancorato al mondo.
 *
 * **Serve alla comparsa, e da sola.** Accodare la sagoma intera per aggiungere
 * un corso sporcherebbe ogni chunk della torre per scrivere voxel che ci sono
 * gia': una passata di archi su un centro maturo farebbe piu' lavoro di frame
 * di tutta la crescita insieme. Qui si accoda cio' che davvero si aggiunge.
 */
export function archArm(body: VoxelStamp, host: ArchHost, arch: BuildingArch): ArchArm | null {
  const material = archMaterial(body, host, arch);
  if (material === null) return null;

  const columns = armColumns(arch, host);
  let minAt = columns[0].at;
  let maxAt = columns[0].at;
  for (const column of columns) {
    if (column.at < minAt) minAt = column.at;
    if (column.at > maxAt) maxAt = column.at;
  }
  const minZ = arch.z - ARCH.haunch;
  const sizeAt = maxAt - minAt + 1;
  const sizeZ = arch.rise + ARCH.haunch;

  const sizeX = alongX(arch.face) ? sizeAt : arch.width;
  const sizeY = alongX(arch.face) ? arch.width : sizeAt;
  const voxels = new Uint8Array(sizeX * sizeY * sizeZ);
  const surfaces = new Uint8Array(voxels.length);
  const stamp: VoxelStamp = {
    sizeX,
    sizeY,
    sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    bandStarts: [0, sizeZ],
  };

  const anchor: VoxelAnchor = {
    x: alongX(arch.face) ? minAt : arch.across,
    y: alongX(arch.face) ? arch.across : minAt,
    z: minZ,
  };
  writeArm(stamp, anchor, columns, arch, material);
  return { anchor, stamp };
}

/**
 * La sagoma **registrata** di un edificio che porta un arco: corpo piu' braccio.
 *
 * E' cio' che `recordStamp` restituisce, e serve a cancellare: chi demolisce
 * deve poter ridisegnare tutto quello che il record ha scritto, braccio
 * compreso, o l'arco resterebbe a mezz'aria sopra la strada.
 *
 * Il riquadro cresce sul solo verso di `facing`, esattamente di quanto
 * `envelopeOf` ha gia' dichiarato: sono la stessa aritmetica letta nei due
 * versi, come gia' `overhangFor` e `groundSideOf`.
 */
export function withArch(body: VoxelStamp, host: ArchHost, arch: BuildingArch): VoxelStamp {
  if (archMaterial(body, host, arch) === null) return body;

  const axisX = alongX(arch.face);
  // Quanto il riquadro e' gia' cresciuto **su questa faccia**: lo sbalzo conta
  // solo se va dalla stessa parte. Sulla faccia opposta dello stesso asse la
  // sagoma e' piu' larga ma dal lato sbagliato, e crescerebbe di troppo poco.
  const already = (host.overhang ?? 0) > 0 && host.facing === arch.face
    ? (host.overhang ?? 0)
    : 0;
  const extra = Math.max(0, arch.reach - already);
  if (extra === 0) {
    const grown = cloneInto(body, body.sizeX, body.sizeY, 0, 0, body.anchorX, body.anchorY);
    paintArch(grown, host, arch);
    return grown;
  }

  // Le facce 1 e 3 crescono dal lato dell'origine: il corpo scivola in avanti e
  // l'ancora lo segue, che e' la stessa posizione che `generateBuilding` da'
  // all'impronta dentro l'inviluppo quando lo sbalzo va da quella parte.
  const near = arch.face === 1 || arch.face === 3;
  const offsetX = axisX && near ? extra : 0;
  const offsetY = !axisX && near ? extra : 0;
  const grown = cloneInto(
    body,
    body.sizeX + (axisX ? extra : 0),
    body.sizeY + (axisX ? 0 : extra),
    offsetX,
    offsetY,
    body.anchorX + offsetX,
    body.anchorY + offsetY,
  );
  paintArch(grown, host, arch);
  return grown;
}

/**
 * Scrive il braccio dentro una sagoma che ha **gia'** il posto per contenerlo.
 *
 * E' la meta' di `withArch` che disegna, separata da quella che allarga: la
 * sagoma di un record con piu' sedimi si compone su una tela che copre gia'
 * tutti e due i corpi e il vuoto in mezzo, e farla crescere una seconda volta
 * la sposterebbe rispetto alla propria ancora. La materia si campiona dalla tela
 * stessa, quindi un arco fra due sedimi dello stesso record prende il colore del
 * muro da cui parte esattamente come quello verso un dirimpettaio.
 *
 * Non fa niente se all'imposta non c'e' materia: e' lo stesso rifiuto di
 * `withArch`, e dipingere con un colore di ripiego farebbe leggere il braccio
 * come un pezzo di un altro edificio.
 */
export function paintArch(stamp: VoxelStamp, host: ArchHost, arch: BuildingArch): void {
  const material = archMaterial(stamp, host, arch);
  if (material === null) return;
  writeArm(stamp, { x: host.x, y: host.y, z: host.baseZ }, armColumns(arch, host), arch, material);
}

/** Copia uno stamp dentro un riquadro piu' largo, a un offset dato. */
function cloneInto(
  body: VoxelStamp,
  sizeX: number,
  sizeY: number,
  offsetX: number,
  offsetY: number,
  anchorX: number,
  anchorY: number,
): VoxelStamp {
  const voxels = new Uint8Array(sizeX * sizeY * body.sizeZ);
  const surfaces = new Uint8Array(voxels.length);
  for (let sz = 0; sz < body.sizeZ; sz++) {
    for (let sy = 0; sy < body.sizeY; sy++) {
      for (let sx = 0; sx < body.sizeX; sx++) {
        const from = sx + body.sizeX * (sy + body.sizeY * sz);
        const to = (sx + offsetX) + sizeX * ((sy + offsetY) + sizeY * sz);
        voxels[to] = body.voxels[from];
        surfaces[to] = body.surfaces[from];
      }
    }
  }
  return {
    sizeX,
    sizeY,
    sizeZ: body.sizeZ,
    anchorX,
    anchorY,
    anchorZ: body.anchorZ,
    voxels,
    surfaces,
    bandStarts: body.bandStarts,
  };
}

/**
 * Scrive il braccio dentro uno stamp gia' allocato, in coordinate di mondo.
 *
 * E' l'unico ciclo che disegna un arco, e lo condividono la comparsa — che
 * scrive il solo braccio — e la rigenerazione — che scrive corpo e braccio
 * insieme. Due copie divergerebbero al primo ritocco del rinfianco, e la
 * divergenza sarebbe un voxel che compare e non si cancella piu'.
 */
function writeArm(
  stamp: VoxelStamp,
  anchor: VoxelAnchor,
  columns: readonly ArmColumn[],
  arch: BuildingArch,
  material: { id: number; surface: number },
): void {
  const axisX = alongX(arch.face);
  for (const column of columns) {
    for (let j = 0; j < arch.width; j++) {
      const across = arch.across + j;
      const wx = axisX ? column.at : across;
      const wy = axisX ? across : column.at;
      for (let z = arch.z - column.drop; z < arch.z + arch.rise; z++) {
        const sx = wx - anchor.x + stamp.anchorX;
        const sy = wy - anchor.y + stamp.anchorY;
        const sz = z - anchor.z + stamp.anchorZ;
        if (sx < 0 || sy < 0 || sz < 0) continue;
        if (sx >= stamp.sizeX || sy >= stamp.sizeY || sz >= stamp.sizeZ) continue;
        const index = stampIndex(stamp, sx, sy, sz);
        stamp.voxels[index] = material.id;
        stamp.surfaces[index] = material.surface;
      }
    }
  }
}
