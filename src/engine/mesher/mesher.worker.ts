import { createScratch, greedyMesh } from './greedyMesher';
import type { MeshJob, MeshResult } from './meshTypes';

/**
 * Worker di meshing: riceve un volume paddato, restituisce array grezzi.
 *
 * Gli scratch buffer vivono a livello di modulo, quindi crescono una volta e
 * vengono riusati per tutti i job successivi. Il buffer di input torna indietro
 * insieme al risultato per essere riciclato dal pool sul main thread.
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const scratch = createScratch();

ctx.onmessage = (event: MessageEvent<MeshJob>): void => {
  const job = event.data;

  const t0 = performance.now();
  const mesh = greedyMesh(job.padded, scratch, job.ceiling);
  const meshMs = performance.now() - t0;

  const result: MeshResult = {
    jobId: job.jobId,
    key: job.key,
    positions: mesh.positions,
    faces: mesh.faces,
    palettes: mesh.palettes,
    surfaces: mesh.surfaces,
    shade: mesh.shade,
    indices: mesh.indices,
    detailQuadCount: mesh.detailQuadCount,
    quadCount: mesh.quadCount,
    min: mesh.min,
    max: mesh.max,
    meshMs,
    padded: job.padded,
    ceiling: job.ceiling,
  };

  // I buffer di input tornano sempre indietro. Gli array della geometria si
  // trasferiscono solo se non vuoti: quelli vuoti sono singleton di modulo e
  // trasferirli li renderebbe inutilizzabili per i job successivi.
  const transfer: Transferable[] = [job.padded.buffer, job.ceiling.buffer];
  if (mesh.quadCount > 0) {
    transfer.push(
      mesh.positions.buffer,
      mesh.faces.buffer,
      mesh.palettes.buffer,
      mesh.surfaces.buffer,
      mesh.shade.buffer,
      mesh.indices.buffer,
    );
  }

  ctx.postMessage(result, transfer);
};
