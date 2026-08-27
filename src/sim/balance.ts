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
     * serve esattamente un edificio residenziale pieno. E' la relazione 1:1 che
     * rende leggibile un bilancio a colpo d'occhio, e ha una gemella nel cibo —
     * dove pero' l'unita' non e' piu' la fabbrica ma il lotto agricolo, e il
     * listino sta in `farms` misurato in case sfamate.
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
       * Cosa un landmark puo' abbattere per farsi posto.
       *
       * **Un landmark si pianta anche dentro l'edificato, e demolisce il
       * costruito.** Il riquadro che occupa viene sgomberato di cio' che ci
       * trova — case, torri — e la struttura prende il loro posto: il gesto e'
       * una gomma dichiarata, e leggere la citta' non e' piu' un prerequisito
       * del piazzamento. Il costo non e' in fondi ed e' voluto: con un milione
       * in cassa un prezzo non vincola niente. Sventrare toglie edifici alla
       * simulazione, quindi capacita', quindi soddisfazione — il conto lo
       * presenta `tick` con il `crowdingPenalty` che ha gia'.
       *
       * **Un monumento non sostituisce un altro monumento.** Il riquadro che ne
       * contiene uno rifiuta, e il cursore lo segna in rosso: toccare i
       * monumenti resta un gesto esplicito, ed e' della gomma. Qui
       * `clearsLandmarks` resta spento, mentre `demolition.clearing` lo tiene
       * acceso: e' l'unica differenza fra piazzare e demolire.
       *
       * Il tetto resta aperto perche' la regola vive in `clearance.ts`, che e'
       * la stessa delle arcologie: li' la soglia e' un numero vero, qui vale
       * tutto il costruito.
       */
      clearing: {
        maxLevel: Number.POSITIVE_INFINITY,
        clearsLandmarks: false,
      },

      /**
       * Costo, intensita' al centro e raggio di ciascun ruolo.
       *
       * **Il raggio e' un budget di cammino, non una distanza in linea d'aria.**
       * Da quando la portata e' geodetica un passo fuori strada costa
       * `BALANCE.reach.land`, quindi nel tessuto un raggio `r` arriva a circa
       * `r / land` celle. I valori qui sono stati alzati di un quarto — l'inverso
       * esatto di `land = 1.25` — perche' la citta' lontano dalle strade
       * coprisse quanto copriva prima: e' una conversione di unita', come il
       * raddoppio che l'aveva preceduta quando il voxel di contenuto si e'
       * dimezzato.
       *
       * Cio' che **non** e' conversione, ed e' il senso della meccanica: lungo la
       * pavimentazione il budget si spende a costo pieno, quindi il quarto in
       * piu' resta tutto. Un mercato su un'arteria arriva davvero a 55 celle
       * lungo la strada, tagliando gli isolati si ferma sui 44 di prima, e
       * dietro un braccio di mare non arriva affatto.
       *
       * `cost` e `strength` **non** si toccano: il primo e' denaro, il secondo
       * un'ampiezza di campo. Nessuno dei due e' una distanza.
       */
      roles: {
        market: { cost: 120, strength: 210, radius: 55 },
        factory: { cost: 150, strength: 205, radius: 50 },
        park: { cost: 200, strength: 195, radius: 45 },
        // La crescita che sfama: una serra produce cibo e riconverte l'industria
        // vicina in torri idroponiche. Costa come la fabbrica perche' e' il suo
        // gemello sull'altra risorsa — li' i materiali, qui il pasto.
        greenhouse: { cost: 180, strength: 200, radius: 48 },
        power: { cost: 200, strength: 200, radius: 48 },
        school: { cost: 260, strength: 195, radius: 50 },
        port: { cost: 320, strength: 190, radius: 60 },
        // Costa meno del porto perche' promette meno: il porto apre il commercio
        // con il mondo, il traghetto collega due punti dell'isola fra loro. E'
        // il collegamento *interno*, ed e' l'unico che serva a qualcosa su una
        // sponda dove non c'e' ancora niente da esportare.
        ferry: { cost: 260, strength: 180, radius: 58 },
        // Costa piu' del porto perche' non chiede la costa: il fronte mare e'
        // un anello e finisce, mentre una superficie ampia si trova ovunque a
        // patto di cercarla. La differenza di prezzo e' il vincolo di sito
        // riportato in denaro.
        airport: { cost: 420, strength: 185, radius: 63 },
        transport: { cost: 240, strength: 185, radius: 65 },
        radio: { cost: 300, strength: 185, radius: 60 },
        lighthouse: { cost: 240, strength: 175, radius: 40 },
        // I landmark del gruppo identita' arrivano piu' lontano dei semi di
        // crescita: devono «incoronare» un quartiere gia' edificato e tenerlo
        // insieme, e una sfera pari a quella di un mercato non li distingue.
        // Il decadimento resta lineare, quindi la parte che supera davvero la
        // soglia di crescita e' una frazione del raggio: l'ampiezza extra e'
        // cio' che la riporta a coprire l'isolato, non solo il cuore.
        //
        // **Il raggio si paga al quadrato, ma si paga una volta sola.** Il
        // Dijkstra e il campo ricalcolano (2r+1)² celle e l'overlay le disegna
        // per intero, quindi ogni cella di raggio in piu' costa quattro volte;
        // e' pero' il costo di un piazzamento — un gesto del giocatore, non del
        // tick — e un raggio sotto il centinaio e' gia' comparso nelle misure
        // del progetto. La sfera ampia e' una scelta voluta e dichiarata.
        university: { cost: 360, strength: 200, radius: 90 },
        monument: { cost: 440, strength: 215, radius: 87 },
        museum: { cost: 380, strength: 195, radius: 89 },
        cathedral: { cost: 400, strength: 205, radius: 87 },
        theatre: { cost: 420, strength: 205, radius: 85 },
        stadium: { cost: 460, strength: 210, radius: 92 },
        // Il gemello del monumento sull'acqua: il prezzo da identita' con il
        // vincolo di sito riportato in denaro, come l'aeroporto — un lago o un
        // fronte mare non sono ovunque, e chi li ha se li paga.
        marina: { cost: 440, strength: 210, radius: 92 },
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
        // Il parco spinge la casa, ma non tanto da soffocare il commercio. A 0,7
        // il mercato (residenziale e commerciale a 1) e il parco sommati facevano
        // saturare il residenziale a 255 sull'intero centro, e il confronto a
        // parita' finiva sempre a favore della casa: nessun negozio nasceva mai
        // come uso primario, solo come secondo uso di una casa-bottega. A 0,55 il
        // parco corona ancora le case, e il commercio emerge dove il mercato
        // satura per primo.
        park: { residential: 0.55, commercial: 0.2, industrial: -0.35, civic: 1 },
        // La serra non accende l'industria: la **converte**. A far nascere i
        // capannoni che poi diventano torri idroponiche e' la fabbrica; qui le
        // case si avvicinano al cibo e i negozi lo vendono.
        greenhouse: { residential: 1, commercial: 0.4, industrial: 0, civic: 0.15 },
        power: { residential: -0.35, commercial: 0.25, industrial: 1, civic: 0 },
        school: { residential: 0.75, commercial: 0.25, industrial: -0.1, civic: 1 },
        port: { residential: 0, commercial: 0.7, industrial: 1, civic: 0 },
        // L'opposto del porto sullo stesso fronte mare: da un imbarco passano
        // persone, non container, quindi tira su negozi e case e lascia stare i
        // capannoni. E' cio' che rende sensato metterne uno dove un porto
        // rovinerebbe il quartiere.
        ferry: { residential: 0.75, commercial: 1, industrial: 0.15, civic: 0.35 },
        airport: { residential: -0.35, commercial: 1, industrial: 0.5, civic: 0.6 },
        transport: { residential: 1, commercial: 0.8, industrial: 0.45, civic: 0.2 },
        radio: { residential: 0.35, commercial: 1, industrial: 0.4, civic: 0.55 },
        lighthouse: { residential: 0.5, commercial: 0.35, industrial: -0.1, civic: 1 },
        university: { residential: 0.5, commercial: 0.45, industrial: 0, civic: 1 },
        monument: { residential: 0.55, commercial: 0.75, industrial: -0.2, civic: 1 },
        museum: { residential: 0.25, commercial: 0.6, industrial: -0.1, civic: 1 },
        cathedral: { residential: 0.5, commercial: 0.25, industrial: -0.15, civic: 1 },
        theatre: { residential: 0.35, commercial: 0.7, industrial: -0.15, civic: 1 },
        stadium: { residential: 0.3, commercial: 1, industrial: -0.05, civic: 0.55 },
        // Case e negozi sul fronte d'acqua, capannoni lontani: la stessa
        // direzione del traghetto, ma con la spinta civica del gruppo identita'.
        marina: { residential: 0.45, commercial: 0.85, industrial: -0.2, civic: 1 },
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
       * Il nucleo che arriva con il settore.
       *
       * **Un settore comprato e' terra, e la terra da sola non cresce.** La
       * crescita nasce dove il campo di desiderabilita' esiste, e il campo
       * esiste solo dove un catalizzatore l'ha acceso: senza questo nucleo il
       * giocatore pagava cinquecento fondi per un pezzo d'isola su cui non
       * compariva mai niente, e il messaggio che prometteva «the new land can
       * support city growth» descriveva una cosa che non succedeva.
       *
       * E' un mercato e non un ruolo nuovo, ed e' **piu' debole del listino**:
       * un borgo, non un centro. Deve bastare a far attecchire le prime case e
       * lasciare al giocatore la scelta di cosa fare del resto del settore —
       * che e' esattamente quello per cui il settore si compra.
       */
      seed: {
        kind: 'market',
        strength: 150,
        radius: 30,
      },
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
      materials: 35,
      population: 24,
    },

    /**
     * La funivia: due torri e una traversata che il terreno non concede.
     *
     * **La cosa piu' cara che il giocatore possa piazzare a mano**, ed e' la
     * misura del fatto che annulla un pezzo di geografia: un settore costiero
     * (cinquecento) compra altra isola, questa fa valere quella che c'e' gia'
     * dall'altra parte dell'acqua. A listino basso il mare smetterebbe di essere
     * un vincolo, e con lui mezza forma dell'isola.
     *
     * La soglia di popolazione e' quella dell'espansione: una funivia serve una
     * citta' che ha gia' due rive da collegare, e proporla prima insegnerebbe a
     * scavalcare l'acqua invece di occupare la terra.
     */
    ropeway: {
      cost: 620,
      materials: 120,
      population: 48,
    },

    /**
     * La gomma: lo strumento che demolisce cio' che il giocatore sceglie.
     *
     * **Non e' il piazzamento di un landmark, e non paga niente.** Il catalizzatore
     * demolisce per farsi posto e il suo costo e' il monumento che non compare; qui
     * il gesto e' la demolizione in se', e il conto lo presenta `tick` con il
     * `crowdingPenalty` che ha gia' — togliere edifici toglie capacita' e
     * soddisfazione. E' la stessa regola di `catalyst.clearing`, tenuta in un
     * oggetto proprio perche' sono due manopole distinte: chi alza il tetto di
     * demolizione del monumento non deve allargare anche la gomma.
     */
    demolition: {
      clearing: {
        maxLevel: Number.POSITIVE_INFINITY,
        clearsLandmarks: true,
      },
    },

    /**
     * I landmark: monumenti che coronano una citta' gia' edificata.
     *
     * Piazzarne uno su una citta' vuota gettava sotto la struttura un terrapieno
     * a scala di isolato — una mega-piattaforma di terra su niente. La soglia di
     * edifici costruisce il «gia' edificata»: sotto, il landmark non si piazza.
     */
    landmark: {
      requiredBuildings: 16,
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
      greenhouse: { density: 55, wealth: 45, accessibility: 35, satisfaction: 10, industry: 75 },
      power: { density: 30, wealth: 25, accessibility: 20, satisfaction: -65, industry: 150 },
      school: { density: 45, wealth: 70, accessibility: 40, satisfaction: 110, industry: -5 },
      port: { density: 30, wealth: 60, accessibility: 135, satisfaction: -20, industry: 85 },
      ferry: { density: 50, wealth: 45, accessibility: 130, satisfaction: 40, industry: 10 },
      airport: { density: 35, wealth: 70, accessibility: 150, satisfaction: -35, industry: 45 },
      transport: { density: 95, wealth: 25, accessibility: 155, satisfaction: 5, industry: 20 },
      radio: { density: 25, wealth: 55, accessibility: 150, satisfaction: 10, industry: 30 },
      lighthouse: { density: 15, wealth: 50, accessibility: 60, satisfaction: 70, industry: -15 },
      university: { density: 40, wealth: 105, accessibility: 55, satisfaction: 75, industry: 5 },
      monument: { density: 65, wealth: 70, accessibility: 35, satisfaction: 125, industry: -10 },
      museum: { density: 20, wealth: 120, accessibility: 45, satisfaction: 90, industry: 0 },
      cathedral: { density: 30, wealth: 35, accessibility: 20, satisfaction: 150, industry: -5 },
      theatre: { density: 55, wealth: 85, accessibility: 40, satisfaction: 130, industry: -5 },
      stadium: { density: 80, wealth: 40, accessibility: 70, satisfaction: 85, industry: 0 },
      marina: { density: 55, wealth: 60, accessibility: 75, satisfaction: 85, industry: -10 },
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
      /**
       * La torre idroponica nasce **dove il suolo e' finito**, non dove il cibo
       * scarseggia: la fame e' un fatto della citta' intera e questo profilo
       * descrive una colonna. Le due soglie restano in cima al gruppo — densita'
       * da centro, alla pari con `office`, e l'impatto industriale piu' alto di
       * tutti — ed e' cio' che la tiene fuori dalla periferia, dove un campo
       * costa infinitamente meno e rende di piu' per fondo speso. L'ordine di
       * valutazione in `specializationOf` non cambia: `farming` si chiede per
       * prima, quindi la parita' su `density` non la fa perdere contro nessuno.
       *
       * **La densita' era 0,52, cioe' sopra il proprio soffitto.** I ruoli che
       * portano industria contribuiscono `density` 25 (fabbrica) e 55 (mercato):
       * sommati a influenza piena fanno 80 su `metricScale` 180, cioe' **0,444**.
       * Misurato piazzando i due catalizzatori sulla stessa colonna, il massimo
       * raggiungibile sulla mappa e' esattamente quello, e a sedici colonne di
       * distanza scende sotto 0,38. La soglia non era severa: era irraggiungibile
       * per costruzione — nessuna citta' di soli ruoli di crescita poteva
       * esprimere `farming`, e la via verticale al cibo restava dichiarata in tre
       * documenti e chiusa nei numeri.
       *
       * L'altra meta' del cancello e' il `minLevel` della torre, e **quella non si
       * tocca**: vive nel catalogo delle tipologie, fuori di qui, insieme alla
       * ragione per cui abbassarla svuota lo skyline industriale.
       *
       * A 0,40 la fascia che qualifica esiste ed e' stretta: si apre solo dove
       * mercato e fabbrica si sovrappongono davvero, e si richiude appena i due
       * si allontanano. E' la stessa promessa di prima — una torre e' rara e si
       * guadagna — detta con un numero che sta sotto il soffitto invece che
       * sopra.
       *
       * **La serra e' la terza porta, e la sola dentro la crescita.** Finche'
       * `farming` chiedeva fabbrica o universita', il cibo verticale restava un
       * lusso del gruppo identita'; una serra accanto a una fabbrica o a un
       * mercato supera adesso le due soglie con soli ruoli di crescita. Da sola
       * non basta — la sua densita' sta sotto 0,4 — quindi la torre resta una
       * conquista e non un piazzamento.
       */
      farming: { density: 0.4, industry: 0.34 },
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
    /**
     * Quanta della spesa alimentare della citta' un collegamento copre in un tick.
     *
     * **Era una quantita' assoluta, ed e' la correzione.** `importFoodPerTick: 8`
     * andava contro una domanda che vale `pop * food.perResident`, quindi sbagliava
     * da tutte e due le parti: a 240 abitanti un porto copriva il 667% della spesa
     * — la campagna non serviva — e a 3.268 ne copriva il 4,9%, cioe' era
     * decorativo. Il bersaglio della scorta qui accanto scala gia' con la
     * popolazione: era la portata a non scalare.
     *
     * **Un supplemento, mai un'alternativa**, ed e' scelto perche' resti tale: da
     * solo il porto copre il 12%, porto e aeroporto insieme il 31%, e con la
     * priorita' sul cibo si arriva al 55%. Il cibo e' l'unica risorsa che compete
     * per la **terra**, e un canale che sostituisse la campagna cancellerebbe
     * proprio la tensione che le da' un posto sulla mappa.
     */
    importFoodShare: 0.12,
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
    /**
     * Dopo quanto tempo senza cambiamenti la scelta contestuale si apre comunque.
     *
     * Sotto, una decisione ordinaria attende un cambiamento reale della citta'
     * (una nuova classe di edifici, un ordine di grandezza in piu' di abitanti):
     * una citta' ferma non viene interrotta. Questo tetto evita che resti muta
     * per sempre quando il giocatore costruisce senza cambiare categoria.
     */
    maxIdleTicks: 3000,
    /** Quanto dura il «decidi piu' tardi» prima che la carta ricompaia. */
    snoozeTicks: 600,
    minimumBuildings: 6,

    /**
     * Quanta della domanda alimentare deve restare servita perche' non sia
     * emergenza, e quanta ne serve perche' l'emergenza si consideri rientrata.
     *
     * **Non e' piu' il livello del magazzino, ed e' la correzione.** La scelta
     * si apriva sotto `trade.foodReservePerResident`, cioe' pretendeva una
     * scorta di trenta tick in dispensa; ma chi pianta i campi punta al
     * *pareggio* — `missingPlotsOf` copre il deficit e nient'altro — quindi una
     * citta' perfettamente sfamata tiene comunque uno stock intorno a zero. I
     * due bersagli erano incompatibili: il driver non poteva, per costruzione,
     * soddisfare la condizione dell'allarme, che percio' restava vera per
     * sempre. `fedShareOf` distingue la carestia dal pareggio — e' la ragione
     * per cui esiste — ed e' la domanda giusta da fare qui.
     *
     * Nove decimi e non il pareggio esatto: il raccolto arriva a scatti — un
     * lotto ritirato, una passata di semina che tarda — e chiedere il pieno
     * farebbe di ogni singhiozzo un'emergenza.
     */
    hungerThreshold: 0.9,

    /**
     * Quanto il **raccolto** deve coprire della domanda perche' l'emergenza si
     * consideri rientrata e possa tornare a scattare.
     *
     * **Si misura sulla produzione e non sui pasti**, ed e' il secondo mezzo
     * errore corretto. Con il riarmo su `fedShareOf` la scelta continuava a
     * ripresentarsi ogni novanta secondi — misurato: dieci aperture in novemila
     * tick, cioe' quante prima — perche' la dotazione appena concessa sfamava
     * la citta' per un centinaio di tick, il fronte si ricaricava su *quel*
     * pasto, e la carestia tornava puntuale appena il regalo finiva. L'allarme
     * si stava riarmando sulla propria risposta.
     *
     * Il raccolto invece una dotazione non lo tocca: rientra solo chi ha
     * piantato campi o convertito industria in torri, cioe' chi ha davvero
     * risolto. Una carestia strutturale viene percio' chiesta **una volta** — e
     * che sia in corso continua a dirlo la HUD, che e' il suo mestiere.
     *
     * Sopra il pareggio e non al pareggio: a copertura esatta ogni oscillazione
     * del raccolto riaprirebbe l'emergenza, e il margine e' cio' che distingue
     * una citta' che ce la fa da una che ci arriva per un pelo.
     */
    recoveryCoverage: 1.05,

    /**
     * Quanti tick di respiro compra una risposta all'emergenza alimentare.
     *
     * **La dotazione si misura in tempo, non in cibo**, ed e' l'unica unita' che
     * regge il confronto: `foodGrant` era una quantita', e una quantita' contro
     * una spesa che cresce con la citta' vale un intervento a quarantotto
     * abitanti e sette decimi di tick a tremila. Scalarla con la popolazione ha
     * chiuso meta' del problema; l'altra meta' era che nemmeno cento tick di
     * consumo sono un intervento — a schermo sono **dieci secondi**, e in dieci
     * secondi non si pianta niente.
     *
     * Seicento e' scelto contro `intervalTicks`: due terzi del tempo che manca
     * alla prossima decisione. Abbastanza perche' la citta' possa reagire —
     * piantare, convertire, aprire un canale — e non tanto da rendere il cibo un
     * problema risolto: quando il regalo finisce, se nessuno ha fatto niente, la
     * carestia e' ancora li'.
     */
    reliefTicks: 600,

    foodGrant: 120,
    materialGrant: 80,
    fundsGrant: 160,
    decisionCost: 90,
    satisfactionStep: 0.08,

    /**
     * L'unita' su cui si misura la taglia di una citta', in abitanti.
     *
     * Vale `weights.residentialCapacity`: un edificio residenziale pieno. Ci si
     * misurano i **costi** e le contropartite di una scelta — fondi spesi,
     * materiali convertiti — che devono pesare uguale a ogni taglia di citta':
     * finche' restavano piatti, a tremila abitanti i giardini di quartiere erano
     * cibo gratis.
     *
     * Il **cibo** invece non passa piu' di qui: la dotazione dell'emergenza si
     * conta in tick di respiro (`reliefTicks`) sulla spesa vera della citta',
     * senza l'arrotondamento a edifici interi che a popolazioni piccole rendeva
     * il regalo a scatti.
     */
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
     * Quanta domanda la **campagna** punta a coprire, non il bilancio.
     *
     * `missingPlotsOf` puntava al pareggio secco, e quel bersaglio ha una
     * conseguenza che non si legge finche' non la si vede in partita: una citta'
     * sfamata tiene la dispensa a **zero per costruzione**, perche' il raccolto
     * pareggia il pasto e non avanza niente. Da li' ogni oscillazione — un lotto
     * mangiato da un isolato, un tick di organico basso — e' subito carestia, e
     * non c'e' nessuna scorta a assorbirla.
     *
     * Il quindici per cento e' un margine, non una riserva: la scorta che ne
     * nasce e' l'avanzo che si accumula, e cresce solo finche' la popolazione non
     * raggiunge la campagna. Sta **sopra** `decisions.recoveryCoverage` apposta,
     * ed e' un contratto legato in `contracts.test.ts`: se il bersaglio stesse
     * sotto la soglia di rientro, piantare non riarmerebbe mai il fronte
     * dell'emergenza e la carestia si potrebbe dichiarare una volta sola.
     */
    targetCoverage: 1.15,
  },

  /**
   * I produttori di cibo, in ordine di `FARM_KIND`.
   *
   * **Il listino e' in edifici residenziali sfamati, non in cibo.** Un campo ne
   * sfama due, un frutteto uno, una torre sei; il cibo per tick lo fa
   * `FOOD_PER_HOUSE`, che e' derivato qui sotto da `residentialCapacity` e
   * `food.perResident` invece di essere un letterale. E' la stessa relazione 1:1
   * di prima — quando il cibo usciva dall'industria, `perProduction /
   * perResident` faceva esattamente `residentialCapacity` — detta pero' in modo
   * che non si possa piu' rompere per distrazione: cambiare la capacita' di una
   * casa muove il listino da solo.
   *
   * **`denseHousing` non tocca il listino, e deve essere cosi'.** La policy
   * moltiplica `residentialCapacity`, quindi la stessa casa ospita piu' gente e
   * mangia di piu' mentre un campo raccoglie sempre uguale: densificare stringe
   * la dispensa. E' la conseguenza giusta, ed e' l'unico posto da guardare se un
   * giorno la si volesse togliere.
   */
  farms: [
    /** Campo: la terra costa poco e rende poco per colonna, ma non chiede fondi. */
    { houses: 2, workers: 4, upkeep: 0 },
    /**
     * Frutteto: meno resa del campo, ma regge il pendio e sta bene in citta'.
     *
     * **Le braccia sono due e non tre, ed e' una correzione.** A tre, un frutteto
     * rendeva 0,4 di cibo per braccio contro gli 0,6 del campo: era peggiore *sia*
     * per terra *sia* per lavoro, cioe' non aveva nessun asse su cui valere la
     * pena. Il guaio si vedeva dal mandato `communityGardens`, che abbassa la
     * soglia di cio' che diventa frutteto: l'alternativa che suona alimentare
     * peggiorava il raccolto due volte.
     *
     * A parita' di cibo per braccio resta un solo costo, ed e' quello giusto: il
     * frutteto vuole **il doppio della terra** per lo stesso raccolto. E' proprio
     * cio' che il mandato promette di se' — *housing spreads low* — e la campagna
     * si allarga invece di rendere meno.
     */
    { houses: 1, workers: 2, upkeep: 0 },
    /**
     * Torre idroponica: non prende suolo agricolo e ne vale sei, ma e' industria
     * convertita — un'unita' qui e' un'unita' di materiali in meno — e si paga in
     * fondi per tick. E' il ripiego quando l'isola e' finita, non una scorciatoia.
     */
    { houses: 6, workers: 12, upkeep: 3.5 },
  ] as readonly { readonly houses: number; readonly workers: number; readonly upkeep: number }[],

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
    /** Scorta per edificio che negozi ed export non possono consumare. */
    reservePerBuilding: 2,
    /** Manutenzione per edificio per tick, in materiali. */
    upkeepPerBuilding: 0.02,
    /** Capacita' aggiunta da ogni livello, uguale per tutti gli usi. */
    capacityPerLevel: 0.25,
    /** Tetto del bonus: al livello 12 un edificio vale quattro edifici base. */
    maxCapacityBonus: 3,
    /** Il tessuto urbano cresce gratis; dal grattacielo in poi serve la filiera. */
    freeThroughLevel: 6,
    /** Base della curva quadratica dei costi degli upgrade. */
    upgradeBaseCost: 2,
    /** Scorta consumata quando si apre il cantiere di un'arcologia. */
    arcologyCost: 200,
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
     * Contributo di un ponte in quota che unisce la citta' primaria a un
     * settore secondario.
     *
     * Vale un po' piu' di una linea di traghetto: arriva soltanto dopo che le
     * due rive hanno prodotto torri abbastanza alte, quindi premia una fase
     * urbana piu' matura. Otto punti sono percepibili sulla migrazione senza
     * cancellare affollamento e servizi dal bersaglio della soddisfazione.
     */
    perIslandBridge: 0.08,

    /**
     * Linee oltre le quali la citta' non ringrazia piu'.
     *
     * Senza un tetto, il traghetto sarebbe la via piu' economica per comprare
     * soddisfazione all'infinito — due moli, un contributo, ripetere. Tre linee
     * sono gia' una rete su un'isola di questa scala.
     */
    maxFerryLines: 3,

    /** Un settore produce un ponte; il tetto difende salvataggi non affidabili. */
    maxIslandBridges: 8,
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
    /**
     * Punti di desiderabilita' sottratti per ogni edificio nel raggio breve.
     *
     * E' la manopola della **densita' urbana**: e' il solo termine che cresce con
     * gli edifici gia' posati, quindi decide quanti ne possono stare affiancati
     * prima che il campo scenda sotto la soglia di sito. Da 6 a 8 il nucleo saturo
     * ammette circa un quarto di edifici in meno nel raggio breve, e la citta'
     * resta meno fitta — con meno chunk e meno draw call, cioe' piu' frame — senza
     * toccare la portata dei catalizzatori.
     */
    congestionPerBuilding: 6,
    /**
     * Soglia sotto cui una cella non e' candidata, per uso urbano, indicizzata
     * come `BUILDING_CLASS`. La desiderabilita' deve superarla, non pareggiarla.
     */
    siteThreshold: [40, 34, 30, 25] as readonly number[],
  },

  // --- Portata dei catalizzatori ------------------------------------------

  /**
   * Quanto costa attraversare una cella, in celle.
   *
   * L'influenza di un catalizzatore non viaggia piu' in linea retta: si propaga
   * sulle celle percorribili, quindi l'acqua la ferma, un dirupo la rallenta e
   * una strada la porta piu' lontano. Questi numeri sono la forma che ne esce.
   *
   * **Nessuno scende sotto 1, ed e' un vincolo e non una taratura.** Il campo
   * ricalcola il quadrato di Chebyshev del raggio, e con un costo sotto 1 la
   * portata uscirebbe da quel quadrato: si perderebbe l'equivalenza fra
   * percorso incrementale e ricostruzione totale, che e' l'invariante su cui
   * poggia tutto `DesirabilityField`. Una strada quindi non costa *meno*: a
   * costare di piu' e' tutto il resto, e la strada vince in termini relativi.
   *
   * Di conseguenza la portata nel tessuto vale circa `radius / land`, cioe' meno
   * del raggio nominale: i raggi dei ruoli sono tarati su questo, non sulla
   * distanza in linea d'aria.
   */
  reach: {
    /** Pavimentazione: il riferimento, e la portata piena. */
    pavement: 1,
    /** Terra edificabile fuori strada. */
    land: 1.25,
    /** Ciglio e pendenza forte: si passa, ma il giro si sente. */
    steep: 2.5,
    /** Acqua: invalicabile. Dietro a un braccio di mare non c'e' citta'. */
    water: Infinity,
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
     * e quanto e' alta. Questo e' l'arresto d'emergenza, e serve a impedire che
     * un mondo mal configurato impili all'infinito sulla stessa cella.
     *
     * **Non e' piu' il tetto di un formato.** Lo era finche' le quote stavano in
     * un byte per cella; ora stanno in una mappa sparsa che non ha un massimo
     * suo, quindi il numero e' rimasto quello ma la ragione e' cambiata — e
     * abbassarlo e' una scelta legittima, non la rottura di una codifica.
     */
    maxStackPerColumn: 255,
  },
} as const;

/**
 * Cibo che un edificio residenziale pieno mangia in un tick.
 *
 * **E' derivato apposta.** Era il numero nascosto dentro `food.perProduction`, e
 * per leggerlo bisognava sapere che `perProduction / perResident` faceva
 * `residentialCapacity`: una relazione vera, documentata in tre posti, e che
 * nessun tipo difendeva. Ora e' un prodotto, quindi cambiare la capacita' di una
 * casa o il consumo di un abitante muove da solo tutto il listino di `farms`, e
 * il pareggio alimentare resta leggibile a colpo d'occhio — *un campo sfama due
 * case, un frutteto una, una torre sei*.
 *
 * Vale sulla capacita' **base**: e' un'ancora di lettura, non una quantita' di
 * runtime. Con `denseHousing` attiva una casa ne ospita di piu' e mangia di piu',
 * ed e' esattamente il senso di quella policy.
 */
export const FOOD_PER_HOUSE = BALANCE.weights.residentialCapacity * BALANCE.food.perResident;
