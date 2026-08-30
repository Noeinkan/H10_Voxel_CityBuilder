import { falloff } from '../../sim';
import { hashCoords } from '../rng';
import { SKYLINE } from './config';

/**
 * Fin dove una colonna puo' salire, che e' una domanda diversa da «questa
 * colonna vuole crescere?».
 *
 * **Perche' esiste un dominio a se'.** Finora l'altezza era una funzione della
 * sola desiderabilita', e la desiderabilita' satura: `DesirabilityField` e' un
 * `Uint8Array` clampato in `0..255` e l'ultima soglia di upgrade sta a 198, cioe'
 * alla fine dell'alfabeto. Oltre quel punto il campo non *distingue* piu' due
 * colonne del centro, e alzare il livello massimo non darebbe uno skyline ma un
 * altopiano — tutto il nucleo saturo che sale insieme. La desiderabilita'
 * continua percio' a decidere **se** un edificio promuove; qui si decide **fin
 * dove**. Sono due domande, e per questo due dati.
 *
 * **Perche' non sta in `src/sim/`.** La quota ammessa e' un dato del mondo, come
 * le strade, le opere e i vincoli di sito: si ricava da distanza dai poli, dal
 * mare e dal bordo dell'edificato, cioe' da geografia. `src/sim/` continua a
 * ragionare per cella e a non avere una coordinata verticale (invariante 7); un
 * indice `z` nel campo moltiplicherebbe per il numero di livelli tutta la memoria
 * densa, ed e' l'alternativa da non prendere.
 *
 * **Puro e senza stato**, come la rete stradale: non si salva, non si invalida
 * quando arriva un catalizzatore, e non conosce `BUILDER.maxLevel` — il clamp lo
 * fa il chiamante, cosi' questo file resta testabile senza mondo e senza
 * terreno.
 */

/**
 * Le tre fasce della citta'.
 *
 * L'ordine e' contratto: e' anche l'indice in `SKYLINE.levelCap`, e i tetti
 * salgono con l'indice.
 */
export const TIER = {
  /** Costa e periferia: bassa e porosa, e' la corona attorno all'edificato. */
  fringe: 0,
  /** Fascia intermedia: il tessuto terrazzato che sta fra la corona e il centro. */
  middle: 1,
  /** Centro denso: l'unica fascia da cui un picco puo' partire. */
  core: 2,
} as const;

export type SkylineTier = (typeof TIER)[keyof typeof TIER];

/**
 * Un polo della citta', come lo vede questo dominio.
 *
 * E' deliberatamente una forma strutturale e non `Catalyst`: qui non servono
 * ruolo, uso urbano ne' vettore di influenza, e importarli legherebbe la
 * gerarchia al catalogo della simulazione senza guadagnarci niente.
 */
export interface Pole {
  readonly x: number;
  readonly y: number;
  /** Raggio in colonne. A distanza pari al raggio il polo non si sente. */
  readonly radius: number;

  /**
   * Peso del polo nella colonna, 0..1, quando chi chiama sa gia' misurarlo.
   *
   * E' la portata geodetica del catalizzatore: l'influenza gira attorno a un
   * dirupo e si ferma sull'acqua invece di attraversarla in linea retta. Entra
   * come funzione e non come `ReachCache` per la stessa ragione di
   * `waterDistance` qui sotto — il dominio resta puro, e a misurare e' chi la
   * cache ce l'ha gia' in mano.
   *
   * Assente, si ricade sulla distanza di Chebyshev: e' cio' che tiene in piedi i
   * chiamanti che un polo lo costruiscono a mano, i test per primi.
   */
  readonly reachAt?: (x: number, y: number) => number;
}

export interface SkylineQuery {
  readonly x: number;
  readonly y: number;

  readonly poles: readonly Pole[];

  /**
   * Distanza dalla prima colonna d'acqua, o null se non ce n'e' entro il raggio
   * cercato.
   *
   * Entra come numero e non come `TerrainMap` per la stessa ragione per cui
   * `cluster.ts` prende un `GradePlan` invece del mondo: il dominio resta puro, e
   * la misura la fa chi il terreno ce l'ha gia' in mano.
   */
  readonly waterDistance: number | null;

  /** Edifici entro `SKYLINE.edgeRadius`: quanto e' costruito attorno. */
  readonly builtNeighbours: number;

  readonly seed: number;

  /** Isolato della colonna, negli indici di `blockAt`. Serve all'elezione del picco. */
  readonly blockKx: number;
  readonly blockKy: number;
}

/**
 * Quanto forte si sente il polo piu' vicino, in 0..1.
 *
 * Stessa attenuazione che `DesirabilityField` usa per i catalizzatori, e non e'
 * una coincidenza da correggere: il campo e la gerarchia devono dire «vicino al
 * polo» nello stesso modo, altrimenti il centro della desiderabilita' e il
 * centro dello skyline cadrebbero in due punti diversi. Per questo la curva non
 * e' piu' riscritta qui ma importata da `src/sim/reach`, che ne e' l'unica
 * copia. Vince il polo che si sente di piu', non la somma: due catalizzatori
 * accostati fanno un centro, non un centro alto il doppio.
 */
export function poleReach(query: SkylineQuery): number {
  let best = 0;
  for (const pole of query.poles) {
    if (pole.radius <= 0) continue;
    const reach =
      pole.reachAt !== undefined
        ? pole.reachAt(query.x, query.y)
        : falloff(
            Math.max(Math.abs(pole.x - query.x), Math.abs(pole.y - query.y)) / pole.radius,
          );
    if (reach > best) best = reach;
  }
  return best;
}

/**
 * true se l'isolato e' fra quelli ammessi a un picco.
 *
 * Funzione dell'isolato e non della colonna: dentro un isolato eletto sale
 * l'edificio che ci riesce, e a deciderlo e' gia' la geometria — `blockRoom`
 * impedisce ai lotti interni di allargarsi, quindi sono gli angoli a diventare
 * le torri. Farlo per colonna darebbe invece un picco isolato in mezzo a vicini
 * bassi, che legge come un errore e non come una guglia.
 */
export function isPeakBlock(seed: number, blockKx: number, blockKy: number): boolean {
  const roll = hashCoords((seed ^ SKYLINE.peakSalt) >>> 0, blockKx, blockKy);
  return roll % SKYLINE.peakEvery === 0;
}

/**
 * La fascia a cui questa colonna appartiene.
 *
 * L'ordine delle domande e' la regola, e non e' commutativo: la costa vince su
 * tutto — una torre sul filo della battigia cancella la linea di costa anche in
 * mezzo al centro — e il bordo dell'edificato viene prima del polo, perche' un
 * catalizzatore appena piazzato in mezzo al prato non deve autorizzare
 * immediatamente un grattacielo dove non c'e' ancora citta'.
 */
export function tierAt(query: SkylineQuery): SkylineTier {
  if (query.waterDistance !== null && query.waterDistance <= SKYLINE.coastNear) {
    return TIER.fringe;
  }
  if (query.builtNeighbours < SKYLINE.edgeMiddle) return TIER.fringe;
  if (query.builtNeighbours < SKYLINE.edgeCore) return TIER.middle;
  // Fuori dall'influenza di ogni polo non c'e' un centro: c'e' del tessuto
  // fitto, che e' un'altra cosa e si ferma alla fascia intermedia.
  if (poleReach(query) <= 0) return TIER.middle;
  return TIER.core;
}

/**
 * Fin dove la colonna puo' salire, in livelli.
 *
 * **Non e' clampato a `BUILDER.maxLevel`**, di proposito: questo dominio non
 * conosce il catalogo degli edifici, e il tetto assoluto lo applica il Builder.
 * La taratura di `SKYLINE` fa comunque coincidere il massimo teorico con quel
 * numero, e un test lo verifica invece di lasciarlo alla buona volonta'.
 */
export function allowedLevelAt(query: SkylineQuery): number {
  const tier = tierAt(query);
  let cap = SKYLINE.levelCap[tier];

  // Il cono vale nel solo centro: darlo anche alla fascia intermedia
  // rimetterebbe una rampa continua da un capo all'altro della citta', cioe'
  // esattamente l'altopiano che le fasce esistono per evitare.
  if (tier === TIER.core) cap += Math.round(SKYLINE.coneBonus * poleReach(query));

  // Il bordo non elegge picchi: una guglia in mezzo alla corona non e'
  // un'eccezione governata, e' un edificio fuori posto.
  if (tier !== TIER.fringe && isPeakBlock(query.seed, query.blockKx, query.blockKy)) {
    cap += SKYLINE.peakBonus;
  }

  return cap;
}

/**
 * Livelli che la gerarchia concede **oltre** il tetto nudo della propria fascia.
 *
 * E' il cono piu' l'elezione, letti come un numero solo: zero significa «qui la
 * colonna ha esattamente cio' che la fascia ammette a tutti», e il massimo
 * significa «qui la gerarchia concentra l'altezza». Serve a chi deve distinguere
 * la **cresta** dalla **spalla** dentro la stessa fascia — le due famiglie di
 * megastruttura lo fanno — e sta qui perche' e' una domanda sulla gerarchia, come
 * `isPeakBlock`, non sul dominio che la interroga.
 *
 * Non e' clampato a `BUILDER.maxLevel` per la stessa ragione di `allowedLevelAt`:
 * il tetto assoluto non appartiene a questo dominio, e applicarlo qui
 * cancellerebbe proprio la differenza fra cresta e spalla nelle citta' alte.
 */
export function heightBonusAt(query: SkylineQuery): number {
  return allowedLevelAt(query) - SKYLINE.levelCap[tierAt(query)];
}

/**
 * Livelli che restano a chi parte `rise` voxel sopra il terreno.
 *
 * **Il tetto e' sulla quota finale, non sul volume costruito.** Una gerarchia
 * che contasse i soli livelli dell'edificio direbbe che una torre da nove su una
 * soletta a trenta voxel e' alta come la stessa torre a terra, e in periferia
 * basterebbe un piano artificiale per avere il centro. Qui la quota di partenza
 * si converte in livelli — `SKYLINE.deckLevelRise` voxel ciascuno — e si scala
 * dal tetto: il secondo piano di citta' e' altezza che qualcuno ha gia' speso.
 *
 * Non e' clampato a zero dal basso: un risultato negativo significa che quella
 * quota non ammette proprio niente, ed e' un'informazione che il chiamante deve
 * poter leggere invece di confonderla con «ammette un livello zero».
 */
export function levelsAboveDeck(cap: number, rise: number): number {
  if (rise <= 0) return cap;
  return cap - Math.floor(rise / SKYLINE.deckLevelRise);
}
