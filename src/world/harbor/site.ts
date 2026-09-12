import { HARBOR } from './config';
import type { HarborProbe } from './plan';

/**
 * Che costa si e' trovato davanti questo landmark.
 *
 * **E' la domanda che sceglie la figura d'acqua**, e sta a parte perche' e'
 * l'unica parte del distretto che guarda il terreno *prima* di sapere cosa
 * costruirci. Il piano di `plan.ts` disegna; qui si misura, e basta.
 *
 * **Non una figura per ruolo, ma un vocabolario che il luogo declina.** Porto,
 * marina e traghetto attingono tutti e tre alle stesse forme, e a scegliere e' la
 * riva: una lingua di terra profonda e dritta ammette le darsene a pettine delle
 * West India Docks, una riva piu' stretta il canale che stacca un'isola come a
 * Dubai Marina, una punta circondata d'acqua soltanto il porticciolo fra due
 * moli. Due porti sulla stessa isola vengono cosi' diversi perche' stanno in due
 * posti diversi — che e' la ragione per cui in una citta' vera i due porti sono
 * diversi.
 *
 * **Puro e in coordinate canoniche.** Entrano una fascia di righe, un tetto di
 * ricerca e due funzioni — dove cade una colonna nel mondo, cosa c'e' li' —
 * esce una misura. La rotazione la porta `column`, che e' la stessa di
 * `plan.ts`: cosi' la stessa costa girata di un quarto da' la stessa risposta,
 * e non c'e' un secondo segno da tenere allineato.
 */

export const HARBOR_FIGURE = {
  /**
   * Darsene a pettine scavate nella riva.
   *
   * Le West India Docks: bacini rettangolari che entrano nella terra
   * perpendicolari alla costa, separati da dita di banchina su cui sta la
   * citta'. Vuole la terra piu' profonda del vocabolario, e una riva dritta —
   * i bacini si aprono tutti sullo stesso mare, e su una costa storta meta' si
   * aprirebbe sull'asciutto.
   */
  docks: 'docks',

  /**
   * Canale parallelo alla costa che si richiude in mare ai due capi.
   *
   * Dubai Marina: la striscia fra il canale e il mare diventa **un'isola**, ed
   * e' quella la figura — non il canale in se'. Vuole meno terra delle darsene,
   * perche' e' sottile, e tollera una riva meno dritta: il canale la segue.
   */
  canal: 'canal',

  /**
   * Specchio d'acqua chiuso da due moli che si protendono dalla riva.
   *
   * Il porticciolo: la figura di chi la terra non ce l'ha. Su una punta o su una
   * lingua stretta non c'e' niente in cui scavare, e l'unico gesto disponibile
   * e' **aggiungere** — due bracci di pietra che chiudono un pezzo di mare e gli
   * lasciano una bocca.
   */
  cove: 'cove',

  /**
   * Argine e banchina lungo la riva, con qualche pontile.
   *
   * Il ripiego, e un ripiego onesto: dove la riva e' bassa, frastagliata o gia'
   * costruita, il fronte d'acqua e' un bordo murato e non una forma scavata.
   */
  embankment: 'embankment',
} as const;

export type HarborFigure = (typeof HARBOR_FIGURE)[keyof typeof HARBOR_FIGURE];

/** Riga senza riva: entro il tetto di ricerca, acqua non ce n'e'. */
export const NO_SHORE = Number.POSITIVE_INFINITY;

export interface CoastQuery {
  /** Prima riga canonica della fascia sondata. */
  readonly fromRow: number;
  /** Ultima riga canonica, esclusa. */
  readonly toRow: number;
  /** Tetto della ricerca, in colonne, di qua e di la' dallo zero canonico. */
  readonly reach: number;
  /** Pelo dello specchio che il landmark fronteggia. */
  readonly waterZ: number;
}

export interface CoastSite {
  readonly figure: HarborFigure;
  /** Prima riga canonica misurata: `shore[i]` e' la riga `fromRow + i`. */
  readonly fromRow: number;
  /** Colonna canonica in cui comincia l'acqua, riga per riga. `NO_SHORE` se manca. */
  readonly shore: readonly number[];
  /** Colonne di terra asciutta e libera dietro la riva, riga per riga. */
  readonly land: readonly number[];
  /** Terra dietro la riva sulla riga di mezzo dell'ordinamento. */
  readonly landDepth: number;
  /** Quanto la riva si sposta fra la riga piu' avanti e la piu' indietro. */
  readonly spread: number;
}

/** Misura la costa davanti al landmark e ne sceglie la figura. */
export function surveyCoast(
  query: CoastQuery,
  probe: HarborProbe,
  column: (cx: number, cy: number) => { x: number; y: number },
): CoastSite {
  const shore: number[] = [];
  const land: number[] = [];

  const wet = (cx: number, cy: number): boolean => {
    const spot = column(cx, cy);
    return probe.has(spot.x, spot.y) && probe.heightAt(spot.x, spot.y) <= query.waterZ;
  };
  // Terra su cui una figura puo' lavorare: emersa, dentro il mondo generato, e
  // **libera**. L'ultima condizione e' quella che tiene una darsena da quaranta
  // colonne fuori dal quartiere che le sta dietro: senza, il pettine si
  // scaverebbe dentro le case.
  const dry = (cx: number, cy: number): boolean => {
    const spot = column(cx, cy);
    if (!probe.has(spot.x, spot.y)) return false;
    if (probe.heightAt(spot.x, spot.y) <= query.waterZ) return false;
    return probe.free === undefined || probe.free(spot.x, spot.y);
  };

  for (let cy = query.fromRow; cy < query.toRow; cy++) {
    let edge = NO_SHORE;
    for (let cx = 0; cx <= query.reach; cx++) {
      if (wet(cx, cy)) {
        edge = cx;
        break;
      }
    }
    shore.push(edge);

    let depth = 0;
    if (edge !== NO_SHORE) {
      for (let cx = edge - 1; cx >= -query.reach; cx--) {
        if (!dry(cx, cy)) break;
        depth++;
      }
    }
    land.push(depth);
  }

  const found = shore.filter((edge) => edge !== NO_SHORE);
  const landDepth = median(land.filter((_, i) => shore[i] !== NO_SHORE));
  // Lo scarto si misura sulle sole righe che una riva ce l'hanno: una riga tutta
  // asciutta non e' una costa storta, e' una costa che li' non c'e'.
  const spread = found.length === 0 ? 0 : Math.max(...found) - Math.min(...found);

  return {
    figure: figureFor(found.length, shore.length, landDepth, spread),
    fromRow: query.fromRow,
    shore,
    land,
    landDepth,
    spread,
  };
}

/**
 * La figura che questa costa ammette.
 *
 * L'ordine dei rami e' una gerarchia di ambizione: si prova prima il gesto piu'
 * grande, e si scende quando il terreno non lo regge. L'ultimo ramo non ha
 * condizioni perche' l'argine si costruisce ovunque ci sia una riva — ed e'
 * giusto che il ripiego non possa fallire.
 */
function figureFor(
  wetRows: number,
  rows: number,
  landDepth: number,
  spread: number,
): HarborFigure {
  // Meno di mezza fascia ha una riva davanti: il landmark sta su una punta o su
  // una lingua, e non c'e' niente in cui scavare. Si aggiunge invece di togliere.
  if (wetRows * 2 < rows) return HARBOR_FIGURE.cove;
  if (landDepth >= HARBOR.dockLand && spread <= HARBOR.straightSpread) {
    return HARBOR_FIGURE.docks;
  }
  if (landDepth >= HARBOR.canalLand) return HARBOR_FIGURE.canal;
  return HARBOR_FIGURE.embankment;
}

/** Il valore di mezzo, o zero su un elenco vuoto. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}
