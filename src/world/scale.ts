import { CHUNK } from './chunkCoords';

/**
 * La scala degli edifici come manopola ripetibile.
 *
 * **E' la fonte unica delle due manopole e di ogni numero accoppiato.** Prima
 * questi numeri erano scritti a mano nei config di dominio e tenuti insieme da
 * commenti e pochi test di coerenza: alzare `maxLevel` significava ricordarsi di
 * allungare `LEVEL_CAPS`, `START_LEVEL_CDF`, `maxDirtyChunksPerBuilding` e
 * `GRAMMAR.minBandSide`, e dimenticarne uno faceva comparire un palo o sparire
 * un edificio in silenzio. Qui ogni costante accoppiata e' **derivata**, con il
 * perche' scritto accanto: cambiare le due manopole e vedere i test di
 * `scale.test.ts` verdi garantisce che nessun accoppiamento e' rimasto scoperto.
 *
 * **Vive alla radice di `src/world/` per la stessa ragione di `planMask.ts`.**
 * Le manopole e le loro derivate servono a buildings, streets, skyline,
 * arcology, aerial e traffic: tenerle dentro uno solo di questi domini avrebbe
 * costretto gli altri a importarlo, cioe' a dipendere da un dominio che non
 * usano. Qui non importa da nessun dominio: importa solo `chunkCoords`, che e'
 * una convenzione, non un dominio.
 *
 * **La microgeometria resta fuori.** Zoccolo, parapetto, portale, passo montanti,
 * smusso e sbalzo restano a grana voxel fissa nei config di dominio; qui si
 * scala solo la *struttura* — numero di sotto-volumi e fasce, profondita' degli
 * arretramenti, ampiezza dei vuoti. Le due eccezioni dichiarate sono
 * `MAX_OVERHANG` (lo sbalzo, che entra nel conto di `segmentSide`) e
 * `MAX_BAND_HEIGHT` (la fascia piu' alta che un profilo produce, che entra nel
 * conto del budget di chunk).
 */

/** Le due manopole: l'impronta del modulo e il numero di livelli. */
export const SCALE: {
  readonly moduleFootprint: number;
  readonly maxLevel: number;
} = {
  /**
   * Impronta massima del singolo modulo a fasce, in voxel.
   *
   * E' l'asse orizzontale: sotto questo lato un edificio e' un `generateBuilding`;
   * oltre, e' un assemblaggio di sotto-volumi su un podio condiviso (vedi
   * `buildings/assemble.ts`). Raddoppia rispetto agli otto di partenza.
   */
  moduleFootprint: 16,

  /**
   * Livello massimo raggiungibile. E' l'asse verticale: da qui discendono
   * `LEVEL_CAPS`, `START_LEVEL_CDF`, il tetto dello skyline e il budget di chunk.
   */
  maxLevel: 20,
};

/**
 * Lo sbalzo massimo verso la strada, in voxel.
 *
 * **E' microgeometria e resta fisso**: non scala con il modulo. Sta qui e non in
 * `GRAMMAR` perche' `segmentSideOf` deve tenerne conto, e farlo importare da un
 * dominio rovescerebbe la direzione delle dipendenze. Chi ne ha bisogno lo
 * riesporta (vedi `buildings/config/grammar.ts`).
 */
export const MAX_OVERHANG = 2;

/**
 * L'altezza della fascia piu' alta che un profilo produce.
 *
 * E' il `bandHeight[1]` del civico: serve a `maxTowerHeightOf` per calcolare in
 * forma chiusa quanto puo' salire una torre di livello massimo. Non e' una
 * seconda manopola — e' un tetto dichiarato per derivare il budget di chunk
 * senza importare il catalogo delle classi.
 */
export const MAX_BAND_HEIGHT = 8;

/** Quota che corona e dettaglio sul tetto aggiungono sopra l'ultima fascia. */
const CROWN_AND_PROP = 14;

/** L'impronta minima: sotto, un modulo non e' un volume ma un palo. */
export function minFootprintOf(module: number = SCALE.moduleFootprint): number {
  return module / 2;
}

/** Il lato sotto cui una fascia del corpo non scende. */
export function minBandSideOf(module: number = SCALE.moduleFootprint): number {
  return module / 2;
}

/**
 * Il passo degli scarti di fascia, in voxel.
 *
 * E' l'unita' con cui la grammatica sposta le fasce: un voxel sul modulo di
 * partenza (8), due su quello raddoppiato (16). Gli scarti di `bandOps.ts`
 * diventano multipli di questo passo, cosi' lo stesso repertorio compone una
 * casa da otto voxel o un modulo da sedici senza taratura a mano.
 */
export function bandStepOf(module: number = SCALE.moduleFootprint): number {
  return Math.max(1, Math.floor(module / 8));
}

/**
 * L'ampiezza minima dell'anello scoperto perche' una rientranza sia terrazza.
 *
 * E' la profondita' dell'arretramento `setback` (due passi): sotto, lo scarto di
 * `jog`/`shrinkOneSide` resta uno scalino e non una terrazza. Scala con il passo,
 * cosi' la distinzione fra gradino e terrazza non dipende dalla grandezza del
 * modulo.
 */
export function terraceMinRingOf(module: number = SCALE.moduleFootprint): number {
  return 2 * bandStepOf(module);
}

/**
 * Il lato sotto cui una fascia non viene svuotata in una corte.
 *
 * Meta' del modulo, cioe' il lato minimo di un edificio ordinario: sotto non
 * c'e' una casa ma un palo, e non c'e' un cuore da svuotare. La corte si apre
 * cosi' su ogni casa, senza chiedere il lato pieno che spetta agli assemblaggi.
 */
export function courtyardMinSideOf(module: number = SCALE.moduleFootprint): number {
  return module / 2;
}

/**
 * Lato oltre il quale uno stamp compare a ritagli invece che in un colpo solo.
 *
 * Deve reggere l'inviluppo massimo (`module + MAX_OVERHANG`) senza costringere
 * un edificio normale a spezzarsi, quindi sta sopra quel lato e resta pari
 * (multiplo di cella). `CHUNK / 2` e' il pavimento: sotto, un ritaglio
 * attraverserebbe piu' di due colonne di chunk per asse.
 */
export function segmentSideOf(
  module: number = SCALE.moduleFootprint,
  overhang: number = MAX_OVERHANG,
): number {
  return Math.max(CHUNK / 2, Math.ceil((module + overhang + 1) / 2) * 2);
}

/** Tetti di impronta e fasce per livello. */
export interface LevelCaps {
  readonly minFootprint: number;
  readonly maxFootprint: number;
  readonly minBands: number;
  readonly maxBands: number;
}

/**
 * La massa di ogni livello, generata dalle manopole.
 *
 * **L'impronta degli edifici ordinari satura a `mid`, mai al lato pieno del
 * modulo**: il lato pieno e' riservato agli assemblaggi su podio (solo oltre il
 * modulo `buildStamp` passa a `assembleBuilding`), quindi un singolo
 * `generateBuilding` non produce mai un 16x16 — quel segnale visivo appartiene
 * alle megastrutture. Le fasce continuano a salire con un'accelerazione in cima
 * che da' alle torri la loro altezza.
 */
export function levelCapsOf(
  module: number = SCALE.moduleFootprint,
  V: number = SCALE.maxLevel,
): readonly LevelCaps[] {
  const min = module / 2;
  const mid = min + module / 4;
  // Il lato pieno del modulo resta agli assemblaggi: il tetto d'impronta satura
  // a `mid` e la minima ci arriva a meta' scala, cosi' i livelli bassi restano
  // vari ma nessun volume singolo raggiunge il modulo.
  const minMid = Math.max(1, Math.round(V / 4));
  // Le fasce salgono un livello alla volta fin qui, poi accelerano in cima.
  const linearEnd = Math.max(1, Math.round((V * 5) / 6));

  const out: LevelCaps[] = [];
  let prevMinBands = 0;
  let prevMaxBands = 0;
  for (let level = 0; level <= V; level++) {
    const maxFootprint = mid;
    const minFootprint = level >= minMid ? mid : min;
    let minBands: number;
    let maxBands: number;
    if (level <= linearEnd) {
      minBands = level + 1;
      maxBands = level + 2;
    } else {
      const over = level - linearEnd;
      minBands = prevMinBands + over + 1;
      maxBands = prevMaxBands + over + 2;
    }
    prevMinBands = minBands;
    prevMaxBands = maxBands;
    out.push({ minFootprint, maxFootprint, minBands, maxBands });
  }
  return out;
}

/**
 * La distribuzione del livello iniziale, cumulata e a coda lunga.
 *
 * Quasi tutto nasce al livello base e pochissimo piu' su: uno skyline e' fatto
 * di molti volumi bassi e pochi picchi. Ha una voce per livello fino a `V`, per
 * il difetto che si ripresenta a ogni cambio di scala (vedi `levels.ts`).
 */
export function startLevelCdfOf(V: number = SCALE.maxLevel): readonly number[] {
  const head = [0.78, 0.94, 0.985, 0.997];
  const out: number[] = [];
  for (let level = 0; level <= V; level++) out.push(level < head.length ? head[level] : 1);
  return out;
}

/** I tetti dello skyline, derivati perche' il massimo teorico coincida con `V`. */
export function skylineCapsOf(V: number = SCALE.maxLevel): {
  readonly levelCap: readonly number[];
  readonly coneBonus: number;
  readonly peakBonus: number;
} {
  // Il cono e il picco non scalano: sono due livelli e uno, ed e' la somma a
  // dover crescere. Il tetto del centro assorbe tutta la scala.
  const coneBonus = 2;
  const peakBonus = 1;
  const core = V - coneBonus - peakBonus;
  return {
    levelCap: [Math.round(core / 3), Math.round((core * 2) / 3), core],
    coneBonus,
    peakBonus,
  };
}

/**
 * L'altezza massima in voxel che una torre di livello `V` puo' produrre.
 *
 * Forma chiusa: la fascia piu' alta di `levelCapsOf` per l'altezza massima di
 * fascia, piu' corona e dettaglio. E' il numero che `maxDirtyChunksPerBuildingOf`
 * usa per non stimare.
 */
export function maxTowerHeightOf(
  module: number = SCALE.moduleFootprint,
  V: number = SCALE.maxLevel,
): number {
  return levelCapsOf(module, V)[V].maxBands * MAX_BAND_HEIGHT + CROWN_AND_PROP;
}

/**
 * Chunk che un singolo edificio puo' marcare sporchi, fondazione inclusa.
 *
 * Due colonne di chunk per asse (l'impronta piu' l'inviluppo), i piani che la
 * torre massima attraversa piu' i due di bordo, e un margine per la fondazione
 * a cavallo di una cucitura. E' aritmetica, non stima: se un edificio sfora
 * sparisce in silenzio, quindi il tetto deve derivare dalla torre piu' alta che
 * `V` sa produrre.
 */
export function maxDirtyChunksPerBuildingOf(
  module: number = SCALE.moduleFootprint,
  V: number = SCALE.maxLevel,
): number {
  const tower = maxTowerHeightOf(module, V);
  return 2 * 2 * (Math.ceil(tower / CHUNK) + 2) + 12;
}

/**
 * Passo e scostamento della maglia stradale, derivati dal modulo.
 *
 * Il vincolo e' che l'isolato piu' stretto — `pitch - 2 * jitter` — regga il
 * modulo piu' largo piu' due cubi di marciapiede. Il passo scala con il modulo,
 * lo scostamento resta circa un quinto del passo (il piu' vicino a meta' che
 * tenga insieme la lettura di griglia).
 */
export function streetPitchOf(
  module: number = SCALE.moduleFootprint,
  cellSize = 2,
): { readonly pitch: number; readonly jitter: number } {
  const pitch = Math.round((module * 2.5) / cellSize) * cellSize;
  const jitter = Math.round(pitch / 5 / cellSize) * cellSize;
  return { pitch, jitter };
}

/**
 * Raggio di costa per la selezione della tipologia.
 *
 * E' l'impronta massima piu' tre cubi: il mercato sul porto deve *vedere*
 * l'acqua, non sfiorarla.
 */
export function coastalRadiusOf(
  module: number = SCALE.moduleFootprint,
  cellSize = 2,
): number {
  return module + 3 * cellSize;
}

/**
 * Lato dell'arcologia: deve superare il modulo (o non e' una megastruttura) ma
 * stare dentro `segmentSide` (o si spezza in pianta). Le ricette lo usano per
 * dichiarare il proprio ingombro.
 */
export function arcologySpanOf(module: number = SCALE.moduleFootprint): number {
  return Math.min(segmentSideOf(module), module + 4);
}
