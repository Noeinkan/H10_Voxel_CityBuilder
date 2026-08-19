/**
 * Unica fonte di verita' dei numeri della simulazione.
 *
 * Nessun altro file di `src/sim/` contiene coefficienti, soglie o moltiplicatori:
 * tutto passa da qui, cosi' la calibrazione e' un file solo. Le sole eccezioni
 * dichiarate sono le costanti aritmetiche del PRNG in `rng.ts` (che non sono
 * parametri di gioco) e i dati della scena di debug in `scenario.ts` (che sono
 * un fixture, non un bilanciamento).
 *
 * **Le policy non si scrivono qui a runtime.** `policyMultipliers` contiene i
 * valori nominali; attivare o disattivare una policy e' un'operazione sullo
 * stato (`setPolicyActive`), che ricalcola i pesi come prodotto dei
 * moltiplicatori attivi sul valore base. `balance.ts` resta immutabile.
 */

export const BALANCE = {
  // --- Stato iniziale ------------------------------------------------------

  start: {
    population: 0,
    food: 600,
    materials: 300,
    funds: 1200,
    /** Modificatore di soddisfazione, sempre in [0, 1]. */
    satisfaction: 0.5,
    /** Seme del PRNG dello stato. Zero e' un valore valido: mulberry32 lo accetta. */
    rngState: 0x5119_0001,
  },

  // --- Pesi base della simulazione ----------------------------------------
  //
  // Sono i valori su cui le policy applicano i loro moltiplicatori. I tre pesi
  // di desiderabilita' valgono 1 di proposito: senza policy attive il campo
  // deve valere esattamente `strength` al centro di un catalizzatore, e quello
  // e' un invariante verificato dai test.

  weights: {
    /** Abitanti ospitati da un edificio residenziale. */
    residentialCapacity: 24,
    /** Materiali prodotti per tick da un edificio produttivo a pieno organico. */
    productionYield: 2.5,
    /** Fondi consumati per tick da un edificio civico. */
    civicUpkeep: 2,
    /** Peso della somma dei catalizzatori nel campo, per classe. */
    desirabilityResidential: 1,
    desirabilityProduction: 1,
    desirabilityCivic: 1,
  },

  /** Moltiplicatori nominali delle policy. Il catalogo sta in `policies.ts`. */
  policyMultipliers: {
    denseHousing: 1.5,
    industrialSubsidy: 1.25,
    austerity: 0.7,
    greenBelt: 1.2,
    zoningRelief: 1.15,
    civicPride: 1.3,
  },

  // --- Azioni del giocatore -----------------------------------------------

  gameplay: {
    catalyst: {
      cost: [120, 150, 200] as readonly number[],
      strength: [210, 205, 195] as readonly number[],
      radius: [22, 20, 18] as readonly number[],
      /** Distanza di Chebyshev minima fra catalizzatori della stessa classe. */
      minDistance: 10,
      /** Varianti di fase 2. I primi tre preservano il ciclo guidato dell'MVP. */
      roles: {
        market: { cost: 120, strength: 210, radius: 22 },
        factory: { cost: 150, strength: 205, radius: 20 },
        park: { cost: 200, strength: 195, radius: 18 },
        port: { cost: 320, strength: 190, radius: 24 },
        transport: { cost: 240, strength: 185, radius: 26 },
        university: { cost: 360, strength: 200, radius: 21 },
        monument: { cost: 440, strength: 215, radius: 20 },
      },
    },
    policy: {
      denseHousing: { cost: 180, population: 24, upkeep: 1.8 },
      industrialSubsidy: { cost: 220, population: 36, upkeep: 2.4 },
      austerity: { cost: 100, population: 0, upkeep: 0.6 },
      greenBelt: { cost: 140, population: 12, upkeep: 1.2 },
      zoningRelief: { cost: 160, population: 24, upkeep: 1.4 },
      civicPride: { cost: 260, population: 72, upkeep: 2.8 },
    },
    expansion: {
      cost: 500,
      population: 48,
      /** Lato di un settore costiero, allineato a due chunk. */
      size: 64,
    },
    success: {
      population: 120,
      buildingsPerClass: 3,
      satisfaction: 0.4,
      /** Venti secondi a 10 tick/s di bilancio non negativo. */
      stableTicks: 200,
    },
    crisis: {
      foodReserve: 24,
      fundsReserve: 40,
      satisfaction: 0.2,
    },
  },

  // --- Distretti, commercio e decisioni ----------------------------------

  districts: {
    /** Scala comune che porta i contributi locali nel dominio 0..1. */
    metricScale: 180,
    /** Contributo minimo di un secondo ruolo per far emergere un distretto. */
    overlapThreshold: 0.22,
    catalystEffects: {
      market: { density: 55, wealth: 105, accessibility: 45, satisfaction: 25, industry: 0 },
      factory: { density: 25, wealth: 35, accessibility: 25, satisfaction: -55, industry: 145 },
      park: { density: -25, wealth: 35, accessibility: 10, satisfaction: 145, industry: -20 },
      port: { density: 30, wealth: 60, accessibility: 135, satisfaction: -20, industry: 85 },
      transport: { density: 95, wealth: 25, accessibility: 155, satisfaction: 5, industry: 20 },
      university: { density: 40, wealth: 105, accessibility: 55, satisfaction: 75, industry: 5 },
      monument: { density: 65, wealth: 70, accessibility: 35, satisfaction: 125, industry: -10 },
    },
    spatialPolicy: {
      denseHousing: { density: 45 },
      industrialSubsidy: { industry: 45, wealth: 20 },
      austerity: { satisfaction: -35 },
      greenBelt: { density: -25, satisfaction: 50 },
      zoningRelief: { density: 35, satisfaction: -20 },
      civicPride: { wealth: 20, satisfaction: 45 },
    },
  },

  trade: {
    foodReservePerResident: 1.5,
    materialReservePerBuilding: 2,
    importFoodPerTick: 8,
    importFoodPrice: 0.45,
    exportMaterialsPerTick: 5,
    exportMaterialPrice: 1.1,
    focusedMultiplier: 1.75,
    modeMultiplier: {
      balanced: { food: 1, materials: 1 },
      foodImports: { food: 1.75, materials: 0.5 },
      materialExports: { food: 0.5, materials: 1.75 },
    },
  },

  decisions: {
    /** Prima scelta non prima di 45 secondi di simulazione. */
    firstTick: 450,
    /** Novanta secondi di respiro dopo una scelta risolta. */
    intervalTicks: 900,
    minimumBuildings: 6,
    foodGrant: 120,
    materialGrant: 80,
    fundsGrant: 160,
    decisionCost: 90,
    satisfactionStep: 0.08,
    populationScale: 24,
    historyLimit: 12,
  },

  // --- Popolazione ---------------------------------------------------------

  population: {
    /**
     * Frazione dello spazio libero riempita per tick. Il tetto duro e'
     * `1 / (1 + migrationJitter)`: sopra, la crescita scavalcherebbe la capacita'
     * e la popolazione oscillerebbe invece di convergere.
     */
    growthRate: 0.06,
    /** Frazione dell'eccedenza che se ne va quando la capacita' scende. */
    declineRate: 0.12,
    /** Ampiezza del rumore sulla migrazione, in frazione della crescita. */
    migrationJitter: 0.2,

    /**
     * Quanto la soddisfazione pesa sulla crescita.
     *
     * A 0 la citta' cresce uguale che sia amata o odiata; a 1 una soddisfazione
     * nulla la ferma del tutto. Il fattore vale `1 - k + k * soddisfazione`,
     * quindi resta sempre in `[1 - k, 1]` e non puo' invertire il segno della
     * crescita.
     */
    satisfactionInfluence: 0.5,
    /** Frazione di popolazione persa per tick quando il cibo non basta. */
    /** Il cibo mancante rallenta e poi riduce la città, lasciando tempo per reagire. */
    starvationRate: 0.002,
    /**
     * Quanto la saturazione del suolo edificabile frena la crescita. Con
     * `edifici / colonne edificabili` a 1 il fattore va a zero: l'isola piena
     * smette di attirare gente invece di crescere all'infinito.
     */
    landPressure: 1,
  },

  // --- Cibo ----------------------------------------------------------------

  food: {
    /** Consumo per abitante per tick. */
    perResident: 0.05,

    /**
     * Cibo prodotto per tick da un edificio produttivo a pieno organico.
     *
     * Il valore non e' scelto a caso: `perProduction / perResident` fa 24, cioe'
     * esattamente `weights.residentialCapacity`. Un edificio produttivo sfama
     * quindi un edificio residenziale pieno, e una citta' in rapporto 1:1 sta in
     * pareggio alimentare. E' la relazione che rende leggibile il bilancio —
     * cambiare uno dei tre numeri senza guardare gli altri due la rompe.
     */
    perProduction: 1.2,
  },

  // --- Lavoro --------------------------------------------------------------

  work: {
    /** Frazione della popolazione disponibile come forza lavoro. */
    workforceShare: 0.45,
    /** Lavoratori richiesti da un edificio produttivo per andare a pieno regime. */
    workersPerProduction: 8,
  },

  // --- Fondi ---------------------------------------------------------------

  funds: {
    /** Gettito per abitante per tick. */
    taxPerResident: 0.12,
  },

  // --- Materiali -----------------------------------------------------------

  materials: {
    /** Manutenzione per edificio per tick, in materiali. */
    upkeepPerBuilding: 0.02,
  },

  // --- Soddisfazione -------------------------------------------------------

  satisfaction: {
    /** Livello di partenza verso cui si torna senza edifici civici. */
    base: 0.35,
    /** Contributo di un edificio civico finanziato. */
    perCivic: 0.05,
    /** Penalita' a piena saturazione degli alloggi. */
    crowdingPenalty: 0.4,
    /** Tetto al rapporto popolazione / capacita' usato nel calcolo dell'affollamento. */
    maxOccupancy: 4,
    /** Frazione della distanza dal bersaglio colmata per tick. In (0, 1]. */
    inertia: 0.08,
  },

  // --- Campo di desiderabilita' -------------------------------------------

  desirability: {
    /**
     * Raggio breve, in celle, entro cui gli edifici gia' presenti generano
     * congestione. Sta anche sul percorso incrementale: aggiungere un edificio
     * ricalcola esattamente il quadrato di Chebyshev di questo raggio.
     */
    congestionRadius: 3,
    /** Punti di desiderabilita' sottratti per ogni edificio nel raggio breve. */
    congestionPerBuilding: 6,
    /**
     * Soglia sotto cui una cella non e' candidata, per classe, indicizzata come
     * `BUILDING_CLASS`. La desiderabilita' deve superarla, non pareggiarla.
     */
    siteThreshold: [40, 30, 25] as readonly number[],
  },

  // --- Limiti duri ---------------------------------------------------------

  limits: {
    /**
     * Tetto di ogni stock. Non e' bilanciamento: e' la rete che impedisce a un
     * accumulo lungo di arrivare a `Infinity` e da li' a `NaN`.
     */
    maxStock: 1e9,
    /** Valore massimo rappresentabile in una cella del campo. */
    maxDesirability: 255,
  },
} as const;
