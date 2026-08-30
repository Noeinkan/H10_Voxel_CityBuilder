import { BALANCE } from '../sim';
import { ARCOLOGY } from '../world/arcology/config';
import type { ArcologyStanding } from '../world/arcology/prospect';
import type { CoachContext, CoachSuggestion } from './coach';

/**
 * La scala dell'arcologia, detta al giocatore.
 *
 * Sta in un file suo e non dentro `coach.ts` per la ragione di `AGENTS.md` —
 * quello era gia' a ridosso del limite — ma la linea di taglio non e' solo la
 * lunghezza: le altre righe della voce nominano **un gesto e la sua verifica**,
 * mentre questa racconta una **scala** con dei numeri sopra, e ha bisogno di
 * sapere cosa il dominio delle megastrutture misura. E' lo stesso taglio fra
 * `SelectionPanelModel` e `prospects`: cosa c'e' e cosa manca sono due lavori.
 *
 * Il tipo `CoachContext` arriva di la' con un `import type`, e il ciclo che ne
 * risulta e' cancellato in compilazione — lo stesso ciclo dichiarato che
 * `prospects.ts` tiene con `SelectionPanelModel.ts`.
 *
 * **Qui non si decide se una megastruttura nasce**: quello lo dice
 * `arcologyReady`, e le lacune le misura `arcologyGaps` accanto ad esso. Questo
 * strato sceglie **quando parlare** e con quali parole, come gia' fanno `TIPS` e
 * le soglie in cima a `coach.ts`.
 */

/**
 * A quale frazione della quota successiva vale la pena nominarla.
 *
 * Stesso tre quarti di `STAGE` in `coach.ts`, e per lo stesso motivo: sotto, il
 * traguardo e' lontano e citarlo sarebbe rumore su una riga che si legge una
 * alla volta.
 */
const ARCOLOGY_COACH = {
  nearShare: 0.75,
} as const;

/**
 * La megastruttura, detta come una scala invece che come un annuncio.
 *
 * **Parla solo quando e' il passo successivo**, e non appena la condizione e'
 * falsa: le lacune lontane — non c'e' un centro, non c'e' il quartiere — sono le
 * stesse cose che lo skyline e lo sviluppo dicono meglio, con un gesto piu'
 * vicino. Qui si prende la parola dal momento in cui il quartiere c'e' e manca
 * solo che finisca di crescere, piu' i due casi in cui la citta' e' pronta e a
 * fermarla e' qualcos'altro: il magazzino, o una quota gia' piena.
 *
 * I numeri delle lacune lontane non si perdono: vivono nel cassetto Citta' e
 * nella scheda dell'isolato, che sono i due posti dove una scala si **legge**
 * invece di essere annunciata.
 */
export function arcologySuggestion(context: CoachContext): CoachSuggestion | null {
  if (context.clearing) {
    return {
      id: 'coach-arcology-site',
      tier: 'arcology',
      title: 'An arcology is being built',
      message: 'A site is being cleared in the center: an arcology is about to rise where the city can no longer grow.',
      highlight: null,
      grow: null,
    };
  }

  const { arcology } = context;
  if (arcology.existing >= arcology.allowed) return quotaSuggestion(arcology);

  const prospect = arcology.prospect;
  if (prospect === null) return null;
  const blocking = prospect.gaps[0] ?? null;
  // Il quartiere attorno al candidato deve esserci: finche' manca quello, la
  // riga giusta e' un'altra e questa sarebbe rumore.
  if (blocking !== null && blocking.refusal !== 'notCapped') return null;

  // L'anello e' quello entro cui i vicini contano davvero: chi lo guarda vede
  // *quali* edifici la condizione sta contando, invece di un punto.
  const place = { x: prospect.x, y: prospect.y, radius: ARCOLOGY.radius };
  const cost = BALANCE.materials.arcologyCost;

  if (blocking === null) {
    // Nessuna lacuna urbanistica: la citta' e' pronta e il magazzino e' l'ultima
    // porta. E' anche l'unico rifiuto che il predicato puro non puo' produrre —
    // lo aggiunge il driver — quindi si misura qui invece di leggerlo.
    if (context.state.materials.stock >= cost) return null;
    const missing = Math.ceil(cost - context.state.materials.stock);
    return {
      id: 'coach-arcology-materials',
      tier: 'arcology',
      title: `Stock ${missing} more Materials`,
      message: `The highlighted block is ready for an arcology, and the city cannot pay for it: one costs ${cost} Materials. Place a Factory whose ring covers the core, or turn on Industrial subsidy. The step is complete when the site starts clearing.`,
      highlight: null,
      grow: null,
      place,
    };
  }

  const have = blocking.have ?? 0;
  const need = blocking.need ?? ARCOLOGY.minCapped;
  const remaining = Math.max(1, need - have);
  return {
    id: 'coach-arcology',
    tier: 'arcology',
    title: `Let the core top out · ${have}/${need}`,
    message: `An arcology is what a quarter becomes when it has nothing left to become, and ${remaining} more ${remaining === 1 ? 'tower' : 'towers'} inside the highlighted ring must still reach the height the center allows. Every extra level costs more Materials than the last, so keep industry ahead of construction: that, not desirability, is what stalls a saturated core. The step is complete when a site starts clearing there.`,
    highlight: null,
    grow: null,
    place,
  };
}

/**
 * L'isola ne ha quante ne ammette: l'unica riga di questo tier che spinge avanti.
 *
 * **La quota e' derivata dagli edifici**, quindi «non se ne puo' avere un'altra»
 * non e' un divieto ma un traguardo con un numero sopra — ed e' il solo punto in
 * cui questa meccanica premia la crescita ordinaria invece di chiederle di
 * fermarsi. Si tace finche' quel numero e' lontano, come per gli stadi.
 */
function quotaSuggestion(arcology: ArcologyStanding): CoachSuggestion | null {
  const { buildings, existing, nextQuotaAt: target } = arcology;
  if (buildings < target * ARCOLOGY_COACH.nearShare) return null;
  const remaining = Math.max(1, target - buildings);
  return {
    id: 'coach-arcology-quota',
    tier: 'arcology',
    title: `Grow to ${target} buildings · ${buildings}/${target}`,
    message: `The city carries ${existing} ${existing === 1 ? 'arcology' : 'arcologies'}, which is all its size allows. Build ${remaining} more ${remaining === 1 ? 'building' : 'buildings'} anywhere and it will allow another; the next one rises on its own where a quarter has topped out.`,
    highlight: null,
    grow: null,
  };
}
