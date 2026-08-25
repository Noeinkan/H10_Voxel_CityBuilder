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
import {
  Builder,
  type AloftRefusal,
  type BuilderStats,
  type LandmarkSite,
} from '../world/buildings/Builder';
import {
  footprintDepth,
  type BuildingRecord,
  type ReadonlyBuildingRegistry,
} from '../world/buildings/BuildingRegistry';
import { hasAloftRecipe } from '../world/landmarks/config';
import { createReachCost } from '../world/reachCost';
import { StreetNetwork } from '../world/streets/StreetNetwork';
import type { Facing } from '../world/streets/streetGrid';
import { BIOME } from '../world/terrain/config';
import type { Region } from '../world/terrain/region';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { puffsAt, type SmokePuff } from '../world/traffic/plume';
import { posesAt, type VehiclePose } from '../world/traffic/poses';
import { planTraffic, type TrafficRoute, type TrafficStructure } from '../world/traffic/routes';
import { wakeAt, type WakeMark } from '../world/traffic/wake';
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
  placeRopeway,
  placeTerrace,
  ropewayFailure,
  terraceFailure,
  togglePolicy,
  type ActionFailure,
  type ActionResult,
  type SiteCost,
} from './actions';
import type { TerraceRefusal } from '../world/aerial/terracePlan';
import type { RopewayRefusal } from '../world/ropeway/ropewayPlan';
import type { RopewayCable, RopewayRide } from '../world/buildings/ropewayDriver';
import { planRopewayRoutes } from '../world/traffic/ropewayRoutes';
import { cityCondition, isSelfSufficient, type CityCondition } from './cityCondition';
import { onboardingAllows, onboardingOf, type OnboardingState } from './onboarding';

const TICK_RATE = 10;

/**
 * I rifiuti del tetto, detti come gesti che il giocatore possa fare.
 *
 * Riusano i tre motivi della mensola invece di aggiungerne quattro: dicono gia'
 * le stesse cose — cerca un edificio, cercane uno piu' alto, cercane uno libero
 * — e un rifiuto nuovo si paga in una riga di testo per lingua ogni volta che si
 * aggiunge un modo di costruire in quota.
 */
const ALOFT_FAILURE: Readonly<Record<AloftRefusal, ActionFailure>> = {
  'needs-roof': 'needs-building',
  'roof-too-small': 'needs-building',
  'roof-too-low': 'building-too-short',
  'roof-occupied': 'no-room-aloft',
};

/** Il ruolo dietro uno strumento, che sia gia' un ruolo o solo un uso urbano. */
function roleOf(target: BuildingClass | CatalystId): CatalystId {
  return typeof target === 'number' ? defaultCatalystOfClass(target) : target;
}
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
  private terraceMemo: { readonly key: string; readonly refusal: TerraceRefusal | null } | null = null;
  private ropewayMemo: { readonly key: string; readonly refusal: RopewayRefusal | null } | null = null;

  /**
   * L'orologio del traffico, in secondi di gioco.
   *
   * Avanza con la velocita' scelta e si ferma in pausa: e' l'unica cosa che rende
   * le barche parte della simulazione invece che un'animazione che gira per conto
   * suo mentre la citta' e' congelata.
   */
  private clock = 0;

  private routes: readonly TrafficRoute[] = [];
  /** Le corse di funivia da cui le cabine di `routes` sono state calcolate. */
  private rides: readonly RopewayRide[] = [];
  /** Firma delle strutture da cui `routes` e' stato calcolato. */
  private routeKey = '';
  /** Conto grossolano che dice se valga la pena ricostruire quella firma. */
  private routeStamp = -1;

  /** Settori comprati e non ancora seminati: aspettano che il terreno arrivi. */
  private readonly pendingSectors: Region[] = [];

  constructor(
    world: VoxelWorld,
    private readonly map: TerrainMap,
    _region: ScenarioRegion,
    seed: number,
  ) {
    // Il costo di attraversamento entra qui e da nessun'altra parte: e' cio' che
    // rende geodetica l'influenza dei catalizzatori invece che in linea retta.
    // Senza, la simulazione ricadrebbe sulla Chebyshev di sempre, che su
    // un'isola di canali e terrazze prometteva citta' dall'altra parte del mare.
    this.state = createSimState({
      rngState: seed,
      reachCost: createReachCost(map, new StreetNetwork(seed)),
    });
    this.builder = new Builder(world, map, seed);
  }

  advance(dt: number): void {
    if (!this.paused) this.clock += dt * this.speed;
    if (!this.paused) this.loop.advance(dt * this.speed, () => {
      const start = performance.now();
      this.state = tick(this.state, this.map);
      this.state = this.builder.onTick(this.state);
      this.healthyTicks = isSelfSufficient(this.state) ? this.healthyTicks + 1 : 0;
      this.lastTickMs = performance.now() - start;
      // Le passate del Builder sono l'unico momento in cui il registry cambia:
      // quello che il cursore sapeva del riquadro sotto di se' e' di un tick fa.
      this.clearanceMemo = null;
      this.terraceMemo = null;
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

    const result = placeCatalyst(this.state, this.map, x, y, target, this.usesRooftop(x, y, target));
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

    // Il tetto parla per primo quando c'e' un tetto: sotto la colonna c'e' un
    // edificio, quindi «non e' terreno edificabile» sarebbe la risposta a una
    // domanda che nessuno ha fatto.
    const aloft = this.builder.landmarkAloftSite(x, y, roleOf(target));
    if (aloft.refusal !== null) return ALOFT_FAILURE[aloft.refusal];
    return catalystFailure(this.state, this.map, x, y, target, aloft.site !== null);
  }

  /**
   * true se questo ruolo, puntato su un edificio, si posa sul tetto.
   *
   * Serve a chi tiene il puntatore in mano: la colonna da interrogare non e'
   * quella del terreno dietro la torre ma quella della torre, e chi non lo sa
   * chiederebbe il posto sbagliato. E' la stessa distinzione della mensola.
   */
  catalystUsesRooftop(target: BuildingClass | CatalystId): boolean {
    return hasAloftRecipe(roleOf(target));
  }

  private usesRooftop(x: number, y: number, target: BuildingClass | CatalystId): boolean {
    return this.builder.landmarkAloftSite(x, y, roleOf(target)).site !== null;
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

  /**
   * Perche' una mensola non si puo' posare qui, o null se si puo'.
   *
   * La porta del cursore. Chiede al mondo con `terraceSite`, che **non scrive**,
   * e passa il rifiuto al gioco: e' la stessa coppia di domande dei
   * catalizzatori — cosa dice il luogo, cosa dice il bilancio — nello stesso
   * ordine.
   */
  terraceFailure(x: number, y: number): ActionFailure | null {
    return terraceFailure(this.state, this.terraceRefusalAt(x, y));
  }

  /**
   * Posa una mensola sull'edificio di questa colonna.
   *
   * **Si paga solo cio' che compare.** Il budget di chunk e' l'ultima parola e
   * si scopre scrivendo: se `placeTerrace` dice di no dopo che la convalida e'
   * passata, i fondi restano dove sono e il messaggio lo dice, invece di
   * addebitare una struttura che non c'e'.
   */
  placeTerrace(x: number, y: number): ActionResult {
    const result = placeTerrace(this.state, this.terraceRefusalAt(x, y));
    if (!result.success) return result;

    if (!this.builder.placeTerrace(x, y)) {
      return { success: false, reason: 'no-room-aloft' };
    }
    this.terraceMemo = null;
    return this.apply(result, 'Terrace built: the city gains a floor above the street.');
  }

  /**
   * Cosa il mondo dice di questa colonna, con una voce di memoria.
   *
   * Vale la stessa ragione di `clearanceAt`: il cursore fa la stessa domanda a
   * ogni `pointermove` e il click cade dove il cursore ha appena chiesto. Si
   * invalida a ogni tick, che e' l'unico momento in cui il registry cambia da
   * solo, e a ogni posa.
   */
  private terraceRefusalAt(x: number, y: number): TerraceRefusal | null {
    const key = `${x},${y}`;
    if (this.terraceMemo !== null && this.terraceMemo.key === key) {
      return this.terraceMemo.refusal;
    }
    const site = this.builder.terraceSite(x, y);
    const refusal = site.ok ? null : site.refusal;
    this.terraceMemo = { key, refusal };
    return refusal;
  }

  /**
   * Perche' una funivia non parte da qui, o null se parte.
   *
   * La porta del cursore, gemella di `terraceFailure`: chiede al mondo con
   * `ropewaySite`, che **non scrive**, e passa il rifiuto al gioco.
   */
  ropewayFailure(x: number, y: number): ActionFailure | null {
    return ropewayFailure(this.state, this.ropewayRefusalAt(x, y));
  }

  /**
   * Tira una funivia dalla colonna cliccata.
   *
   * **Si paga solo cio' che compare**, come per la mensola: se il budget di
   * chunk dice di no dopo che la convalida e' passata, i fondi restano dove sono
   * invece di addebitare due torri che non ci sono.
   */
  placeRopeway(x: number, y: number): ActionResult {
    const result = placeRopeway(this.state, this.ropewayRefusalAt(x, y));
    if (!result.success) return result;

    if (!this.builder.placeRopeway(x, y)) {
      return { success: false, reason: 'no-room-for-line' };
    }
    this.ropewayMemo = null;
    return this.apply(result, 'Ropeway open: the crossing no longer needs the ground.');
  }

  /** La stessa memoria di `terraceRefusalAt`, e per la stessa ragione. */
  private ropewayRefusalAt(x: number, y: number): RopewayRefusal | null {
    const key = `${x},${y}`;
    if (this.ropewayMemo !== null && this.ropewayMemo.key === key) {
      return this.ropewayMemo.refusal;
    }
    const site = this.builder.ropewaySite(x, y);
    const refusal = site.ok ? null : site.refusal;
    this.ropewayMemo = { key, refusal };
    return refusal;
  }

  /** Le funi da disegnare. Riferimento stabile finche' non ne nasce una. */
  ropewayCables(): readonly RopewayCable[] {
    return this.builder.ropewayCables;
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

  buyExpansion(sectorId: string, region: Region): ActionResult {
    const result = buyExpansion(this.state, this.unlocked.has(sectorId));
    if (result.success) {
      this.unlocked.add(sectorId);
      // Il nucleo non si pianta adesso: il terreno del settore non esiste
      // ancora, e la ricerca del sito guarderebbe colonne non generate.
      this.pendingSectors.push(region);
    }
    return this.apply(result, 'Coastal sector purchased.');
  }

  expansionFailure(sectorId: string): ActionFailure | null {
    return expansionFailure(this.state, this.unlocked.has(sectorId));
  }

  /**
   * Il settore e' arrivato: ci si pianta il nucleo che lo fa crescere.
   *
   * **Terra e crescita non sono la stessa cosa**, ed e' il difetto che questa
   * chiamata chiude. La citta' nasce dove il campo di desiderabilita' esiste, e
   * il campo esiste solo dove un catalizzatore l'ha acceso: un settore comprato
   * restava quindi un pezzo d'isola vuoto per sempre, mentre il messaggio
   * prometteva che ci sarebbe cresciuta la citta'. Il borgo che arriva con la
   * terra e' quella promessa mantenuta al minimo — abbastanza da far attecchire
   * le prime case, non abbastanza da decidere cosa diventera' il settore.
   */
  markSectorReady(): void {
    this.message = this.seedSectors()
      ? 'Coastal sector ready. A market opened on the new land: the city grows from there.'
      : 'Coastal sector ready. The new land can support city growth.';
  }

  /** Pianta il nucleo di ogni settore che ha ormai terreno sotto. */
  private seedSectors(): boolean {
    let seeded = false;
    for (let i = this.pendingSectors.length - 1; i >= 0; i--) {
      const spot = this.sectorSeedSite(this.pendingSectors[i]);
      if (spot === null) continue;
      this.pendingSectors.splice(i, 1);

      const seed = BALANCE.gameplay.expansion.seed;
      const kind = seed.kind as CatalystId;
      const definition = catalystById(kind);
      this.state = addCatalyst(this.state, {
        x: spot.x,
        y: spot.y,
        class: definition.class,
        kind,
        strength: seed.strength,
        radius: seed.radius,
      });
      this.builder.placeLandmark(spot.x, spot.y, kind);
      seeded = true;
    }
    return seeded;
  }

  /**
   * La colonna piu' centrale del settore su cui si possa costruire.
   *
   * Al centro e non al margine: un nucleo sul bordo spingerebbe meta' della
   * propria influenza sull'acqua, e il settore crescerebbe da un angolo invece
   * che da se stesso. Il passo grosso basta — si cerca un punto, non il punto.
   */
  private sectorSeedSite(region: Region): { readonly x: number; readonly y: number } | null {
    const centreX = region.minX + region.sizeX / 2;
    const centreY = region.minY + region.sizeY / 2;
    const step = 4;

    let best: { x: number; y: number } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let y = region.minY + step; y < region.minY + region.sizeY - step; y += step) {
      for (let x = region.minX + step; x < region.minX + region.sizeX - step; x += step) {
        const column = this.map.columnAt(x, y);
        if (column === null || !column.buildable) continue;
        if (this.builder.registry.isOccupied(x, y)) continue;
        const score = Math.abs(x - centreX) + Math.abs(y - centreY);
        if (score >= bestScore) continue;
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }

  /**
   * Dove stanno i mezzi in questo istante.
   *
   * Le rotte si ricalcolano **solo quando cambiano le strutture**: cercare una
   * rotta di mare visita qualche migliaio di celle, e rifarlo a ogni frame per
   * spostare una barca di un decimo di voxel sarebbe l'unica cosa qui dentro a
   * costare qualcosa.
   */
  trafficPoses(): readonly VehiclePose[] {
    this.syncTraffic();
    return posesAt(this.routes, this.clock);
  }

  /**
   * Il fumo dei fumaioli in questo istante.
   *
   * Una seconda lettura delle stesse rotte, non un secondo stato: uno sbuffo e'
   * dov'era la nave qualche secondo fa, quindi il pennacchio non ha niente da
   * conservare fra un frame e l'altro. In pausa si ferma con tutto il resto,
   * perche' l'orologio e' lo stesso.
   */
  trafficPuffs(): readonly SmokePuff[] {
    this.syncTraffic();
    return puffsAt(this.routes, this.clock);
  }

  /**
   * La schiuma che gli scafi hanno lasciato dietro di se'.
   *
   * La terza lettura delle stesse rotte, e non un terzo stato: un segno di scia
   * e' dov'era la nave qualche secondo fa, come uno sbuffo di fumo. Chi vola e
   * chi pende non ne lascia — la selezione sta in `wake.ts`, che sa quali mezzi
   * galleggiano; qui non c'e' un tipo da controllare.
   */
  trafficWake(): readonly WakeMark[] {
    this.syncTraffic();
    return wakeAt(this.routes, this.clock);
  }

  private syncTraffic(): void {
    // **Il caso comune e' un confronto fra due interi e un riferimento.** La
    // firma vera scorre il registry, che con duemila edifici e' l'unica cosa qui
    // dentro il cui costo cresce con la citta': i landmark e i catalizzatori sono
    // unita' e cambiano di numero solo quando il giocatore fa qualcosa, quindi
    // basta quel numero a sapere che non c'e' niente da rifare. Le funivie
    // portano gia' la propria risposta: il loro array cambia identita' solo
    // quando ne nasce una.
    const rides = this.builder.ropewayRides;
    // **La citta' che cresce alza le rotte di volo**, quindi non basta piu' che
    // cambino le strutture: un circuito calcolato quando l'aeroporto era in
    // mezzo ai campi resterebbe alla propria quota mentre attorno crescono
    // torri da centoquaranta voxel, e l'aereo ci passerebbe dentro. A scaglioni
    // pero', e non a ogni edificio — quello sarebbe una ricerca di rotta di mare
    // ogni volta che spunta una villetta. Sessantaquattro edifici e' molto meno
    // di quanto serve a cambiare la sagoma di un quartiere.
    const skyline = this.builder.registry.count >> 6;
    const stamp = this.builder.registry.landmarkCount * 1024 + this.state.catalysts.length
      + skyline * 1_048_576;
    if (stamp === this.routeStamp && rides === this.rides) return;
    this.routeStamp = stamp;

    const structures = this.trafficStructures();
    const key = `${skyline}|${structures
      .map((item) => `${item.id}@${item.cx},${item.cy}:${item.facing}:${item.aloft ? 1 : 0}`)
      .join('|')}`;
    if (key === this.routeKey && rides === this.rides) return;
    this.routeKey = key;
    this.rides = rides;
    this.routes = [
      ...planTraffic(
        structures,
        (x, y) => this.isOpenWater(x, y),
        (x, y) => this.ceilingAt(x, y),
      ),
      ...planRopewayRoutes(rides),
    ];
  }

  /**
   * Quanto e' alto cio' che occupa una colonna: terreno o costruito.
   *
   * E' l'unica cosa che `world/traffic/` sa della citta' vera, e arriva come
   * predicato per la stessa ragione dell'acqua — quel dominio non ha un registry
   * e non deve averne uno. Il terreno entra nel massimo insieme agli edifici:
   * un circuito che scavalcasse le torri e non la collina dietro sarebbe lo
   * stesso difetto guardato dall'altra parte.
   */
  private ceilingAt(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const ground = this.map.has(cx, cy) ? this.map.heightAt(cx, cy) : 0;
    return Math.max(this.builder.registry.supportAt(cx, cy).z, ground);
  }

  /**
   * Acqua navigabile: mare **gia' generato**.
   *
   * Il bioma di una colonna che non esiste ancora e' `ocean`, ed e' la risposta
   * giusta per il terreno e quella sbagliata per una barca: una rotta ci
   * passerebbe attraverso e la barca navigherebbe sul vuoto oltre il bordo del
   * mondo.
   */
  private isOpenWater(x: number, y: number): boolean {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    return this.map.has(cx, cy) && this.map.biomeAt(cx, cy) === BIOME.ocean;
  }

  /** I landmark, ridotti a cio' che il traffico deve sapere di loro. */
  private trafficStructures(): readonly TrafficStructure[] {
    const out: TrafficStructure[] = [];
    for (const record of this.builder.registry.all) {
      const kind = record.landmark;
      if (kind === undefined) continue;
      const catalyst = this.catalystOf(record, kind);
      if (catalyst === null) continue;
      out.push({
        id: record.id,
        kind,
        class: record.class,
        cx: catalyst.x,
        cy: catalyst.y,
        x: record.x,
        y: record.y,
        facing: (record.facing ?? 0) as Facing,
        z: record.baseZ,
        aloft: record.aloft === true,
      });
    }
    return out;
  }

  /**
   * Il catalizzatore che questo landmark rappresenta, o null.
   *
   * Ruolo **e** riquadro insieme, come in `landmarkDriver`: un ingombro largo
   * venti colonne ne contiene facilmente due, e il solo riquadro darebbe al
   * porto le linee del traghetto accanto.
   */
  private catalystOf(
    record: BuildingRecord,
    kind: CatalystId,
  ): { readonly x: number; readonly y: number } | null {
    const depth = footprintDepth(record);
    for (const catalyst of this.state.catalysts) {
      if (catalystRoleOf(catalyst) !== kind) continue;
      if (catalyst.x < record.x || catalyst.x >= record.x + record.footprint) continue;
      if (catalyst.y < record.y || catalyst.y >= record.y + depth) continue;
      return catalyst;
    }
    return null;
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
