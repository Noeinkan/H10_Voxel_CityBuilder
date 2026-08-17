import { blockTransferables } from './columnBlock';
import { HeightField } from './heightField';
import { generateColumnBlock } from './IslandGenerator';
import type { BlockMessage, DoneMessage, TerrainJob } from './terrainMessages';

/**
 * Worker di generazione: riceve un lotto di colonne di chunk, restituisce i dati
 * per colonna un blocco alla volta.
 *
 * Il blocco parte appena e' pronto, con i suoi quattro buffer trasferiti: il
 * main thread comincia a scrivere voxel — e quindi a meshare — mentre il worker
 * sta ancora generando il resto dell'isola. Come il worker di meshing, questo
 * file non importa ne' Three.js ne' il `VoxelWorld`.
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<TerrainJob>): void => {
  const job = event.data;
  const field = new HeightField(job.seed, job.shape);
  const total = job.blocks.length;

  const started = performance.now();
  for (let i = 0; i < total; i++) {
    const request = job.blocks[i];
    const block = generateColumnBlock(field, request.ccx, request.ccy);
    const message: BlockMessage = { type: 'block', block, index: i, total };
    ctx.postMessage(message, blockTransferables(block));
  }

  const done: DoneMessage = { type: 'done', blocks: total, generationMs: performance.now() - started };
  ctx.postMessage(done);
};
