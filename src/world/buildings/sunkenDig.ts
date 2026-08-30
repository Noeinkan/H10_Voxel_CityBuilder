import type { ArcologyRecipe } from '../arcology/config';
import type { PartsRecipe } from '../landmarks/config';
import { generateFromRecipe } from '../landmarks/generate';
import type { Facing } from '../streets/streetGrid';
import { EMPTY_STAMP, STAMP_EMPTY, type VoxelStamp } from './stamp';

/**
 * Il volume di roccia che un earthscraper toglie: la terza eccezione allo scavo.
 *
 * **Si riempie e non si scava**, dice il progetto, e le eccezioni erano due —
 * la montagna sopra il tetto di un landmark (`enqueueSlopeCarve`) e il bacino di
 * una marina (`enqueueBasinDig`). Questa e' la terza, e ha lo stesso confine
 * delle prime due: l'impronta della struttura, mai il grembiule, mai una colonna
 * fuori dall'ingombro. Viaggia anche sulla stessa coda — `EMPTY_STAMP` come
 * sagoma nuova e il volume da togliere come «precedente» — quindi non nasce qui
 * nessun percorso di scrittura che non fosse gia' a budget.
 *
 * **Marca solo la roccia che c'e' davvero.** Il confronto con `heightAt` non e'
 * un'ottimizzazione: `clearObsoleteVoxelBatch` consuma il budget del frame per
 * ogni cella che visita, anche dove `setBlock` poi non cambia niente perche' la
 * cella era gia' vuota. Su un imbuto da diciassettemila celle, meta' delle quali
 * sopra il profilo del terreno a valle, sarebbero stati minuti di comparsa
 * spesi a svuotare l'aria.
 *
 * **E' una funzione pura del record, ed e' cio' che tiene in piedi il
 * salvataggio.** `Builder.restore` ridisegna gli stamp e nient'altro: terreno e
 * strade si rifanno dal seme perche' sono funzioni pure, quindi un pozzo
 * caricato ritroverebbe la roccia dentro e la struttura sepolta. Entrano qui
 * soltanto la ricetta, il verso, l'angolo, la base e le quote del terreno —
 * tutti dati che il record porta o che il seme rigenera — e la stessa chiamata
 * riapre il pozzo identico mille tick o una partita dopo.
 */

/** Il terreno ridotto a cio' che lo scavo deve sapere. `TerrainMap` lo soddisfa. */
export interface DigProbe {
  readonly heightAt: (x: number, y: number) => number;
}

/**
 * Lo scavo come `PartsRecipe` di un solo stadio.
 *
 * Passare per `generateFromRecipe` invece di scrivere un terzo ciclo di disegno
 * fa arrivare gratis la rotazione sul verso vero: le scatole di `sunken.dig`
 * sono in coordinate canoniche come tutte le altre parti, e `orientPart` le
 * porta dove vanno con lo stesso segno. Un ciclo scritto a mano qui sarebbe
 * l'occasione classica per far divergere le due rotazioni, e la divergenza si
 * vedrebbe come un pozzo storto rispetto alla propria struttura.
 */
function digRecipeOf(recipe: ArcologyRecipe): PartsRecipe | null {
  const sunken = recipe.sunken;
  if (sunken === undefined || sunken.dig.length === 0) return null;
  return {
    span: recipe.span,
    height: recipe.height,
    anchor: recipe.anchor,
    stages: [0],
    parts: [sunken.dig],
  };
}

/**
 * La roccia da togliere sotto un earthscraper, ancorata a `baseZ`.
 *
 * Torna `EMPTY_STAMP` per una ricetta che sale, e per un pozzo che il terreno ha
 * gia' aperto da se' — una struttura posata su un fianco a valle dove non c'e'
 * niente da scavare.
 */
export function sunkenDigStamp(
  recipe: ArcologyRecipe,
  facing: Facing,
  originX: number,
  originY: number,
  baseZ: number,
  probe: DigProbe,
): VoxelStamp {
  const digRecipe = digRecipeOf(recipe);
  if (digRecipe === null) return EMPTY_STAMP;

  const shape = generateFromRecipe(digRecipe, { stage: 0, facing });
  const { sizeX, sizeY, sizeZ } = shape;
  const voxels = new Uint8Array(sizeX * sizeY * sizeZ);
  const plane = sizeX * sizeY;

  let marked = 0;
  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const column = dx + sizeX * dy;
      // `heightAt` conta i voxel pieni: l'ultimo sta a `height - 1`.
      const rock = probe.heightAt(originX + dx, originY + dy) - baseZ;
      const top = Math.min(sizeZ, rock);
      for (let lz = 0; lz < top; lz++) {
        const index = column + plane * lz;
        if (shape.voxels[index] === STAMP_EMPTY) continue;
        voxels[index] = 1;
        marked++;
      }
    }
  }
  if (marked === 0) return EMPTY_STAMP;

  return {
    sizeX,
    sizeY,
    sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    // Lo scavo non dipinge niente: e' il volume da togliere, e la coda ne legge
    // soltanto quali celle sono diverse da zero.
    surfaces: new Uint8Array(voxels.length),
    bandStarts: [0, sizeZ],
  };
}
