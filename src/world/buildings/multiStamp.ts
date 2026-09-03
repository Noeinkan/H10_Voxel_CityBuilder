import { hashCoords } from '../rng';
import { paintArch } from './archStamp';
import { boundsOf, type BuildingRecord } from './BuildingRegistry';
import { DEFAULT_BUILDING_FORM } from './config';
import { generateBuilding } from './generate';
import { typologyOf } from './recordStamp';
import { STAMP_EMPTY, type VoxelStamp } from './stamp';
import { styleOf, styledProfile } from './style';
import { typologyProfile } from './typology';

/**
 * La sagoma di un edificio che occupa piu' di un sedime.
 *
 * **E' cio' che «un edificio, un rettangolo» aveva reso impossibile.** Un
 * edificio che ha assorbito il dirimpettaio sta su due lotti con in mezzo la
 * carreggiata: la sua sagoma non e' un parallelepipedo e non lo puo' diventare
 * senza cancellare la strada. Qui i corpi si compongono su una tela che li
 * contiene tutti, e cio' che resta fra loro e' aria — che il registry, per parte
 * sua, non ha mai prenotato: vedi `plotOf`.
 *
 * **I sedimi in piu' non conservano l'edificio che c'era.** Il secondo corpo si
 * disegna con un sotto-seme del sopravvissuto, al suo livello e con la sua
 * tipologia: e' lui che si e' allungato fin la', non il vicino che gli e'
 * rimasto accanto. E' anche l'unica lettura che non chiede altro stato — un
 * rettangolo basta, e il record non deve portarsi dietro il seme, il livello e
 * lo stile di un edificio che non esiste piu'.
 *
 * **Il braccio si dipinge alla fine, sulla tela intera.** Quando i due corpi
 * stanno gia' dentro la stessa sagoma, l'arco fra loro e' un corso continuo con
 * la spalla a tutti e due i capi — e' `armColumns` a specchiarla, e la
 * riconosce da `mate` a zero.
 */

/** Sale dei sedimi in piu': separa i loro semi da ogni altro hash sullo stesso record. */
const PART_SALT = 0x2b71_ce05;

/**
 * Corpo principale piu' i sedimi in piu', fusi in una sagoma sola.
 *
 * L'ancora resta quella del record — angolo dell'impronta principale alla quota
 * di base — cosi' `anchorOf` continua a rispondere come per qualunque altro
 * edificio e la coda di comparsa non ha un caso in piu'.
 */
export function partedStamp(record: BuildingRecord, body: VoxelStamp): VoxelStamp {
  const bounds = boundsOf(record);
  const anchorX = record.x - bounds.x;
  const anchorY = record.y - bounds.y;

  const typology = typologyOf(record);
  const profile = styledProfile(typologyProfile(typology), styleOf(record.style));
  const salt = (record.seed ^ PART_SALT) >>> 0;

  const bodies = (record.parts ?? []).map((part, i) => ({
    part,
    stamp: generateBuilding({
      class: record.class,
      level: record.level,
      seed: hashCoords(salt, i, 0),
      footprintCap: Math.min(part.sizeX, part.sizeY),
      footprintFloor: Math.min(part.sizeX, part.sizeY),
      form: record.form ?? DEFAULT_BUILDING_FORM,
      profile,
      // Un sedime in piu' non aggetta: lo sbalzo e' del fronte strada del corpo
      // principale, e la sua striscia e' gia' contata nell'inviluppo di quello.
      shape: { ...typology.shape, overhang: 0 },
      mixed: record.mixed,
      facing: record.facing,
      baseBandHeight: record.baseBand,
    }),
  }));

  let sizeZ = body.sizeZ;
  for (const piece of bodies) sizeZ = Math.max(sizeZ, piece.stamp.sizeZ);

  const voxels = new Uint8Array(bounds.sizeX * bounds.sizeY * sizeZ);
  const surfaces = new Uint8Array(voxels.length);
  const canvas: VoxelStamp = {
    sizeX: bounds.sizeX,
    sizeY: bounds.sizeY,
    sizeZ,
    anchorX,
    anchorY,
    anchorZ: body.anchorZ,
    voxels,
    surfaces,
    // Una fascia sola, come per un assemblaggio: la comparsa a budget scorre
    // comunque l'array lineare, e le fasce del solo corpo principale non
    // descriverebbero la tela.
    bandStarts: [0, sizeZ],
  };

  blit(canvas, body, anchorX - body.anchorX, anchorY - body.anchorY);
  for (const piece of bodies) {
    blit(canvas, piece.stamp, piece.part.x - bounds.x, piece.part.y - bounds.y);
  }
  if (record.arch !== undefined) paintArch(canvas, record, record.arch);
  return canvas;
}

/** Copia i voxel pieni di una sagoma dentro la tela, a un offset in pianta. */
function blit(canvas: VoxelStamp, piece: VoxelStamp, offsetX: number, offsetY: number): void {
  for (let sz = 0; sz < piece.sizeZ && sz < canvas.sizeZ; sz++) {
    for (let sy = 0; sy < piece.sizeY; sy++) {
      const cy = sy + offsetY;
      if (cy < 0 || cy >= canvas.sizeY) continue;
      for (let sx = 0; sx < piece.sizeX; sx++) {
        const cx = sx + offsetX;
        if (cx < 0 || cx >= canvas.sizeX) continue;
        const from = sx + piece.sizeX * (sy + piece.sizeY * sz);
        const id = piece.voxels[from];
        if (id === STAMP_EMPTY) continue;
        const to = cx + canvas.sizeX * (cy + canvas.sizeY * sz);
        canvas.voxels[to] = id;
        canvas.surfaces[to] = piece.surfaces[from];
      }
    }
  }
}
