import {
  BALANCE,
  CATALYSTS,
  CLASS_LABELS,
  type BuildingClass,
  type CatalystDefinition,
  type CatalystId,
} from '../sim';
import type { HudIcon } from './hudIcons';

/**
 * Quale catalizzatore piazzare qui attorno, e perche'.
 *
 * **E' la domanda che la scheda non sapeva rispondere.** La carta «To grow»
 * diceva «78 of the 96 it needs» e, sotto, da chi arrivavano quei 78: cioe' una
 * diagnosi completa e nessuna cura. Il giocatore restava con un numero e
 * diciannove tessere nella toolbar, e l'unico modo di scegliere fra loro era
 * piazzarne una e guardare cosa succedeva — a centoventi fondi il tentativo.
 *
 * Nessuno stato nuovo: la risposta e' gia' tutta nelle definizioni dei ruoli.
 * Quanto un catalizzatore versa su un uso al proprio centro e' `strength *
 * influence[cls]`, la stessa aritmetica che `influenceSummary` mostra su un
 * landmark gia' posato; qui la si applica ai ruoli **non ancora** posati e si
 * ordina. Per questo il modulo e' puro e non tocca la simulazione: chiede al
 * catalogo, non al campo.
 *
 * **Quello che promette e' un limite superiore, e va detto.** Il valore e' al
 * centro del raggio e senza pesi di policy; a due isolati di distanza vale
 * meno, perche' la portata segue strade e terreno. La riga dice «up to», che e'
 * l'unica parola che rende vera la promessa senza rifare qui il calcolo
 * geodetico che vive in `reach.ts`.
 */

export interface AdviceOption {
  readonly id: CatalystId;
  readonly label: string;
  readonly icon: HudIcon;
  /** Desiderabilita' versata sull'uso in difetto, al centro del raggio. */
  readonly gain: number;
  /** Quota rispetto al consiglio migliore, 0..1: e' la lunghezza della barra. */
  readonly share: number;
  readonly cost: number;
  /** La sua resa al centro basta da sola a chiudere il divario. */
  readonly enough: boolean;
  /**
   * Ce n'e' gia' uno in portata.
   *
   * Non lo esclude — un secondo mercato versa quanto il primo — ma lo dice: chi
   * sta gia' guardando le fonti della propria desiderabilita' deve poter
   * riconoscere il nome che ha appena letto li' sopra, o il consiglio sembra
   * ignorare cio' che c'e'.
   */
  readonly present: boolean;
  readonly hint: string;
}

export interface SiteAdvice {
  /** L'uso a cui manca desiderabilita': e' per lui che si consiglia. */
  readonly cls: BuildingClass;
  readonly label: string;
  /** Quanta desiderabilita' manca alla soglia. */
  readonly missing: number;
  /** I tre consigli migliori, dal piu' efficace. Mai vuoto. */
  readonly options: readonly AdviceOption[];
}

export interface AdviceQuery {
  readonly cls: BuildingClass;
  readonly missing: number;
  /** La colonna vede il mare: apre porto, traghetto, faro e marina. */
  readonly coastal: boolean;
  /** Terreno piatto e lavorabile: e' cio' che l'aeroporto pretende. */
  readonly flat: boolean;
  /** Etichette dei ruoli gia' in portata, come le scrive la scheda. */
  readonly nearby: readonly string[];
}

/** Quanti consigli mostrare. Tre stanno in un colpo d'occhio, cinque no. */
const SHOWN = 3;

/**
 * I ruoli che alzerebbero questo uso qui, dal piu' efficace.
 *
 * `null` dove non c'e' niente da consigliare: nessun ruolo piazzabile versa su
 * quell'uso. E' un caso vero — l'industria in cima a una scogliera — e una
 * carta vuota insegnerebbe a saltarla, che e' la stessa scelta di `growth:
 * null` nella scheda.
 */
export function siteAdvice(query: AdviceQuery): SiteAdvice | null {
  const missing = Math.max(0, Math.round(query.missing));
  const ranked = CATALYSTS
    .filter((entry) => placeable(entry, query))
    .map((entry) => ({ entry, gain: Math.round(entry.strength * entry.influence[query.cls]) }))
    .filter((entry) => entry.gain > 0)
    .sort((a, b) => order(a, missing) - order(b, missing)
      // A parita' di fascia, il prezzo per chi basta e la resa per chi non
      // basta; l'ordine di toolbar chiude i pari. L'ordinamento dev'essere
      // totale, o due letture della stessa colonna darebbero due liste diverse.
      || (a.gain >= missing && b.gain >= missing
        ? a.entry.cost - b.entry.cost || b.gain - a.gain
        : b.gain - a.gain || a.entry.cost - b.entry.cost));

  if (ranked.length === 0) return null;
  const best = Math.max(...ranked.map((entry) => entry.gain));

  return {
    cls: query.cls,
    label: CLASS_LABELS[query.cls],
    missing,
    options: ranked.slice(0, SHOWN).map(({ entry, gain }) => ({
      id: entry.id,
      label: entry.label,
      icon: entry.id,
      gain,
      share: best === 0 ? 0 : gain / best,
      cost: entry.cost,
      enough: gain >= missing,
      present: query.nearby.includes(entry.label),
      hint: entry.description,
    })),
  };
}

/**
 * Prima chi basta, poi chi non basta.
 *
 * **Ordinare per sola resa dava consigli sbagliati e costosi.** Sul civico il
 * monumento vince per venti punti di desiderabilita' e costa piu' del doppio del
 * parco: a un divario di quindici erano equivalenti in effetto e non in prezzo,
 * e la scheda consigliava il piu' caro dei due. Fra i ruoli che chiudono il
 * divario da soli conta quindi il prezzo, e la resa in eccesso non conta
 * niente — la desiderabilita' oltre soglia non compra un secondo livello.
 */
function order(entry: { readonly gain: number }, missing: number): number {
  return entry.gain >= missing ? 0 : 1;
}

/**
 * L'uso piu' vicino alla propria soglia di sito, su una colonna nuda.
 *
 * Consigliare per l'uso che manca **di meno** e non per quello che il giocatore
 * preferirebbe: e' l'unico che un catalizzatore solo puo' davvero portare
 * sopra soglia, e un consiglio che non chiude il divario e' un consiglio che
 * non si vede funzionare. `null` quando un uso e' gia' sopra soglia — li' non
 * manca niente e la colonna sta solo aspettando il proprio turno.
 */
export function closestUse(
  desirability: readonly number[],
  classes: readonly BuildingClass[],
): { readonly cls: BuildingClass; readonly missing: number } | null {
  const thresholds = BALANCE.desirability.siteThreshold;
  let best: { cls: BuildingClass; missing: number } | null = null;
  for (const cls of classes) {
    const threshold = thresholds[cls] ?? 0;
    const missing = threshold - (desirability[cls] ?? 0);
    if (missing <= 0) return null;
    if (best === null || missing < best.missing) best = { cls, missing };
  }
  return best;
}

/**
 * Se il ruolo puo' stare qui.
 *
 * E' la stessa domanda che `src/world/sites/` risolve al piazzamento, ridotta a
 * cio' che la scheda ha in mano: la colonna sa se vede il mare e se il suolo e'
 * piano. Consigliare un porto all'interno sarebbe peggio di non consigliare
 * niente — manderebbe il giocatore a spendere per un rifiuto.
 */
function placeable(entry: CatalystDefinition, query: AdviceQuery): boolean {
  if (entry.site === 'coastal' || entry.site === 'waterfront') return query.coastal;
  if (entry.site === 'open') return query.flat;
  return true;
}
