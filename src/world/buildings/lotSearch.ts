import { columnKey } from '../chunkCoords';
import { groundKindAt, isCoastal, nearLand } from './siteWorks';
import { sightWater } from '../sites/siteRules';
import { GROUND } from '../grading/grade';
import { BlockMemo, LotMemo } from './lotMemo';
import { BUILDER, MAX_FOOTPRINT } from './config';
import { placeLot, type Lot } from '../streets/lots';
import { FACING, type Facing } from '../streets/streetGrid';
import { decksAt, type BuildDeck } from '../aerial/decks';
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
   * La citta' in quota entra da due sole domande, ed e' voluto: la ricerca deve
   * sapere se sopra una colonna presa corre una soletta, e quante volte una
   * soletta e' nata, non cosa ci sia costruito sopra.
   */
  constructor(
    private readonly ctx: BuildContext,
    private readonly decks: DeckProbe,
    /**
     * Se un'impronta ancorata qui vede la carreggiata.
     *
     * Entra come funzione e non come rete per la stessa ragione di `decks`: la
     * ricerca deve sapere una cosa sola, e chi gliela risponde non e' affar suo.
     * E' anche cio' che tiene questo file indifferente a *quale* rete stradale
     * ci sia sotto — la maglia catastale o il tracciato organico.
     */
    private readonly roadside: (x: number, y: number, footprint: number) => boolean,
  ) {}

  /** Siti bocciati in modo definitivo, per la statistica del `Builder`. */
  get blacklisted(): number {
    return this.banned.size;
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
   * Su quale piano appoggia un'impronta di lato `side`.
   *
   * Il suolo finche' e' libero — ed e' il caso di ogni edificio finche' nessuno
   * ha costruito niente in quota — altrimenti si prende **l'impalcato piu'
   * basso** che abbia il volume sopra di se' libero: riempire il secondo livello
   * prima del terzo e' la stessa regola con cui la citta' riempie il suolo prima
   * di alzarsi.
   *
   * **In quota l'impalcato porta il proprio riquadro**, e chi chiama ci sposta
   * dentro il lotto. Il suolo non ne ha uno: li' il lotto l'ha gia' risolto la
   * ricerca continua al suolo.
   */
  pickDeck(x: number, y: number, side: number): BuildDeck {
    const decks = decksAt(this.ctx.registry.at(x, y), this.ctx.terrain.heightAt(x, y));

    for (const deck of decks) {
      if (deck.kind === 'ground') {
        if (!this.groundTaken(x, y, side)) return deck;
        continue;
      }
      // Una cella sola sopra il piano: se e' libera lo e' anche il resto, perche'
      // qualunque volume in quota parte da li'. La collisione vera la fa
      // `overlaps` sull'impronta e sull'altezza definitive.
      if (!this.ctx.registry.overlaps(x, y, 1, deck.z, 1)) return deck;
    }
    // Nessun piano libero: torna il suolo, e il rifiuto arriva da `overlaps` con
    // il motivo giusto invece che da qui con un ramo in piu'.
    return decks[0];
  }

  /** true se un edificio prende il suolo di una qualunque colonna dell'impronta. */
  private groundTaken(x: number, y: number, side: number): boolean {
    for (let dy = 0; dy < side; dy++) {
      for (let dx = 0; dx < side; dx++) {
        if (this.ctx.registry.isOccupied(x + dx, y + dy)) return true;
      }
    }
    return false;
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
      onFrontage: (lx, ly, side) => this.roadside(lx, ly, side),
      // Il rettangolo dipende dal solo isolato d'origine, e la scansione lo
      // percorre tutto: due candidati dello stesso isolato fanno la stessa
      // domanda in un altro ordine. Il secondo la salta, e da adesso anche il
      // primo dell'infornata dopo — finche' l'epoca non cambia.
      exhausted: (side) => this.blockMemo.isExhausted(origin.kx, origin.ky, side),
      onExhausted: (side) => this.blockMemo.exhaust(origin.kx, origin.ky, side),
    });
  }

  /**
   * Quante volte il mondo ha reso di nuovo libera una colonna.
   *
   * Somma di tre contatori monotoni, uno per ciascun modo in cui `lotIsFree` puo'
   * cambiare idea su una colonna che aveva bocciato: il registry che rilascia una
   * prenotazione o toglie un record, un impalcato che nasce sopra un suolo preso,
   * un chunk di terreno che arriva dove non c'era isola. Non dice **cosa** e'
   * cambiato, e non serve: chi la legge butta via tutto quello che sapeva.
   *
   * Sono tre e non uno perche' ciascuno sta accanto alla domanda che invalida —
   * `isOccupied`, `hasDeck`, il terreno — e un quarto modo di liberare suolo
   * dovra' portarsi il proprio contatore, non aggiungere un gancio qui.
   */
  private freedomEpoch(): number {
    return this.ctx.registry.vacated + this.decks.decksOpened + this.ctx.terrain.chunkCount;
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
   * true se il quadrato e' libero, edificabile e non gia' bocciato.
   *
   * E' il predicato con cui `placeLot` cerca attorno al candidato, quindi viene
   * chiamato molte volte: fa solo letture per colonna — `TerrainMap` e
   * registry — e non genera niente. La pendenza **non** si controlla qui: la
   * verifica `surveyGround` a valle, e un lotto bocciato per pendenza finisce
   * fra i siti bocciati, che questa funzione consulta al giro dopo.
   */
  private lotIsFree(x: number, y: number, footprint: number): boolean {
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
   * Le quattro ragioni per cui una singola colonna non regge un lotto.
   *
   * Sta a parte perche' e' la risposta che il memo tiene: dividere la domanda
   * per colonna dalla domanda per quadrato e' cio' che rende memorizzabile la
   * prima senza toccare la seconda.
   */
  private columnIsFree(x: number, y: number, key: number): boolean {
    // Letture senza allocazione: `columnAt` costruirebbe un oggetto e
    // `at` un array di record per ogni colonna, e qui le colonne si
    // contano a migliaia per infornata.
    // **Il suolo preso non chiude piu' la colonna per sempre.** Se sopra
    // corre una soletta il lotto esiste ancora, una quota piu' su: e' la
    // seconda delle tre assunzioni di colonna che la 4.9 rompe. La domanda
    // in piu' si paga solo su questo ramo — cioe' sulle sole colonne gia'
    // costruite — quindi una citta' senza piattaforme costa quello di prima.
    if (this.ctx.registry.isOccupied(x, y) && !this.decks.hasDeck(x, y)) return false;
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
  /** Quante solette sono nate finora: e' meta' dell'epoca di invalidazione. */
  readonly decksOpened: number;
}
