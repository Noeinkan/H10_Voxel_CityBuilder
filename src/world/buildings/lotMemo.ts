import { MAX_FOOTPRINT } from './config';

/**
 * Cio' che una sola infornata ha gia' scoperto cercando lotti.
 *
 * **Il difetto che risolve.** In una infornata il `Builder` chiama `findLot`
 * fino a ventisette volte — due giri da `sitesPerBuild * candidateOverfetch`
 * candidati, piu' i siti del porto — e ogni chiamata percorre lo stesso
 * rettangolo di venticinque isolati, un centinaio di colonne per lato. In un
 * nucleo saturo nessuna di quelle passeggiate trova niente, quindi le percorre
 * tutte fino in fondo: misurate, oltre un milione di colonne lette per
 * infornata. La seconda ricerca ripete il lavoro della prima, e la dodicesima
 * pure.
 *
 * **Qui sta solo la colonna bocciata.** Evita di rifare le quattro domande su
 * una cella gia' vista, e il grosso del guadagno misurato viene da li': in un
 * nucleo saturo la stessa colonna viene sondata da decine di quadrati diversi, e
 * la risposta e' sempre la stessa. Il rettangolo esaurito — l'altra meta' della
 * fase 1.1 — e' passato a `BlockMemo` qui sotto, perche' quel fatto vale piu' a
 * lungo di una infornata e tenerne due copie con due scadenze diverse era il
 * modo sicuro di farle divergere.
 *
 * **Vive quanto una infornata, e non un tick di piu'.** E' la sola ragione per
 * cui non c'e' un'invalidazione da inseguire: dentro `buildPass` niente rende
 * libera una colonna che era presa — nessun cantiere chiude, nessuna
 * prenotazione cade, nessun impalcato nasce — mentre fra un'infornata e l'altra
 * tutte e tre le cose succedono. Il `BlockMemo` sopravvive al tick e infatti
 * quelle tre le deve guardare: lo fa con un'epoca sola invece che con tre ganci,
 * e la differenza di grana e' cio' che rende la scelta praticabile li' e non qui
 * — un rettangolo per isolato si ricostruisce, un milione di colonne no.
 *
 * **Solo il rifiuto si memorizza.** «Libera» non si tiene: una colonna libera se
 * la prende l'edificio del candidato successivo, e ricordarla tale sarebbe
 * l'unico modo di far nascere due edifici sullo stesso lotto. Il rifiuto invece
 * e' monotono nella direzione giusta — dentro l'infornata la citta' puo' solo
 * occupare altro suolo — ed e' questo a rendere il memo esatto invece che
 * approssimato.
 */
export class LotMemo {
  /** Colonne che una `lotIsFree` ha gia' bocciato in questa infornata. */
  private readonly refused = new Set<number>();

  /** Da chiamare all'inizio di ogni infornata: e' tutta l'invalidazione che c'e'. */
  reset(): void {
    this.refused.clear();
  }

  /** true se questa colonna e' gia' stata bocciata. */
  refuses(key: number): boolean {
    return this.refused.has(key);
  }

  /** Segna la colonna come non edificabile per il resto dell'infornata. */
  refuse(key: number): void {
    this.refused.add(key);
  }
}

/**
 * Gli isolati in cui una misura d'impronta non sta piu' da nessuna parte.
 *
 * **Il fatto che ricorda e' piu' grosso di grana di quello del `LotMemo`, e vale
 * piu' a lungo.** `placeLot` percorre **tutto** il rettangolo di venticinque
 * isolati attorno all'origine, e il candidato ne cambia soltanto l'ordine: il suo
 * "niente" e' quindi una proprieta' del rettangolo e del lato, non della colonna
 * proposta. Se un lato non stava da nessuna parte per il primo candidato, non ci
 * sta nemmeno per l'undicesimo — ne' per il primo dell'infornata dopo, che e' la
 * parte che la fase 1.1 lasciava sul tavolo: in un nucleo saturo ogni infornata
 * ricominciava daccapo la stessa passeggiata di diecimila colonne.
 *
 * **La monotonia regge finche' nessuno libera suolo**, e a differenza di una
 * infornata sola qui il caso esiste: un cantiere che chiude, una prenotazione che
 * cade, un impalcato che nasce, un settore di terra che arriva. E' per questo che
 * il memo non si tiene da solo — `observe` gli passa un'epoca, e a ogni sua
 * variazione il memo cade tutto invece di inseguire quale rettangolo sia
 * cambiato. Ricostruirlo costa una passeggiata per isolato d'origine, cioe'
 * esattamente quello che si pagava prima a ogni infornata.
 *
 * **Solo l'esaurimento si memorizza.** Come per il `LotMemo`, «c'e' posto» non si
 * tiene: quel posto se lo prende l'edificio del candidato successivo.
 */
export class BlockMemo {
  private readonly exhausted = new Set<number>();

  /**
   * L'ultima epoca vista. Nasce a -1 e non a 0 perche' un mondo appena costruito
   * ha epoca 0 e nessun memo: la prima `observe` non deve sembrare un cambiamento.
   */
  private epoch = -1;

  /**
   * Allinea il memo al mondo: se l'epoca e' cambiata, qualcosa ha reso libera una
   * colonna e cio' che il memo sapeva non vale piu'.
   */
  observe(epoch: number): void {
    if (epoch === this.epoch) return;
    this.epoch = epoch;
    this.exhausted.clear();
  }

  /** Dimentica tutto senza toccare l'epoca: e' la porta di `Builder.forget`. */
  clear(): void {
    this.exhausted.clear();
  }

  /** true se cercare ancora un lotto di questo lato attorno a questo isolato e' inutile. */
  isExhausted(kx: number, ky: number, footprint: number): boolean {
    return this.exhausted.has(scopeKey(kx, ky, footprint));
  }

  /** Registra che il rettangolo di questo isolato non ha piu' lotti di questo lato. */
  exhaust(kx: number, ky: number, footprint: number): void {
    this.exhausted.add(scopeKey(kx, ky, footprint));
  }

  /** Quante coppie isolato-lato sono dichiarate esaurite adesso. */
  get size(): number {
    return this.exhausted.size;
  }
}

/**
 * Isolati rappresentabili per lato dell'origine.
 *
 * Stessa idea del bias di `columnKey`, con due ordini di grandezza in meno da
 * coprire: un isolato e' largo decine di voxel, quindi duemila per direzione
 * sono gia' un mondo piu' grande di quanto il gioco generi. La chiave che ne
 * esce sta in ventisette bit, cioe' dentro l'intero piccolo di V8 — che e' tutto
 * il punto di non usare una stringa.
 */
const BLOCK_BIAS = 1 << 11;

function scopeKey(kx: number, ky: number, footprint: number): number {
  return (((kx + BLOCK_BIAS) << 12) | (ky + BLOCK_BIAS)) * (MAX_FOOTPRINT + 1) + footprint;
}
