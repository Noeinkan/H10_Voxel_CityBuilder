import type { CatalystId } from '../sim';
import { generateIsland } from '../world/terrain/IslandGenerator';
import { VoxelWorld } from '../world/VoxelWorld';
import { GrowthScene } from './growthScene';

/**
 * Una citta' che cresce da sola, sempre uguale, per misurare il ciclo.
 *
 * **Non e' codice di produzione**: e' la fixture della fase 6.2, come
 * `testTerrain` lo e' per la simulazione. Serve un'isola vera e non piatta,
 * perche' acqua, costa e pendenze sono cio' che accende campate, porti e opere
 * di terra — le passate che su una fixture piatta non girano mai e che quindi
 * nessuna misura vedrebbe.
 *
 * **Gioca come un giocatore, dal `GrowthScene`**, e non dal `Builder` nudo: le
 * voci che costano di piu' — il campo che la congestione rifa', il coach, la
 * rete stradale che si ricostruisce a ogni catalizzatore — vivono attorno al
 * `Builder`, e una misura che le lasciasse fuori direbbe che il ciclo sta nel
 * budget quando non ci sta. Paga i catalizzatori, segue l'ordine del tutorial,
 * aspetta i fondi e risponde alle carte evento con la prima alternativa.
 *
 * **Deterministica per costruzione**: niente orologio, niente caso. Il passo e'
 * quello di un frame a 60 fps, quindi sei `advance` per tick — la coda di
 * comparsa lavora quanto a schermo, e la citta' che cresce e' la stessa a ogni
 * run: e' cio' che rende confrontabili i contatori del profilo.
 */

export interface ProfileCityOptions {
  readonly seed?: number;
  readonly ticks: number;
  /** Lato dell'isola; il gioco ne genera una da 512. */
  readonly side?: number;
  /** Chiamata ogni `every` tick, per chi vuole stampare l'avanzamento. */
  readonly onProgress?: (scene: GrowthScene, tick: number) => void;
  readonly every?: number;
}

export interface ProfiledCity {
  readonly scene: GrowthScene;
  readonly placed: number;
  /** Catalizzatori del piano che non hanno trovato un sito, con il motivo. */
  readonly skipped: readonly string[];
}

const FRAMES_PER_TICK = 6;
const FRAME_SECONDS = 1 / 60;
/** Ogni quanti tick il giocatore riprova il prossimo catalizzatore del piano. */
const PLACE_EVERY = 20;
/** Fin dove cerca un sito attorno al punto voluto, e con che passo. */
const SEARCH_RADIUS = 60;
const SEARCH_STEP = 4;

/**
 * Il piano, in scostamenti dal centro dell'isola.
 *
 * I primi tre sono il tutorial; poi un anello che si allarga, con abbastanza
 * cibo e industria da non far scattare il declino, e un landmark d'identita'
 * perche' la sua portata larga e' uno dei casi cari del campo.
 */
const PLAN: readonly { readonly role: CatalystId; readonly dx: number; readonly dy: number }[] = [
  { role: 'market', dx: 0, dy: 0 },
  { role: 'factory', dx: 70, dy: 20 },
  { role: 'park', dx: -60, dy: 30 },
  { role: 'greenhouse', dx: -40, dy: -70 },
  { role: 'market', dx: 40, dy: -60 },
  { role: 'school', dx: 90, dy: -40 },
  { role: 'transport', dx: -90, dy: -20 },
  { role: 'factory', dx: 120, dy: 80 },
  { role: 'greenhouse', dx: -110, dy: 90 },
  { role: 'market', dx: 10, dy: 110 },
  { role: 'park', dx: 130, dy: -110 },
  { role: 'power', dx: -140, dy: -90 },
  { role: 'university', dx: 0, dy: -130 },
  { role: 'market', dx: -150, dy: 20 },
  { role: 'factory', dx: 160, dy: 10 },
  { role: 'greenhouse', dx: 60, dy: 160 },
  { role: 'school', dx: -60, dy: 150 },
  { role: 'market', dx: 170, dy: -150 },
];

/** Rifiuti che passano da soli aspettando: il catalizzatore si riprova dopo. */
const WAIT = new Set(['insufficient-funds', 'onboarding-order', 'milestone-required']);

export function growProfileCity(options: ProfileCityOptions): ProfiledCity {
  const seed = options.seed ?? 1337;
  const side = options.side ?? 512;
  const region = { minX: 0, minY: 0, sizeX: side, sizeY: side };
  const world = new VoxelWorld();
  const { map } = generateIsland(world, seed, region);
  const scene = new GrowthScene(world, map, region, seed);
  const centre = side >> 1;

  let next = 0;
  let placed = 0;
  const skipped: string[] = [];

  for (let tick = 0; tick < options.ticks; tick++) {
    if (tick % PLACE_EVERY === 0 && next < PLAN.length) {
      const want = PLAN[next];
      const outcome = place(scene, want.role, centre + want.dx, centre + want.dy);
      if (outcome === 'placed') {
        placed++;
        next++;
      } else if (!WAIT.has(outcome)) {
        skipped.push(`${want.role} @${want.dx},${want.dy}: ${outcome}`);
        next++;
      }
    }

    const decision = scene.stats.state.pendingDecision;
    if (decision !== null && decision.options.length > 0) scene.chooseDecision(decision.options[0].id);

    for (let frame = 0; frame < FRAMES_PER_TICK; frame++) scene.advance(FRAME_SECONDS);
    if (options.onProgress !== undefined && (tick + 1) % (options.every ?? 500) === 0) {
      options.onProgress(scene, tick + 1);
    }
  }

  return { scene, placed, skipped };
}

/** Spirale attorno al punto voluto, fino al primo sito che il gioco accetta. */
function place(scene: GrowthScene, role: CatalystId, cx: number, cy: number): string {
  let last = 'no-site';
  for (let r = 0; r <= SEARCH_RADIUS; r += SEARCH_STEP) {
    const steps = r === 0 ? 1 : 16;
    for (let a = 0; a < steps; a++) {
      const angle = (a / steps) * Math.PI * 2;
      const x = Math.round(cx + r * Math.cos(angle));
      const y = Math.round(cy + r * Math.sin(angle));
      const failure = scene.catalystFailure(x, y, role);
      if (failure === null) {
        const result = scene.placeCatalyst(x, y, role);
        return result.success ? 'placed' : String(result.reason);
      }
      if (WAIT.has(failure)) return failure;
      last = failure;
    }
  }
  return last;
}
