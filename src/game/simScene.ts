import {
  createScenarioState,
  nextBuildSites,
  setPolicyActive,
  setSelectedClass,
  tick,
  writeDesirabilityData,
  type BuildSite,
  type BuildingClass,
  type PolicyId,
  type ScenarioRegion,
  type SimState,
} from '../sim';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { FixedStepLoop } from './loop';

/** Tick al secondo del passo automatico. */
export const SIM_TICK_RATE = 10;

/** Candidati tenuti pronti per l'overlay. */
export const SIM_SITE_COUNT = 10;

/**
 * Cablaggio di `?sim=1`: la simulazione che gira su un'isola senza costruirci.
 *
 * E' il gemello di `GrowthScene` per la scena di misura — stesso costruttore,
 * stesso `advance(dt)`, stesso getter `stats` — e nasce dividendo il bootstrap,
 * dove viveva sparsa fra cinque variabili di modulo e sei funzioni. Restava
 * l'unica delle due scene a non avere una casa, e non c'era una ragione: `tick`
 * non piazza un edificio nemmeno per sbaglio, quindi qui non serve un `Builder`
 * — ma tutto il resto del giro e' lo stesso.
 */
export class SimScene {
  private state: SimState;
  private readonly loop = new FixedStepLoop(SIM_TICK_RATE, SIM_TICK_RATE);

  /** Il passo automatico parte acceso: una scena ferma non mostra un bilancio. */
  private auto = true;
  private lastTickMs = 0;
  private buildSites: readonly BuildSite[] = [];
  private cells = 0;

  constructor(
    private readonly world: VoxelWorld,
    private readonly map: TerrainMap,
    region: ScenarioRegion,
  ) {
    this.state = createScenarioState(map, region);
    this.refreshDerived();
  }

  advance(dt: number): void {
    if (!this.auto) return;
    this.loop.advance(dt, () => this.step(1));
  }

  /**
   * Avanza di `count` tick e misura quanto e' costato un tick, non il gruppo.
   *
   * La media e' sul numero richiesto perche' e' l'unico modo di confrontare il
   * passo automatico — un tick alla volta — con lo scatto manuale da overlay,
   * che ne chiede parecchi insieme.
   */
  step(count: number): void {
    const start = performance.now();
    let next = this.state;
    for (let i = 0; i < count; i++) {
      next = tick(next, this.map);
    }
    this.lastTickMs = (performance.now() - start) / count;
    this.state = next;
  }

  toggleAuto(): void {
    this.auto = !this.auto;
  }

  selectClass(cls: BuildingClass): void {
    this.state = setSelectedClass(this.state, cls);
    this.refreshDerived();
  }

  togglePolicy(id: PolicyId): void {
    this.state = setPolicyActive(this.state, id, !this.state.policies.includes(id));
    this.refreshDerived();
  }

  /** I candidati che l'overlay disegna, ricalcolati fuori dal ciclo di frame. */
  sitesAt(count: number): readonly BuildSite[] {
    return nextBuildSites(this.state, this.map, count);
  }

  get simState(): SimState {
    return this.state;
  }

  get autoEnabled(): boolean {
    return this.auto;
  }

  get tickMs(): number {
    return this.lastTickMs;
  }

  get sites(): readonly BuildSite[] {
    return this.buildSites;
  }

  get dataCells(): number {
    return this.cells;
  }

  /**
   * Ricalcola cio' che dipende dal campo: la lista dei candidati e la copia in
   * `VoxelWorld.data`.
   *
   * Non sta nel ciclo di frame perche' non ha motivo di starci. Il campo cambia
   * solo per un'azione del giocatore — una policy, un catalizzatore, un edificio
   * — mai per un tick, quindi rifare questi due passi a ogni frame sarebbe
   * lavoro garantito inutile.
   */
  private refreshDerived(): void {
    this.buildSites = nextBuildSites(this.state, this.map, SIM_SITE_COUNT);
    this.cells = writeDesirabilityData(this.world, this.state, this.map);
  }
}
