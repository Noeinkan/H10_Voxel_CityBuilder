import { BLOCK, LOT_ROLE, type LotRole } from './config';
import type { BlockRect } from '../streets/streetGrid';

/**
 * Che parte di un isolato occupa un lotto.
 *
 * **Puro come `cluster.ts` e `lots.ts`**: entrano un riquadro e un quadrato, esce
 * un ruolo. Non conosce il registry, il terreno ne' il mondo, e per questo si
 * verifica scrivendo quattro numeri a mano invece di far crescere una citta'.
 *
 * **Dichiara una regola che c'era gia' e che nessuno aveva scritto.** Le torri
 * d'angolo esistono da prima di questo file: `blockRoom` lascia allargarsi solo
 * chi tocca due lati del riquadro, quindi i lotti d'angolo finiscono per essere
 * gli unici a poter crescere in pianta — e diventano le torri dell'isolato per
 * conseguenza, non per scelta. Finche' la regola restava implicita non si poteva
 * ne' rafforzare ne' tarare: qui diventa un criterio di catalogo come gli altri.
 *
 * **Sta fuori dalle passate perche' lo usano in due.** La nascita legge il ruolo
 * per scegliere la tipologia, la promozione legge lo spazio per decidere se
 * allargare, ed e' la stessa regola di `hierarchy.ts` e `urbanForm.ts`. In due
 * copie divergerebbero al primo ritocco di taratura.
 */

/**
 * Ruolo di un lotto dentro il proprio isolato.
 *
 * Un lotto tocca un lato quando ci arriva entro `BLOCK.edgeReach`: non si chiede
 * che sia a filo, perche' `placeLot` scorre a passo di `STREETS.align` e
 * l'impronta puo' uscire dispari — pretendere il filo esatto direbbe «cuore» a
 * un lotto che sta sulla carreggiata.
 *
 * Gli estremi di `BlockRect` sono **inclusi**, e il riquadro copre la
 * carreggiata: e' la stessa convenzione di `streetGrid.ts`, e leggerla al
 * contrario sposterebbe ogni angolo di un voxel.
 */
export function lotRoleOf(rect: BlockRect, x: number, y: number, footprint: number): LotRole {
  const reach = BLOCK.edgeReach;
  const west = x - rect.x0 <= reach;
  const east = rect.x1 - (x + footprint - 1) <= reach;
  const south = y - rect.y0 <= reach;
  const north = rect.y1 - (y + footprint - 1) <= reach;

  const onX = west || east;
  const onY = south || north;
  if (onX && onY) return LOT_ROLE.corner;
  if (onX || onY) return LOT_ROLE.frontage;
  return LOT_ROLE.interior;
}

/**
 * Lato massimo che un'impronta puo' raggiungere restando dentro l'isolato.
 *
 * **Non scende mai sotto il pavimento.** Un edificio materializzato da una
 * partita salvata puo' avere l'ancora su una colonna che la rete di oggi
 * considera carreggiata, e in quel caso il riquadro dell'isolato non lo contiene:
 * rimpicciolirlo per questo sarebbe una demolizione mascherata da upgrade.
 *
 * Viene da `upgradeDriver`, dove era un metodo privato: da quando la nascita
 * legge il ruolo del lotto sono due le passate che ragionano sullo spazio dentro
 * l'isolato, e la regola non puo' vivere dentro una delle due.
 */
export function blockRoom(rect: BlockRect, x: number, y: number, floor: number): number {
  return Math.max(floor, Math.min(rect.x1 - x + 1, rect.y1 - y + 1));
}
