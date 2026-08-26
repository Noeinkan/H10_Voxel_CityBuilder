import {
  BUILDING_CLASS,
  catalystById,
  districtPairingsOf,
  dominantUse,
  specializationGapsOf,
  type BuildingClass,
  type CatalystId,
  type SpecializationGap,
} from '../sim';
import { bestProspectOf, type TypologyGap } from '../world/buildings/typology';
import { unlocksFor } from '../world/buildings/unlocks';
import { landmarkOf } from '../world/landmarks/config';
import type { ColumnInfo } from '../game/selection';
import type { SelectionRow } from './SelectionPanelModel';

/**
 * Cosa questo luogo **non** e' ancora, detto come qualcosa da fare.
 *
 * Sta in un file suo e non dentro `SelectionPanelModel` per la ragione di
 * `AGENTS.md`: quel file e' a ridosso del limite, e il semaforo prende il lock
 * per path. Ma la linea di taglio non e' solo la lunghezza — descrivere cosa
 * **c'e'** e descrivere cosa **manca** sono due lavori, e le quattro sezioni
 * della scheda non cambiano quando cambia una soglia in `balance.ts`.
 *
 * Il tipo `SelectionRow` arriva di la' con un `import type`, e il ciclo che ne
 * risulta e' cancellato in compilazione: e' lo stesso ciclo dichiarato che
 * `DesirabilityField.ts` tiene con `districts.ts`.
 *
 * **Qui c'e' solo la lingua.** Cosa manchi lo dicono `specializationGapsOf` e
 * `bestProspectOf`, ognuna accanto alla regola che applica; questo strato sceglie
 * le parole, come gia' fanno `GROUND_LABELS` e `YIELD_PHRASE` nella scheda.
 */

/** Due decimali: le metriche del profilo stanno tutte in [0, 1]. */
function amount(value: number): string {
  return value.toFixed(2);
}

/**
 * Cosa un ruolo sblocca, come righe di tooltip.
 *
 * Sta qui e non in `GameHudModel` per la ragione dichiarata in `AGENTS.md`:
 * quel file e' gia' oltre il limite, e riceve il campo e la chiamata ma mai il
 * calcolo. Sta qui e non in `unlocks.ts` per la ragione opposta: li' c'e' quali
 * forme un ruolo apra, che e' una regola del mondo; **come si dice** e' di
 * questo strato, come per le righe della scheda qui sotto.
 *
 * Il quartiere e' il punto della riga: dice che fra il catalizzatore e la forma
 * c'e' un passaggio, e che quel passaggio e' un quartiere. Un elenco piatto di
 * nomi e' esattamente cio' che prometteva troppo.
 *
 * **Una preposizione e non una freccia.** `office districts → Office tower`
 * chiede di sapere da che parte si legge la freccia e mette la condizione prima
 * della cosa promessa, che e' l'ordine sbagliato: qui si nomina la forma, e poi
 * dove la si trova.
 */
export function unlockLines(id: CatalystId): readonly string[] {
  return unlocksFor(id).map(
    (unlock) => `${unlock.typologies.join(', ')} in ${unlock.specialization} districts`,
  );
}

/**
 * Con chi questo ruolo va a braccetto, come righe di tooltip.
 *
 * **E' la sola sinergia del gioco, e non compariva da nessuna parte.** Due
 * catalizzatori i cui campi si sovrappongono danno un quartiere che nessuno dei
 * due da' da solo — porto piu' mercato fa un porto commerciale, universita' piu'
 * trasporto fa un campus — e il quartiere e' cio' che poi apre le forme di
 * `unlockLines`. Senza questa riga la catena aveva l'anello di mezzo invisibile:
 * si leggeva «Only here: Office tower in office districts» senza sapere che un
 * distretto e' una **coppia**, e ci si arrivava per tentativi da duecento fondi.
 *
 * Il nome del ruolo e non il suo id: `market` e `transport` si scrivono `Market`
 * e `Transit` in ogni altro punto dell'interfaccia, e l'id nudo qui sarebbe
 * l'unico posto in cui il giocatore legge il nome interno.
 */
export function pairingLines(id: CatalystId): readonly string[] {
  return districtPairingsOf(id).map((pairing) => {
    const partners = pairing.partners.map((role) => catalystById(role).label).join(' or ');
    return `${partners} → ${pairing.district} quarter`;
  });
}

/**
 * Quanto un landmark cresce, come righe di tooltip.
 *
 * Gli stadi sono la promessa di crescita di un monumento: piazzato presto,
 * rinforza il proprio catalizzatore a ogni soglia di edifici vicini. Lo stadio
 * zero e' il piazzamento e non si conta; i numeri veri sono le soglie
 * successive. Un ruolo senza ricetta non ha stadi, e la riga tace.
 */
export function stageLines(id: CatalystId): readonly string[] | null {
  const recipe = landmarkOf(id);
  if (recipe === null) return null;
  const thresholds = recipe.stages.slice(1);
  if (thresholds.length === 0) return null;
  return [
    `Grows at ${thresholds.join(' · ')} nearby buildings`,
    'Each stage strengthens the catalyst',
  ];
}

/**
 * Cosa un uso urbano consegna alla citta', in due parole.
 *
 * **E' l'anello che mancava fra il catalizzatore e le risorse.** Il tooltip
 * dice gia' quali usi un ruolo attira, e la barra in alto dice quanti fondi,
 * materiali e cibo ci sono: fra le due cose non c'era niente, e il giocatore non
 * aveva modo di sapere che un mercato riempie la cassa **attraverso** i negozi
 * che fa nascere, o che una fabbrica non produce materiali — li producono i
 * capannoni che le crescono intorno.
 *
 * Il cibo compare sotto il residenziale e non come voce sua, ed e' il punto: non
 * lo produce nessun uso urbano, lo **consumano** gli abitanti, e i campi che lo
 * coltivano arrivano da soli quando il conto non torna. Detto altrove sarebbe una
 * quinta riga; detto qui e' la conseguenza di far crescere le case.
 */
const CLASS_YIELD: Readonly<Record<BuildingClass, string>> = {
  [BUILDING_CLASS.residential]: 'residents, and the food they eat',
  [BUILDING_CLASS.commercial]: 'funds',
  [BUILDING_CLASS.industrial]: 'materials',
  [BUILDING_CLASS.civic]: 'satisfaction, paid for in funds',
};

/**
 * Cosa arrivera' in cassa se questo ruolo attecchisce, dal contributo maggiore.
 *
 * Solo i due usi piu' favoriti: un ruolo che ne tocca tre elencherebbe mezza
 * economia e non direbbe piu' niente su di se'. Sono gia' ordinati per
 * influenza da `CatalystDefinition.favours`.
 */
export function yieldLine(id: CatalystId): string | null {
  // La serra e' l'unico ruolo che produce cibo **davvero**: i campi crescono
  // attorno a lei e l'industria vicina diventa torri idroponiche. Il cibo non e'
  // un uso urbano, quindi non passa da `CLASS_YIELD` — la resa si dichiara qui.
  if (id === 'greenhouse') return 'food, then residents';
  const favours = catalystById(id).favours.slice(0, 2);
  if (favours.length === 0) return null;
  return favours.map((cls) => CLASS_YIELD[cls]).join(', then ');
}

/**
 * Il requisito vincolante di una specializzazione, come frase.
 *
 * Il gap di ruolo dice **dove andare a piazzare qualcosa**, quello di soglia
 * **cosa aspettare**: sono due gesti diversi, e il dominio ha gia' deciso quale
 * dei due riportare — qui non si sceglie, si traduce.
 */
function specializationPhrase(gap: SpecializationGap): string {
  if (gap.metric === null) return `needs ${gap.roles.join(' or ')} in range`;
  return `${gap.metric} ${amount(gap.have)} of ${amount(gap.need)}`;
}

/**
 * Un requisito di tipologia, come frase, oppure `null` dove non c'e' un gesto.
 *
 * `use`, `mixed` e `lotRole` non compaiono mai in una prospettiva — la
 * selezione li scarta a monte — ma il ramo resta: e' un `null` che sparisce
 * dall'elenco, non una riga che dice una cosa su cui non si puo' agire.
 */
function typologyPhrase(gap: TypologyGap): string | null {
  switch (gap.kind) {
    case 'level':
      return `level ${gap.need}`;
    case 'coastal':
      return 'a waterfront';
    case 'specialization':
      return `a ${gap.wants?.[0]} district`;
    case 'roles':
      return `${gap.wants?.join(' or ')} in range`;
    case 'charter':
      return `the ${gap.wants?.join(' or ')} charter`;
    case 'district':
      return `a ${gap.wants?.join(' or ')} quarter`;
    case 'metric':
      return gap.bound === 'max'
        ? `${gap.metric} below ${amount(gap.need ?? 0)}`
        : `${gap.metric} ${amount(gap.have ?? 0)} of ${amount(gap.need ?? 0)}`;
    default:
      return null;
  }
}

/**
 * Le righe che dicono cosa questo luogo potrebbe diventare, e cosa gli manca.
 *
 * Da zero a due. **Nessuna dove non c'e' niente di vero da dire**: un prato
 * senza un solo ruolo nel raggio non e' vicino a niente, e stampargli accanto un
 * requisito irraggiungibile insegnerebbe a saltare la riga — che e' il modo in
 * cui una scheda smette di essere letta. E' la stessa scelta di `cityUse: null`
 * in `selection.ts`, dove il vuoto e' un fatto invece di un numero plausibile.
 */
export function prospectRows(column: ColumnInfo): readonly SelectionRow[] {
  const rows: SelectionRow[] = [];
  const profile = column.profile;

  // Il livello e' quello che il luogo **permette**, non quello che c'e': la
  // domanda e' cosa potrebbe crescere qui, e chiederlo al livello attuale
  // direbbe di no a ogni forma alta solo perche' l'isolato e' giovane.
  const prospect = bestProspectOf({
    use: dominantUse(profile),
    level: column.allowedLevel,
    profile,
    coastal: column.coastal,
  });
  const wanted = prospect?.gaps.find((gap) => gap.kind === 'specialization')?.wants?.[0] ?? null;

  // Fuori dall'influenza di ogni catalizzatore la citta' non arriva: li' non c'e'
  // una specializzazione «vicina», ce ne sono sei tutte lontane uguali, e
  // nominarne una sarebbe sceglierla a caso.
  if (profile.roles.length > 0) {
    const gaps = specializationGapsOf(profile);
    // **Le due righe raccontano una storia sola.** Se la forma che potrebbe
    // crescere qui pretende un quartiere preciso, si spiega quello e non il piu'
    // vicino: due righe che rispondono a domande scollegate — «il quartiere piu'
    // prossimo» e «la forma piu' alta» — costano lo stesso spazio e non fanno
    // una catena, che e' la sola cosa per cui questa scheda vale la pena.
    const gap = (wanted === null ? undefined : gaps.find((entry) => entry.id === wanted)) ?? gaps[0];
    if (gap !== undefined) {
      rows.push({ label: 'Could become', value: `${gap.id} — ${specializationPhrase(gap)}` });
    }
  }

  if (prospect === null) return rows;

  const missing = prospect.gaps
    .map(typologyPhrase)
    .filter((phrase): phrase is string => phrase !== null);
  if (missing.length > 0) {
    rows.push({
      label: 'Could grow',
      value: `${prospect.definition.label} — needs ${missing.join(' and ')}`,
    });
  }

  return rows;
}
