import { GRADING } from '../grading/config';
import type { GradePlan } from '../grading/grade';
import { CLUSTER } from './config';

/**
 * A cosa si aggrega un lotto, e cosa quella fila gli impone.
 *
 * **Un cluster non e' un oggetto.** E' cio' che due record hanno in comune: la
 * quota del piano e l'altezza del corso di base. La simulazione continua a
 * contare un edificio per record, il registry continua a indicizzarne uno per
 * volta, e la cancellazione resta per record — perche' il basamento condiviso sta
 * *dentro* lo stamp di ciascun membro, non in una struttura che li sopravvive.
 *
 * **Puro.** Entrano un piano di opera gia' calcolato e i termini dei vicini gia'
 * costruiti, esce una terna. Niente `TerrainMap`, niente registry, niente mondo:
 * e' la stessa mossa di `grading/grade.ts` e `sites/siteRules.ts`, e per la
 * stessa ragione — queste regole si verificano scrivendo tre numeri a mano,
 * invece di far crescere una citta' per vedere se due case si toccano.
 *
 * **Il rifiuto non e' un fallimento: e' il gradino.** Un lotto che non entra
 * nella fila del vicino ne apre una propria alla propria quota, e su un fianco e'
 * esattamente cosi' che l'isolato terrazzato viene fuori dalla regola invece di
 * essere disegnato da qualcuno.
 */

export interface ClusterTerms {
  /** Identita' della fila. Serve a leggerla, non a costruirla. */
  readonly id: number;

  /**
   * Quota del piano condiviso: diventa il `baseZ` di ogni membro.
   *
   * E' il primo dei due numeri che il record porta, e non ha bisogno di un campo
   * proprio: `BuildingRecord.baseZ` e' gia' questa quota.
   */
  readonly deck: number;

  /** Altezza del corso di base condiviso, in voxel. Zero se la fila non ne ha. */
  readonly base: number;
}

export interface ClusterRequest {
  /** Il piano che l'impronta si progetterebbe da sola, senza vicini. */
  readonly own: GradePlan;

  /**
   * Densita' locale, 0..1.
   *
   * Decide il solo corso di base. La quota si condivide comunque: due edifici
   * accostati a quote diverse leggono come un errore anche in periferia.
   */
  readonly density: number;

  /**
   * Termini dei vicini gia' costruiti, in ordine deterministico.
   *
   * Chi chiama garantisce l'ordine — e non e' pignoleria: con due vicini
   * ammissibili la fila scelta deciderebbe altrimenti l'ordine di enumerazione
   * del registry, che e' il tipo di dipendenza nascosta che `lots.ts` ha gia'
   * dovuto togliere di mezzo una volta.
   */
  readonly neighbours: readonly ClusterTerms[];

  /** Id da assegnare se nessun vicino accoglie il lotto. */
  readonly nextId: number;
}

/**
 * true se il lotto puo' entrare nella fila descritta da `terms`.
 *
 * Le tre condizioni dicono tre cose diverse e nessuna e' ridondante:
 *
 * 1. **Si riempie, non si scava.** Un lotto il cui piano naturale sta *sopra* il
 *    deck della fila dovrebbe scendere per allinearsi, e scendere significa
 *    togliere isola. Non entra: apre il gradino sopra.
 * 2. **Quanto muro per stare in fila.** Il riempimento che il membro accetta di
 *    pagare per farsi alzare fino al deck. E' la scelta di forma urbana, e il suo
 *    numero e' `CLUSTER.maxJoinFill`.
 * 3. **Il tetto strutturale resta quello che e'.** Misurato dalla quota naturale
 *    piu' bassa toccata, come lo misura `planGrade`: il muro sotto un membro di
 *    una fila non e' diverso da qualunque altro muro.
 */
export function joinsCluster(terms: ClusterTerms, own: GradePlan): boolean {
  if (terms.deck < own.padZ) return false;
  if (terms.deck - own.padZ > CLUSTER.maxJoinFill) return false;
  return terms.deck - own.footZ <= GRADING.maxWorksStep;
}

/**
 * Termini della fila a cui il lotto appartiene.
 *
 * Il primo vicino ammissibile vince e i suoi termini si adottano **invariati**,
 * id compreso: e' cio' che rende la fila una cosa sola invece di una catena di
 * compromessi, e che permette a un membro arrivato dopo di trovare la quota
 * giusta senza ricalcolare niente di chi c'era prima.
 *
 * Senza vicini ammissibili si apre una fila nuova alla propria quota. Il corso di
 * base compare solo sopra `CLUSTER.minDensity`, e da li' in poi lo ereditano
 * anche i membri che si accostano da colonne meno dense: la continuita' della
 * fila vale piu' della variazione locale, che e' il punto dell'aggregazione.
 */
export function planCluster(request: ClusterRequest): ClusterTerms {
  for (const terms of request.neighbours) {
    if (joinsCluster(terms, request.own)) return terms;
  }

  return {
    id: request.nextId,
    deck: request.own.padZ,
    base: request.density >= CLUSTER.minDensity ? CLUSTER.baseHeight : 0,
  };
}
