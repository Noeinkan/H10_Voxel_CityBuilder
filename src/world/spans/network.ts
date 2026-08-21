/**
 * La rete in quota vista come grafo.
 *
 * **Perche' esiste.** Il settimo punto della fase non chiede dei ponti, chiede
 * una *rete*: «fra due isolati collegati deve esistere un percorso continuo,
 * verificabile come proprieta' e non giudicato a occhio». Il riferimento della
 * 4.14 lo dice dall'altro lato — il Minneapolis Skyway diventa il piano
 * principale quando e' continuo, e resta un ornamento finche' non lo e'.
 *
 * Da qui due usi dello stesso oggetto, ed e' il motivo per cui sta in un file
 * suo invece che dentro il Builder: **decidere** quale campata costruire — vince
 * chi unisce due componenti separate — e **verificare** che il risultato sia
 * connesso. Se le due definizioni di "connesso" vivessero in posti diversi
 * divergerebbero al primo refactor, e il test smetterebbe di misurare la regola.
 *
 * **Il grafo si ricostruisce, non si aggiorna.** Un union-find non sa disfare
 * un'unione, e qui le campate spariscono davvero: quando un appoggio cambia
 * livello la sua campata cade. Ricostruirlo a ogni passata costa quanto le
 * campate esistenti — che sono unita', non migliaia — ed e' sempre esatto;
 * tenerlo incrementale sarebbe piu' veloce e a volte sbagliato.
 *
 * **Si cammina attraverso gli edifici.** Due campate che condividono un appoggio
 * sono connesse: si esce da una, si attraversa l'edificio, si prende l'altra. E'
 * il modello dello skyway, dove il percorso passa dentro i palazzi e non solo
 * sopra le strade, ed e' anche l'unica lettura che il registry sappia sostenere
 * senza inventarsi un grafo di camminabilita' che nessuno costruisce.
 */

/**
 * Cio' che serve di una campata per farne un arco.
 *
 * `supports` e' opzionale perche' lo e' su `BuildingRecord`, dove ogni campo che
 * non serve a tutti i record lo e': un arco senza appoggi non lega niente, e
 * questo file lo salta invece di pretendere che il chiamante lo filtri.
 */
export interface SpanLink {
  /** Gli id degli appoggi. Due per un ponte, tre o piu' per una piazza. */
  readonly supports?: readonly number[];
}

const NO_SUPPORTS: readonly number[] = [];

export class SpanNetwork {
  private readonly parent = new Map<number, number>();
  private readonly size = new Map<number, number>();
  private readonly degree = new Map<number, number>();

  /** Ricostruisce la rete dalle campate che esistono adesso. */
  static of(links: Iterable<SpanLink>): SpanNetwork {
    const network = new SpanNetwork();
    for (const link of links) network.add(link);
    return network;
  }

  /** Rappresentante della componente, con compressione di cammino. */
  find(id: number): number {
    let root = id;
    while (this.parent.get(root) !== undefined && this.parent.get(root) !== root) {
      root = this.parent.get(root) as number;
    }
    let cursor = id;
    while (this.parent.get(cursor) !== undefined && this.parent.get(cursor) !== cursor) {
      const next = this.parent.get(cursor) as number;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  connected(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }

  /** Campate che poggiano su questo edificio. */
  degreeOf(id: number): number {
    return this.degree.get(id) ?? 0;
  }

  /**
   * Unisce due appoggi e dice se ha davvero fuso due componenti.
   *
   * E' il valore su cui `spanPass` decide: `false` significa che i due erano
   * gia' raggiungibili l'uno dall'altro, quindi la campata chiuderebbe un ciclo
   * invece di allargare la rete.
   */
  link(a: number, b: number): boolean {
    const ra = this.root(a);
    const rb = this.root(b);
    if (ra === rb) return false;

    const sa = this.size.get(ra) ?? 1;
    const sb = this.size.get(rb) ?? 1;
    // Unione per taglia: tiene l'albero basso senza tenere anche un rango.
    const [big, small] = sa >= sb ? [ra, rb] : [rb, ra];
    this.parent.set(small, big);
    this.size.set(big, sa + sb);
    return true;
  }

  /**
   * Registra una campata. true se ha allargato la rete invece di chiudere un ciclo.
   *
   * Una piazza ha piu' di due appoggi e li lega tutti al primo: e' proprio cio'
   * che ne fa un nodo, perche' da li' in poi due campate che arrivano su lati
   * diversi risultano connesse fra loro.
   */
  add(link: SpanLink): boolean {
    const supports = link.supports ?? NO_SUPPORTS;
    let merged = false;
    for (const id of supports) {
      this.degree.set(id, (this.degree.get(id) ?? 0) + 1);
      this.root(id);
    }
    for (let i = 1; i < supports.length; i++) {
      if (this.link(supports[0], supports[i])) merged = true;
    }
    return merged;
  }

  /** Componenti distinte fra gli appoggi noti. */
  get components(): number {
    const roots = new Set<number>();
    for (const id of this.parent.keys()) roots.add(this.find(id));
    return roots.size;
  }

  /** Registra un id che ancora non c'e', e ne restituisce la radice. */
  private root(id: number): number {
    if (this.parent.get(id) === undefined) {
      this.parent.set(id, id);
      this.size.set(id, 1);
      return id;
    }
    return this.find(id);
  }
}

/**
 * Isolati distinti raggiunti dalla componente piu' larga.
 *
 * **E' la proprieta' del gate**, e per questo e' una funzione e non un commento:
 * «esiste almeno un percorso continuo fra due isolati diversi che non passa dal
 * suolo» vuol dire che questo numero e' almeno due. `blockOf` risponde in che
 * isolato sta un appoggio — e' `streets.blockAt` vista da qui, senza che questo
 * file debba sapere che le strade esistono.
 */
export function widestReach(
  links: Iterable<SpanLink>,
  blockOf: (supportId: number) => string | null,
): number {
  const network = SpanNetwork.of(links);
  const blocks = new Map<number, Set<string>>();

  for (const link of links) {
    for (const id of link.supports ?? NO_SUPPORTS) {
      const block = blockOf(id);
      if (block === null) continue;
      const root = network.find(id);
      const reached = blocks.get(root);
      if (reached === undefined) blocks.set(root, new Set([block]));
      else reached.add(block);
    }
  }

  let widest = 0;
  for (const reached of blocks.values()) {
    if (reached.size > widest) widest = reached.size;
  }
  return widest;
}
