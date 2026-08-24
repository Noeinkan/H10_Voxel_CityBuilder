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
  // Sono i valori su cui le policy applicano i loro moltiplicatori. I quattro
  // pesi di desiderabilita' valgono 1 di proposito: senza policy attive il campo
  // deve valere esattamente `strength` al centro di un catalizzatore, per gli
  // usi che quel ruolo porta a pieno (influenza 1). E' un invariante verificato
  // dai test.

  weights: {
    /** Abitanti ospitati da un edificio residenziale. */
    residentialCapacity: 24,
    /**
     * Clienti serviti per tick da un edificio commerciale a pieno organico.
     *
     * Vale quanto `residentialCapacity` di proposito: un edificio commerciale
     * serve esattamente un edificio residenziale pieno, cosi' come un edificio
     * industriale ne sfama esattamente uno. Sono le due relazioni 1:1 che
     * rendono leggibile un bilancio a colpo d'occhio.
     */
    commercialCapacity: 24,
    /** Materiali prodotti per tick da un edificio industriale a pieno organico. */
    productionYield: 2.5,
    /** Fondi consumati per tick da un edificio civico. */
    civicUpkeep: 2,
    /** Peso della somma dei catalizzatori nel campo, per uso urbano. */
    desirabilityResidential: 1,
    desirabilityCommercial: 1,
    desirabilityIndustrial: 1,
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
    marketCharter: 1.28,
  },

  // --- Azioni del giocatore -----------------------------------------------

  gameplay: {
    catalyst: {
      /** Distanza di Chebyshev minima fra catalizzatori dello stesso ruolo. */
      minDistance: 20,

      /**
       * Quanto ogni stadio del landmark aggiunge all'intensita' del suo
       * catalizzatore.
       *
       * **E' volutamente poco.** Il campo satura a 255 e le intensita' di
       * partenza stanno fra 185 e 215: uno stadio massimo aggiunge una
       * ventina di punti, cioe' un margine, non una seconda leva. Un porto
       * cresciuto vale un po' piu' di un porto appena piazzato — che e' la
       * ricompensa per aver sviluppato il quartiere attorno — ma la scelta
       * *quale* catalizzatore piazzare resta piu' importante di quanto a lungo
       * lo si e' lasciato crescere.
       *
       * Chi lo applica sta in `src/world/`, e passa da `setCatalystStrength`
       * come qualunque altra variazione: la simulazione non sa che i landmark
       * esistono, e questo numero e' l'unica cosa che il loro dominio le chiede.
       */
      stageBonus: 8,

      /**
       * Fin dove un landmark puo' sventrare per farsi posto.
       *
       * **Un landmark si pianta anche dentro l'edificato**, e il riquadro che
       * occupa viene sgomberato di cio' che ci trova. Non di tutto pero': oltre
       * questo livello il piazzamento rifiuta, e il giocatore deve cercare la
       * sacca bassa dentro il quartiere denso invece di cliccare dove gli pare.
       * E' cio' che tiene il gesto una lettura della citta' e non una gomma.
       *
       * **Quattro su dodici e' un terzo della scala**, cioe' il tessuto che una
       * citta' matura ha ancora attorno alle sue torri. Il numero e' l'unica
       * manopola di questa meccanica e va tarato a schermo: troppo basso, e nel
       * centro non si sventra piu' niente proprio dove il gesto ha senso;
       * troppo alto, e un monumento cancella un centro direzionale.
       *
       * Il costo non e' in fondi ed e' voluto: con un milione in cassa un
       * prezzo non vincola niente. Sventrare toglie edifici alla simulazione,
       * quindi capacita', quindi soddisfazione — il conto lo presenta `tick`
       * con il `crowdingPenalty` che ha gia'.
       */
      clearing: {
        maxLevel: 4,
      },

      /**
       * Costo, intensita' al centro e raggio di ciascun ruolo.
       *
       * **I raggi sono raddoppiati per conversione di unita', non per
       * bilanciamento.** Il voxel di contenuto vale meta' di quanto valeva:
       * un raggio di 22 copriva un certo numero di isolati, e per continuare a
       * coprirne altrettanti deve valere 44 voxel. Lasciarli fermi avrebbe
       * dimezzato la portata di ogni catalizzatore senza che nessuno lo avesse
       * deciso.
       *
       * `cost` e `strength` **non** si toccano: il primo e' denaro, il secondo
       * un'ampiezza di campo. Nessuno dei due e' una distanza.
       */
      roles: {
        market: { cost: 120, strength: 210, radius: 44 },
        factory: { cost: 150, strength: 205, radius: 40 },
        park: { cost: 200, strength: 195, radius: 36 },
        port: { cost: 320, strength: 190, radius: 48 },
        // Costa meno del porto perche' promette meno: il porto apre il commercio
        // con il mondo, il traghetto collega due punti dell'isola fra loro. E'
        // il collegamento *interno*, ed e' l'unico che serva a qualcosa su una
        // sponda dove non c'e' ancora niente da esportare.
        ferry: { cost: 260, strength: 180, radius: 46 },
        // Costa piu' del porto perche' non chiede la costa: il fronte mare e'
        // un anello e finisce, mentre una superficie ampia si trova ovunque a
        // patto di cercarla. La differenza di prezzo e' il vincolo di sito
        // riportato in denaro.
        airport: { cost: 420, strength: 185, radius: 50 },
        transport: { cost: 240, strength: 185, radius: 52 },
        university: { cost: 360, strength: 200, radius: 42 },
        monument: { cost: 440, strength: 215, radius: 40 },
      },

      /**
       * Quanto ciascun ruolo favorisce — o penalizza — ognuno dei quattro usi.
       *
       * E' la tabella che ha sostituito "un catalizzatore, una classe": un
       * mercato tira su negozi *e* case, una fabbrica tira su capannoni e caccia
       * via le abitazioni. I valori sono moltiplicatori di `strength`, quindi
       * stanno in `[-1, 1]`; un `1` esatto e' cio' che tiene in piedi
       * l'invariante "al centro il campo vale esattamente `strength`" per gli
       * usi che il ruolo porta a pieno. Uno zero non costa nulla: il campo
       * salta del tutto gli usi che un ruolo non tocca.
       */
      influence: {
        market: { residential: 1, commercial: 1, industrial: 0, civic: 0.15 },
        factory: { residential: -0.2, commercial: 0.2, industrial: 1, civic: 0 },
        park: { residential: 0.7, commercial: 0.2, industrial: -0.35, civic: 1 },
        port: { residential: 0, commercial: 0.7, industrial: 1, civic: 0 },
        // L'opposto del porto sullo stesso fronte mare: da un imbarco passano
        // persone, non container, quindi tira su negozi e case e lascia stare i
        // capannoni. E' cio' che rende sensato metterne uno dove un porto
        // rovinerebbe il quartiere.
        ferry: { residential: 0.75, commercial: 1, industrial: 0.15, civic: 0.35 },
        airport: { residential: -0.35, commercial: 1, industrial: 0.5, civic: 0.6 },
        transport: { residential: 1, commercial: 0.8, industrial: 0.45, civic: 0.2 },
        university: { residential: 0.5, commercial: 0.45, industrial: 0, civic: 1 },
        monument: { residential: 0.55, commercial: 0.75, industrial: -0.2, civic: 1 },
      },
    },
    policy: {
      denseHousing: { cost: 180, population: 24, upkeep: 1.8 },
      industrialSubsidy: { cost: 220, population: 36, upkeep: 2.4 },
      austerity: { cost: 100, population: 0, upkeep: 0.6 },
      greenBelt: { cost: 140, population: 12, upkeep: 1.2 },
      zoningRelief: { cost: 160, population: 24, upkeep: 1.4 },
      civicPride: { cost: 260, population: 72, upkeep: 2.8 },
      marketCharter: { cost: 200, population: 48, upkeep: 1.6 },
    },
    /**
     * Quando due imbarchi fanno una linea.
     *
     * **La coppia si misura in distanza e basta.** Qui non c'e' niente che sappia
     * dove sia l'acqua, e non deve esserci: la simulazione dichiara cosa un ruolo
     * pretende e la geografia la legge `src/world/`, esattamente come per il
     * vincolo di sito. Tutti e due gli imbarchi stanno gia' sulla costa — glielo
     * impone `'coastal'` — quindi «lontani e sul mare» e' quanto basta perche' la
     * linea sia una traversata e non un molo che guarda se stesso.
     */
    ferry: {
      /**
       * Distanza minima fra i due capi di una linea.
       *
       * Piu' del doppio di `minDistance`, che vieta solo di sovrapporre due
       * imbarchi: a quaranta voxel — venti cubi di terreno — i due moli non si
       * vedono piu' come una cosa sola, ed e' da li' che una barca ha un senso
       * invece di essere una passeggiata.
       */
      minRange: 44,

      /**
       * Distanza massima. Oltre, la linea non e' servita.
       *
       * Non e' un limite di navigazione ma di gioco: due imbarchi ai due capi
       * dell'isola collegherebbero tutto con tutto, e il traghetto smetterebbe di
       * chiedere dove metterlo. Vale un settore d'espansione e mezzo.
       */
      maxRange: 192,
    },

    expansion: {
      cost: 500,
      population: 48,
      /**
       * Lato di un settore costiero, allineato a quattro chunk.
       *
       * Segue il lato dell'isola: e' una frazione della costa, non una misura
       * assoluta, e a isola raddoppiata un settore da 64 avrebbe comprato un
       * ottavo di quello che comprava prima.
       */
      size: 128,
    },

    /**
     * La mensola posata a mano: il primo pezzo di citta' in quota che il
     * giocatore sceglie invece di guardare crescere.
     *
     * **Costa meno di un settore e piu' di niente.** Un settore costiero e' un
     * pezzo d'isola e vale cinquecento; una mensola e' un piano largo quanto una
     * facciata, e il suo prezzo deve rendere una scelta il *dove*, non il *se* —
     * a listino basso il giocatore ne semina ovunque e la quota smette di essere
     * un luogo per diventare una decorazione.
     *
     * La soglia di popolazione e' quella dell'espansione dimezzata: la citta' in
     * quota e' la risposta a un suolo che finisce, e proporla prima che il suolo
     * cominci a stringere insegnerebbe a costruire in alto per abitudine invece
     * che per necessita'.
     */
    terrace: {
      cost: 180,
      population: 24,
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
      ferry: { density: 50, wealth: 45, accessibility: 130, satisfaction: 40, industry: 10 },
      airport: { density: 35, wealth: 70, accessibility: 150, satisfaction: -35, industry: 45 },
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
      marketCharter: { wealth: 40, accessibility: 20, satisfaction: 15 },
    },

    /**
     * Conseguenza spaziale di un mandato, con la stessa forma di `spatialPolicy`.
     *
     * I valori sono piu' alti di quelli delle policy per due ragioni: al massimo
     * tre mandati sono attivi insieme — uno per famiglia — e devono scavallare
     * le soglie di `specialization` qui sotto, altrimenti il segno lasciato da
     * una decisione resterebbe sotto la risoluzione di `Math.floor` in
     * `generate.ts` e non si vedrebbe.
     */
    spatialCharter: {
      importedSupply: { wealth: 40, accessibility: 35, industry: -15 },
      rationing: { density: 55, satisfaction: -45 },
      communityGardens: { density: -45, wealth: 15, satisfaction: 60 },
      festivalGrounds: { density: 30, satisfaction: 55 },
      leasedSquare: { wealth: 50, accessibility: 30, satisfaction: -15 },
      localShops: { density: 35, wealth: 45, satisfaction: 20 },
      soldReserves: { wealth: 20, satisfaction: -35, industry: 55 },
      foodFair: { accessibility: 20, satisfaction: 55 },
    },

    /**
     * Soglie sul profilo locale che qualificano una specializzazione.
     *
     * Non sono usi urbani: sono aggettivi che si posano su un uso gia' deciso,
     * e servono alla tipologia edilizia. Il catalogo dei ruoli richiesti sta in
     * `districts.ts`, qui stanno solo i numeri.
     */
    specialization: {
      office: { wealth: 0.4, accessibility: 0.38, density: 0.4 },
      tourism: { wealth: 0.38, satisfaction: 0.56 },
      research: { wealth: 0.32, satisfaction: 0.44 },
      logistics: { accessibility: 0.42, industry: 0.38 },
      entertainment: { density: 0.38, satisfaction: 0.52 },
    },
  },

  /**
   * Commercio interno: il ciclo economico che si distingue da quello industriale.
   *
   * L'industria consuma lavoratori e produce materiali e cibo; il commercio
   * consuma lavoratori **e materiali** e produce fondi e soddisfazione. Sono
   * due catene diverse sullo stesso bacino di manodopera, ed e' la competizione
   * per quel bacino a rendere le due strategie leggibili l'una contro l'altra.
   */
  commerce: {
    /** Domanda di servizi generata da un abitante per tick. */
    demandPerResident: 1,
    /** Lavoratori richiesti da un edificio commerciale per andare a pieno regime. */
    workersPerCommercial: 5,
    /**
     * Materiali consumati per cliente servito.
     *
     * A 24 clienti un edificio commerciale pieno brucia 0,72 materiali per
     * tick, contro i 2,5 che produce un edificio industriale pieno: tre isolati
     * e mezzo di negozi vivono su una fabbrica sola. E' il numero che lega le
     * due catene invece di lasciarle indipendenti.
     */
    goodsPerCustomer: 0.03,
    /**
     * Fondi incassati per cliente servito.
     *
     * A 24 clienti fa 1,92 per tick, appena sotto i 2 che costa un edificio
     * civico: un isolato commerciale pieno paga quasi esattamente un servizio
     * pubblico.
     */
    revenuePerCustomer: 0.08,
    /** Contributo alla soddisfazione bersaglio con la domanda interamente servita. */
    satisfactionPerService: 0.18,
  },

  /**
   * Edifici a uso misto.
   *
   * Un edificio misto non e' una zona nuova: e' un edificio con un uso primario
   * e un secondo uso che ne porta una frazione di capacita' economica. Nasce
   * dove due campi compatibili superano insieme le loro soglie, quindi dalla
   * sovrapposizione, non da una scelta del giocatore cella per cella.
   */
  mixedUse: {
    /** Quota di capacita' economica che l'uso secondario porta nell'edificio. */
    secondaryShare: 0.5,
    /**
     * Frazione della soglia di sito che il secondo uso deve superare.
     *
     * Sotto 1 perche' il secondo uso e' ospite: chiedergli la stessa soglia del
     * primo renderebbe l'uso misto un evento raro proprio dove serve, cioe' nel
     * bordo sfumato fra due campi.
     */
    thresholdShare: 0.85,
    /**
     * Usi che possono convivere in un edificio, per indice di uso primario.
     *
     * Indici come in `BUILDING_CLASS`: 0 residenziale, 1 commerciale, 2
     * industriale, 3 civico. Il commerciale e' il connettore — sta con tutti,
     * ed e' l'unico che compare in ogni riga.
     */
    partners: [[1], [0, 3], [1], [1]] as readonly (readonly number[])[],
  },

  trade: {
    foodReservePerResident: 1.5,
    materialReservePerBuilding: 2,
    importFoodPerTick: 8,
    importFoodPrice: 0.45,
    exportMaterialsPerTick: 5,
    exportMaterialPrice: 1.1,
    /**
     * Cosa porta ciascun collegamento con l'esterno.
     *
     * Le chiavi sono ruoli di catalizzatore, e sono l'elenco completo di chi
     * commercia: un ruolo che non compare qui non apre nessun canale. I valori
     * moltiplicano la capacita' di listino e si sommano fra collegamenti, cosi'
     * il secondo aggiunge invece di sovrapporsi.
     *
     * I due profili sono opposti di proposito. Il porto muove volume: carica
     * tutto quello che il listino prevede, al suo prezzo. L'aeroporto muove
     * valore: importa cibo in fretta perche' non aspetta una stiva piena, non
     * spedisce materiali sfusi, e su quel poco spunta un prezzo migliore.
     */
    link: {
      port: { food: 1, materials: 1, price: 1 },
      airport: { food: 1.6, materials: 0.25, price: 1.2 },
    },
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

    /**
     * L'opera concessa da un'alternativa: un catalizzatore ridotto.
     *
     * Non e' un ruolo nuovo. Un `Catalyst` porta forza e raggio propri,
     * indipendenti dalla riga di catalogo, quindi un giardino di quartiere e'
     * un `park` che pesa meno di quello che il giocatore paga — altrimenti una
     * decisione regalerebbe cio' che la toolbar fa pagare.
     */
    grant: {
      strength: 120,
      radius: 14,
      /** Candidati da scandire prima di rinunciare all'opera. */
      searchDepth: 24,
    },
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

    /**
     * Contributo di una linea di traghetto **aperta**, cioe' servita da due
     * imbarchi.
     *
     * E' l'unico effetto che una coppia porta e un molo solo no, ed e' li' che
     * «collega» smette di essere una parola: un imbarco isolato resta un
     * catalizzatore come gli altri — la sua influenza c'e' comunque — e cio' che
     * gli manca e' la linea. Vale quanto un paio di edifici civici finanziati,
     * perche' e' quello che sostituisce: sull'altra sponda ci si arriva.
     */
    perFerryLine: 0.05,

    /**
     * Linee oltre le quali la citta' non ringrazia piu'.
     *
     * Senza un tetto, il traghetto sarebbe la via piu' economica per comprare
     * soddisfazione all'infinito — due moli, un contributo, ripetere. Tre linee
     * sono gia' una rete su un'isola di questa scala.
     */
    maxFerryLines: 3,
  },

  // --- Campo di desiderabilita' -------------------------------------------

  desirability: {
    /**
     * Raggio breve, in colonne, entro cui gli edifici gia' presenti generano
     * congestione. Sta anche sul percorso incrementale: aggiungere un edificio
     * ricalcola esattamente il quadrato di Chebyshev di questo raggio.
     *
     * Raddoppiato con la scala del voxel, per la stessa ragione dei raggi dei
     * catalizzatori: e' una distanza. `congestionPerBuilding` invece e' punti di
     * desiderabilita' e resta dov'era.
     */
    congestionRadius: 6,
    /** Punti di desiderabilita' sottratti per ogni edificio nel raggio breve. */
    congestionPerBuilding: 6,
    /**
     * Soglia sotto cui una cella non e' candidata, per uso urbano, indicizzata
     * come `BUILDING_CLASS`. La desiderabilita' deve superarla, non pareggiarla.
     */
    siteThreshold: [40, 34, 30, 25] as readonly number[],
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
    /**
     * Quote che una cella puo' portare, al massimo.
     *
     * Non e' bilanciamento ne' una scelta di forma urbana: **quante quote una
     * colonna ammetta davvero lo dice il mondo**, che sa dove passa una soletta
     * e quanto e' alta. Questo e' il tetto del formato — il contatore per cella
     * e' un byte — e serve a impedire che un mondo mal configurato lo faccia
     * traboccare, non a decidere quanto sale la citta'.
     */
    maxStackPerColumn: 255,
  },
} as const;
