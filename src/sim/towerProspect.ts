import { catalystRoleOf } from './catalysts';
import { BUILDING_CLASS } from './classes';
import {
  gapRatio,
  rolesForSpecialization,
  specializationGapsOf,
  urbanProfileAt,
  type SpecializationGap,
} from './districts';
import type { SimState } from './SimState';

/**
 * Dove sta per nascere la prossima torre idroponica, e cosa le manca.
 *
 * **La torre e' la leva principale del cibo tardivo, ed e' anche l'unica che il
 * giocatore non piazza.** Nasce se un edificio industriale dentro il raggio di
 * una serra — o di una fabbrica, o di un campus — supera *insieme* le due soglie
 * di `farming`. Fino a qui l'unica cosa che l'interfaccia sapeva dire era il
 * gesto generico, «sovrapponi la serra alla fabbrica»: vero, ma muto su quale
 * delle due soglie manchi e di quanto, cioe' proprio sul fatto che distingue
 * l'attesa utile dall'attesa inutile.
 *
 * `specializationGapsOf` risponde gia' a quella domanda **per un luogo**. Il
 * pezzo che mancava e' scegliere il luogo: qui si guardano gli edifici
 * industriali, che sono i soli da cui una torre possa nascere, e si tiene quello
 * piu' vicino ad arrivarci.
 */
export interface TowerProspect {
  readonly x: number;
  readonly y: number;
  /** La condizione vincolante di `farming` in quel punto. */
  readonly gap: SpecializationGap;
  /** Quanto della condizione c'e' gia', in [0, 1]. Zero dove manca il ruolo. */
  readonly ratio: number;
}

/**
 * L'edificio industriale piu' vicino a diventare una torre, o `null`.
 *
 * Torna `null` in due casi che sembrano uno solo e non lo sono: quando nessun
 * luogo e' candidato — niente industria, o nessuna in raggio di un ruolo che
 * apra `farming` — e quando un candidato **qualifica gia'**. Il secondo e' il
 * caso buono: `specializationGapsOf` tace su chi ha passato tutte le soglie, e
 * qui la stessa reticenza significa che non c'e' niente da consigliare, la torre
 * arriva alla prossima promozione. Chi legge deve trattarli uguale — nessun
 * consiglio da dare — e non spiegare l'assenza.
 *
 * **La scansione e' filtrata prima geometricamente**, e non e' un dettaglio: chi
 * chiama gira a ogni tick, mentre `urbanProfileAt` costa un giro su tutti i
 * catalizzatori. Il raggio euclideo e' piu' largo di quello vero — la portata
 * segue le strade, quindi il cerchio e' un sovrainsieme del raggiungibile — ed
 * e' esattamente cio' che serve a un filtro: scarta solo chi e' fuori di sicuro,
 * e la verita' la dice il profilo.
 */
export function nearestTowerProspect(state: SimState): TowerProspect | null {
  const roles = rolesForSpecialization('farming');
  const rings = state.catalysts.filter(
    (catalyst) => catalyst.radius > 0 && roles.includes(catalystRoleOf(catalyst)),
  );
  if (rings.length === 0) return null;

  let best: TowerProspect | null = null;
  for (const building of state.buildings) {
    if (building.class !== BUILDING_CLASS.industrial) continue;
    if (building.specialization === 'farming') continue;
    if (!rings.some((ring) => within(ring, building.x, building.y))) continue;

    const profile = urbanProfileAt(state, building.x, building.y);
    // Qualifica gia': la torre e' questione di una promozione, non di un
    // consiglio. Si esce subito perche' nessun candidato piu' avanti di cosi'
    // puo' esistere, e continuare a scandire pagherebbe profili per niente.
    if (profile.specialization === 'farming') return null;

    const gap = specializationGapsOf(profile).find((entry) => entry.id === 'farming');
    if (gap === undefined) continue;

    const ratio = gapRatio(gap);
    // Stretto, non largo: a parita' vince il primo incontrato, e l'ordine di
    // `buildings` e' quello in cui la citta' li ha costruiti. Serve solo perche'
    // due partite identiche non diano due risposte diverse.
    if (best === null || ratio > best.ratio) {
      best = { x: building.x, y: building.y, gap, ratio };
    }
  }
  return best;
}

/** Il filtro grossolano: il quadrato della distanza contro quello del raggio. */
function within(
  ring: { readonly x: number; readonly y: number; readonly radius: number },
  x: number,
  y: number,
): boolean {
  const dx = ring.x - x;
  const dy = ring.y - y;
  return dx * dx + dy * dy <= ring.radius * ring.radius;
}
