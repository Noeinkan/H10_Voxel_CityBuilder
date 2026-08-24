import { hashCoords } from '../rng';
import { drawTree, treeSpec, treeTop } from '../terrain/decor';
import { TREE_SPECIES } from '../terrain/flora';
import type { VoxelStamp } from '../buildings/stamp';
import { SURFACE_KIND } from '../visualBlock';
import type { FarmPlot } from './plotPlan';

/**
 * Gli alberi di un frutteto, come stamp.
 *
 * **Riusa il disegno degli alberi invece di rifarlo.** `drawTree` e' il corpo di
 * `writeTree` senza la destinazione, e qui la destinazione e' uno stamp: il
 * profilo delle specie, l'erosione del bordo, la pendenza della chioma restano
 * scritti una volta sola in `terrain/decor.ts`. Due copie divergerebbero al primo
 * ritocco di un profilo, e il difetto si vedrebbe solo a schermo.
 *
 * **Passa dalla coda della crescita come ogni altro volume.** Un frutteto e' una
 * ventina di alberi, cioe' un migliaio di voxel: scriverli tutti nel tick che li
 * decide farebbe cadere proprio il frame in cui la campagna compare. Consegnando
 * uno stamp si eredita il budget, l'affettamento e la cancellazione che la coda
 * ha gia' — e non si aggiunge un quarto posto da cui i voxel entrano nel mondo.
 *
 * **La regolarita' e' tutto.** Un albero da frutto e' una specie che in natura
 * non nasce: la pianta qualcuno, quindi sta su un reticolo. E' il contrasto con
 * il jitter del bosco vero — che `TREE_DECOR.jitterSize` esiste per creare — a
 * far leggere un frutteto come coltivato invece che come una macchia di bosco.
 */

/**
 * Passo del reticolo degli alberi, in colonne.
 *
 * Sta qui e non in `config.ts` perche' non e' calibrazione: e' dedotto dalla
 * chioma. Il raggio della specie da frutto e' 2, quindi a passo 5 fra due chiome
 * contigue resta una colonna di aria comunque cada il reticolo, e non si
 * compenetrano mai. Cambiare il profilo della specie senza cambiare questo
 * numero fa toccare le chiome, ed e' l'unica cosa da guardare.
 */
const TREE_PITCH = 5;

/** Scostamento massimo di un albero dal proprio nodo, in colonne. */
const TREE_JITTER = 1;

/** Sale del reticolo: separato da quello dei lotti, o il verso muoverebbe gli alberi. */
const TREE_SALT = 0x21_9c_04_5b;

/** Le origini degli alberi di un frutteto, in coordinate di mondo. */
export function orchardTrees(plot: FarmPlot, seed: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  // Si parte a mezzo passo dal bordo: un albero sul filo dell'impronta avrebbe
  // meta' chioma fuori dal lotto, cioe' addosso a quello accanto.
  const start = TREE_PITCH >> 1;
  for (let dy = start; dy < plot.side; dy += TREE_PITCH) {
    for (let dx = start; dx < plot.side; dx += TREE_PITCH) {
      // Un voxel di scarto, non di piu': serve a togliere l'aria di scacchiera
      // esatta senza cancellare il reticolo, che e' cio' che si deve leggere.
      const noise = hashCoords(seed ^ TREE_SALT, plot.x + dx, plot.y + dy);
      out.push({
        x: dx + (noise & TREE_JITTER),
        y: dy + ((noise >>> 8) & TREE_JITTER),
      });
    }
  }
  return out;
}

/**
 * Lo stamp di un frutteto: gli alberi, ancorati al suolo dell'angolo del lotto.
 *
 * **Un solo piano di appoggio per tutto il lotto.** Il piano lo ancora la coda
 * alla quota dell'angolo, quindi su un lotto a gradoni gli alberi piu' lontani
 * restano appesi o interrati di un'alzata. E' accettato di proposito: la
 * pendenza per colonna e' gia' limitata da `FARMS.maxSlope`, e l'alternativa —
 * uno stamp per albero — moltiplicherebbe per venti le voci in coda per
 * guadagnare un voxel di quota.
 */
export function orchardStamp(plot: FarmPlot, seed: number): VoxelStamp {
  const trees = orchardTrees(plot, seed).map((origin) =>
    treeSpec(origin.x, origin.y, TREE_SPECIES.fruit, trunkOf(seed, plot, origin)));

  const sizeX = plot.side;
  const sizeY = plot.side;
  const sizeZ = trees.reduce((tallest, tree) => Math.max(tallest, treeTop(tree, 0)), 1);

  const voxels = new Uint8Array(sizeX * sizeY * sizeZ);
  const surfaces = new Uint8Array(voxels.length);

  for (const tree of trees) {
    drawTree(tree, 0, (x, y, z, palette) => {
      // Il ritaglio e' del lotto: una chioma che sporgesse finirebbe addosso al
      // vicino, che qui non c'e' ancora ma ci sara'.
      if (x < 0 || x >= sizeX || y < 0 || y >= sizeY || z < 0 || z >= sizeZ) return;
      // Stessa disposizione di `stampIndex`, che pero' vuole uno stamp gia'
      // fatto: qui i voxel si stanno ancora scrivendo.
      const index = x + sizeX * (y + sizeY * z);
      // Chi arriva primo tiene: due chiome non si compenetrano per costruzione,
      // ma il tronco passa sotto la chioma del proprio albero.
      if (voxels[index] !== 0) return;
      voxels[index] = palette;
      surfaces[index] = SURFACE_KIND.plain;
    });
  }

  return {
    sizeX,
    sizeY,
    sizeZ,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    voxels,
    surfaces,
    // Una fascia per quota: la coda fa comparire il frutteto dal basso verso
    // l'alto, come un edificio, invece che tutto insieme.
    bandStarts: Array.from({ length: sizeZ + 1 }, (_, z) => z),
  };
}

/** Altezza del tronco, dal seme della propria posizione: un frutteto non e' un vivaio. */
function trunkOf(seed: number, plot: FarmPlot, origin: { x: number; y: number }): number {
  const shape = hashCoords(seed ^ TREE_SALT, plot.x + origin.x, plot.y + origin.y);
  return 4 + (shape >>> 16) % 2;
}
