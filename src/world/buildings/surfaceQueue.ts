import { SURFACE_KIND } from '../visualBlock';
import type { TerrainMap } from '../terrain/TerrainMap';
import type { VoxelWorld } from '../VoxelWorld';
import { GROUND, isDryLand } from '../grading/grade';
import { StreetNetwork, type PavementCell } from '../streets/StreetNetwork';
import { STREET_ROLE, type BlockId } from '../streets/streetGrid';
import { STREETS } from '../streets/config';
import {
  blockNeighbours,
  nearestBlock,
  planCorridor,
  type CorridorLeg,
} from '../streets/corridor';
import type { ReadonlyBuildingRegistry, BuildingRecord } from './BuildingRegistry';
import { BUILDER } from './config';
import { STAMP_EMPTY } from './stamp';
import { groundKindAt, nearLand } from './siteWorks';

/**
 * Il suolo pubblico: carreggiata, grembiuli, piazze, e il salto che li regge.
 *
 * **Una coda e non una scrittura diretta**, per la stessa ragione della coda dei
 * volumi: l'anello di un isolato sono centinaia di colonne e ognuna puo' costare
 * sei voxel di muro, quindi applicarlo tutto nel frame in cui il primo edificio
 * lo giustifica farebbe cadere proprio il frame in cui la citta' si allarga.
 *
 * La priorita' serve a un caso solo ma ricorrente: due sorgenti che rivendicano
 * la stessa colonna — l'asse principale contro quello secondario, il grembiule
 * di un landmark contro la carreggiata. Vince la piu' alta, e vince anche a
 * posteriori, perche' `surfacePriority` ricorda cosa e' gia' stato dipinto.
 */

/**
 * Una colonna di superficie urbana da applicare.
 *
 * Dalla 4.2 porta anche una **quota di progetto**. Finche' la superficie era
 * solo colore, il piano era per forza quello del terreno e il salto restava
 * terreno nudo; con `deck` la stessa coda costruisce il salto, e le tre cose
 * che nella 4.2 devono salire — la rampa che porta alla banchina, il molo, la
 * piazza sopraelevata — sono la stessa operazione con tre quote diverse invece
 * di tre sottosistemi.
 */
export interface SurfacePaint {
  readonly x: number;
  readonly y: number;
  /**
   * Palette del piano calpestabile, oppure **0 per lasciare il terreno dov'e'**.
   *
   * Lo zero e' arrivato con i lotti agricoli: un campo non ripavimenta niente —
   * il grano cresce sul prato che c'e' gia' — e dargli un colore vorrebbe dire
   * inventare uno slot di terra arata dentro una palette che ne ha trentadue e
   * nessuno libero (invarianti 4 e 5). Chi passa 0 sta usando questa coda per la
   * sola `cover`, e allora `deck`, `wall` e `coping` non hanno senso: senza un
   * piano da reggere non c'e' nessun salto da costruire.
   */
  readonly palette: number;
  readonly priority: number;
  /** Quota del piano finito. Se manca, si dipinge il terreno dov'e'. */
  readonly deck?: number;
  /** Palette del muro che regge il piano, quando `deck` supera il terreno. */
  readonly wall?: number;
  /** Coronamento del muro: l'ultimo voxel sotto il piano calpestabile. */
  readonly coping?: number;
  /**
   * Marcatore di copertura da posare sul voxel **sopra** il piano.
   *
   * E' il modo in cui un solco coltivato entra nel mondo, e passa da qui e non
   * da uno stamp per una ragione di formato: uno stamp porta indici di palette e
   * `STAMP_EMPTY` vale 0, mentre un marcatore *e'* palette 0 — inesprimibile in
   * quel linguaggio. Questa coda invece dipinge colonne, che e' esattamente cio'
   * che fa un campo, e ci porta in dote la priorita': una carreggiata che ripassa
   * su un lotto vince, e il marcatore rimasto orfano sparisce da se', perche'
   * `coverToneOn` non trova piu' il proprio terreno sotto.
   */
  readonly cover?: number;
}

export class SurfaceQueue {
  private readonly queue: string[] = [];
  private readonly pending = new Map<string, SurfacePaint>();
  private readonly priority = new Map<string, number>();
  private head = 0;

  /**
   * Isolati la cui carreggiata e' gia' stata accodata: si dipinge una volta sola.
   *
   * Porta l'identita' e non piu' la sola chiave, da quando esiste il raccordo:
   * questo e' **l'insieme dei nodi gia' sulla rete**, e chi cerca il piu' vicino
   * ha bisogno degli indici di isolato, non di stringhe da riconvertire.
   */
  private readonly paintedBlocks = new Map<string, BlockId>();

  constructor(
    private readonly world: VoxelWorld,
    private readonly terrain: TerrainMap,
    private readonly streets: StreetNetwork,
    private readonly registry: ReadonlyBuildingRegistry,
  ) {}

  /** Celle di piazzole e sentieri ancora da applicare. */
  get queued(): number {
    return this.pending.size;
  }

  enqueue(paint: SurfacePaint): void {
    if (!this.canPaint(paint.x, paint.y)) return;
    const key = `${paint.x},${paint.y}`;
    if (paint.priority < (this.priority.get(key) ?? 0)) return;
    const current = this.pending.get(key);
    if (current !== undefined) {
      if (paint.priority > current.priority) this.pending.set(key, paint);
      return;
    }
    this.pending.set(key, paint);
    this.queue.push(key);
  }

  /**
   * Registra un isolato nella rete e tira la strada che lo attacca ai centri
   * distanti, una volta sola.
   *
   * **Niente piu' anello perimetrale**: le strade non chiudono il quadrato, e
   * dentro l'isolato gli edifici crescono senza un perimetro d'asfalto. La sola
   * strada che compare e' il raccordo verso un centro lontano — e' tutto cio'
   * che la rete deve essere: un collegamento minimo che segue il terreno.
   */
  enqueueBlockStreets(block: BlockId): void {
    const key = this.streets.keyOf(block);
    if (this.paintedBlocks.has(key)) return;
    this.paintedBlocks.set(key, block);

    this.linkToNetwork(block);
  }

  /**
   * Accoda delle colonne di carreggiata: piatte, alla quota del terreno.
   *
   * La strada **si adatta al terreno senza scavarlo ne' alzarlo**: niente deck
   * rialzato, niente muri, niente banchina. L'asfalto si dipinge sulla cella
   * piu' alta del terreno e basta — la forma minima che una strada puo' avere.
   */
  private enqueuePavement(cells: readonly PavementCell[]): void {
    if (cells.length === 0) return;

    for (const cell of cells) {
      // Oltre `quayReach` non c'e' terra a cui appoggiarsi: la carreggiata
      // finisce sulla battigia invece di proseguire sul fondale.
      if (!nearLand(this.terrain, cell.x, cell.y)) continue;

      const arterial = cell.role === STREET_ROLE.arterial;
      this.enqueue({
        x: cell.x,
        y: cell.y,
        palette: arterial ? STREETS.arterialPalette : STREETS.minorPalette,
        priority: arterial ? 2 : 1,
        deck: this.terrain.heightAt(cell.x, cell.y),
      });
    }
  }

  /**
   * Tira la strada che attacca alla rete un isolato nato staccato.
   *
   * **Non fa niente quasi sempre, ed e' il punto.** Un isolato che confina con
   * uno gia' dipinto — anche solo per un angolo — condivide con lui la
   * carreggiata, quindi e' gia' collegato e non c'e' niente da costruire: e' il
   * caso di ogni edificio di una citta' che cresce per contiguita', cioe' della
   * quasi totalita'. Le otto letture che lo verificano sono il prezzo che si paga
   * per riconoscere i pochi casi in cui invece un raccordo serve davvero.
   *
   * **E quando serve, e' il porto.** Un landmark si pianta dove il giocatore
   * clicca, e il clic non ha nessun obbligo di cadere accanto all'edificato: fino
   * a qui quello che ne usciva era un rettangolo di banchina in mezzo alla
   * spiaggia, con la citta' cinquecento colonne piu' in la' e niente in mezzo.
   * Stessa cosa per un quartiere che la crescita ha scavalcato.
   *
   * La scansione dei nodi e' lineare nel numero di isolati dipinti, e non e' un
   * costo che cresce col tempo di gioco in senso utile: gira **solo** su un
   * isolato staccato, cioe' una manciata di volte per partita, e un'isola intera
   * ne conta qualche centinaio.
   */
  private linkToNetwork(block: BlockId): void {
    for (const neighbour of blockNeighbours(block)) {
      if (this.paintedBlocks.has(this.streets.keyOf(neighbour))) return;
    }

    const target = nearestBlock(block, this.paintedBlocks.values());
    if (target === null) return;

    const route = planCorridor({
      from: block,
      to: target,
      costOf: (leg) => this.legCost(leg),
    });
    if (route === null) return;

    for (const leg of route) this.enqueuePavement(this.streets.corridorCells(leg));
  }

  /**
   * Quanto costa al raccordo attraversare un passo, e `Infinity` se non si passa.
   *
   * **Giudica il terreno e non l'occupazione**, che e' la differenza fra questa e
   * `canPaint`: una colonna presa da un edificio resta percorribile — la strada
   * la salta e prosegue — mentre una parete o l'acqua fonda no. Confondere le due
   * farebbe girare il percorso attorno alla citta' invece che attraverso, che e'
   * l'esatto contrario di cio' che una strada fa.
   *
   * Il costo di base e' la lunghezza, cosi' a parita' di ostacoli vince il
   * percorso corto; le colonne che non si possono dipingere lo caricano di
   * `linkRefusedCost` ciascuna, ed e' quel rapporto a decidere se la strada gira
   * attorno a una baia o ci finisce dentro.
   */
  private legCost(leg: CorridorLeg): number {
    const rect = this.streets.corridorRect(leg);
    let total = 0;
    let passable = 0;

    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        total++;
        if (groundKindAt(this.terrain, x, y) === GROUND.refused) continue;
        if (!nearLand(this.terrain, x, y)) continue;
        passable++;
      }
    }

    if (total === 0) return Number.POSITIVE_INFINITY;
    // Un passo per meta' in acqua non e' una strada mezza costruita: e' un
    // pugno di colonne staccate, che legge come un errore invece che come
    // un'assenza. Meglio non passare di li' affatto.
    if (passable < total * STREETS.linkMinPaved) return Number.POSITIVE_INFINITY;
    return (total - passable) * STREETS.linkRefusedCost + total;
  }

  /**
   * Applica la superficie a budget.
   *
   * Il budget conta **voxel scritti, non celle**: una cella su un molo puo'
   * costarne sei, e contarla come una lascerebbe passare nello stesso frame sei
   * volte il lavoro previsto proprio dove il terreno e' piu' mosso — cioe' dove
   * il frame e' gia' piu' caro. Una cella iniziata si finisce comunque, per non
   * lasciare mezzo muro in piedi fra un frame e l'altro.
   */
  step(): void {
    let written = 0;
    while (this.head < this.queue.length && written < BUILDER.surfaceVoxelsPerFrame) {
      const key = this.queue[this.head++];
      const paint = this.pending.get(key);
      if (paint === undefined) continue;
      this.pending.delete(key);
      if (!this.canPaint(paint.x, paint.y)) continue;

      const ground = this.terrain.heightAt(paint.x, paint.y);
      const deck = Math.max(paint.deck ?? ground, ground);
      this.clearDecorColumn(paint.x, paint.y);

      if (paint.wall !== undefined) {
        for (let z = ground; z < deck - 1; z++) {
          this.world.setBlock(paint.x, paint.y, z, z === deck - 2 && paint.coping !== undefined
            ? paint.coping
            : paint.wall, SURFACE_KIND.utility);
          written++;
        }
      }

      // Palette 0 vuol dire «il terreno resta quello che e'»: e' il caso di un
      // lotto agricolo, che posa solo il proprio solco. Scrivere lo zero qui
      // svuoterebbe invece la colonna, cioe' aprirebbe un buco nel prato.
      if (paint.palette !== STAMP_EMPTY) {
        this.world.setBlock(paint.x, paint.y, deck - 1, paint.palette);
        written++;
      }

      // Il marcatore va **sopra** il piano, dove il mesher lo cerca. Si scrive
      // per ultimo: `clearDecorColumn` qui sopra ha appena ripulito la colonna
      // per venti voxel, e posarlo prima vorrebbe dire toglierlo nello stesso
      // giro. Non serve svuotare prima — `setCoverMark` sovrascrive.
      //
      // Lo **zero e' una richiesta**, non un'assenza: e' un lotto agricolo che si
      // ritira e vuole indietro il proprio prato. `undefined` invece e' «non
      // toccare», ed e' cio' che dice ogni colonna di carreggiata.
      if (paint.cover !== undefined) {
        if (paint.cover === 0) this.world.setBlock(paint.x, paint.y, deck, STAMP_EMPTY);
        else this.world.setCoverMark(paint.x, paint.y, deck, paint.cover);
        written++;
      }

      this.priority.set(key, paint.priority);
    }

    if (this.head >= this.queue.length) {
      this.queue.length = 0;
      this.head = 0;
    }
  }

  /** Bonifica tronchi e chiome nel lotto e nel suo bordo, senza toccare il suolo. */
  clearSiteDecor(x: number, y: number, w: number, h: number = w): void {
    for (let py = y - 1; py <= y + h; py++) {
      for (let px = x - 1; px <= x + w; px++) {
        if (this.registry.at(px, py).length > 0) continue;
        this.clearDecorColumn(px, py);
      }
    }
  }

  /** Bonifica soltanto l'anello aggiunto da un upgrade, preservando il volume vecchio. */
  clearExpandedSiteDecor(record: BuildingRecord, footprint: number): void {
    for (let py = record.y - 1; py <= record.y + footprint; py++) {
      for (let px = record.x - 1; px <= record.x + footprint; px++) {
        const insideOld = px >= record.x && px < record.x + record.footprint &&
          py >= record.y && py < record.y + record.footprint;
        if (insideOld) continue;
        const occupied = this.registry.at(px, py).some((other) => other.id !== record.id);
        if (occupied) continue;
        this.clearDecorColumn(px, py);
      }
    }
  }

  /**
   * Toglie tronchi e chiome sopra una colonna. **Non tocca l'acqua.**
   *
   * La bonifica parte dalla quota del terreno e sale di `decorClearanceHeight`,
   * che e' tarato sulla conifera piu' alta: venti voxel. Su una colonna
   * sommersa quella quota e' il **fondale**, quindi la passata cancellava tutta
   * l'acqua sopra di esso — e attorno a ogni porto, a ogni molo e a ogni lotto
   * sulla battigia restava un rettangolo di mare scavato fino al fondo. Si
   * vedeva a colpo d'occhio e non lo diceva nessun test, perche' fino a qui
   * l'opera di terra riempiva subito dopo le stesse colonne e il buco spariva
   * sotto la banchina.
   *
   * Sott'acqua non cresce niente: non c'e' decoro da togliere, e la risposta
   * giusta e' non fare niente.
   *
   * A dirlo e' il **bioma** e non il confronto fra quota e specchio, per la
   * stessa ragione per cui `isDryLand` esiste: `classifyBiome` chiama oceano
   * cio' che sta sotto il *proprio* specchio, che dentro una conca e' quello del
   * lago, e una fixture di terreno piano dichiara terra a una quota qualsiasi.
   */
  clearDecorColumn(x: number, y: number): void {
    const column = this.terrain.columnAt(x, y);
    if (column === null) return;
    if (!isDryLand(column.biome)) return;

    const top = column.height + BUILDER.decorClearanceHeight;
    for (let z = column.height; z < top; z++) {
      if (this.world.getBlock(x, y, z) !== STAMP_EMPTY) {
        this.world.setBlock(x, y, z, STAMP_EMPTY);
      }
    }
  }

  private canPaint(x: number, y: number): boolean {
    return groundKindAt(this.terrain, x, y) !== GROUND.refused &&
      !this.registry.isOccupied(x, y);
  }
}
