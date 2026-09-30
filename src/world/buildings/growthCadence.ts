import { AERIAL } from '../aerial/config';
import { ARCOLOGY } from '../arcology/config';
import { CROSSINGS } from '../crossings/config';
import { FARMS } from '../farms/config';
import { HARBOR } from '../harbor/config';
import { SPANS } from '../spans/config';
import { ARCH, BUILDER, FUSION } from './config';
import { nextDueTick, staggerOffsets, type PassCadence } from './passSchedule';

/**
 * Il calendario delle passate del `Builder`: chi gira, ogni quanto, in che
 * ordine.
 *
 * **Le cadenze restano nei config dei domini**; qui si decide soltanto come
 * convivono. L'ordine del tavolo e' l'ordine in cui due passate girano quando
 * cadono nello stesso tick, e le ragioni stanno riga per riga.
 *
 * Il tracciato e il cantiere di sgombero non ci sono: girano a ogni tick, prima
 * di tutto, e fuori dal budget — il primo confronta una firma, il secondo chiude
 * cio' che il tick prima ha aperto, e l'infornata di questo tick ne ha bisogno.
 */

export type GrowthPassName =
  | 'decay'
  | 'build'
  | 'arcologies'
  | 'upgrades'
  | 'fusions'
  | 'harbors'
  | 'arches'
  | 'spans'
  | 'crossings'
  | 'terraces'
  | 'routes'
  | 'guides'
  | 'farms';

export interface GrowthCadence extends PassCadence {
  readonly name: GrowthPassName;
}

/**
 * Tick fra l'infornata e gli upgrade.
 *
 * **Dopo, e non nello stesso tick.** Si contendono i posti di `maxGrowing`, e
 * l'infornata deve prenderli per prima: finche' cadevano insieme bastava
 * l'ordine del tavolo, ma insieme sono anche le due passate care del periodo
 * dieci, cioe' il picco che lo sfasamento esiste per togliere.
 *
 * **Due e non uno**, per i percorsi in quota: periodo 24, incontrano ogni periodo
 * dieci il cui sfasamento ha la loro stessa parita'. Con infornata e upgrade a un
 * tick di distanza le due parita' sarebbero diverse, e i percorsi cadrebbero
 * addosso a una delle due; a due tick restano uguali, e i percorsi trovano posto.
 */
const UPGRADE_LAG = 2;

/**
 * `heavy` segue la prima tabella della 6.2 (286 edifici, isola da 512): percorsi
 * in quota a 47 ms di media, infornata e campate a 13, landmark piu' upgrade a 6.
 * Tutte le altre stavano sotto i 3 ms. Non e' una taratura fine e non deve
 * esserlo: dice soltanto quali passate lo sfasamento separa per prime.
 */
export const GROWTH_PASSES: readonly GrowthCadence[] = [
  // **Il declino prima della crescita, e non e' l'ordine di comodo.** Una
  // colonna appena liberata torna candidata subito — e' vuota, ed e' anche
  // appena diventata piu' desiderabile, perche' l'edificio che se n'e' andato
  // portava via la propria congestione. Con l'ordine opposto la citta'
  // ricostruirebbe nel punto in cui ha appena rinunciato, un tick dopo l'altro.
  // A impedirlo davvero e' il fronte dentro l'infornata; questo ordine e' la
  // seconda meta' della stessa risposta, e vale quando le due cadono insieme.
  { name: 'decay', period: BUILDER.ticksPerDecay },
  { name: 'build', period: BUILDER.ticksPerBuild, heavy: true },
  // Il megaprogetto maturo prenota il magazzino prima degli upgrade ordinari.
  // Altrimenti una passata da sessantaquattro torri spenderebbe fino all'ultima
  // unita' disponibile e l'arcologia, pur avendo tutte le condizioni urbane,
  // resterebbe in attesa per sempre per una pura conseguenza dell'ordine.
  { name: 'arcologies', period: ARCOLOGY.ticksPerPass, anchor: { pass: 'upgrades', lag: 0 } },
  // Landmark e upgrade sono una riga sola: i landmark hanno gia' soddisfatto una
  // soglia urbana e prendono il proprio posto prima degli upgrade ordinari, che
  // in una citta' matura riempiono `maxGrowing` a ogni giro — eseguiti per primi
  // potevano affamare per sempre un landmark anche con decine di edifici nel
  // raggio.
  { name: 'upgrades', period: BUILDER.ticksPerUpgrade, heavy: true, anchor: { pass: 'build', lag: UPGRADE_LAG } },
  // **La fusione dopo la promozione.** Il lato che l'isolato concede dipende dal
  // livello raggiunto: valutata prima, nello stesso tick, leggerebbe il gradino
  // d'impronta di un giro fa e proporrebbe di prendersi il vicino a un edificio
  // che quel giro avrebbe allargato da solo, sul prato.
  { name: 'fusions', period: FUSION.ticksPerPass },
  // Il distretto costiero segue i landmark, e a cadenza propria: lo stadio che
  // il quartiere ha appena meritato e' anche l'anello che il fronte si prende, ma
  // non c'e' fretta — le opere viaggiano sulle code di sempre.
  { name: 'harbors', period: HARBOR.ticksPerPass },
  // **Prima l'arco, poi il ponte.** Le due passate guardano lo stesso vuoto e la
  // prima che arriva se lo prende: dando la precedenza alla campata di `spans/`,
  // un ponte occuperebbe la quota di fascia su cui i due corpi si sarebbero
  // incontrati e l'arco non nascerebbe mai. L'ordine opposto non ha il difetto
  // speculare — un arco esiste solo dove le due fasce coincidono, che e' raro.
  { name: 'arches', period: ARCH.ticksPerPass, anchor: { pass: 'spans', lag: 0 } },
  { name: 'spans', period: SPANS.ticksPerPass, heavy: true },
  // Il ponte lungo viene dopo le campate locali: prima una citta' costruisce la
  // propria rete, poi uno skyline maturo puo' scavalcare il mare.
  { name: 'crossings', period: CROSSINGS.automatic.ticksPerPass },
  // Mensole e percorsi sono due atti urbani distinti — il dettaglio e il
  // collegamento — e vanno a cadenze diverse. Nessuno dei due legge la
  // simulazione: una mensola dipende da una facciata, un percorso da cosa c'e'
  // fra due edifici.
  { name: 'terraces', period: AERIAL.terrace.ticksPerPass },
  { name: 'routes', period: AERIAL.route.ticksPerPass, heavy: true },
  // La via da terra per ultima, perche' serve un impalcato che qualcuno abiti
  // gia': prima si costruisce sopra la citta', poi si guadagna il modo di
  // arrivarci.
  { name: 'guides', period: AERIAL.guide.ticksPerPass },
  // La campagna dopo la crescita perche' e' la crescita a mangiarsela: valutata
  // prima, un lotto appena coperto resterebbe contato come produttore fino al
  // giro dopo, e la citta' rincorrerebbe la fame con un ritardo permanente.
  { name: 'farms', period: FARMS.ticksPerPass },
];

const OFFSETS = staggerOffsets(GROWTH_PASSES);

/**
 * Il primo tick `>= from` in cui la passata gira.
 *
 * Serve a chi deve far cadere una passata in un tick preciso — un test che
 * chiama `onTick` una volta sola — senza sapere quale sfasamento le e' toccato.
 */
export function growthPassTick(name: GrowthPassName, from = 0): number {
  const cadence = GROWTH_PASSES.find((pass) => pass.name === name)!;
  return nextDueTick(from, cadence.period, OFFSETS.get(name)!);
}
