import { isDryLand } from '../grading/grade';
import { SUNKEN } from './config';

/**
 * Quanta profondita' un luogo offre, e se la roccia attorno tiene l'acqua fuori.
 *
 * **Puro e senza mondo**, come `siting.ts` e `skyline/tiers.ts`: entra un
 * terreno ridotto a due domande — quanto e' alto, che bioma porta — esce un
 * verdetto. `TerrainMap` lo soddisfa senza adattatori, ed e' la stessa forma che
 * `HarborProbe` ha in `harbor/plan.ts`.
 *
 * **Perche' e' un dominio a se' e non una riga di `grading/`.** Quelle due
 * rispondono a domande opposte: `grading/` chiede «cosa serve costruire perche'
 * questo terreno regga», e la sua risposta e' un prezzo in volume aggiunto;
 * questa chiede «quanta roccia c'e' da togliere qui sotto», e la sua risposta e'
 * un numero che nessuna opera aumenta. Metterle insieme avrebbe messo lo scavo
 * dentro il modulo che il progetto ha scritto per non scavare.
 */

/** Il terreno ridotto a cio' che la misura deve sapere. `TerrainMap` lo soddisfa. */
export interface DepthProbe {
  readonly heightAt: (x: number, y: number) => number;
  readonly biomeAt: (x: number, y: number) => number;
}

export interface SunkenSite {
  /** Il piano finito: la colonna piu' alta dell'impronta. */
  readonly padZ: number;
  /** La colonna piu' bassa: quanto il rimo sporge sul lato a valle. */
  readonly footZ: number;
  /** Quote scavabili sotto il piano finito, mai sotto `SUNKEN.floorZ`. */
  readonly depth: number;
  /** Falso se una colonna bagnata arriva entro `SUNKEN.dryRim` dall'ingombro. */
  readonly dryRim: boolean;
}

/**
 * La profondita' che un ingombro offre, e la tenuta del suo contorno.
 *
 * **Il piano finito e' il massimo e non la media**, come in `planGrade` e per la
 * stessa ragione rovesciata: li' livellare verso il basso vorrebbe dire scavare,
 * qui si scava comunque, ma la piazza deve restare **sopra** ogni colonna che
 * tocca — un piano alla media lascerebbe il terreno a monte a coprire il proprio
 * parapetto.
 *
 * **Il contorno asciutto si chiede al bioma, non al confronto fra quota e
 * specchio.** Il pozzo scende sotto il livello del mare, quindi «questa colonna
 * e' piu' bassa dell'acqua» e' vero per meta' isola e non dice niente; a dire
 * «qui c'e' acqua» e' `isDryLand`. E' la stessa distinzione che
 * `clearDecorColumn` aveva sbagliato, e che era costata l'acqua cancellata
 * attorno a ogni porto.
 */
export function surveySunkenSite(
  probe: DepthProbe,
  x: number,
  y: number,
  sizeX: number,
  sizeY: number,
): SunkenSite {
  let padZ = 0;
  let footZ = Number.MAX_SAFE_INTEGER;
  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const height = probe.heightAt(x + dx, y + dy);
      if (height > padZ) padZ = height;
      if (height < footZ) footZ = height;
    }
  }

  const rim = SUNKEN.dryRim;
  let dryRim = true;
  for (let cy = y - rim; cy < y + sizeY + rim && dryRim; cy++) {
    for (let cx = x - rim; cx < x + sizeX + rim; cx++) {
      if (!isDryLand(probe.biomeAt(cx, cy))) {
        dryRim = false;
        break;
      }
    }
  }

  return {
    padZ,
    footZ,
    depth: Math.max(0, padZ - SUNKEN.floorZ),
    dryRim,
  };
}
