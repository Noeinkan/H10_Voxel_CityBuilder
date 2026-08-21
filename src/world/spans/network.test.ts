import { describe, expect, it } from 'vitest';
import { SpanNetwork, widestReach, type SpanLink } from './network';

/**
 * La rete in quota come grafo.
 *
 * Sono i due usi dello stesso oggetto, e questi test li tengono allineati:
 * `link` decide quale campata vale la pena costruire, `widestReach` verifica che
 * il risultato sia connesso. Se divergessero, il gate misurerebbe una regola
 * diversa da quella che la citta' applica.
 */

function link(...supports: number[]): SpanLink {
  return { supports };
}

describe('SpanNetwork — unire due componenti', () => {
  it('la prima campata fra due edifici li unisce, la seconda no', () => {
    const network = new SpanNetwork();
    expect(network.add(link(1, 2))).toBe(true);
    // La stessa coppia, o un secondo ponte fra gli stessi due: chiude un ciclo,
    // e per la rete non aggiunge niente.
    expect(network.add(link(1, 2))).toBe(false);
  });

  it('una catena resta una componente sola', () => {
    const network = SpanNetwork.of([link(1, 2), link(2, 3), link(3, 4)]);

    expect(network.connected(1, 4)).toBe(true);
    expect(network.components).toBe(1);
  });

  it('due catene separate restano due componenti', () => {
    const network = SpanNetwork.of([link(1, 2), link(3, 4)]);

    expect(network.connected(1, 3)).toBe(false);
    expect(network.components).toBe(2);
  });

  it('chiudere il triangolo non fonde niente di nuovo', () => {
    const network = SpanNetwork.of([link(1, 2), link(2, 3)]);
    expect(network.add(link(1, 3))).toBe(false);
    expect(network.components).toBe(1);
  });

  it('un edificio sconosciuto non e connesso a nessuno', () => {
    const network = SpanNetwork.of([link(1, 2)]);
    expect(network.connected(1, 99)).toBe(false);
  });
});

describe('SpanNetwork — il grado tiene la forma della rete', () => {
  it('conta le campate che poggiano su ciascun edificio', () => {
    const network = SpanNetwork.of([link(1, 2), link(2, 3), link(2, 4)]);

    // E' il numero con cui `spanPass` impedisce che una torre alta e centrale
    // diventi lo snodo di otto ponti solo perche' e' compatibile con tutti.
    expect(network.degreeOf(2)).toBe(3);
    expect(network.degreeOf(1)).toBe(1);
    expect(network.degreeOf(99)).toBe(0);
  });
});

describe('SpanNetwork — la piazza e un nodo', () => {
  it('lega fra loro tutti gli edifici che la reggono', () => {
    // Tre campate che arrivano su una piazza da lati diversi risultano connesse
    // fra loro: e' questo a distinguere un nodo da tre ponti che si incrociano.
    const network = SpanNetwork.of([link(1, 2, 3)]);

    expect(network.connected(1, 3)).toBe(true);
    expect(network.components).toBe(1);
    expect(network.degreeOf(2)).toBe(1);
  });

  it('una piazza unisce due catene che prima non si toccavano', () => {
    const network = SpanNetwork.of([link(1, 2), link(3, 4)]);
    expect(network.connected(1, 4)).toBe(false);

    expect(network.add(link(2, 3, 5))).toBe(true);
    expect(network.connected(1, 4)).toBe(true);
  });
});

describe('widestReach — la proprieta del gate', () => {
  /** Due edifici per isolato: 1 e 2 in «a», 3 e 4 in «b», 5 in «c». */
  const blockOf = (id: number): string | null => {
    if (id <= 2) return 'a';
    if (id <= 4) return 'b';
    if (id === 5) return 'c';
    return null;
  };

  it('un ponte dentro un isolato solo non fa una rete', () => {
    // E' il caso che il riferimento al Minneapolis Skyway chiama ornamento:
    // esiste, e non porta da nessuna parte.
    expect(widestReach([link(1, 2)], blockOf)).toBe(1);
  });

  it('un ponte fra due isolati diversi passa il gate', () => {
    expect(widestReach([link(2, 3)], blockOf)).toBe(2);
  });

  it('ponti sparsi che non si toccano non si sommano', () => {
    // Due componenti da un isolato ciascuna: il gate chiede **un** percorso
    // continuo, non due tratti che stanno in isolati diversi.
    expect(widestReach([link(1, 2), link(3, 4)], blockOf)).toBe(1);
  });

  it('una catena conta tutti gli isolati che attraversa', () => {
    expect(widestReach([link(1, 2), link(2, 3), link(4, 5)], blockOf)).toBe(2);
    expect(widestReach([link(1, 2), link(2, 3), link(3, 5)], blockOf)).toBe(3);
  });

  it('un appoggio senza isolato non conta', () => {
    expect(widestReach([link(1, 6)], blockOf)).toBe(1);
  });

  it('senza campate non si raggiunge niente', () => {
    expect(widestReach([], blockOf)).toBe(0);
  });
});
