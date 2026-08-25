/**
 * Unica fonte di verita' dei numeri della costruzione.
 *
 * Nessun altro file di `src/world/buildings/` contiene una soglia, una cadenza o
 * un indice di palette. La ragione non e' l'ordine ma la separazione dei domini —
 * `sim/balance.ts` descrive le regole della simulazione, e se un edificio viene
 * su troppo alto o troppo spesso la risposta sta qui, mai in quello: toccare
 * `balance.ts` per far tornare un conto visivo sposterebbe il pareggio
 * alimentare per rendere piu' bella una torre.
 *
 * E' una facciata, e i consumatori importano `buildings/config` senza sapere in
 * quale modulo sta il numero che chiedono. Cinque file, e la divisione risponde
 * a cinque domande diverse:
 *
 * | Modulo | Domanda |
 * | --- | --- |
 * | `builder.ts` | quanto in fretta la citta' cresce, e quanto costa un edificio |
 * | `grammar.ts` | di che parole e' fatta una forma |
 * | `levels.ts` | quanta massa da' un livello, e come si arriva al successivo |
 * | `classProfile.ts` | che aspetto ha un uso quando il luogo non dice altro |
 * | `typologies.ts` | quale forma prende un uso in un luogo preciso |
 * | `styles.ts` | di che materia e' fatto un quartiere |
 *
 * Un numero nuovo va nel modulo che risponde alla sua domanda, non in fondo al
 * primo file aperto.
 */

export { BUILDER, CLUSTER, DEFAULT_BUILDING_FORM } from './builder';
export type { BuildingForm } from './builder';

export {
  BAND_OP,
  CROWN_KIND,
  GRAMMAR,
  LOT_ROLE,
  MAX_FOOTPRINT,
  MIN_FOOTPRINT,
} from './grammar';
export type { BandOp, CrownKind, LotRole } from './grammar';

export { LEVEL_CAPS, START_LEVEL_CDF, upgradeThresholdOf } from './levels';
export type { LevelCaps } from './levels';

export { CLASS_PROFILE } from './classProfile';
export type { ClassProfile } from './classProfile';

export { DEFAULT_TYPOLOGY_SHAPE, TYPOLOGIES, typologyById } from './typologies';
export type {
  TypologyDefinition,
  TypologyId,
  TypologyRequirement,
  TypologyShape,
} from './typologies';

export { BLOCK, STYLE, STYLES, styleById } from './styles';
export type { StyleDefinition, StylePalette } from './styles';
