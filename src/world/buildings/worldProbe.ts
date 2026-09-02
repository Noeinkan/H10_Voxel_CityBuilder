import { GROUND, isDryLand } from '../grading/grade';
import { BIOME } from '../terrain/config';
import type { BuildContext } from './buildContext';
import { groundKindAt } from './siteWorks';
import { STAMP_EMPTY } from './stamp';

/**
 * Le letture sul mondo che i driver rifacevano ognuno per conto suo.
 *
 * **Non sostituisce le sonde di dominio, le alimenta.** `RopewayProbe`,
 * `AerialProbe`, `CrossingProbe` e `SpanProbe` restano dove sono: sono il
 * contratto che tiene le regole pure e testabili senza un registry in mano, ed e'
 * il motivo per cui `ropewayPlan` si prova con quattro funzioni finte invece che
 * con mezza citta'. Quello che cambia e' da dove i driver prendono il contenuto
 * di quelle chiusure: prima ognuno riscriveva
 * `ctx.world.getBlock(x, y, z) !== STAMP_EMPTY` e `!ctx.registry.isOccupied(x, y)`
 * — quattro copie a testa — e adesso le chiede per nome.
 *
 * **Le due domande sulla terra sono due, e restano due.** La funivia chiede
 * `isDryLand`, che esclude anche fiumi e laghi; il ponte fra settori chiede solo
 * che non sia oceano. Sono sempre state diverse, e dargli un nome solo qui
 * cambierebbe dove nascono i ponti senza che nessuno l'abbia chiesto: due nomi
 * distinti costano una riga in piu' e dicono la verita'.
 */
export interface WorldProbe {
  /** La quota del terreno nudo. */
  heightAt(x: number, y: number): number;
  /**
   * La prima quota libera sopra **tutto**: il terreno, o il tetto di chi ci sta
   * sopra. E' cio' che una fune o una gamba deve scavalcare.
   */
  topAt(x: number, y: number): number;
  /** Terra asciutta: non oceano, e nemmeno fiume o lago. */
  isDryLand(x: number, y: number): boolean;
  /** Non oceano. Piu' larga di `isDryLand`, ed e' la domanda dei ponti. */
  isAboveSea(x: number, y: number): boolean;
  /** Il suolo regge una fondazione. */
  isFirm(x: number, y: number): boolean;
  /** Nessuno ha preso il suolo di questa colonna. */
  isFree(x: number, y: number): boolean;
  /** C'e' carreggiata o marciapiede. */
  isPavement(x: number, y: number): boolean;
  /** C'e' materia in questo voxel. */
  isSolid(x: number, y: number, z: number): boolean;
}

/**
 * La sonda canonica su un contesto di costruzione.
 *
 * **Una per driver e non una per candidata.** Sono chiusure senza stato — solo
 * letture — quindi costruirla nel costruttore e riusarla e' sicuro, ed e' la
 * stessa ragione per cui `SpanDriver` teneva gia' la sua invece di allocarne una
 * per ogni coppia che esamina.
 */
export function worldProbe(ctx: BuildContext): WorldProbe {
  return {
    heightAt: (x, y) => ctx.terrain.heightAt(x, y),
    topAt: (x, y) => Math.max(ctx.terrain.heightAt(x, y), ctx.registry.supportAt(x, y).z),
    // **Il bioma e non la quota**: una colonna piu' alta del mare puo' essere un
    // fondale appena generato, e una piu' bassa una conca asciutta.
    isDryLand: (x, y) => ctx.terrain.has(x, y) && isDryLand(ctx.terrain.biomeAt(x, y)),
    isAboveSea: (x, y) => ctx.terrain.biomeAt(x, y) !== BIOME.ocean,
    isFirm: (x, y) => groundKindAt(ctx.terrain, x, y) !== GROUND.refused,
    isFree: (x, y) => !ctx.registry.isOccupied(x, y),
    isPavement: (x, y) => ctx.streets.isPavement(x, y),
    isSolid: (x, y, z) => ctx.world.getBlock(x, y, z) !== STAMP_EMPTY,
  };
}
