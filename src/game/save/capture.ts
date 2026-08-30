import {
  removeBuildings,
  reviveSimState,
  toSimStateData,
  type Building,
  type SimState,
} from '../../sim';
import type { BuildingRecord } from '../../world/buildings/BuildingRegistry';
import { SAVE_VERSION, type SaveGame, type SaveScene } from './format';

/**
 * Da partita in corso a file.
 *
 * **La potatura sta qui, non al caricamento**, ed e' la scelta che tiene
 * semplice tutto il resto: quello che il caricamento non saprebbe ridisegnare
 * non entra nel file, e insieme non ci entra nemmeno il conto che la
 * simulazione ne teneva. Il file e' quindi coerente per costruzione — i record
 * e `buildings` dicono la stessa citta' — e `restore` non ha un caso speciale
 * da gestire ne' un modo di sbagliarlo.
 *
 * Cosa non si sa ridisegnare, e perche': campate, impalcati, gambe, ascensori e
 * stazioni di funivia si cancellano con `clearVolume` — un parallelepipedo — e
 * non rigenerando la sagoma, quindi il loro generatore vuole un piano
 * (`SpanPlan`, `DeckPlan`) che il record non porta. Edifici, landmark e
 * arcologie invece hanno `recordStamp`, che li ridisegna esatti.
 *
 * **E chi ci poggiava sopra cade con loro.** Un edificio costruito su un
 * impalcato senza il suo impalcato resterebbe sospeso in aria: la potatura
 * segue `supports` e porta via anche lui. Dopo il caricamento e' la passata
 * della rete in quota a riproporre campate e mensole sui tetti tornati, che e'
 * esattamente il mestiere per cui quelle passate esistono.
 */

export interface CaptureInput {
  readonly seed: number;
  readonly state: SimState;
  readonly records: Iterable<BuildingRecord>;
  /** Settori comprati, **in ordine di acquisto**: e' l'ordine che rifa' la costa. */
  readonly sectors: readonly string[];
  readonly scene: SaveScene;
  /** Millisecondi epoch. Entra come parametro perche' qui dentro non si tira l'ora. */
  readonly savedAt: number;
}

export function captureSave(input: CaptureInput): SaveGame {
  const all = [...input.records].sort((a, b) => a.id - b.id);
  const doomed = prune(all);

  const lost: Building[] = [];
  for (const record of all) {
    if (!doomed.has(record.id)) continue;
    const counted = countedBuilding(record);
    if (counted !== null) lost.push(counted);
  }

  return {
    version: SAVE_VERSION,
    savedAt: input.savedAt,
    seed: input.seed,
    sim: pruned(input.state, lost),
    records: all.filter((record) => !doomed.has(record.id)),
    sectors: [...input.sectors],
    scene: input.scene,
  };
}

/**
 * I dati della simulazione senza gli edifici potati.
 *
 * **Su una copia staccata, e non e' pignoleria.** `removeBuildings` aggiorna il
 * campo di desiderabilita' **in place** e ne passa la proprieta' al nuovo stato:
 * chiamarlo sullo stato vivo cancellerebbe quegli edifici dalla partita in
 * corso, cioe' salvare cambierebbe la citta' che si sta giocando. `reviveSimState`
 * costruisce un campo nuovo dagli stessi dati, quindi la potatura avviene su uno
 * stato che non e' di nessuno e viene buttato via una riga dopo.
 *
 * Il ramo costoso si paga **solo quando c'e' davvero qualcosa da potare** —
 * cioe' solo in una citta' che ha gia' costruito in quota. Finche' non ce n'e',
 * questo e' un `toSimStateData` e nient'altro.
 */
function pruned(state: SimState, lost: readonly Building[]) {
  const data = toSimStateData(state);
  if (lost.length === 0) return data;
  return toSimStateData(removeBuildings(reviveSimState(data), lost));
}

/**
 * Gli id che non entrano nel file: il seme, e chi ci poggia sopra.
 *
 * **Un passo solo basta**, e non e' fortuna: un appoggio esiste prima di cio'
 * che regge, quindi il suo id e' sempre piu' piccolo. Scorrendo in ordine
 * crescente, quando si guarda un record i suoi appoggi sono gia' stati
 * giudicati.
 */
function prune(sorted: readonly BuildingRecord[]): ReadonlySet<number> {
  const doomed = new Set<number>();
  for (const record of sorted) {
    if (unrenderable(record)) {
      doomed.add(record.id);
      continue;
    }
    for (const support of record.supports ?? []) {
      if (doomed.has(support)) {
        doomed.add(record.id);
        break;
      }
    }
  }
  return doomed;
}

/** true se nessun generatore sa ridisegnare questo record dal record e basta. */
function unrenderable(record: BuildingRecord): boolean {
  return record.span !== undefined ||
    record.aerial !== undefined ||
    record.ropeway !== undefined;
}

/**
 * L'edificio che la simulazione ha contato per questo record, se ne ha contato
 * uno.
 *
 * E' la stessa tabella di `tally` in `BuildingRegistry`, letta al contrario, e
 * l'unica cosa da tenere allineata se un giorno nasce una sesta struttura.
 * L'abbinamento di `removeBuildings` e' per cella e uso, quindi bastano tre
 * campi.
 *
 * **L'arcologia non passa mai di qui** perche' non puo' essere potata: e'
 * fondata a terra e non ha `supports`. Se un giorno ne avesse, la sua riga qui
 * non basterebbe — la simulazione la conta una volta per fascia, su colonne che
 * solo `worldBands` sa dire — ed e' meglio che il caso resti scoperto e visibile
 * che coperto male.
 */
function countedBuilding(record: BuildingRecord): Building | null {
  if (record.landmark !== undefined) return null;
  if (record.span !== undefined) return null;
  if (record.aerial !== undefined) return null;
  if (record.ropeway !== undefined) return null;
  if (record.arcology !== undefined) return null;
  return { x: record.x, y: record.y, class: record.class };
}
