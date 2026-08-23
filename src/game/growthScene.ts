import {
  addCatalyst,
  BALANCE,
  catalystById,
  catalystRoleOf,
  createSimState,
  defaultCatalystOfClass,
  decisionOption,
  nextBuildSites,
  tick,
  type BuildingClass,
  type CatalystId,
  type DecisionGrant,
  type PolicyId,
  type SimState,
  type TradeMode,
} from '../sim';
import type { ScenarioRegion } from '../sim/scenario';
import { Builder, type BuilderStats, type LandmarkSite } from '../world/buildings/Builder';
import type { ReadonlyBuildingRegistry } from '../world/buildings/BuildingRegistry';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import type { VoxelWorld } from '../world/VoxelWorld';
import { FixedStepLoop } from './loop';
import {
  buyExpansion,
  catalystFailure,
  catalystSiteCost,
  changeTradeMode,
  chooseDecision,
  expansionFailure,
  grantSite,
  placeCatalyst,
  togglePolicy,
  type ActionFailure,
  type ActionResult,
  type SiteCost,
} from './actions';
import { cityCondition, isSelfSufficient, type CityCondition } from './cityCondition';
import { onboardingAllows, onboardingOf, type OnboardingState } from './onboarding';

const TICK_RATE = 10;
export interface GrowthStats {
  readonly ready: true;
  readonly tick: number;
  readonly tickMs: number;
  readonly buildings: number;
  readonly countsByClass: readonly number[];
  /** Edifici che ospitano un uso come secondo, per indice di uso. */
  readonly mixedByClass: readonly number[];
  /** Edifici per tipologia, dalla piu' comune alla piu' rara. */
  readonly typologies: readonly (readonly [string, number])[];
  readonly levels: readonly number[];
  readonly builder: BuilderStats;
  readonly state: SimState;
  readonly paused: boolean;
  readonly speed: number;
  readonly message: string;
  readonly onboarding: OnboardingState;
  readonly condition: CityCondition;
  readonly unlockedSectors: readonly string[];
}

/** Cablaggio esclusivo di `?grow=1`: la scena sim normale non costruisce voxel. */
export class GrowthScene {
  private state: SimState;
  private readonly builder: Builder;
  private readonly loop = new FixedStepLoop(TICK_RATE, TICK_RATE);
  private lastTickMs = 0;
  private paused = false;
  private speed = 1;
  private healthyTicks = 0;
  private readonly unlocked = new Set<string>();
  private message = 'Choose a catalyst and place it on the island.';
  private clearanceMemo: { readonly key: string; readonly site: LandmarkSite } | null = null;

  constructor(
    world: VoxelWorld,
    private readonly map: TerrainMap,
    _region: ScenarioRegion,
    seed: number,
  ) {
    this.state = createSimState({ rngState: seed });
    this.builder = new Builder(world, map, seed);
  }

  advance(dt: number): void {
    if (!this.paused) this.loop.advance(dt * this.speed, () => {
      const start = performance.now();
      this.state = tick(this.state, this.map);
      this.state = this.builder.onTick(this.state);
      this.healthyTicks = isSelfSufficient(this.state) ? this.healthyTicks + 1 : 0;
      this.lastTickMs = performance.now() - start;
      // Le passate del Builder sono l'unico momento in cui il registry cambia:
      // quello che il cursore sapeva del riquadro sotto di se' e' di un tick fa.
      this.clearanceMemo = null;
    });
    this.builder.step();
  }

  placeCatalyst(x: number, y: number, target: BuildingClass | CatalystId): ActionResult {
    const failure = this.catalystFailure(x, y, target);
    if (failure !== null) return { success: false, reason: failure };

    // Prima di piazzare: dopo, i condannati sono ancora nel registry — restano
    // finche' i loro voxel non spariscono — e la stessa domanda risponderebbe di
    // nuovo lo stesso numero, facendo il doppio del lavoro per dirlo.
    const clears = this.clearanceAt(x, y, target).clears;

    const result = placeCatalyst(this.state, this.map, x, y, target);
    if (result.success) {
      const placed = result.state.catalysts[result.state.catalysts.length - 1];
      // Il ruolo e non la classe: e' il ruolo a decidere quale struttura
      // compare, e passare `placed.class` — come si faceva finche' il segno era
      // un voxel colorato — perdeva proprio l'informazione che serve.
      if (placed !== undefined) this.builder.placeLandmark(x, y, catalystRoleOf(placed));
      this.clearanceMemo = null;
    }

    return this.apply(result, clears === 0
      ? 'Catalyst placed.'
      : `Catalyst placed. Clearing ${clears} ${clears === 1 ? 'building' : 'buildings'} to make room.`);
  }

  catalystFailure(x: number, y: number, target: BuildingClass | CatalystId): ActionFailure | null {
    if (!onboardingAllows(this.state, target)) return 'onboarding-order';
    return catalystFailure(this.state, this.map, x, y, target);
  }

  /** Prezzo pesato dal terreno, per il cartellino sul cursore. */
  catalystSiteCost(x: number, y: number, target: BuildingClass | CatalystId): SiteCost | null {
    return catalystSiteCost(this.map, x, y, target);
  }

  /**
   * Cosa il riquadro del landmark troverebbe qui: quanti edifici porta via, o
   * perche' la struttura non ci sta.
   *
   * **Non e' un rifiuto**, ed e' per questo che non passa da `catalystFailure`:
   * il catalizzatore si piazza comunque e il suo campo funziona lo stesso. Cio'
   * che cambia e' quanto costa in citta' e se il monumento comparira' — due
   * cose che il giocatore deve sapere **prima** del click, ed e' l'unico posto
   * dove puo' saperle.
   */
  catalystSite(x: number, y: number, target: BuildingClass | CatalystId): LandmarkSite {
    return this.clearanceAt(x, y, target);
  }

  /**
   * Lo sventramento della colonna interrogata, con una voce di memoria.
   *
   * Il cursore fa **due** domande sulla stessa colonna a ogni movimento — «si
   * puo' piazzare?» e «quanti ne porta via?» — e la risposta e' la stessa
   * lettura del registry su tutto il riquadro del landmark. Una voce sola basta
   * a non pagarla due volte: le due domande arrivano di fila, e il click cade
   * dove il cursore ha appena chiesto.
   *
   * Si invalida a ogni tick e a ogni piazzamento, che sono gli unici due momenti
   * in cui il registry cambia: `step` scrive voxel, non record.
   */
  private clearanceAt(x: number, y: number, target: BuildingClass | CatalystId): LandmarkSite {
    const role = typeof target === 'number' ? defaultCatalystOfClass(target) : target;
    const key = `${x},${y},${role}`;
    if (this.clearanceMemo !== null && this.clearanceMemo.key === key) {
      return this.clearanceMemo.site;
    }
    const site = this.builder.landmarkClearance(x, y, role);
    this.clearanceMemo = { key, site };
    return site;
  }

  togglePolicy(id: PolicyId): ActionResult {
    const active = !this.state.policies.includes(id);
    return this.apply(togglePolicy(this.state, id), active ? 'Policy activated.' : 'Policy deactivated.');
  }

  /**
   * Applica un'alternativa e, se ne concede una, ne costruisce l'opera.
   *
   * L'opera si legge **prima** di risolvere: `resolveDecision` azzera
   * `pendingDecision`, e dopo non ci sarebbe piu' niente da cui ricavarla.
   */
  chooseDecision(optionId: string): ActionResult {
    const pending = this.state.pendingDecision;
    const grant = pending === null ? undefined : decisionOption(pending, optionId)?.grant;

    const result = this.apply(chooseDecision(this.state, optionId), 'Decision applied to the city.');
    if (result.success && grant !== undefined) this.buildGrant(grant);
    return result;
  }

  /**
   * Posa l'opera sul miglior sito che la citta' offre.
   *
   * Prima si cercano i candidati dell'uso che il ruolo porta, cosi' un mercato
   * nasce fra i negozi; se quell'uso non ha ancora niente si ripiega sui
   * candidati migliori in assoluto, che e' comunque il cuore della citta'.
   * Senza nessun candidato l'opera non si fa: la decisione resta valida e il
   * messaggio lo dice, invece di lasciare il giocatore a chiedersi cosa sia
   * successo.
   */
  private buildGrant(grant: DecisionGrant): void {
    const definition = catalystById(grant.kind);
    const depth = BALANCE.decisions.grant.searchDepth;
    const preferred = nextBuildSites(this.state, this.map, depth, { class: definition.class });
    const site = grantSite(this.state, this.map, grant.kind, preferred)
      ?? grantSite(this.state, this.map, grant.kind, nextBuildSites(this.state, this.map, depth));
    if (site === null) {
      this.message = `The city had no room for the new ${definition.label.toLowerCase()}.`;
      return;
    }

    this.state = addCatalyst(this.state, {
      x: site.x,
      y: site.y,
      class: definition.class,
      kind: grant.kind,
      strength: BALANCE.decisions.grant.strength,
      radius: BALANCE.decisions.grant.radius,
    });
    this.builder.placeLandmark(site.x, site.y, grant.kind);
    this.message = `${definition.label} built where the decision landed.`;
  }

  setTradeMode(mode: TradeMode): ActionResult {
    return this.apply(changeTradeMode(this.state, mode), 'Trade strategy updated.');
  }

  buyExpansion(sectorId: string): ActionResult {
    const result = buyExpansion(this.state, this.unlocked.has(sectorId));
    if (result.success) this.unlocked.add(sectorId);
    return this.apply(result, 'Coastal sector purchased.');
  }

  expansionFailure(sectorId: string): ActionFailure | null {
    return expansionFailure(this.state, this.unlocked.has(sectorId));
  }

  markSectorReady(): void {
    this.message = 'Coastal sector ready. The new land can support city growth.';
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setSpeed(speed: number): void {
    this.speed = speed === 2 || speed === 4 ? speed : 1;
  }

  setMessage(message: string): void {
    this.message = message;
  }

  get simState(): SimState {
    return this.state;
  }

  get statusMessage(): string {
    return this.message;
  }

  get registry(): ReadonlyBuildingRegistry {
    return this.builder.registry;
  }

  get stats(): GrowthStats {
    return {
      ready: true,
      tick: this.state.tickCount,
      tickMs: this.lastTickMs,
      buildings: this.builder.registry.count,
      countsByClass: [...this.builder.registry.countsByClass],
      mixedByClass: [...this.builder.registry.mixedByClass],
      typologies: [...this.builder.registry.typologyHistogram]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      levels: [...this.builder.registry.levelHistogram],
      builder: this.builder.stats,
      state: this.state,
      paused: this.paused,
      speed: this.speed,
      message: this.message,
      onboarding: onboardingOf(this.state),
      condition: cityCondition(this.state, this.healthyTicks),
      unlockedSectors: [...this.unlocked],
    };
  }

  private apply(result: ActionResult, successMessage: string): ActionResult {
    if (result.success) {
      this.state = result.state;
      this.message = successMessage;
    }
    return result;
  }
}
