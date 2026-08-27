import { SURFACE_KIND } from '../visualBlock';
import { paletteAt } from '../terrain/biomes';
import type { TerrainMap } from '../terrain/TerrainMap';
import type { VoxelWorld } from '../VoxelWorld';
import { GRADING } from '../grading/config';
import {
  GROUND,
  WORKS,
  groundKindOf,
  isDryLand,
  planGrade,
  type GradePlan,
  type GroundKind,
} from '../grading/grade';
import { seesWater } from '../sites/siteRules';
import { BUILDER } from './config';

/**
 * Come si presenta il terreno a chi deve costruirci, e cosa serve costruire
 * perche' regga.
 *
 * **Legge la `TerrainMap` e nient'altro** — tranne `buildWorks`, che e' l'unica
 * qui a scrivere. Sono le domande che il Builder si faceva da se' su ogni
 * colonna che esaminava; averle qui le rende verificabili senza far crescere
 * una citta', ed e' anche cio' che permette a `grading/` di restare puro senza
 * che il Builder debba fargli da traduttore.
 */

/** I quattro assi cardinali, per la ricerca della terra da una colonna d'acqua. */
const QUAY_AXES: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Come si presenta una colonna a chi deve costruirci sopra.
 *
 * Tre letture senza allocazione invece di `columnAt`, che costruirebbe un
 * oggetto: questa funzione sta nel percorso caldo di `placeLot`, dove le
 * colonne si contano a migliaia per infornata.
 */
export function groundKindAt(
  terrain: TerrainMap,
  x: number,
  y: number,
  /** Vero per misurare l'acqua di lago contro il proprio pelo (vedi `groundKindOf`). */
  lakeQuay = false,
): GroundKind {
  if (!terrain.has(x, y)) return GROUND.refused;
  return groundKindOf(
    terrain.biomeAt(x, y),
    terrain.slopeAt(x, y),
    terrain.heightAt(x, y),
    lakeQuay ? terrain.waterTopAt(x, y) : undefined,
  );
}

/**
 * L'opera che regge l'impronta, o null se non ce n'e' una.
 *
 * Ha sostituito `surveyGround`, che rispondeva soltanto "il terreno e' gia'
 * piano?" e in caso contrario perdeva il sito per sempre. La domanda ora e'
 * cosa costruire perche' lo diventi, e le tre risposte — niente, un
 * terrapieno, una banchina — vivono in `grading/`.
 */
export function surveyGrade(
  terrain: TerrainMap,
  x: number,
  y: number,
  w: number,
  h: number = w,
  mask?: WorksMask,
  /**
   * Vero per trattare l'acqua di lago come battigia contro il proprio pelo.
   *
   * **Lo chiede la ricetta, non chi costruisce.** E' il flag `lakeQuay` di una
   * ricetta costiera — la marina — che lo porta qui: sul mare il parametro non
   * cambia nulla, perche' lo specchio della colonna *e'* il livello del mare, e
   * ogni altra struttura continua a vedere il lago come prima, cioe' rifiutato.
   */
  lakeQuay = false,
): GradePlan | null {
  const columns: { kind: GroundKind; height: number; waterTop?: number }[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (mask !== undefined && mask[dy * w + dx] === 0) continue;
      const cx = x + dx;
      const cy = y + dy;
      let kind = groundKindAt(terrain, cx, cy, lakeQuay);
      // Chi scava un bacino addomestica la riva, scarpata compresa: la sponda
      // di un lago scende piu' ripida di `maxTerraceSlope` — e' quella la
      // ragione per cui la citta' le cresce intorno — ma per la marina quella
      // pendenza non e' un muro da rispettare, e' il dislivello che il
      // terrapieno della promenade deve colmare. Solo per lei, quindi, la
      // terra emersa non rifiuta mai: al peggio si paga.
      if (kind === GROUND.refused && lakeQuay && isDryLand(terrain.biomeAt(cx, cy))) {
        kind = GROUND.sloped;
      }
      if (kind === GROUND.refused) return null;
      columns.push({
        kind,
        height: terrain.heightAt(cx, cy),
        // Lo specchio serve solo al piano della banchina, che `planGrade`
        // legge sulle colonne di riva; le altre lo ignorano.
        waterTop: lakeQuay && kind === GROUND.shore ? terrain.waterTopAt(cx, cy) : undefined,
      });
    }
  }
  return planGrade(columns);
}

/**
 * L'opera che regge un landmark su qualunque pendio, o null se non ce n'e' una.
 *
 * **E' la risposta di `surveyGrade` dove quella rifiuterebbe, e non e' una
 * deroga: e' una domanda diversa.** Un edificio ordinario non copre la parete
 * che lo precede, quindi la parete dentro la sua impronta lo ferma; un landmark
 * invece **sostituisce** il terreno del proprio ingombro — affonda alla quota
 * piu' bassa e la sagoma copre la parete per intero — e in cima scava la
 * montagna che spunterebbe dal tetto. Cio' che resta fuori dall'impronta, la
 * parete compresa, non si tocca.
 *
 * Il piano che ne esce non costruisce niente: `works` e' sempre `none`, e chi
 * lo usa sa gia' che la base scende al minimo (`footZ`). Le due quote sono la
 * sola cosa che conta — dove appoggia la struttura, e fin dove il tetto deve
 * poter salire.
 *
 * **L'unico rifiuto vero e' l'acqua fonda.** Una parete di roccia si copre; un
 * fondale oltre la banchina no — la struttura ci affonderebbe e il mare
 * mostrerebbe un buco rettangolare al posto delle colonne coperte.
 */
export function surveyLandmarkGrade(
  terrain: TerrainMap,
  x: number,
  y: number,
  w: number,
  h: number = w,
  mask?: WorksMask,
): GradePlan | null {
  let footZ = Number.MAX_SAFE_INTEGER;
  let padZ = 0;
  let columns = 0;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (mask !== undefined && mask[dy * w + dx] === 0) continue;
      columns++;
      const cx = x + dx;
      const cy = y + dy;
      const kind = groundKindAt(terrain, cx, cy);
      if (kind === GROUND.refused && !isDryLand(terrain.biomeAt(cx, cy))) return null;
      const height = terrain.heightAt(cx, cy);
      if (height < footZ) footZ = height;
      if (height > padZ) padZ = height;
    }
  }

  if (columns === 0) return null;
  return { works: WORKS.none, padZ, footZ, fill: 0 };
}

/**
 * Quali colonne di un'impronta l'opera deve reggere: `1` si costruisce, `0` no.
 *
 * E' un array `w * h` in ordine di riga, cioe' la stessa disposizione con cui
 * `stampFootprint` risponde: le due si passano l'una all'altra senza
 * conversioni. Assente vale «tutta l'impronta», che e' il caso di ogni edificio
 * — un volume rettangolare pieno non ha niente da escludere.
 *
 * **Esiste per il fronte mare.** Il riquadro di un porto e' per meta' specchio
 * d'acqua: senza maschera l'opera lo portava tutto alla quota della banchina, e
 * quello che si vedeva era una piattaforma rettangolare con dentro una pozza
 * d'acqua piu' alta del mare che la circonda. Con la maschera, il molo e' terra
 * e la darsena resta il mare che c'era.
 */
export type WorksMask = Uint8Array;

/**
 * true se una colonna dell'impronta non e' lavorabile affatto.
 *
 * Distingue i due motivi di rifiuto di `surveyGrade`, e gira **solo sul ramo di
 * rifiuto**: ripete la scansione invece di farsi restituire il motivo da
 * `planGrade`, perche' quella funzione risponde a una domanda sola e allargarla
 * a un risultato con causa la costringerebbe ad allocare un oggetto anche nelle
 * migliaia di chiamate che vanno a buon fine.
 */
export function hasUnworkableColumn(
  terrain: TerrainMap,
  x: number,
  y: number,
  w: number,
  h: number = w,
): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (groundKindAt(terrain, x + dx, y + dy) === GROUND.refused) return true;
    }
  }
  return false;
}

/**
 * true se la colonna e' terra emersa o ha terra a portata di banchina.
 *
 * **E' il vincolo di forma che mancava alla 4.2.** `maxQuayDepth` risponde a
 * una domanda strutturale — fin dove il fondale regge un muro — e su un
 * bassofondo dolce dice di si' per una quindicina di colonne al largo. Nessuno
 * aveva mai deciso che la citta' dovesse arrivarci: l'anello di carreggiata di
 * un isolato costiero se le prendeva tutte, e quello che si vedeva era una
 * piattaforma rettangolare in mezzo al mare.
 *
 * Guarda i quattro assi e non il quadrato, per la stessa ragione di
 * `seesWater` in `sites/`: e' la domanda opposta con lo stesso costo, e una
 * colonna raggiungibile solo in diagonale e' comunque una colonna a cui
 * conviene non allungare la banchina.
 */
export function nearLand(terrain: TerrainMap, x: number, y: number): boolean {
  if (isDryLand(terrain.biomeAt(x, y))) return true;

  for (let d = 1; d <= GRADING.quayReach; d++) {
    for (const [dx, dy] of QUAY_AXES) {
      const cx = x + dx * d;
      const cy = y + dy * d;
      if (!terrain.has(cx, cy)) continue;
      if (isDryLand(terrain.biomeAt(cx, cy))) return true;
    }
  }
  return false;
}

/**
 * true se la colonna vede il mare entro `BUILDER.coastalRadius`.
 *
 * La ricerca sta in `sites/siteRules.ts` perche' e' la stessa che decide se
 * un porto puo' essere piazzato qui. A cambiare e' solo il raggio, e non e' un
 * dettaglio: qui la domanda e' d'aspetto — un mercato sul porto deve *vedere*
 * l'acqua, anche da lontano — mentre il vincolo di piazzamento pretende il
 * fronte mare.
 */
export function isCoastal(terrain: TerrainMap, x: number, y: number): boolean {
  return seesWater(terrain, x, y, BUILDER.coastalRadius);
}

/**
 * Costruisce l'opera sotto l'impronta: terra dentro, muro sul perimetro.
 *
 * **Il perimetro e' l'unica parte che si vede**, ed e' l'unica che diventa
 * muratura. Le colonne interne restano stratigrafia di bioma, con lo stesso
 * `paletteAt` che usa `IslandGenerator`: sotto un edificio non le guarda
 * nessuno, e rivestirle costerebbe voxel per niente.
 *
 * Il corso di coronamento e' cio' che distingue un muro di contenimento da un
 * blocco di roccia: una riga chiara in cima al salto, che a distanza di gioco
 * e' il solo segno che dichiari il dislivello costruito invece che scavato.
 *
 * **La maschera decide dove l'opera esiste.** Senza, e' tutta l'impronta, cioe'
 * il comportamento di ogni edificio. Con, e' solo cio' che la struttura occupa
 * davvero: un porto costruisce il molo e lascia la darsena al mare, invece di
 * portare all'asciutto il proprio riquadro intero.
 */
export function buildWorks(
  world: VoxelWorld,
  terrain: TerrainMap,
  x: number,
  y: number,
  w: number,
  plan: GradePlan,
  h: number = w,
  mask?: WorksMask,
): void {
  const quay = plan.works === WORKS.quay;
  const wall = quay ? GRADING.quayWall : GRADING.terraceWall;
  const coping = quay ? GRADING.quayCoping : GRADING.terraceCoping;
  const filled = (dx: number, dy: number): boolean =>
    dx >= 0 && dy >= 0 && dx < w && dy < h &&
    (mask === undefined || mask[dy * w + dx] === 1);

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (!filled(dx, dy)) continue;
      const cx = x + dx;
      const cy = y + dy;
      const height = terrain.heightAt(cx, cy);
      if (height >= plan.padZ) continue;

      // Il bordo e' la colonna che ha un vicino **fuori dall'opera**, non quella
      // sul bordo del riquadro: con una maschera le due cose smettono di
      // coincidere, ed e' il muro attorno alla darsena — che sta in mezzo
      // all'impronta — a doversi vedere di taglio.
      const edge = !filled(dx - 1, dy) || !filled(dx + 1, dy) ||
        !filled(dx, dy - 1) || !filled(dx, dy + 1);
      if (plan.works !== WORKS.none && edge) {
        for (let z = height; z < plan.padZ; z++) {
          world.setBlock(cx, cy, z, z === plan.padZ - 1 ? coping : wall, SURFACE_KIND.utility);
        }
        continue;
      }

      const biome = terrain.biomeAt(cx, cy);
      for (let z = height; z < plan.padZ; z++) {
        // La quota di riferimento e' quella **finita**: il riempimento continua
        // lo strato di roccia del piano che porta, non quello del terreno che
        // copre, o il terrapieno si vedrebbe come una toppa di un altro grigio.
        world.setBlock(cx, cy, z, paletteAt(biome, plan.padZ, plan.padZ - 1 - z));
      }
    }
  }
}
