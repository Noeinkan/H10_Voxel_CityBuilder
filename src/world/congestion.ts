import { BALANCE, catalystRoleOf, falloff, type Catalyst } from '../sim';
import { footprintDepth, type BuildingRecord } from './buildings/BuildingRegistry';
import type { RopewayRide } from './buildings/ropewayDriver';

/**
 * L'ingorgo come geografia: quanto il costruito allontana da se' cio' che lo
 * attraversa.
 *
 * **E' il ciclo del traffico di Cities Skylines senza un veicolo e senza ricerca
 * di percorso.** La distanza dei catalizzatori e' geodetica dalla 4.2, quindi
 * bastava una cosa perche' densificare avesse un prezzo spaziale: far salire il
 * costo di attraversamento dove la citta' e' fitta. Un quartiere che si
 * infittisce diventa *lontano*, i campi che lo raggiungevano si accorciano, la
 * desiderabilita' cala e la crescita si ferma — finche' non arriva qualcosa che
 * muove gente.
 *
 * Non va confuso con `src/world/traffic/`: li' barche e aerei sono **pose in
 * funzione del tempo** per il colpo d'occhio, e non sanno niente di carichi. Qui
 * non c'e' nessun mezzo, e non ce ne sara' uno.
 *
 * **E non va confuso con l'altra congestione, che nel campo c'era gia'.**
 * `gameplay.congestionPerBuilding` e' un termine *sottrattivo sul valore*: gli
 * edifici vicini abbassano la desiderabilita' della cella in cui stanno, e dice
 * «vivere in mezzo a tanti edifici piace meno». Questo e' un termine *additivo
 * sul costo di attraversamento*, e dice «attraversare tanti edifici richiede
 * piu' cammino». La prima toglie valore qui, la seconda allontana tutto il
 * resto; il confronto per esteso sta in `src/sim/README.md`.
 *
 * **Il carico sta su tessere e non su celle**, ed e' la ragione per cui questo
 * modulo esiste invece di essere una riga in `reachCost.ts`: il costo di un passo
 * viene chiesto una volta per vicino visitato dentro Dijkstra, cioe' decine di
 * migliaia di volte per catalizzatore, e deve costare una ricerca in una `Map`.
 * Contare i record attorno a una colonna a ogni domanda sarebbe il costo
 * dominante del campo.
 *
 * **Il vicinato entra a meta' peso.** Senza, due celle affiancate ai lati opposti
 * di un confine di tessera avrebbero costi diversi senza che niente sia cambiato,
 * e la citta' mostrerebbe la propria griglia di conteggio nelle forme che
 * crescono. Il nucleo e' normalizzato — un carico uniforme resta se stesso — cosi'
 * la sfocatura sposta i bordi e non la scala.
 */

const CONGESTION = BALANCE.reach.congestion;

/** Cio' che il costo di attraversamento chiede all'ingorgo. */
export interface CongestionLookup {
  /** Carico della colonna, 0..1. Zero dove la citta' non e' ancora arrivata. */
  readonly at: (x: number, y: number) => number;
}

/**
 * Qualcosa che muove gente, e per questo scioglie l'ingorgo attorno a se'.
 *
 * Arriva gia' risolto — posizione, portata e forza — perche' questo modulo non
 * deve sapere ne' quali ruoli del catalogo contino ne' come sia fatta una
 * funivia: a tradurre le due sorgenti e' `transitSourcesOf`, qui sotto.
 */
export interface TransitSource {
  readonly x: number;
  readonly y: number;
  /** Raggio del sollievo, in celle. */
  readonly radius: number;
  /** Quanto scioglie al centro, 0..1. */
  readonly relief: number;
}

/** Chiave di tessera in un intero, con abbondanza per le coordinate negative. */
const KEY_BIAS = 1 << 15;
const KEY_SPAN = 1 << 16;

function tileKey(tx: number, ty: number): number {
  return (tx + KEY_BIAS) * KEY_SPAN + (ty + KEY_BIAS);
}

/** Somma del nucleo 3x3 usato dalla sfocatura: il centro pieno, gli otto a meta'. */
const KERNEL_SUM = 1 + 0.5 * 8;

/**
 * Le sorgenti di trasporto della partita: i catalizzatori che muovono gente e i
 * capolinea delle funivie.
 *
 * **Le posizioni e non le portate**, ed e' cio' che tiene fuori la ricorsione:
 * un sollievo che leggesse il campo di un catalizzatore dipenderebbe dal costo
 * di attraversamento che questo modulo serve a produrre. Qui la distanza e' in
 * linea d'aria, e resta un fatto sui dati.
 */
export function transitSourcesOf(
  catalysts: readonly Catalyst[],
  rides: readonly RopewayRide[] = [],
): readonly TransitSource[] {
  const out: TransitSource[] = [];

  for (const catalyst of catalysts) {
    const relief = CONGESTION.transitRelief[catalystRoleOf(catalyst)] ?? 0;
    if (relief <= 0) continue;
    out.push({
      x: catalyst.x,
      y: catalyst.y,
      radius: catalyst.radius * CONGESTION.reliefReach,
      relief,
    });
  }

  // I due capi di una corsa, non la fune: sotto la campata non si sale, e una
  // linea che alleggerisse tutto cio' che scavalca renderebbe scorrevole proprio
  // il centro che ha attraversato senza fermarsi.
  for (const ride of rides) {
    const first = ride.path[0];
    const last = ride.path[ride.path.length - 1];
    for (const end of [first, last]) {
      if (end === undefined) continue;
      out.push({
        x: end.x,
        y: end.y,
        radius: CONGESTION.tile * 2 * CONGESTION.reliefReach,
        relief: CONGESTION.ropewayRelief,
      });
    }
  }

  return out;
}

/**
 * Il carico della citta', per tessera.
 *
 * Si ricostruisce per intero da registry e sorgenti di trasporto — come il campo
 * di desiderabilita' e come la rete stradale — e per questo non entra nella
 * serializzazione e non ha un percorso incrementale. **Il costo vero non e'
 * questa passata, e' cio' che la segue**: un carico nuovo rende stale ogni
 * portata gia' calcolata, quindi chi chiama `rebuild` deve poi buttare la cache
 * geodetica. E' la ragione per cui si chiama a scaglioni e non a ogni edificio.
 */
export class CongestionMap implements CongestionLookup {
  private tiles = new Map<number, number>();

  /** Quante tessere portano un carico. Serve a chi misura, non al gioco. */
  get size(): number {
    return this.tiles.size;
  }

  /** Carico della colonna, 0..1. */
  at = (x: number, y: number): number => {
    const tile = CONGESTION.tile;
    return this.tiles.get(tileKey(Math.floor(x / tile), Math.floor(y / tile))) ?? 0;
  };

  /**
   * Rifa' il carico da zero, e dice **se e' cambiato davvero**.
   *
   * Il valore di ritorno e' meta' della fase: rifare il carico costa un quinto
   * di millisecondo, rifare il campo che ne dipende ne costa cinquanta o
   * novanta. Chi chiama deve poter distinguere «la citta' si e' infittita» da
   * «e' successo qualcosa che l'ingorgo non vede» — un mercato piazzato, un
   * edificio comparso in periferia dove non satura niente — e pagare solo il
   * primo caso. Su diciannove ruoli, quindici non alleviano nulla.
   *
   * `records` e' l'iteratore del registry e si consuma: chi chiama lo prende
   * fresco. **Le campate restano fuori** — un ponte scavalca il suolo senza
   * prenderlo, ed e' proprio la cosa che allevia un ingorgo invece di crearlo —
   * mentre i landmark entrano: uno stadio e' la struttura che intasa di piu' in
   * tutto il catalogo.
   */
  rebuild(records: Iterable<BuildingRecord>, transit: readonly TransitSource[] = []): boolean {
    const tile = CONGESTION.tile;
    const raw = new Map<number, number>();

    for (const record of records) {
      if (record.span !== undefined) continue;
      const width = record.footprint;
      const depth = footprintDepth(record);
      if (!(width > 0) || !(depth > 0) || !(record.height > 0)) continue;

      // Il volume si spartisce fra le tessere che l'impronta tocca davvero,
      // invece di finire tutto in quella del centro: una pista o un viadotto
      // sono lunghi quanto tre isolati, e concentrarli su una tessera darebbe un
      // ingorgo dove non c'e' niente e nessuno dove passa la struttura.
      const x1 = record.x + width;
      const y1 = record.y + depth;
      for (let ty = Math.floor(record.y / tile); ty <= Math.floor((y1 - 1) / tile); ty++) {
        const oy = Math.min(y1, (ty + 1) * tile) - Math.max(record.y, ty * tile);
        if (oy <= 0) continue;
        for (let tx = Math.floor(record.x / tile); tx <= Math.floor((x1 - 1) / tile); tx++) {
          const ox = Math.min(x1, (tx + 1) * tile) - Math.max(record.x, tx * tile);
          if (ox <= 0) continue;
          const key = tileKey(tx, ty);
          raw.set(key, (raw.get(key) ?? 0) + ox * oy * record.height);
        }
      }
    }

    const next = blurred(raw, transit);
    const moved = differs(this.tiles, next);
    this.tiles = next;
    return moved;
  }

  /** Svuota il carico. Serve a una partita nuova e ai test. */
  clear(): void {
    this.tiles = new Map();
  }
}

/**
 * Se il carico nuovo sposta qualcosa che si possa vedere.
 *
 * La soglia e' un centesimo di cella di costo, la stessa sotto cui `blurred`
 * scarta una tessera: sotto, la differenza non arriva ne' al campo — che
 * quantizza in sedicesimi — ne' agli occhi.
 */
function differs(before: ReadonlyMap<number, number>, after: ReadonlyMap<number, number>): boolean {
  if (before.size !== after.size) return true;
  const epsilon = 0.01 / CONGESTION.jam;
  for (const [key, load] of after) {
    if (Math.abs((before.get(key) ?? 0) - load) > epsilon) return true;
  }
  return false;
}

/**
 * Sfocatura, normalizzazione e sollievo in una passata sola.
 *
 * Le tessere di uscita sono quelle piene **piu' la loro corona**: il nucleo
 * porta carico anche fuori dal costruito, e fermarsi alle piene darebbe una
 * sfocatura che entra e non esce, cioe' proprio il gradino che si voleva
 * togliere.
 */
function blurred(
  raw: ReadonlyMap<number, number>,
  transit: readonly TransitSource[],
): Map<number, number> {
  const { tile, saturation, jam } = CONGESTION;
  const out = new Map<number, number>();
  if (raw.size === 0 || !(saturation > 0) || !(jam > 0)) return out;

  const cells = tile * tile;
  const wanted = new Set<number>();
  for (const key of raw.keys()) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      wanted.add(key + dx * KEY_SPAN + dy);
    }
  }

  for (const key of wanted) {
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const volume = raw.get(key + dx * KEY_SPAN + dy);
        if (volume === undefined) continue;
        sum += dx === 0 && dy === 0 ? volume : volume * 0.5;
      }
    }
    if (sum <= 0) continue;

    const load = Math.min(1, sum / (KERNEL_SUM * cells * saturation));
    const eased = load * (1 - reliefAt(key, transit));
    // Sotto un centesimo di cella l'ingorgo non si vede e non si sente: tenerlo
    // farebbe crescere la mappa con la periferia invece che con il centro.
    if (eased * jam >= 0.01) out.set(key, eased);
  }

  return out;
}

/** Quanto le sorgenti di trasporto sciolgono questa tessera, 0..1. */
function reliefAt(key: number, transit: readonly TransitSource[]): number {
  if (transit.length === 0) return 0;

  const tile = CONGESTION.tile;
  const ty = (key % KEY_SPAN) - KEY_BIAS;
  const tx = Math.floor(key / KEY_SPAN) - KEY_BIAS;
  const cx = tx * tile + tile / 2;
  const cy = ty * tile + tile / 2;

  // Il massimo e non la somma: due stazioni affiancate non fanno una strada
  // larga il doppio, e sommandole il centro tornerebbe scorrevole a forza di
  // collegamenti invece che di spazio.
  let best = 0;
  for (const source of transit) {
    if (!(source.radius > 0)) continue;
    const dx = cx - source.x;
    const dy = cy - source.y;
    const share = source.relief * falloff(Math.sqrt(dx * dx + dy * dy) / source.radius);
    if (share > best) best = share;
  }
  return Math.min(1, best);
}
