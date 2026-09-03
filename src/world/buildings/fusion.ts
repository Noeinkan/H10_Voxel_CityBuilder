import type { BuildingClass } from '../../sim';
import { CLEARANCE_KIND, type ClearanceKind } from './clearance';
import { FUSION } from './config/fusion';

/**
 * Chi puo' assorbire chi: la regola della fusione, pura e senza mondo.
 *
 * Entrano il candidato, il lato quadrato che l'isolato gli concederebbe e i
 * record che stanno dentro quel quadrato; esce l'elenco di chi cade e gli usi
 * che il sopravvissuto eredita, oppure il motivo per cui non se ne fa niente.
 * E' la stessa divisione di `cluster.ts` e `siting.ts`, e serve alla stessa
 * cosa: la regola si verifica senza far crescere un'isola.
 *
 * **La classificazione non si riscrive.** Chi si puo' togliere di mezzo lo dice
 * gia' `clearance.ts` con `CLEARANCE_KIND`, e questa regola la legge invece di
 * inventarsene una seconda: la citta' in quota, le arcologie e chi le porta non
 * cadono, un monumento non cade, una campata non e' un ostacolo. Quello che si
 * aggiunge qui e' cio' che vale per la sola fusione — il livello, la quota di
 * base e chi regge qualcosa.
 */

/** Un record dentro il quadrato, ridotto a cio' che la regola guarda. */
export interface FusionMember {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly baseZ: number;
  readonly level: number;
  readonly class: BuildingClass;
  /** Come lo classifica `clearance.ts`: un edificio cade, una struttura no. */
  readonly kind: ClearanceKind;
  /** true se porta una mensola, un percorso o un monumento sul tetto. */
  readonly carries: boolean;
  /** true se i suoi voxel stanno ancora comparendo o sparendo. */
  readonly growing: boolean;
}

export interface FusionQuery {
  /** Chi assorbe, con l'impronta che ha adesso. */
  readonly host: FusionMember & { readonly footprint: number };
  /** Il lato quadrato che la gerarchia e l'isolato concedono al candidato. */
  readonly side: number;
  /** I record dentro quel quadrato, **escluso** il candidato. */
  readonly inside: readonly FusionMember[];
}

export const FUSION_REFUSALS = {
  /** Il candidato non e' arrivato alla soglia di torre. */
  tooLow: 'tooLow',
  /** L'isolato non concede un'impronta piu' larga di quella che ha gia'. */
  noRoom: 'noRoom',
  /** Il quadrato e' vuoto: allargarsi nel prato e' gia' mestiere della promozione. */
  nothingToAbsorb: 'nothingToAbsorb',
  /** Dentro c'e' qualcosa che non si assorbe: struttura, monumento o un piu' cresciuto. */
  blocked: 'blocked',
  /** Uno dei due sta ancora comparendo. */
  busy: 'busy',
  /** Il quadrato scavalca un gradino della fila: il podio non sarebbe uno. */
  stepped: 'stepped',
  /** Piu' edifici di quanti una fusione ne possa portare via in una volta. */
  tooMany: 'tooMany',
} as const;

export type FusionRefusal = (typeof FUSION_REFUSALS)[keyof typeof FUSION_REFUSALS];

export interface FusionPlan {
  /** Gli id da sgomberare, in ordine di lettura. */
  readonly absorb: readonly number[];
  /**
   * Gli usi che il record fuso dichiarera'.
   *
   * Il primo e' quello del candidato, poi uno per assorbito nello stesso ordine
   * di `absorb`. E' posizionale come quello di un'arcologia, e per la stessa
   * ragione: `tally` lo conta e la simulazione lo riceve una voce per volta.
   */
  readonly uses: readonly BuildingClass[];
  /** Dove i cantieri hanno tolto un edificio: le celle da ridichiarare. */
  readonly cells: readonly { readonly x: number; readonly y: number; readonly class: BuildingClass }[];
}

export type FusionResult =
  | { readonly ok: true; readonly plan: FusionPlan }
  | { readonly ok: false; readonly refusal: FusionRefusal };

/**
 * Chi cade perche' il vicino se lo prende.
 *
 * **Il rifiuto e' del quadrato, non del singolo record**, come per lo
 * sventramento: un quadrato liberato a meta' non e' un lotto piu' largo, e
 * lasciar cadere una casa attorno a una torre che resta in piedi darebbe
 * all'assemblaggio un buco al posto di una massa.
 *
 * **Assorbe chi e' cresciuto di piu', mai il contrario.** Non e' una
 * preferenza: senza, due vicini di pari livello si assorbirebbero a vicenda a
 * seconda di chi il cursore incontra prima, e la citta' cambierebbe figura in
 * modo diverso a ogni caricamento della stessa partita. Il pari e' ammesso — a
 * decidere resta il cursore — ma il piu' basso non si prende il piu' alto.
 */
export function planFusion(query: FusionQuery): FusionResult {
  const { host, side, inside } = query;

  if (host.level < FUSION.minLevel) return { ok: false, refusal: FUSION_REFUSALS.tooLow };
  if (side <= host.footprint) return { ok: false, refusal: FUSION_REFUSALS.noRoom };
  if (inside.length === 0) return { ok: false, refusal: FUSION_REFUSALS.nothingToAbsorb };
  if (inside.length > FUSION.maxAbsorbed) return { ok: false, refusal: FUSION_REFUSALS.tooMany };

  for (const member of inside) {
    if (member.kind !== CLEARANCE_KIND.building) {
      return { ok: false, refusal: FUSION_REFUSALS.blocked };
    }
    if (member.carries) return { ok: false, refusal: FUSION_REFUSALS.blocked };
    if (member.level > host.level) return { ok: false, refusal: FUSION_REFUSALS.blocked };
    if (member.growing) return { ok: false, refusal: FUSION_REFUSALS.busy };
    // **La quota di base e' la stessa o non c'e' fusione.** Un assemblaggio
    // poggia su un podio solo, e due lotti separati da un gradino della fila
    // stanno su due quote: il podio ne coprirebbe uno e sotterrerebbe l'altro.
    // E' lo stesso rifiuto che `cluster.ts` chiama gradino, letto un piano piu'
    // in la'.
    if (member.baseZ !== host.baseZ) return { ok: false, refusal: FUSION_REFUSALS.stepped };
  }

  return {
    ok: true,
    plan: {
      absorb: inside.map((member) => member.id),
      uses: [host.class, ...inside.map((member) => member.class)],
      cells: inside.map((member) => ({ x: member.x, y: member.y, class: member.class })),
    },
  };
}
