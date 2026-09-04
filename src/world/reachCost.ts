import { BALANCE, type StepCost } from '../sim';
import type { CongestionLookup } from './congestion';
import { BIOME } from './terrain/config';
import type { TerrainMap } from './terrain/TerrainMap';

/**
 * Quanto costa all'influenza di un catalizzatore attraversare una colonna.
 *
 * **Sta in `src/world/` perche' e' l'unico posto da cui si possono leggere
 * terreno e strade insieme.** `src/sim/` non importa `src/engine/` per
 * contratto, e le configurazioni di entrambi ci passano; la simulazione riceve
 * quindi una funzione gia' fatta invece del mondo, com'e' gia' per
 * `SkylineQuery.waterDistance` e `BuildSiteQuery.headroomAt`.
 *
 * **La strada che conta e' quella che si vede.** Fino alla rete tracciata questa
 * funzione leggeva `StreetNetwork.isPavement`, cioe' la maglia catastale: una
 * funzione del solo seed, vera su tutto il piano, e — da quando l'anello
 * perimetrale non si dipinge piu' — invisibile. L'influenza correva quindi lungo
 * carreggiate che non esistevano, e il giocatore vedeva la citta' allargarsi in
 * un disco senza capire perche'. Adesso la sorgente e' il tracciato di
 * `src/world/roads/`: le stesse colonne che si vedono, e nient'altro.
 *
 * **L'acqua si controlla prima della strada, e non e' un dettaglio d'ordine.**
 * Un viadotto attraversa il mare e il tracciato lo sa; l'influenza no, e non
 * deve: un ponte porta veicoli, non desiderabilita', e far filtrare un
 * quartiere dall'altra parte della baia perche' c'e' un ponte vorrebbe dire
 * rimettere in piedi proprio la citta' che scavalca il mare che `water:
 * Infinity` esiste per impedire.
 *
 * **Una colonna non ancora generata vale acqua.** `biomeAt` risponde `ocean`
 * dove il terreno non e' arrivato, ed e' la risposta giusta: l'influenza non
 * deve entrare in terra che non esiste. Quando l'isola si allarga, il costo
 * cambia sotto le portate gia' calcolate, e a rimetterle in pari e'
 * `rebuildField`.
 *
 * **La citta' costruita e' il terzo ingrediente, e si somma agli altri due.**
 * Il carico di `congestion.ts` non sostituisce il costo del suolo: lo alza. Da
 * qui seguono le due cose che tengono in piedi il resto — nessun passo scende
 * sotto 1, quindi la portata non esce dal quadrato che il campo ricalcola; e la
 * carreggiata resta la via piu' corta anche dentro l'ingorgo, perche' paga lo
 * stesso supplemento del tessuto partendo da meno.
 *
 * Sarebbe stato piu' fedele al modello del traffico caricare solo la
 * carreggiata, ed e' stato provato: il tessuto attorno costa 1,25, quindi
 * l'influenza avrebbe semplicemente scavalcato l'isolato pagando un quarto di
 * cella in piu' e il quartiere denso non sarebbe mai diventato lontano. Un
 * ingorgo che si aggira non e' un ingorgo.
 */

/**
 * Cio' che il costo chiede al tracciato.
 *
 * E' un'interfaccia e non la classe perche' la rete nasce **dopo** lo stato
 * della simulazione — la costruisce il `Builder`, che a sua volta ha bisogno
 * del mondo — mentre questa funzione va passata a `createSimState`. Chi cabla i
 * due se la fa dare da una chiusura, e non c'e' nessun ordine di costruzione da
 * rispettare.
 */
export interface RoadLookup {
  readonly hasRoad: (x: number, y: number) => boolean;
}

export function createReachCost(
  map: TerrainMap,
  roads: () => RoadLookup | null,
  // Come il tracciato, e per la stessa ragione: il carico nasce dal registry del
  // Builder, che esiste dopo lo stato della simulazione. Il default a `null`
  // tiene in piedi i chiamanti che non hanno una citta' sotto — i test e le
  // fixture — e da' esattamente il costo di prima della 8.3.
  congestion: () => CongestionLookup | null = () => null,
): StepCost {
  const { pavement, land, steep, water, congestion: jam } = BALANCE.reach;

  return (x, y) => {
    if (map.biomeAt(x, y) === BIOME.ocean) return water;
    const base = roads()?.hasRoad(x, y) === true
      ? pavement
      // Roccia e cigli: ci si passa, ma il giro si sente.
      : map.isBuildable(x, y) ? land : steep;

    const load = congestion()?.at(x, y) ?? 0;
    return load > 0 ? base + jam.jam * load : base;
  };
}
