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
    food: 400,
    materials: 200,
    funds: 1000,
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
    civicUpkeep: 6,
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
    starvationRate: 0.05,
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
