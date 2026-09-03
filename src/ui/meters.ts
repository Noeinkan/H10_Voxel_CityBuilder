import { BUILDING_CLASS, type BuildingClass } from '../sim';
import type { HudIcon } from './hudIcons';

/**
 * Le misure grafiche delle superfici informative: barre, toni e verdetti.
 *
 * Nasce da un difetto misurabile della scheda di selezione: ventidue righe
 * `etichetta: valore` tutte con lo stesso peso, e ogni valore una frase intera
 * — «serves 12 customers a tick · one of 1218 · 14% used citywide». Nessuna
 * delle tre parti era sbagliata; sbagliato era che si leggessero **in fila**,
 * cioe' che per sapere se un negozio andava bene bisognasse finire la riga.
 * Una barra risponde prima della parola, e la parola resta nel `title` per chi
 * la vuole.
 *
 * Puro e senza DOM, come `SelectionPanelModel` e per la stessa ragione: qui si
 * decide **quanto e' pieno** ciascun indicatore, e sbagliarlo si vede solo
 * leggendolo. Il disegno vive in `meterBits.ts`.
 *
 * Sta in un file suo e non dentro la scheda perche' lo condividono due
 * superfici — la scheda di selezione e il cassetto Citta' — e un vocabolario
 * grafico scritto due volte diverge alla prima ritaratura: e' lo stesso motivo
 * per cui `overviewGoal` e' esportato invece di essere ricopiato nella barra.
 */

/**
 * Come sta un indicatore, non di che colore e'.
 *
 * `watch` e `bad` non sono due gradi della stessa cosa: il primo dice «guarda
 * qui», il secondo «questo ti sta costando adesso». La differenza serve a non
 * dipingere di rosso una citta' che sta soltanto crescendo, che e' il modo piu'
 * rapido di insegnare a ignorare il rosso.
 */
export type MeterTone = 'good' | 'watch' | 'bad' | 'plain';

export interface Meter {
  readonly id: string;
  /** `null` dove nessuna icona direbbe qualcosa di piu' dell'etichetta. */
  readonly icon: HudIcon | null;
  readonly label: string;
  /** Il numero come si legge: «96% occupied», «14.4 a tick». */
  readonly value: string;
  /**
   * Quota piena della barra, 0..1, oppure `null` per un valore senza tetto.
   *
   * Una barra senza tetto e' peggio di nessuna barra: mostrerebbe una lunghezza
   * che non si puo' confrontare con niente, e il colpo d'occhio — l'unica cosa
   * per cui una barra esiste — direbbe il falso.
   */
  readonly ratio: number | null;
  readonly tone: MeterTone;
  /** La prosa che prima era il valore della riga. Vive nel `title` del nodo. */
  readonly hint: string;
}

/** Una voce con segno dentro una barra composta. */
export interface Contribution {
  readonly label: string;
  readonly icon: HudIcon | null;
  /**
   * Nome stabile della famiglia a cui la voce appartiene, dove ne ha una.
   *
   * Serve al solo colore: i quattro usi hanno una tinta ciascuno in tutta
   * l'interfaccia, e ricavarla dall'indice della voce la farebbe cambiare
   * quando un uso manca. Un contributo senza famiglia — un landmark, i vicini —
   * lo lascia indefinito e prende la tinta neutra.
   */
  readonly key?: string;
  readonly value: number;
  /** Larghezza relativa alla voce piu' grande in valore assoluto, 0..1. */
  readonly share: number;
  readonly negative: boolean;
}

/**
 * Quanto ce n'e' contro quanto ne serve, e da chi viene.
 *
 * E' la forma della domanda «perche' non cresce»: il totale da solo dice che
 * manca, le voci dicono da dove prenderlo. Le due cose stanno nello stesso
 * blocco perche' separarle rimetterebbe il giocatore a incrociare due elenchi.
 */
export interface Breakdown {
  readonly label: string;
  readonly value: number;
  readonly target: number;
  readonly ratio: number;
  readonly met: boolean;
  readonly parts: readonly Contribution[];
}

/**
 * La risposta corta, in cima a tutto: cosa sta succedendo qui.
 *
 * Una riga sola e un tono. Sostituisce la carta «To grow», che diceva la stessa
 * cosa in tre righe di prosa e la diceva **dopo** il titolo del pannello.
 */
export interface Verdict {
  readonly tone: MeterTone;
  /** Due o tre parole, in maiuscoletto: «Cannot grow», «Needs desirability». */
  readonly headline: string;
  /** Una riga sola che dice perche'. Mai due. */
  readonly detail: string;
}

/**
 * L'icona di ciascun uso urbano.
 *
 * Il commercio prende quella del mercato e l'industria quella della fabbrica:
 * sono i due ruoli che il giocatore ha gia' in mano nella toolbar, quindi
 * l'associazione e' gia' stata imparata una volta e non se ne insegna una
 * seconda.
 */
export const CLASS_ICONS: Readonly<Record<BuildingClass, HudIcon>> = {
  [BUILDING_CLASS.residential]: 'residential',
  [BUILDING_CLASS.commercial]: 'market',
  [BUILDING_CLASS.industrial]: 'factory',
  [BUILDING_CLASS.civic]: 'civic',
};

export interface MeterInput {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly icon?: HudIcon;
  readonly ratio?: number;
  readonly tone?: MeterTone;
}

export function meter(input: MeterInput): Meter {
  return {
    id: input.id,
    icon: input.icon ?? null,
    label: input.label,
    value: input.value,
    ratio: input.ratio === undefined ? null : clamp01(input.ratio),
    tone: input.tone ?? 'plain',
    hint: input.hint,
  };
}

/**
 * Il tono di una quota che si vuole **alta**: occupazione delle case, organico,
 * copertura del cibo.
 *
 * Le due soglie non sono simmetriche di proposito. Sotto meta' e' un problema
 * che costa adesso; fra meta' e la soglia piena e' una cosa da guardare; sopra
 * va bene. Tarare al pareggio secco — verde solo a 1 — accenderebbe l'ambra su
 * ogni citta' viva, ed e' la lezione gia' pagata in `balance.ts`.
 */
export function toneForFill(ratio: number, full = 0.9): MeterTone {
  if (ratio >= full) return 'good';
  if (ratio >= 0.5) return 'watch';
  return 'bad';
}

/**
 * Il tono di una quota che si vuole **bassa**: le case piene oltre la capienza,
 * i negozi oltre la domanda.
 */
export function toneForLoad(ratio: number, limit = 1): MeterTone {
  if (ratio > limit) return 'bad';
  if (ratio > limit * 0.9) return 'watch';
  return 'good';
}

/**
 * Il blocco composto, con le larghezze gia' risolte.
 *
 * Le quote si prendono sul **massimo assoluto** e non sul totale: le voci
 * negative — la congestione dei vicini — renderebbero il totale piu' piccolo
 * della sua parte piu' grande, e la barra piu' lunga uscirebbe dal blocco. Sul
 * massimo, invece, la voce che pesa di piu' e' sempre piena e le altre si
 * leggono in rapporto a lei, che e' cio' che si vuole sapere.
 */
export function breakdownOf(
  label: string,
  value: number,
  target: number,
  parts: readonly Omit<Contribution, 'share' | 'negative'>[],
): Breakdown {
  let peak = 0;
  for (const part of parts) peak = Math.max(peak, Math.abs(part.value));
  return {
    label,
    value,
    target,
    ratio: target <= 0 ? 1 : clamp01(value / target),
    met: value >= target,
    parts: parts.map((part) => ({
      ...part,
      share: peak === 0 ? 0 : Math.abs(part.value) / peak,
      negative: part.value < 0,
    })),
  };
}

/** Interi senza virgola, il resto a un decimale: `productionYield` vale 2,5. */
export function amount(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

/** «+52» o «-24»: il segno esplicito, perche' e' il senso della voce. */
export function signed(value: number): string {
  return `${value > 0 ? '+' : '-'}${amount(Math.abs(value))}`;
}

/** «96%»: la quota come la legge chi guarda la barra, non come la calcola. */
export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
