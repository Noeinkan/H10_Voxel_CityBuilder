import { CHUNK } from '../world/chunkCoords';
import { columnIndex } from '../world/terrain/columnBlock';
import type { TerrainMap } from '../world/terrain/TerrainMap';
import { BALANCE } from './balance';
import { BUILDING_CLASS, type BuildingClass } from './classes';
import { cellIndexOf, DesirabilityField, FREE, type CellRect } from './DesirabilityField';
import type { SimState } from './SimState';

/**
 * Decisioni della simulazione: dove crescera' il prossimo edificio.
 *
 * E' l'unico output "di volonta'" della simulazione, e non scrive niente da
 * nessuna parte. Restituisce candidati ordinati; chi costruisce sta fuori da
 * `src/sim/` e resta libero di ignorarli.
 */

export interface BuildSite {
  readonly x: number;
  readonly y: number;
  /** Uso urbano primario della cella. */
  readonly class: BuildingClass;
  /**
   * Secondo uso ospitato nello stesso edificio, o -1 se l'edificio e' a uso
   * singolo. Non e' una seconda cella e non e' una zona: e' lo stesso volume
   * che porta due capacita' economiche.
   */
  readonly mixed: BuildingClass | -1;
  /** Desiderabilita' della cella per l'uso primario, 0..255. */
  readonly score: number;
}

export interface BuildSiteQuery {
  /**
   * Se presente, si valuta solo questo uso: la risposta dice dove mettere il
   * prossimo edificio *di quel tipo*, non dove mettere il prossimo edificio.
   * Senza, ogni cella corre con il suo uso migliore.
   */
  readonly class?: BuildingClass;

  /**
   * Se true, nessun sito riceve un secondo uso.
   *
   * Serve a chi vuole un edificio a uso singolo e basta — la fixture della
   * scena di debug — senza dover ignorare il campo a valle.
   */
  readonly singleUse?: boolean;

  /**
   * Quante quote la colonna ammette ancora. Assente, ne vale una.
   *
   * **E' il modo in cui una colonna gia' costruita torna candidabile senza che
   * `src/sim/` guadagni una coordinata verticale.** Il campo sa quante quote
   * sono state spese — le conta `stack` — e non sa, ne' deve sapere, quante ce
   * ne siano: dove passi una soletta e quanto sia alta e' geografia costruita, e
   * la geografia sta nel mondo. E' la stessa mossa di `waterDistance` in
   * `SkylineQuery`: chi il terreno ce l'ha in mano misura, la regola pura riceve
   * un numero.
   *
   * Viene interrogata **solo sulle colonne gia' costruite**, che su un'isola
   * sono una frazione: una partita che non arriva mai in quota paga esattamente
   * quello che pagava prima.
   */
  readonly headroomAt?: (x: number, y: number) => number;

  /**
   * Se presente, si guarda **solo dentro questo riquadro** di celle.
   *
   * **Esiste perche' il punteggio e' assoluto e la classifica e' globale**, e le
   * due cose insieme affamano ogni polo che non sia il piu' forte della mappa.
   * Un catalizzatore appena piazzato lontano dal centro vale al massimo la
   * propria intensita' — duecentodieci per un mercato — mentre nel nucleo maturo
   * due o tre campi sovrapposti tengono migliaia di celle libere sopra
   * duecentoquaranta: i venti posti della lista finivano tutti li', e attorno al
   * catalizzatore nuovo non nasceva **mai** niente. Non era lentezza, era zero, e
   * lo era anche per un'isola con il suo bel monumento sopra.
   *
   * Il riquadro non e' una preferenza sull'ordinamento ma un ritaglio della
   * domanda: chi costruisce chiede «dove cresce *questo* polo» e riceve la
   * classifica di quel pezzo di mappa, dove il confronto fra celle torna a essere
   * fra pari. La rotazione fra i poli — cioe' *quale* pezzo, a ogni infornata —
   * sta in `growthPoles.ts`, accanto a chi le infornate le fa, con il resto di
   * cio' che sa quante volte al secondo la citta' cresce.
   *
   * Costa anche **meno** della domanda globale: si scorrono le colonne di chunk
   * che il riquadro tocca invece di tutte quelle allocate.
   */
  readonly within?: CellRect;
}

/**
 * Fino a `n` candidati, dal migliore al peggiore.
 *
 * Una cella e' candidata solo se soddisfa tutte e tre le condizioni:
 *
 * 1. la colonna e' `buildable` nella `TerrainMap`;
 * 2. nessun edificio la occupa;
 * 3. la sua desiderabilita' **supera** la soglia della classe.
 *
 * Ogni cella compare al massimo una volta, con l'uso che ci prende il punteggio
 * piu' alto: quattro righe per la stessa cella direbbero quattro volte la stessa
 * cosa e riempirebbero i primi dieci posti con un solo isolato.
 *
 * **Uso misto.** Deciso l'uso primario, si guarda se uno dei suoi usi
 * compatibili (`BALANCE.mixedUse.partners`) supera a sua volta una soglia
 * ridotta. Se si', il sito nasce misto. E' il bordo sfumato fra due campi a
 * produrlo — dove un mercato e un parco si sovrappongono nasce la casa-bottega,
 * non dove qualcuno ha disegnato una zona.
 *
 * **Dove si guarda.** Solo dentro le colonne di chunk che il campo ha allocato,
 * e il campo alloca solo dove un catalizzatore o un edificio l'ha toccato. Una
 * mappa senza catalizzatori non ha candidati e non costa nulla da interrogare,
 * per quanto sia grande. Con `within` si guarda solo il riquadro chiesto, ed e'
 * quello che impedisce alla classifica globale di affamare i poli lontani dal
 * nucleo — il perche' sta sul campo.
 *
 * **Come si guarda.** I tre `Uint8Array` della colonna di chunk si prendono una
 * volta sola e poi si scorrono per indice. La versione con un accesso per cella
 * e per classe attraverso l'API pubblica del campo costava venticinque volte
 * tanto, ed e' una scansione che la scena di debug fa a ogni ridisegno.
 *
 * **Ordinamento totale.** A parita' di punteggio decidono `x`, poi `y`, poi la
 * classe. Serve al determinismo: senza, il risultato dipenderebbe dall'ordine di
 * allocazione dei chunk, che a sua volta dipende dall'ordine in cui il giocatore
 * ha piazzato i catalizzatori.
 */
export function nextBuildSites(
  state: SimState,
  terrainMap: TerrainMap,
  n: number,
  query: BuildSiteQuery = {},
): readonly BuildSite[] {
  if (n <= 0) return EMPTY_SITES;

  const only = query.class;
  const thresholds = BALANCE.desirability.siteThreshold;

  // Una classe esclusa riceve una soglia irraggiungibile invece di un ramo in
  // piu' nel ciclo: 256 e' fuori dal dominio di un `Uint8Array`, quindi nessun
  // valore la supera mai.
  const unreachable = BALANCE.limits.maxDesirability + 1;
  const minOf = (cls: BuildingClass): number =>
    only === undefined || only === cls ? thresholds[cls] : unreachable;

  const minResidential = minOf(BUILDING_CLASS.residential);
  const minCommercial = minOf(BUILDING_CLASS.commercial);
  const minIndustrial = minOf(BUILDING_CLASS.industrial);
  const minCivic = minOf(BUILDING_CLASS.civic);

  // La soglia del secondo uso e' piu' bassa di quella del primo: e' un ospite,
  // non un coinquilino alla pari.
  const share = BALANCE.mixedUse.thresholdShare;
  const mixedThreshold = query.singleUse === true
    ? thresholds.map(() => unreachable)
    : thresholds.map((value) => value * share);
  const partners = BALANCE.mixedUse.partners;
  const headroom = query.headroomAt ?? GROUND_ONLY;
  const within = query.within;

  const best: BuildSite[] = [];

  for (const chunk of state.field.chunks.values()) {
    // Fuori dalle colonne generate non si costruisce: la `TerrainMap` direbbe
    // comunque "non edificabile" per ogni cella, tanto vale saltare il blocco.
    const terrainChunk = terrainMap.getChunk(chunk.ccx, chunk.ccy);
    if (terrainChunk === null) continue;

    // Campo e `TerrainMap` hanno la stessa chunkatura e la stessa disposizione
    // per colonna, quindi un solo indice serve a entrambi.
    const buildable = terrainChunk.buildable;
    const values = chunk.values;
    const residential = values[BUILDING_CLASS.residential];
    const commercial = values[BUILDING_CLASS.commercial];
    const industrial = values[BUILDING_CLASS.industrial];
    const civic = values[BUILDING_CLASS.civic];
    const occupancy = chunk.occupancy;
    const levels = chunk.levels;

    const originX = DesirabilityField.originOf(chunk.ccx);
    const originY = DesirabilityField.originOf(chunk.ccy);

    // Il ritaglio si applica agli estremi dei due cicli e non con un confronto
    // per cella: su un riquadro di raggio 44 le colonne di chunk toccate sono
    // nove, e otto di esse ci entrano solo per una striscia.
    const fromX = within === undefined ? 0 : Math.max(0, within.minX - originX);
    const toX = within === undefined ? CHUNK - 1 : Math.min(CHUNK - 1, within.maxX - originX);
    const fromY = within === undefined ? 0 : Math.max(0, within.minY - originY);
    const toY = within === undefined ? CHUNK - 1 : Math.min(CHUNK - 1, within.maxY - originY);

    for (let ly = fromY; ly <= toY; ly++) {
      for (let lx = fromX; lx <= toX; lx++) {
        const i = cellIndexOf(lx, ly);

        // Prima il campo: e' la lettura piu' economica e scarta quasi tutto.
        let bestClass: BuildingClass = BUILDING_CLASS.residential;
        let bestScore = 0;
        if (residential[i] > minResidential) bestScore = residential[i];
        if (commercial[i] > minCommercial && commercial[i] > bestScore) {
          bestScore = commercial[i];
          bestClass = BUILDING_CLASS.commercial;
        }
        if (industrial[i] > minIndustrial && industrial[i] > bestScore) {
          bestScore = industrial[i];
          bestClass = BUILDING_CLASS.industrial;
        }
        if (civic[i] > minCivic && civic[i] > bestScore) {
          bestScore = civic[i];
          bestClass = BUILDING_CLASS.civic;
        }
        if (bestScore === 0) continue;

        // **Una colonna costruita non e' chiusa per sempre.** La domanda al
        // mondo si paga solo qui dentro, cioe' sulle sole celle che qualcosa
        // occupa gia': su una colonna vergine questo ramo non entra nemmeno, e
        // il costo resta quello del confronto con zero che c'era prima.
        //
        // Le quote spese si leggono in due tempi perche' sono tenute in due
        // posti: la prima **e'** l'occupazione, le altre stanno nella mappa
        // sparsa del chunk, che sulla maggior parte dei chunk non esiste.
        if (occupancy[i] !== FREE) {
          const spent = levels === null ? 1 : levels.get(i) ?? 1;
          if (spent >= headroom(originX + lx, originY + ly)) continue;
        }
        if (buildable[columnIndex(lx, ly)] !== 1) continue;

        const x = originX + lx;
        const y = originY + ly;

        // Il secondo uso non entra nell'ordinamento, quindi si cerca **dopo**
        // aver stabilito che il sito entra in lista. Su una mappa fitta le
        // celle sopra soglia sono decine di migliaia e i posti sono una
        // ventina: cercare il secondo uso prima significherebbe farlo per
        // migliaia di siti che verranno scartati alla riga dopo.
        if (!outranks(best, bestScore, x, y, bestClass, n)) continue;

        // Ciclo per indice e non `for...of`: un iteratore allocato per cella
        // sarebbe l'unica allocazione dell'intera funzione.
        const compatible = partners[bestClass];
        let mixed: BuildingClass | -1 = -1;
        let mixedScore = 0;
        for (let k = 0; k < compatible.length; k++) {
          const candidate = compatible[k];
          const value = values[candidate][i];
          if (value <= mixedThreshold[candidate] || value <= mixedScore) continue;
          mixedScore = value;
          mixed = candidate as BuildingClass;
        }

        insertSite(best, { x, y, class: bestClass, mixed, score: bestScore }, n);
      }
    }
  }

  return best;
}

/**
 * true se un sito con questi valori entrerebbe nella lista.
 *
 * Ripete l'ordine di `compareSites` sui campi sciolti invece di costruire un
 * `BuildSite` da confrontare: e' la stessa relazione, ma senza l'oggetto
 * temporaneo che altrimenti nascerebbe per ogni cella sopra soglia.
 */
function outranks(
  list: readonly BuildSite[],
  score: number,
  x: number,
  y: number,
  cls: BuildingClass,
  limit: number,
): boolean {
  if (list.length < limit) return true;
  const worst = list[list.length - 1];
  if (score !== worst.score) return score > worst.score;
  if (x !== worst.x) return x < worst.x;
  if (y !== worst.y) return y < worst.y;
  return cls < worst.class;
}

/** Inserimento ordinato in una lista lunga al massimo `limit`. */
function insertSite(list: BuildSite[], site: BuildSite, limit: number): void {
  if (list.length === limit && compareSites(site, list[list.length - 1]) >= 0) return;

  let at = list.length;
  while (at > 0 && compareSites(site, list[at - 1]) < 0) at--;
  list.splice(at, 0, site);
  if (list.length > limit) list.pop();
}

/** Punteggio decrescente, poi `x`, `y` e uso crescenti. Ordine totale. */
function compareSites(a: BuildSite, b: BuildSite): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  return a.class - b.class;
}

const EMPTY_SITES: readonly BuildSite[] = [];

/**
 * Una quota sola: il suolo, e basta.
 *
 * E' il comportamento di sempre, ed e' anche quello giusto per chi interroga la
 * simulazione senza avere un mondo sotto — i test, la fixture di scenario, la
 * ricerca del sito di un'opera concessa. Chi le quote le sa se le porta.
 */
const GROUND_ONLY = (): number => 1;
