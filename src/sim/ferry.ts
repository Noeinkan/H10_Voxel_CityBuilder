import { BALANCE } from './balance';
import { catalystRoleOf, type CatalystId } from './catalysts';
import type { BuildingClass } from './classes';

/**
 * Quali imbarchi sono serviti da una linea, e quali sono ancora un molo solo.
 *
 * **Una linea e' una coppia.** E' l'intera regola, ed e' anche cio' che rende il
 * traghetto diverso dagli altri sette ruoli: un mercato funziona da solo, un
 * imbarco no. Finche' non ce n'e' un secondo dall'altra parte dell'acqua, quello
 * che si e' costruito e' un molo con delle barche ormeggiate — che e' esattamente
 * cio' che si vede a schermo, e quindi non e' una punizione ma una descrizione.
 *
 * **Sta accanto a `tradeLinksOf` e non dentro.** I due collegamenti rispondono a
 * domande opposte: `trade.ts` chiede «l'isola parla con il mondo?», e la risposta
 * dipende solo da *quali ruoli esistono*; qui si chiede «due punti dell'isola si
 * parlano fra loro?», e la risposta dipende da *dove sono*. Fondere le due
 * significherebbe dare al commercio esterno delle coordinate che non gli servono.
 *
 * **La distanza e' l'unica misura, e non e' una scorciatoia.** In `src/sim/` non
 * c'e' niente che sappia dove finisce la terra — e' la stessa ragione per cui
 * `CatalystSite` e' un'etichetta e non una regola, e a tradurla e' `src/world/`.
 * Entrambi i capi stanno gia' sulla costa perche' il ruolo lo pretende, quindi
 * «distanti e sul mare» e' quanto serve perche' fra i due ci sia una traversata.
 *
 * **Ogni imbarco serve una linea sola.** Tre moli non fanno tre linee: fanno una
 * linea e un molo che aspetta. Senza questo vincolo il contributo crescerebbe
 * come il quadrato del numero di imbarchi, e la strategia migliore sarebbe
 * coprire la costa di moli identici invece di scegliere due punti.
 */

/** Cio' che serve di un catalizzatore per farne un capolinea. */
export interface FerryTerminal {
  readonly x: number;
  readonly y: number;
  readonly kind?: CatalystId;
  readonly class: BuildingClass;
}

/** Una traversata servita: gli indici dei due capi dentro la lista dei catalizzatori. */
export interface FerryLine {
  readonly a: number;
  readonly b: number;
  /** Distanza di Chebyshev fra i due capi, in colonne. */
  readonly length: number;
}

/**
 * Le linee aperte, dalla piu' corta alla piu' lunga.
 *
 * L'accoppiamento e' avido sulla lunghezza: si prende sempre la coppia piu'
 * vicina fra quelle ancora libere. Non e' l'accoppiamento ottimo — quello
 * chiederebbe un algoritmo su grafo per un problema che ha al massimo una
 * manciata di nodi — ma e' **stabile e prevedibile**, che qui conta di piu':
 * aggiungere un imbarco lontano non deve poter riorganizzare le linee che il
 * giocatore aveva gia' capito.
 */
export function ferryLinesOf(catalysts: readonly FerryTerminal[]): readonly FerryLine[] {
  const terminals: number[] = [];
  for (let i = 0; i < catalysts.length; i++) {
    if (catalystRoleOf(catalysts[i]) === 'ferry') terminals.push(i);
  }
  if (terminals.length < 2) return [];

  const { minRange, maxRange } = BALANCE.gameplay.ferry;
  const candidates: FerryLine[] = [];
  for (let i = 0; i < terminals.length; i++) {
    for (let j = i + 1; j < terminals.length; j++) {
      const a = catalysts[terminals[i]];
      const b = catalysts[terminals[j]];
      const length = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      if (length < minRange || length > maxRange) continue;
      candidates.push({ a: terminals[i], b: terminals[j], length });
    }
  }

  // A parita' di lunghezza vince la coppia con l'indice piu' basso, cioe' quella
  // costruita prima: senza il secondo criterio l'ordine dipenderebbe da come
  // `sort` tratta i pari, e due partite identiche potrebbero divergere.
  candidates.sort((p, q) => p.length - q.length || p.a - q.a || p.b - q.b);

  const taken = new Set<number>();
  const lines: FerryLine[] = [];
  for (const line of candidates) {
    if (taken.has(line.a) || taken.has(line.b)) continue;
    taken.add(line.a);
    taken.add(line.b);
    lines.push(line);
  }
  return lines;
}

/**
 * Quante linee la citta' conta ai fini della soddisfazione.
 *
 * Il tetto sta qui e non nel chiamante perche' e' parte della regola: `tick` deve
 * poter chiedere «quante ne valgono» senza sapere che esiste un massimo.
 */
export function servedFerryLines(catalysts: readonly FerryTerminal[]): number {
  return Math.min(ferryLinesOf(catalysts).length, BALANCE.satisfaction.maxFerryLines);
}
