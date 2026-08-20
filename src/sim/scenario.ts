import type { TerrainMap } from '../world/terrain/TerrainMap';
import { catalystById, type CatalystId } from './catalysts';
import { BUILDING_CLASS, type BuildingClass } from './classes';
import type { Catalyst } from './DesirabilityField';
import { nextBuildSites } from './nextBuildSites';
import { addBuilding, addCatalyst, createSimState, type SimState } from './SimState';

/**
 * Catalizzatori piazzati da script per la scena di debug.
 *
 * Non e' bilanciamento e non e' gameplay: e' il fixture che riempie la scena
 * `?debug=1&sim=1` con qualcosa da guardare, finche' il giocatore non avra' un
 * input per piazzarli lui. Per questo i suoi numeri stanno qui e non in
 * `balance.ts`, che descrive le regole della simulazione, non una demo.
 *
 * Deterministico: dipende solo da `(terrainMap, region)`, senza PRNG e senza
 * ordine di visita. La stessa isola da' sempre gli stessi catalizzatori.
 */

const SCENARIO = {
  /**
   * Lato del reticolo su cui si cercano le posizioni.
   *
   * I punti che cadono in mare oltre `snapRadius` non producono un
   * catalizzatore, quindi su un'isola tonda i venticinque punti ne danno una
   * dozzina: sono i punti interni, che e' esattamente cio' che si vuole guardare.
   */
  lattice: 5,

  /** Raggio massimo entro cui accettare una colonna edificabile vicino al punto del reticolo. */
  snapRadius: 24,

  /**
   * Edifici del nucleo di partenza, piazzati sui migliori candidati.
   *
   * Senza, la scena mostrerebbe un campo di desiderabilita' bellissimo e un
   * bilancio fermo a zero: nessuno abita, nessuno lavora, nessuno paga le tasse.
   * Non e' la simulazione che costruisce — `tick` non piazza un edificio nemmeno
   * per sbaglio — e' la scena che le consegna una citta' iniziale, come farebbe
   * un salvataggio.
   *
   * Il rapporto conta: `BALANCE` e' tarato perche' un edificio industriale
   * sfami esattamente un edificio residenziale e un edificio commerciale ne
   * serva uno, quindi una citta' in rapporto 1:1 sta in pareggio. Lasciando
   * scegliere alla sola desiderabilita' si ottengono invece sedici edifici
   * civici e nessuna fattoria, e la scena mostra una citta' che muore di fame —
   * corretto come simulazione, inutile come demo.
   */
  seedBuildings: [
    { class: BUILDING_CLASS.residential, count: 10 },
    { class: BUILDING_CLASS.commercial, count: 6 },
    { class: BUILDING_CLASS.industrial, count: 10 },
    { class: BUILDING_CLASS.civic, count: 4 },
  ] as readonly { class: BuildingClass; count: number }[],

  /**
   * Ruolo, intensita' e raggio per posizione del reticolo, in ordine di
   * scansione. Ruoli e non usi: la fixture piazza catalizzatori, e ogni ruolo
   * porta con se' il proprio vettore di influenza.
   */
  slots: [
    { kind: 'park', strength: 220, radius: 26 },
    { kind: 'market', strength: 200, radius: 22 },
    { kind: 'factory', strength: 180, radius: 18 },
    { kind: 'transport', strength: 190, radius: 20 },
    { kind: 'port', strength: 170, radius: 16 },
    { kind: 'market', strength: 210, radius: 24 },
    { kind: 'university', strength: 160, radius: 20 },
    { kind: 'monument', strength: 180, radius: 18 },
  ] as readonly { kind: CatalystId; strength: number; radius: number }[],
} as const;

export interface ScenarioRegion {
  readonly minX: number;
  readonly minY: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

export interface ScenarioCatalystOptions {
  /** Lato del reticolo; resta un parametro della fixture, non del bilanciamento. */
  readonly lattice?: number;
}

/**
 * Catalizzatori sulle colonne edificabili del reticolo.
 *
 * Ogni punto del reticolo cerca la colonna edificabile piu' vicina con una
 * scansione ad anelli di Chebyshev crescenti: un punto caduto in mare scivola
 * sulla costa piu' vicina invece di sparire, e i punti che non trovano terra
 * entro `snapRadius` semplicemente non producono un catalizzatore.
 */
export function scenarioCatalysts(
  terrainMap: TerrainMap,
  region: ScenarioRegion,
  options: ScenarioCatalystOptions = {},
): readonly Catalyst[] {
  const out: Catalyst[] = [];
  const steps = Math.max(1, Math.floor(options.lattice ?? SCENARIO.lattice));
  let slot = 0;

  for (let gy = 0; gy < steps; gy++) {
    for (let gx = 0; gx < steps; gx++) {
      const spec = SCENARIO.slots[slot % SCENARIO.slots.length];
      slot++;

      // Centro della cella del reticolo, cosi' nessun punto cade sul bordo.
      const x = region.minX + Math.round(((gx + 0.5) * region.sizeX) / steps);
      const y = region.minY + Math.round(((gy + 0.5) * region.sizeY) / steps);

      const snapped = nearestBuildable(terrainMap, x, y, SCENARIO.snapRadius);
      if (snapped === null) continue;

      out.push({
        x: snapped.x,
        y: snapped.y,
        class: catalystById(spec.kind).class,
        kind: spec.kind,
        strength: spec.strength,
        radius: spec.radius,
      });
    }
  }

  return out;
}

/**
 * Stato iniziale della scena di debug: catalizzatori da script e un nucleo di
 * edifici sui migliori candidati.
 *
 * Gli edifici si piazzano uno alla volta rileggendo la lista dei candidati a
 * ogni passo, non prendendo i primi ventiquattro in un colpo solo: ogni edificio
 * alza la congestione intorno a se', quindi il secondo va scelto sul campo che
 * il primo ha lasciato. Prendendoli tutti insieme si otterrebbe un grumo di
 * ventiquattro celle adiacenti nel punto piu' caldo dell'isola.
 */
export function createScenarioState(terrainMap: TerrainMap, region: ScenarioRegion): SimState {
  let state = createSimState();
  for (const catalyst of scenarioCatalysts(terrainMap, region)) {
    state = addCatalyst(state, catalyst);
  }

  // A giro, non a blocchi: alternare le classi le mescola sul territorio invece
  // di dare a ciascuna il proprio quartiere, e ogni piazzamento alza la
  // congestione che il successivo deve schivare.
  const remaining = SCENARIO.seedBuildings.map((spec) => spec.count);
  let placed = true;
  while (placed) {
    placed = false;
    for (let i = 0; i < SCENARIO.seedBuildings.length; i++) {
      if (remaining[i] === 0) continue;
      const spec = SCENARIO.seedBuildings[i];
      const best = nextBuildSites(state, terrainMap, 1, { class: spec.class })[0];
      if (best === undefined) {
        remaining[i] = 0;
        continue;
      }
      state = addBuilding(state, best.mixed === -1
        ? { x: best.x, y: best.y, class: spec.class }
        : { x: best.x, y: best.y, class: spec.class, mixed: best.mixed });
      remaining[i]--;
      placed = true;
    }
  }

  return state;
}

/**
 * Colonna edificabile piu' vicina in distanza di Chebyshev, o null.
 *
 * Scansione ad anelli concentrici, ogni anello visitato in ordine di
 * coordinata: il primo risultato utile e' sempre lo stesso a parita' di mappa.
 */
function nearestBuildable(
  terrainMap: TerrainMap,
  x: number,
  y: number,
  maxRadius: number,
): { x: number; y: number } | null {
  if (terrainMap.isBuildable(x, y)) return { x, y };

  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const onHorizontalEdge = dy === -r || dy === r;
      for (let dx = -r; dx <= r; dx++) {
        // Solo il bordo dell'anello: l'interno e' gia' stato visitato.
        if (!onHorizontalEdge && dx !== -r && dx !== r) continue;
        if (terrainMap.isBuildable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }

  return null;
}
