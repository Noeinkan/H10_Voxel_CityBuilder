/**
 * Che cosa e' un record, chiesto una volta sola.
 *
 * **Questo e' l'unico modulo della repo che legge i campi marker** —
 * `landmark`, `span`, `aerial`, `arcology`, `ropeway`, `aloft`. Prima erano una
 * sessantina di punti in diciannove file, ognuno con il proprio sottoinsieme
 * scritto a mano, e ognuno da rivisitare a mano quando nasceva una struttura
 * nuova: il commento di `save/capture.ts` lo diceva gia' — «l'unica cosa da
 * tenere allineata se un giorno nasce una sesta struttura» — con la sesta gia'
 * nata e le sedi da allineare rimaste diciannove.
 *
 * **La divisione del lavoro e' fra tabella e `switch`, e non e' arbitraria.**
 * Una domanda che ha per risposta si' o no sta in `STRUCTURE_TRAITS`, dove il
 * tipo `Record<StructureKind, ...>` obbliga a riempire la casella nuova. Una
 * domanda che sceglie *cosa fare* — quale generatore, quale contatore, quale
 * scheda — resta uno `switch` esaustivo alla sua sede, che e' il modo in cui il
 * compilatore la fa fallire invece di lasciarla cadere in un ramo di ripiego.
 * In tutti e due i casi il conto e' lo stesso: una struttura nuova rompe la
 * compilazione dove va decisa, e in nessun altro posto.
 *
 * **Cio' che la tabella non poteva dire e' rimasto fuori.** `takesGround` per la
 * citta' in quota dipende dalla *parte* e non dal tipo — una gamba prende suolo,
 * una passerella no — e vive dov'e' sempre stato, in
 * [`aerial/config.ts`](../aerial/config.ts). Alzarlo qui avrebbe voluto dire
 * mentire su quattro parti su sei.
 */

/**
 * I campi marker, e nient'altro.
 *
 * Un tipo strutturale invece di `BuildingRecord`: il registry importa questo
 * modulo, e chiedere a questo modulo il tipo del registry chiuderebbe il
 * cerchio. Il valore non si guarda mai — solo se c'e' — quindi `unknown` e'
 * abbastanza e non lega questo file ai sei tipi dei sei domini.
 */
export interface StructureMarkers {
  readonly landmark?: unknown;
  readonly span?: unknown;
  readonly aerial?: unknown;
  readonly arcology?: unknown;
  readonly ropeway?: unknown;
  readonly aloft?: boolean;
}

/**
 * Le sette cose che un record puo' essere.
 *
 * Sono sette e non sei perche' **un landmark su un tetto non e' un landmark**:
 * non prende il suolo delle proprie colonne (sotto c'e' chi lo ospita, e quello
 * il suolo se l'e' gia' preso) e per lo sventramento e' struttura e non
 * monumento. Erano gia' due casi distinti in `takesGroundOf` e in
 * `clearanceOf`, scritti come `landmark` piu' una condizione su `aloft`.
 */
export const STRUCTURE_KIND = {
  /** Un edificio, e basta: quello che cresce, promuove e la simulazione conta. */
  plain: 'plain',
  /** Un monumento fondato a terra. */
  landmark: 'landmark',
  /** Un monumento sul tetto di qualcun altro. */
  rooftopLandmark: 'rooftopLandmark',
  /** Una campata: non prende suolo, e cade con i suoi appoggi. */
  span: 'span',
  /** Una parte della citta' in quota: mensola, tratto, nodo, gamba, montante. */
  aerial: 'aerial',
  /** Un'arcologia. */
  arcology: 'arcology',
  /** La torre di una funivia. */
  ropeway: 'ropeway',
} as const;

export type StructureKind = (typeof STRUCTURE_KIND)[keyof typeof STRUCTURE_KIND];

/**
 * Il tipo di un record.
 *
 * **L'ordine dei rami e' l'ordine dell'esclusivita'.** Ogni `registry.add` della
 * repo posa un marker solo — verificato sui dieci punti che ne posano uno — con
 * la sola eccezione del monumento sul tetto, che posa `landmark` e `aloft`
 * insieme. Quindi l'ordine non decide niente per i record che esistono, e
 * `aloft` viene guardato dentro il ramo del landmark perche' e' li' che ha un
 * significato: da solo non ne ha mai avuto uno.
 */
export function structureKindOf(record: StructureMarkers): StructureKind {
  if (record.landmark !== undefined) {
    return record.aloft === true ? STRUCTURE_KIND.rooftopLandmark : STRUCTURE_KIND.landmark;
  }
  if (record.span !== undefined) return STRUCTURE_KIND.span;
  if (record.aerial !== undefined) return STRUCTURE_KIND.aerial;
  if (record.arcology !== undefined) return STRUCTURE_KIND.arcology;
  if (record.ropeway !== undefined) return STRUCTURE_KIND.ropeway;
  return STRUCTURE_KIND.plain;
}

/**
 * Le domande da si' o no che la citta' pone su un record.
 *
 * Ogni campo ha **una sede che lo chiede** ed e' nominato per la domanda, non
 * per il tipo che risponde di si': `hostsSpan` e non `isTower`. Sono
 * deliberatamente distinti anche dove oggi darebbero la stessa risposta —
 * reggere una campata, reggere una mensola e reggere un ponte sono tre domande
 * che il codice ha sempre risposto in modo diverso, e fonderle qui vorrebbe
 * dire cambiare comportamento di nascosto sotto un refactor.
 */
export interface StructureTraits {
  /**
   * E' cio' che sta **a terra** in una colonna, e quindi cio' che i vari
   * `buildingAt` cercano quando chiedono «l'edificio vero sotto questo punto».
   *
   * Non e' `plain`: un'arcologia e una torre di funivia sono fondate a terra e
   * i due `buildingAt` non le hanno mai escluse — escludevano quota, campate e
   * monumenti, che sono le tre cose che *attraversano* una colonna senza
   * esserne il fondo. Restringerlo a `plain` cambierebbe chi puo' fare da
   * ospite, ed e' una decisione, non un refactor.
   */
  readonly groundStructure: boolean;
  /** Sale di livello nella passata di `upgradeDriver`. */
  readonly promotes: boolean;
  /** Puo' fare da appoggio a una campata — `spanDriver.canSupport`. */
  readonly hostsSpan: boolean;
  /** Puo' ospitare una mensola o un percorso in quota — `aerialDriver.settled`. */
  readonly hostsAerial: boolean;
  /** Puo' fare da torre a un ponte fra settori — `crossingDriver.canAnchor`. */
  readonly hostsCrossing: boolean;
  /**
   * Porta un **uso urbano**: una `class` che la scheda e l'aggregato dell'isolato
   * leggono come edificio invece che come struttura.
   *
   * **Non e' `capturedAsBuilding` e non e' cio' che conta `tally`**, e le tre
   * domande non coincidono per ragioni diverse: la cattura non sa scrivere
   * un'arcologia come riga sola, il registro non conta le torri di una funivia.
   * Qui ci sono tutte e due. E' la domanda dei tre punti che guardano un record
   * dal lato di chi ci clicca sopra — `selection.usesOf`, `selection.blockAt`,
   * `SelectionPanelModel.isBuilding` — e nessuno dei tre ha mai escluso una
   * torre: prende suolo, ha una classe, e la scheda le mostra il livello come a
   * una casa. Preservato, e imparentato con la casella `promotes` della stessa
   * riga.
   */
  readonly hasUrbanUse: boolean;
  /** `recordStamp` sa ridisegnarlo dal solo record, quindi il salvataggio non lo pota. */
  readonly rebuildableFromRecord: boolean;
  /**
   * La cattura del salvataggio lo restituisce come edificio singolo.
   *
   * Non e' «la simulazione lo conta»: un'arcologia la simulazione la conta
   * eccome, ma per fascia e su piu' colonne, e `countedBuilding` non saprebbe
   * scriverla come una riga sola. La domanda e' quella di `save/capture.ts`.
   */
  readonly capturedAsBuilding: boolean;
}

/**
 * La tabella, che e' anche il censimento.
 *
 * **Le colonne riproducono il comportamento di oggi, riga per riga.** Dove una
 * casella sorprende, il commento dice da dove viene: la tabella e' il posto in
 * cui una risposta strana diventa visibile, non quello in cui si corregge di
 * straforo. Una casella che si vuole cambiare e' un incremento suo, con il suo
 * test.
 */
export const STRUCTURE_TRAITS: Record<StructureKind, StructureTraits> = {
  [STRUCTURE_KIND.plain]: {
    groundStructure: true,
    promotes: true,
    hostsSpan: true,
    hostsAerial: true,
    hostsCrossing: true,
    hasUrbanUse: true,
    rebuildableFromRecord: true,
    capturedAsBuilding: true,
  },
  [STRUCTURE_KIND.landmark]: {
    groundStructure: false,
    // Un landmark cresce di stadio e non di livello, su un altro segnale e con
    // un altro generatore: la sua passata se ne occupa da sola.
    promotes: false,
    // La sua sagoma cambia sotto i piedi di chi ci si appoggiasse.
    hostsSpan: false,
    hostsAerial: false,
    hostsCrossing: false,
    // Occupa spazio ma non e' un edificio: la `class` che il record porta non e'
    // mai stata letta come rendimento, ne' dalla scheda ne' dall'isolato.
    hasUrbanUse: false,
    rebuildableFromRecord: true,
    // Occupa spazio ma non e' un edificio: `addBuilding` non lo ha mai visto.
    capturedAsBuilding: false,
  },
  [STRUCTURE_KIND.rooftopLandmark]: {
    groundStructure: false,
    promotes: false,
    hostsSpan: false,
    hostsAerial: false,
    hostsCrossing: false,
    hasUrbanUse: false,
    rebuildableFromRecord: true,
    capturedAsBuilding: false,
  },
  [STRUCTURE_KIND.span]: {
    groundStructure: false,
    // Non ha un livello: e' l'edificio che la regge a cambiare, e quando cambia
    // lei cade con lui.
    promotes: false,
    hostsSpan: false,
    hostsAerial: false,
    hostsCrossing: false,
    hasUrbanUse: false,
    // `recordStamp` non conosce le campate: la cattura le pota e il caricamento
    // le rifa'.
    rebuildableFromRecord: false,
    capturedAsBuilding: false,
  },
  [STRUCTURE_KIND.aerial]: {
    groundStructure: false,
    // Mensole, tratti, nodi e gambe sono struttura, e non promuovono.
    promotes: false,
    // **Una campata si appoggia alla citta' in quota**, ed e' cosi' da sempre:
    // `canSupport` esclude solo campate e monumenti. Sorprende, ma toglierlo
    // qui cambierebbe la rete delle campate senza che nessuno l'abbia chiesto.
    hostsSpan: true,
    hostsAerial: false,
    hostsCrossing: false,
    hasUrbanUse: false,
    rebuildableFromRecord: false,
    capturedAsBuilding: false,
  },
  [STRUCTURE_KIND.arcology]: {
    groundStructure: true,
    // Cresce di stadio dentro un inviluppo che non cambia mai: promuoverla
    // vorrebbe dire rigenerarla come edificio, che non e'.
    promotes: false,
    hostsSpan: true,
    hostsAerial: false,
    hostsCrossing: false,
    // La scheda e l'isolato la contano fra gli edifici, ma leggono `uses` invece
    // di `class`: e' un edificio per uso, e gli usi sono piu' di uno.
    hasUrbanUse: true,
    rebuildableFromRecord: true,
    // **L'unica struttura che `addBuilding` vede davvero**, e la vede una volta
    // per fascia. La cattura pero' non la restituisce come edificio singolo —
    // il suo conto passa da `uses`, che solo `worldBands` sa ricostruire — ed e'
    // per questo che qui la casella e' falsa mentre `tally` la conta.
    capturedAsBuilding: false,
  },
  [STRUCTURE_KIND.ropeway]: {
    groundStructure: true,
    // **Preservato, e quasi certamente sbagliato.** `upgradeDriver` scandisce
    // `registry.all` ed esclude landmark, campate, quota e arcologie: le torri
    // di una funivia non le ha mai escluse, quindi oggi possono salire di
    // livello come un edificio civico qualunque. La tabella riporta cio' che
    // succede, non cio' che dovrebbe: cambiarlo e' un incremento suo, con il suo
    // test, e ora che la casella e' scritta si vede.
    promotes: true,
    // Stessa storia dal lato opposto: `canSupport` e `settled` non le escludono.
    hostsSpan: true,
    hostsAerial: true,
    hostsCrossing: false,
    // **Preservato, e parente stretto della casella `promotes` qui sopra.**
    // Nessuno dei tre punti dal lato del giocatore ha mai escluso una torre: la
    // scheda le mostra il livello, l'isolato la somma agli edifici e il suo
    // rendimento esce dalla `class` che il record porta comunque. Il giorno che
    // `promotes` si corregge, questa casella e' l'altra meta' della stessa
    // decisione.
    hasUrbanUse: true,
    rebuildableFromRecord: false,
    capturedAsBuilding: false,
  },
};

/** I tratti di un record, in una chiamata sola. */
export function traitsOf(record: StructureMarkers): StructureTraits {
  return STRUCTURE_TRAITS[structureKindOf(record)];
}

/** true se il record e' un edificio ordinario e nient'altro. */
export function isPlainBuilding(record: StructureMarkers): boolean {
  return structureKindOf(record) === STRUCTURE_KIND.plain;
}

/**
 * true se il record e' cio' che sta a terra in una colonna.
 *
 * E' la domanda dei due `buildingAt` — quello di `aerialDriver` e quello di
 * `landmarkDriver` — che la scrivevano come due liste di esclusioni diverse a
 * vedersi ma identiche nell'insieme: `landmark` copre gia' il monumento sul
 * tetto, quindi l'`|| record.aloft === true` del secondo non toglieva niente
 * che non fosse gia' fuori.
 */
export function isGroundStructure(record: StructureMarkers): boolean {
  return STRUCTURE_TRAITS[structureKindOf(record)].groundStructure;
}

/**
 * true se il record e' una campata.
 *
 * **Non e' un tratto**, ed e' giusto che non lo sia: `guideDriver` non chiede
 * «questa cosa regge qualcosa», chiede «questa cosa e' una campata», perche' una
 * campata non ha un sotto — misurarne il tetto per sapere da dove parte un
 * montante darebbe la quota di un ponte invece del piano che lo sostiene. Una
 * domanda sul tipo si risponde con il tipo.
 */
export function isSpan(record: StructureMarkers): boolean {
  return structureKindOf(record) === STRUCTURE_KIND.span;
}

/**
 * true se il record e' la torre di una funivia.
 *
 * Anche questa e' una domanda sul tipo e non un tratto: la fune **non e' un
 * record**, quindi lo sgombero non puo' dedurre dal registro che abbattendo la
 * torre resterebbe un cavo appeso al nulla. Lo sa solo chi riconosce la torre.
 */
export function isRopewayTower(record: StructureMarkers): boolean {
  return structureKindOf(record) === STRUCTURE_KIND.ropeway;
}

/**
 * true se il record e' un monumento, a terra o su un tetto.
 *
 * La fila di facciate lo salta perche' ha un altro generatore e cresce di stadio
 * invece che di livello. Sarebbe comodo scriverlo `!promotes`, e sarebbe
 * sbagliato: quel tratto e' falso anche per campate, quota e arcologie, e
 * toglierebbe dalla fila vicini che oggi ci entrano.
 */
export function isLandmark(record: StructureMarkers): boolean {
  const kind = structureKindOf(record);
  return kind === STRUCTURE_KIND.landmark || kind === STRUCTURE_KIND.rooftopLandmark;
}
