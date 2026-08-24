import { DEFAULT_BUILDING_FORM, typologyById, type TypologyDefinition } from './config';
import { generateBuilding } from './generate';
import { selectTypology, typologyProfile } from './typology';
import { styleOf, styledProfile } from './style';
import type { BuildingRecord } from './BuildingRegistry';
import type { VoxelStamp } from './stamp';

/**
 * La sagoma **registrata** di un edificio, rigenerata dal suo record.
 *
 * E' la meta' meno vistosa della rigenerabilita': il registry non conserva una
 * copia dei voxel, conserva abbastanza da riprodurli — classe, livello, seme,
 * impronta, forma, tipologia, corso di base. Chi deve togliere quei voxel deve
 * poterli ridisegnare, o non saprebbe quali sono suoi.
 *
 * **Con la tipologia registrata, non con quella che il luogo esprime adesso.**
 * Se un catalizzatore nuovo ha cambiato la tipologia di questa colonna, la
 * sagoma da cancellare resta quella che era stata scritta: rigenerarla con la
 * tipologia di oggi lascerebbe voxel orfani a terra. Vale lo stesso per il
 * corso di base, che viaggia con il record e non si ricalcola dalla fila di
 * adesso — se la sagoma partisse da un'altra quota, la cancellazione bucherebbe
 * lo zoccolo sotto il vicino.
 *
 * Esiste come modulo suo perche' ha due chiamanti con lo stesso bisogno e due
 * motivi diversi: l'upgrade, che cancella cio' che il livello nuovo non copre,
 * e lo sventramento, che cancella tutto. Scritta due volte, divergerebbe alla
 * prima volta che qualcuno aggiunge un campo al record.
 */
export function recordStamp(record: BuildingRecord): VoxelStamp {
  const typology = typologyOf(record);
  return generateBuilding({
    class: record.class,
    level: record.level,
    seed: record.seed,
    footprintCap: record.footprint,
    footprintFloor: record.footprint,
    form: record.form ?? DEFAULT_BUILDING_FORM,
    // Con lo stile **registrato**, per la stessa ragione della tipologia: se il
    // catalogo degli stili cambiasse ordine, o se un giorno lo stile smettesse
    // di essere una funzione pura dell'isolato, rigenerare con quello di oggi
    // lascerebbe voxel orfani a terra.
    profile: styledProfile(typologyProfile(typology), styleOf(record.style)),
    shape: typology.shape,
    mixed: record.mixed,
    facing: record.facing,
    baseBandHeight: record.baseBand,
  });
}

/** Tipologia registrata di un edificio, o quella di ripiego del suo uso. */
export function typologyOf(record: BuildingRecord): TypologyDefinition {
  const stored = record.typology === undefined ? null : typologyById(record.typology);
  return stored ?? selectTypology({
    use: record.class,
    mixed: record.mixed,
    level: record.level,
    profile: null,
    coastal: false,
  });
}
