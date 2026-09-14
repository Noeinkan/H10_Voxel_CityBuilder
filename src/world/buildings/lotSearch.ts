import { columnKey } from '../chunkCoords';
import { groundKindAt, isCoastal, nearLand } from './siteWorks';
import { sightWater } from '../sites/siteRules';
import { GROUND } from '../grading/grade';
import { BlockMemo, LotMemo } from './lotMemo';
import { BUILDER, MAX_FOOTPRINT, MIN_FOOTPRINT } from './config';
import { placeLot, type Lot } from '../streets/lots';
import { FACING, type Facing } from '../streets/streetGrid';
import { decksAt, type BuildDeck } from '../aerial/decks';
import { deckLot } from '../aerial/deckLot';
import type { BuildContext } from './buildContext';

/**
 * Dove c'e' posto per un edificio: in pianta e in quota.
 *
 * **Perche' sta fuori dal `Builder`.** Il `Builder` tiene il ciclo, la nascita
 * di un edificio sul lotto e le statistiche; questa e' un'altra domanda, e si
 * riconosce dal fatto che ha uno stato tutto suo — due memo e una lista di siti
 * bocciati — che nessun'altra parte del ciclo legge. Tenerla dentro significava
 * che ogni ritocco alla ricerca passava per il file che tiene anche il tick.
 *
 * **Una sola porta per «e' libero?».** Le tre memorie qui dentro rispondono alla
 * stessa domanda con tre scadenze diverse — la colonna bocciata per l'infornata,
 * il rettangolo esaurito fino a che il mondo non libera suolo, il sito bocciato
 * per sempre — e la ragione per cui stanno insieme e' che divergerebbero se
 * qualcuno potesse consultarne una senza le altre.
 */
export class LotSearch {
  /**
   * Siti bocciati in modo definitivo.
   *
   * Ogni motivo di scarto e' permanente finche' il luogo non cambia: la
   * pendenza di una colonna non cambia e un'impronta non si sposta. Riproporre
   * un sito bocciato significherebbe rifare lo stesso calcolo con lo stesso
   * esito a ogni infornata.
   *
   * **La demolizione e' arrivata**, e con lei il caso che questo commento
   * aspettava: quando un cantiere di landmark porta via degli edifici, `onTick`
   * svuota l'insieme con `forget`, perche' una colonna bocciata perche' occupata
   * adesso puo' essere libera.
   */
  private readonly banned = new Set<number>();

  /**
   * Cio' che l'infornata in corso ha gia' scoperto cercando lotti.
   *
   * Non e' stato di gioco e non sopravvive a `buildPass`: il perche' — e perche'
   * questa e' la sola forma in cui il memo e' esatto — sta in `lotMemo.ts`.
   */
  private readonly lotMemo = new LotMemo();

  /**
   * Isolati senza piu' un lotto libero, da un'infornata all'altra.
   *
   * E' l'altra meta' della stessa ricerca — il rettangolo esaurito invece della
   * colonna bocciata — e vive piu' a lungo perche' il fatto che ricorda vale piu'
   * a lungo. La sua invalidazione e' `freedomEpoch`, che sale ogni volta che il
   * mondo rende di nuovo libera una colonna: `findLot` gliela mostra prima di
   * ogni ricerca, e il memo cade tutto quando cambia.
   */
  private readonly blockMemo = new BlockMemo();

  /**
   * Il lavoro della ricerca, contato e non cronometrato.
   *
   * Sono i tre numeri con cui le fasi 1.1 e 1.2 del memo sono state misurate,
   * da sonde poi buttate: stanno qui perche' a parita' di seme non oscillano, e
   * un rosso su di loro e' un rosso vero. Li legge `PassProfile`.
   */
  private searchCount = 0;
  private squareCount = 0;
  private columnCount = 0;

  /**
   * La citta' in quota entra da due sole domande, ed e' voluto: la ricerca deve
   * sapere se sopra una colonna presa corre una soletta, e quante volte una
   * soletta e' nata, non cosa ci sia costruito sopra.
   */
  constructor(
    private readonly ctx: BuildContext,
    private readonly decks: DeckProbe,
    /**
     * Cosa la ricerca chiede al tracciato: l'affaccio, il suolo che tiene, e
     * quando ha cambiato idea.
     *
     * Entra come sonda e non come rete per la stessa ragione di `decks`: la
     * ricerca deve sapere tre cose, e chi gliele risponde non e' affar suo. E'
     * anche cio' che tiene questo file indifferente a *quale* rete stradale ci
     * sia sotto — la maglia catastale o il tracciato organico.
     */
    private readonly roads: RoadsideProbe,
  ) {}

  /** Siti bocciati in modo definitivo, per la statistica del `Builder`. */
  get blacklisted(): number {
    return this.banned.size;
  }

  /** Ricerche di lotto fatte da inizio partita. */
  get searches(): number {
    return this.searchCount;
  }

  /** Quadrati d'impronta provati da `lotIsFree`. */
  get squaresTried(): number {
    return this.squareCount;
  }

  /** Colonne lette davvero: quelle a cui il memo non ha risposto. */
  get columnsRead(): number {
    return this.columnCount;
  }

  /** true se questa colonna e' gia' stata bocciata per sempre. */
  isBanned(key: number): boolean {
    return this.banned.has(key);
  }

  /**
   * Boccia la colonna per sempre.
   *
   * Il conteggio per motivo resta di chi rifiuta: qui la ragione non serve, e
   * tenerne una copia vorrebbe dire due liste da mantenere allineate.
   */
  ban(key: number): void {
    this.banned.add(key);
  }

  /**
   * **Il memo comincia qui e finisce con l'infornata.** Fra un giro e l'altro
   * un cantiere puo' aver chiuso, una prenotazione caduta, un impalcato
   * nascere: tre modi in cui una colonna bocciata torna libera, e nessuno dei
   * tre accade dentro una sola infornata.
   */
  beginPass(): void {
    this.lotMemo.reset();
  }

  /** Svuota tutto cio' che si ricorda. E' la porta di `Builder.forget`. */
  forget(): void {
    this.banned.clear();
    // Un isolato dichiarato pieno lo era rispetto al terreno di allora:
    // un'espansione puo' avergli aggiunto colonne edificabili sul fronte.
    // L'epoca lo direbbe gia' per i tre modi che il mondo conosce, ma questa e'
    // la porta dichiarata di «il terreno e' di nuovo libero», e chi la apre da
    // fuori non e' tenuto ad aver alzato un contatore.
    this.blockMemo.clear();
    //
    // Il memo dei lotti non ne avrebbe bisogno — nasce e muore dentro
    // `buildPass`, e qui non ci si arriva mai da li' dentro — ma svuotarlo costa
    // due `clear` su insiemi vuoti e toglie di mezzo la sola domanda che chi
    // legge si farebbe: «e se un giorno qualcuno chiamasse `forget` a meta'
    // infornata?».
    this.lotMemo.reset();
  }

  /**
   * Il suolo di questa colonna, come piano su cui appoggiare.
   *
   * **Era la porta della quota, e non lo e' piu'.** Finche' il piano si sceglieva
   * qui — cioe' *dopo* la ricerca del lotto — un lotto a terra il cui quadrato
   * comprendesse una colonna gia' costruita ripiegava sull'impalcato che ci
   * passava sopra, ci centrava l'impronta e la vedeva rifiutare dalla collisione
   * con l'ospite. Il rifiuto in quota non e' definitivo di proposito, quindi la
   * stessa colonna tornava a ogni infornata: misurato, **tremilasessantotto
   * rifiuti `occupied` su tremilacentotre**, e una citta' che scendeva da
   * quattrocentoventi edifici a centosessantanove. La quota si risolve ora dove
   * la roadmap dice che deve, cioe' sulla colonna che la simulazione propone
   * (`pickAerialLot`), e questa resta la risposta di sempre per il suolo.
   */
  groundDeck(x: number, y: number): BuildDeck {
    return decksAt([], this.ctx.terrain.heightAt(x, y))[0];
  }

  /**
   * Il lotto in quota su questa colonna, o `null` se non ce n'e' uno.
   *
   * **E' la riga che il dominio dichiarava e che non era mai stata scritta**:
   * «in quota il lotto e' l'impalcato — niente `findLot`, niente opere di terra,
   * niente fila». Finora il piano si sceglieva **dopo** la ricerca a terra, e
   * quella ricerca boccia la carreggiata come suolo preso: misurato su una citta'
   * di quattrocentoventi edifici, trentanove mensole su quarantacinque abbastanza
   * larghe erano escluse per il solo fatto di sporgere sopra l'asfalto — cioe'
   * per la ragione esatta per cui la fase le mette li'. Un impalcato venti voxel
   * piu' su non ha niente a che vedere con la strada che ha sotto.
   *
   * **Si prova solo dove il suolo e' gia' speso**, ed e' la stessa regola con cui
   * `pickDeck` preferisce il piano piu' basso: la citta' riempie il suolo prima
   * di alzarsi, e una partita che non arriva mai in quota resta identica a quella
   * di oggi. La prima domanda e' una lettura di `Set`, quindi su un'isola senza
   * impalcati questo metodo costa quanto costava non averlo.
   *
   * Il riquadro che torna non e' quello dell'impalcato ma il quadrato libero che
   * ci sta dentro: la parete a cui la mensola e' appesa sta nel riquadro, e
   * un'impronta centrata ci finiva sopra. Vedi `deckLot`.
   */
  pickAerialLot(x: number, y: number): BuildDeck | null {
    if (!this.decks.hasDeck(x, y)) return null;
    // Il suolo viene prima: finche' questa colonna offre ancora un lotto a terra,
    // e' li' che la citta' deve costruire. **Non e' `columnIsFree`**, che la
    // deroga della quota rende gia' vera qui: quella dice «questa colonna e'
    // ancora un lotto», questa dice «a terra non ce n'e' piu' uno», ed e' la
    // seconda a decidere se si sale.
    if (this.groundIsOpen(x, y)) return null;

    for (const deck of decksAt(this.ctx.registry.at(x, y), this.ctx.terrain.heightAt(x, y))) {
      if (deck.kind === 'ground' || deck.rect === undefined) continue;
      const lot = deckLot({
        rect: deck.rect,
        free: (cx, cy) => !this.ctx.registry.overlaps(cx, cy, 1, deck.z, 1),
        minSide: MIN_FOOTPRINT,
        maxSide: MAX_FOOTPRINT,
      });
      if (lot !== null) return { ...deck, rect: lot };
    }
    return null;
  }

  /**
   * Verso dove guarda un edificio nato su questo impalcato.
   *
   * **In quota non c'e' una carreggiata a cui accostarsi, ma un fronte c'e'
   * lo stesso**: e' la direzione in cui l'impalcato sporge, cioe' quella che dal
   * proprio ospite porta al vuoto. E' anche l'unica lettura che dia lo stesso
   * risultato per una mensola e per un pianerottolo — il secondo non ha un
   * ospite, e li' il fronte torna a essere quello della maglia sotto, che a
   * quella quota e' l'unica cosa da cui orientarsi.
   */
  aerialFacing(deckId: number): Facing | undefined {
    const deck = this.ctx.registry.get(deckId);
    if (deck === null) return undefined;
    const hostId = deck.supports?.[0];
    const host = hostId === undefined ? null : this.ctx.registry.get(hostId);
    if (host === null) return this.ctx.streets.facingOf(deck.x, deck.y, deck.footprint) ?? undefined;

    const dx = (2 * deck.x + deck.footprint) - (2 * host.x + host.footprint);
    const dy = (2 * deck.y + (deck.footprintY ?? deck.footprint)) -
      (2 * host.y + (host.footprintY ?? host.footprint));
    if (dx === 0 && dy === 0) return undefined;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? FACING.east : FACING.west;
    return dy > 0 ? FACING.north : FACING.south;
  }

  /**
   * true se il **suolo** di questa colonna e' ancora buono per un edificio.
   *
   * Sono le due sole ragioni per cui un suolo si spende — c'e' gia' sopra
   * qualcosa, oppure ci passa la carreggiata — e non ce n'e' una terza: il
   * terreno rifiutato e l'acqua al largo restano fuori da `columnIsFree`, dove
   * parlano del *terreno*, mentre un impalcato venti voxel piu' su non ha niente
   * a che vedere con cosa ha sotto. E' esattamente cio' che permette a una
   * mensola sopra un canale o sopra un viale di essere un lotto.
   */
  private groundIsOpen(x: number, y: number): boolean {
    return !this.roads.carries(x, y) && !this.ctx.registry.isOccupied(x, y);
  }

  /**
   * Lotto libero piu' vicino alla colonna proposta, anche fuori dal suo isolato.
   *
   * **Perche' non basta il proprio isolato.** I candidati della simulazione
   * arrivano ordinati per punteggio, e su un campo saturo — dove interi
   * quartieri toccano il massimo — a decidere e' il criterio di parita', cioe'
   * `x` e poi `y`. Il risultato e' che la simulazione ripropone all'infinito lo
   * stesso pugno di colonne nell'angolo minimo dell'area satura. Finche' quel
   * primo isolato aveva posto la citta' cresceva; appena si riempiva, ogni
   * infornata successiva ricadeva su un isolato gia' dichiarato pieno e la
   * crescita si fermava del tutto — quattordici edifici su un'isola intera.
   *
   * La colonna proposta designa quindi **un luogo, non un isolato**: se il suo
   * e' pieno si cerca in quelli attorno, dal piu' vicino al piu' lontano. Lo
   * scarto resta limitato dal raggio in isolati, cioe' da poche decine di
   * colonne: abbastanza per non fermarsi, troppo poco perche' un edificio nasca
   * dove la desiderabilita' non lo voleva.
   */
  findLot(x: number, y: number): Lot | null {
    // **Il memo si allinea qui e non a inizio infornata.** Costa tre letture di
    // contatore per ricerca — nulla, di fronte alle diecimila colonne che evita —
    // e in cambio nessun chiamante futuro puo' dimenticarsene: la memoria si
    // aggiorna dove la si usa.
    this.blockMemo.observe(this.freedomEpoch());
    this.searchCount++;
    const streets = this.ctx.streets;
    const origin = streets.blockAt(x, y);
    // Il rettangolo e' soltanto il limite di costo della ricerca. Comprende
    // isolati e interassi insieme: nessuno dei suoi bordi e nessuna cella
    // interna appartiene a un lotto urbanistico. Il primo posto libero viene
    // scelto per distanza dal candidato, quindi il pieno si addensa come una
    // macchia attorno al landmark invece di completare quadrati successivi.
    const radius = BUILDER.blockSearchRadius;
    const southWest = streets.blockRect({
      kx: origin.kx - radius,
      ky: origin.ky - radius,
    });
    const northEast = streets.blockRect({
      kx: origin.kx + radius,
      ky: origin.ky + radius,
    });

    // La costa e' un confine vero, l'isolato no. Un candidato che vede il mare
    // si centra sulla prima acqua navigabile: cosi' l'impronta attraversa la
    // battigia e genera una banchina senza allinearsi a un quadrato teorico.
    const terrain = this.ctx.terrain;
    const coast = isCoastal(terrain, x, y)
      ? sightWater(terrain, x, y, BUILDER.coastalRadius, true)
      : null;
    let targetX = x;
    let targetY = y;
    if (coast !== null) {
      if (coast.facing === FACING.east) targetX += coast.distance;
      else if (coast.facing === FACING.west) targetX -= coast.distance;
      else if (coast.facing === FACING.north) targetY += coast.distance;
      else targetY -= coast.distance;
    }

    return placeLot({
      rect: {
        x0: southWest.x0,
        y0: southWest.y0,
        x1: northEast.x1,
        y1: northEast.y1,
      },
      x: targetX,
      y: targetY,
      footprint: MAX_FOOTPRINT,
      facingAt: coast === null
        ? (lx, ly, side) => this.facingTowardNetwork(lx, ly, side)
        : () => coast.facing,
      accepts: (lx, ly, side) => this.lotIsFree(lx, ly, side),
      // **Solo il tessuto ordinario cerca l'affaccio.** Un'opera costiera passa
      // da `edgeOnly` e ha gia' un fronte suo — la banchina — e chiederle anche
      // la strada la sposterebbe via dall'acqua, che e' l'unica cosa per cui e'
      // li'.
      onFrontage: (lx, ly, side) => this.roads.frontage(lx, ly, side),
      // Un'opera costiera non passa di qui — `edgeOnly` ha una ricerca sua — e
      // non deve: la banchina *e'* il suo fronte, e chiederle un cortile sul
      // retro la spingerebbe via dall'acqua.
      onSetback: (lx, ly, side, facing) => this.hasSetback(lx, ly, side, facing),
      // Il rettangolo dipende dal solo isolato d'origine, e la scansione lo
      // percorre tutto: due candidati dello stesso isolato fanno la stessa
      // domanda in un altro ordine. Il secondo la salta, e da adesso anche il
      // primo dell'infornata dopo — finche' l'epoca non cambia.
      exhausted: (side) => this.blockMemo.isExhausted(origin.kx, origin.ky, side),
      onExhausted: (side) => this.blockMemo.exhaust(origin.kx, origin.ky, side),
    });
  }

  /**
   * Quante volte il mondo ha reso di nuovo libero un **suolo**.
   *
   * Somma di tre contatori monotoni, uno per ciascun modo in cui `lotIsFree` puo'
   * cambiare idea su una colonna che aveva bocciato: il registry che rilascia una
   * prenotazione o toglie un record, un chunk di terreno che arriva dove non
   * c'era isola, una strada che si sposta. Non dice **cosa** e' cambiato, e non
   * serve: chi la legge butta via tutto quello che sapeva.
   *
   * Sono tre e non uno perche' ciascuno sta accanto alla domanda che invalida —
   * `isOccupied`, il terreno, la carreggiata — e un quarto modo di liberare suolo
   * dovra' portarsi il proprio contatore, non aggiungere un gancio qui.
   *
   * **Ce n'era un quarto, ed era l'impalcato che nasce.** Valeva finche' un
   * impalcato rendeva di nuovo candidabile il suolo che copriva; da quando il
   * lotto in quota si risolve per conto suo (`pickAerialLot`), un impalcato non
   * cambia niente di cio' che questo memo ricorda, e tenerlo qui buttava via
   * l'intera memoria degli isolati a ogni mensola.
   */
  private freedomEpoch(): number {
    return this.ctx.registry.vacated + this.ctx.terrain.chunkCount + this.roads.revision;
  }

  /**
   * Orienta la facciata verso l'asse stradale teorico piu' vicino senza usare
   * quell'asse come confine. Il tessuto puo' attraversarlo; se una strada viene
   * davvero collegata, `SurfaceQueue` le trovera' un percorso fra i pieni.
   */
  private facingTowardNetwork(x: number, y: number, footprint: number): Facing {
    const streets = this.ctx.streets;
    const touching = streets.facingOf(x, y, footprint);
    if (touching !== null) return touching;

    const centerX = x + Math.floor((footprint - 1) * 0.5);
    const centerY = y + Math.floor((footprint - 1) * 0.5);
    const dx = streets.nearestLine(0, centerX) - centerX;
    const dy = streets.nearestLine(1, centerY) - centerY;
    if (Math.abs(dx) <= Math.abs(dy)) return dx >= 0 ? FACING.east : FACING.west;
    return dy >= 0 ? FACING.north : FACING.south;
  }

  /**
   * true se il lotto lascia `BUILDER.backSetback` colonne d'aria davanti e
   * dietro. I fianchi non si guardano, ed e' il punto.
   *
   * **Accostarsi lungo la fila e' forma urbana; saldarsi in profondita' e' una
   * massa.** Due case che condividono il muro di fianco fanno un fronte
   * continuo sulla strada — e' cio' che `Frontage.snap` cerca apposta. Le stesse
   * due case saldate sul retro fanno sparire il cortile, e con lui l'unico vuoto
   * da cui la strada dietro si vedrebbe. La regola quindi non conta i vicini:
   * guarda **quali** lati, e l'orientamento e' cio' che glielo dice.
   *
   * Guarda l'occupazione e non la carreggiata: una strada davanti al portone e'
   * esattamente cio' che si vuole, e chiederle di stare piu' in la' arretrerebbe
   * il tessuto dalla via invece di allargare il cortile.
   */
  private hasSetback(x: number, y: number, footprint: number, facing: Facing): boolean {
    // Il fronte guarda est o ovest: la fila corre lungo y, e la profondita' e' x.
    const alongY = facing === FACING.east || facing === FACING.west;
    const registry = this.ctx.registry;

    for (let step = 1; step <= BUILDER.backSetback; step++) {
      const back = -step;
      const front = footprint - 1 + step;
      for (let d = 0; d < footprint; d++) {
        if (alongY) {
          if (registry.isOccupied(x + back, y + d)) return false;
          if (registry.isOccupied(x + front, y + d)) return false;
        } else {
          if (registry.isOccupied(x + d, y + back)) return false;
          if (registry.isOccupied(x + d, y + front)) return false;
        }
      }
    }
    return true;
  }

  /**
   * true se il quadrato e' libero, edificabile e non gia' bocciato.
   *
   * E' il predicato con cui `placeLot` cerca attorno al candidato, quindi viene
   * chiamato molte volte: fa solo letture per colonna — `TerrainMap` e
   * registry — e non genera niente. La pendenza **non** si controlla qui: la
   * verifica `surveyGround` a valle, e un lotto bocciato per pendenza finisce
   * fra i siti bocciati, che questa funzione consulta al giro dopo.
   */
  private lotIsFree(x: number, y: number, footprint: number): boolean {
    this.squareCount++;
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        const key = columnKey(cx, cy);
        // **Il memo per primo.** Dal secondo candidato dell'infornata in poi e'
        // quasi sempre lui a rispondere, e costa una lettura di `Set` al posto
        // delle quattro domande qui sotto.
        if (this.lotMemo.refuses(key)) return false;
        if (!this.columnIsFree(cx, cy, key)) {
          this.lotMemo.refuse(key);
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Le cinque ragioni per cui una singola colonna non regge un lotto.
   *
   * Sta a parte perche' e' la risposta che il memo tiene: dividere la domanda
   * per colonna dalla domanda per quadrato e' cio' che rende memorizzabile la
   * prima senza toccare la seconda.
   */
  private columnIsFree(x: number, y: number, key: number): boolean {
    this.columnCount++;
    // **La carreggiata e' suolo preso, esattamente come un edificio.**
    // `SurfaceQueue.canPaint` gia' si rifiutava di asfaltare una colonna
    // occupata, ma nessuno impediva il gesto opposto: su un'isola cresciuta,
    // quattrocentonovantanove colonne di carreggiata su ottocentoventuno
    // finivano sotto un edificio. La strada c'era nei dati, non a schermo — ed
    // e' l'intero motivo per cui la citta' si leggeva come una massa unica
    // invece che come isolati. L'affaccio qui sopra resta una preferenza sul
    // *dove*; questo e' un divieto sul *sopra*, e le due cose non si sostituiscono.
    if (this.roads.carries(x, y)) return false;
    // Letture senza allocazione: `columnAt` costruirebbe un oggetto e
    // `at` un array di record per ogni colonna, e qui le colonne si
    // contano a migliaia per infornata.
    // **Questa e' la domanda sul suolo, e la quota non la deroga.** Ci fu una
    // deroga — «se sopra corre una soletta il lotto esiste ancora, una quota
    // piu' su» — e la lettura era giusta ma il posto sbagliato: qui si cerca
    // un'impronta *a terra*, e lasciar passare una colonna costruita significava
    // consegnare a `place` un quadrato che il suolo non regge. Il lotto in quota
    // si risolve dove la roadmap dice, cioe' sulla colonna che la simulazione
    // propone: vedi `pickAerialLot`.
    if (this.ctx.registry.isOccupied(x, y)) return false;
    // Dalla 4.2 la battigia e il fianco in pendenza sono lotti come gli
    // altri: costano un'opera, non un rifiuto. Restano fuori solo la roccia
    // e l'acqua troppo profonda per una banchina.
    if (groundKindAt(this.ctx.terrain, x, y) === GROUND.refused) return false;
    // E l'acqua che una banchina reggerebbe ma che nessuno vorrebbe
    // edificata: un lotto al largo poggia su un pad isolato in mezzo al
    // mare, che e' lo stesso difetto dell'anello di carreggiata.
    if (!nearLand(this.ctx.terrain, x, y)) return false;
    return !this.banned.has(key);
  }
}

/**
 * Cio' che la ricerca chiede alla citta' in quota, e nient'altro.
 *
 * E' un'interfaccia e non `AerialDriver` perche' la freccia va in un verso solo:
 * la ricerca sa che sopra un suolo preso puo' correre una soletta, non sa cosa
 * sia un impalcato ne' chi lo abita.
 */
export interface DeckProbe {
  /** true se una soletta passa sopra questa colonna. */
  hasDeck(x: number, y: number): boolean;
}

/**
 * Cio' che la ricerca chiede al tracciato, e nient'altro.
 *
 * Le due domande non sono la stessa vista da due distanze. `frontage` chiede se
 * il lotto **vede** la strada e ordina i candidati; `carries` chiede se la
 * strada **e' li'**, e boccia. Un lotto sul fronte risponde true alla prima e
 * false alla seconda: e' esattamente la posizione che si vuole.
 */
export interface RoadsideProbe {
  /** true se un'impronta ancorata qui ha un affaccio su strada. */
  frontage(x: number, y: number, footprint: number): boolean;
  /** true se la carreggiata — o un impalcato — tiene questa colonna. */
  carries(x: number, y: number): boolean;
  /** Quante volte il tracciato e' cambiato: e' un quarto dell'epoca. */
  readonly revision: number;
}
