import { PALETTE_SLOTS } from '../../engine/paletteSlots';
import { TERRAIN } from '../terrain/config';

/**
 * Unica fonte di verita' dei numeri delle opere di terra.
 *
 * Vale la stessa regola di `terrain/config.ts`, `streets/config.ts` e
 * `buildings/config.ts`: nessun altro file di `src/world/grading/` contiene una
 * quota, un dislivello o un indice di palette.
 *
 * **Perche' esiste questo dominio.** Fino alla fase 4.1 la citta' occupava solo
 * il terreno che il generatore dichiarava `buildable`: piano, asciutto e sopra
 * la battigia — meta' esatta della terra emersa. Tutto il resto veniva
 * scartato, e il rifiuto era definitivo. Le opere ribaltano la domanda: non
 * "questa colonna e' gia' piana?" ma "**cosa serve costruire perche' lo
 * diventi?**". Un terrapieno con il suo muro di contenimento, o una banchina
 * che porta il piano sopra la battigia.
 *
 * **Si riempie, non si scava.** E' il vincolo che tiene insieme tutto il resto:
 * un'opera aggiunge volume e non ne toglie mai. Scavare significherebbe
 * cancellare voxel di isola per fare spazio, e un buco non si richiude piu'.
 * Da qui segue che la quota di un piano finito e' sempre il **massimo** delle
 * colonne che tocca, mai la media e mai il minimo.
 */
export const GRADING = {
  /**
   * Dislivello massimo, in voxel, che un'opera puo' colmare sotto un piano.
   *
   * E' il tetto strutturale, e ha sostituito `BUILDER.maxTerrainStep`: quel
   * numero valeva "quanto dislivello sopporto prima di rinunciare", questo vale
   * "quanto muro sono disposto a costruire". Ventiquattro copre il caso peggiore
   * vero, che e' la banchina — dal fondale a `maxQuayDepth` fino al piano di
   * `quayLevel` — e non il terrapieno, che su questo terreno non arriva a dodici.
   */
  maxWorksStep: 24,

  /**
   * Dislivello sotto il quale il riempimento resta terra e non diventa muro.
   *
   * Un cubo solo di scarto non e' un muro di contenimento: e' il plinto, che
   * gli edifici hanno gia' nel loro profilo. Rivestirlo di pietra darebbe a
   * ogni casa su terreno appena mosso uno zoccolo che non si e' guadagnata.
   *
   * Sono due cubi e non un numero a se': il gradino piu' piccolo che il terreno
   * sappia produrre e' esattamente un cubo, quindi la soglia sta subito sopra.
   */
  terraceMinStep: TERRAIN.cellSize * 2,

  /**
   * Pendenza oltre la quale nemmeno un terrapieno prende la colonna.
   *
   * Non e' un limite strutturale — a quel punto lo impone gia' `maxWorksStep` —
   * ma una scelta di forma: sopra questa soglia stanno le pareti che leggono
   * come roccia anche quando il bioma le chiama collina, ed e' giusto che
   * l'isola conservi dei fianchi che la citta' non ha addomesticato.
   *
   * Da quando la roccia si paga invece di essere rifiutata per bioma, questo e'
   * l'unico rifiuto che resta sulla terra emersa: vale per ogni bioma, e una
   * mesa piana lo passa esattamente come la passa un prato.
   *
   * **Il doppio di `buildableMaxSlope`, e non un numero suo.** Il terrapieno
   * esiste per prendere cio' che il terreno non regge da solo: dire che arriva
   * al doppio della pendenza edificabile e' la sola formulazione che leghi la
   * soglia all'opera invece che al paesaggio. Valeva `0.46` — appena un terzo
   * sopra l'edificabile — e su questo terreno rifiutava dal 3% al 9% della
   * terra emersa a seconda del seed, concentrato esattamente dove il giocatore
   * clicca: il raccordo fra pianoro e pianura. Le opere di terra sono il
   * gioco, non l'eccezione, quindi il rifiuto torna a essere l'eccezione:
   * misurato sugli stessi tre seed, ora sta sotto lo 0,1%, e cio' che resta e'
   * la parete vera — il campo continuo non passa `0.72` nemmeno sul fianco piu'
   * ripido.
   *
   * Il tetto strutturale non e' mai stato lui: sotto un'impronta da sei celle
   * il muro piu' alto che questo terreno sappia produrre e' di dieci voxel,
   * meno della meta' di `maxWorksStep`, con o senza questa soglia.
   */
  maxTerraceSlope: TERRAIN.buildableMaxSlope * 2,

  /**
   * Quota del piano di una banchina.
   *
   * Coincide con la cella di spiaggia piu' alta possibile: la banchina incontra
   * la spiaggia dove questa finisce, invece di tagliarla a mezza altezza o di
   * sporgerle sopra. Lo scarto e' un cubo intero e non un voxel perche'
   * `beachMaxHeight` e' una soglia esclusa e le quote sono quantizzate: la cella
   * di spiaggia piu' alta sta un cubo sotto. Sopra il pelo dell'acqua restano
   * due voxel, quanto basta perche' il molo si legga come tale e non come una
   * secca.
   */
  quayLevel: TERRAIN.beachMaxHeight - TERRAIN.cellSize,

  /**
   * Franco della banchina sopra il proprio specchio, in voxel.
   *
   * Vale `quayLevel - seaLevel` per costruzione, e serve a chi costruisce su
   * un'acqua con un pelo **suo** — la banchina lacustre della marina: il piano
   * finito sale allo specchio della colonna piu' questo franco, che e' la stessa
   * quota relativa che `quayLevel` da' rispetto al mare. Due voxel restano sopra
   * il pelo, quanto basta perche' il pontile si legga come tale e non come una
   * secca.
   */
  quayFreeboard: TERRAIN.beachMaxHeight - TERRAIN.cellSize - TERRAIN.seaLevel,

  /**
   * Fondale massimo, sotto il livello del mare, su cui una banchina puo'
   * poggiare.
   *
   * E' cio' che decide quanto la citta' puo' spingersi sull'acqua. Con il
   * fondale che scende di un cubo per cella, dodici voxel di pescaggio valgono
   * circa sei celle oltre la battigia: un molo, non un'isola artificiale.
   */
  maxQuayDepth: 12,

  /**
   * Quanto una banchina puo' spingersi oltre la terra, in voxel.
   *
   * `maxQuayDepth` dice *fin dove il fondale regge*, e su un bassofondo dolce
   * quella risposta arriva a una quindicina di colonne: l'anello di carreggiata
   * di un isolato costiero le prendeva tutte, e il risultato era una
   * piattaforma rettangolare in mezzo al mare che nessuno aveva progettato.
   * Questo e' il vincolo mancante, ed e' di forma e non di struttura: una
   * banchina e' il bordo costruito della terra, non un'isola artificiale.
   *
   * Due celle di terreno. Oltre, l'acqua resta acqua: spingersi al largo torna
   * a essere competenza di un molo, che ha una forma sua ed e' limitato dalla
   * ricetta che lo disegna.
   */
  quayReach: TERRAIN.cellSize * 2,

  /**
   * Dislivello che giustifica una piazza sopraelevata invece di una dipinta.
   *
   * Sotto, la piazza segue il terreno come ha sempre fatto: livellare un
   * dislivello di un cubo solo produrrebbe un gradino che nessuno legge come
   * progetto.
   */
  plazaMinStep: TERRAIN.cellSize * 2,

  /** Corpo del muro di contenimento di un terrapieno. */
  terraceWall: PALETTE_SLOTS.stoneDark,

  /**
   * Corso di coronamento: l'ultimo voxel del muro, quello che si vede di taglio.
   *
   * Un muro tutto della stessa tinta legge come un blocco di roccia. La riga
   * chiara in cima e' la sola cosa che lo dichiari costruito, e costa un
   * confronto per voxel.
   */
  terraceCoping: PALETTE_SLOTS.stone,

  /** Corpo del muro di banchina: cemento, non pietra da terrapieno. */
  quayWall: PALETTE_SLOTS.concrete,

  /** Coronamento della banchina. */
  quayCoping: PALETTE_SLOTS.concretePale,

  /** Superficie calpestabile di una banchina o di un molo. */
  quayDeck: PALETTE_SLOTS.stone,
} as const;

/**
 * Quanto costa costruire su un terreno, in multipli del prezzo di listino.
 *
 * **Perche' un peso e non un si'/no.** Il bit `buildable` del generatore
 * rispondeva "questa colonna e' gia' pronta?", e una mesa perfettamente piana
 * si sentiva rispondere di no solo perche' sta sopra `rockMinHeight`. La
 * domanda giusta e' quella delle opere — cosa serve perche' regga — e ha una
 * risposta con un prezzo, non con un divieto. Resta rifiutato solo cio' che
 * nessuna opera raddrizza: l'acqua fonda e le pareti sopra `maxTerraceSlope`.
 *
 * I valori sono scelti per ordinare, non per bilanciare al centesimo: fra un
 * prato e una banchina ci deve stare una decisione, non un arrotondamento.
 */
export const BUILD_WEIGHT = {
  /** Prato asciutto e in piano: e' il prezzo di listino, per definizione. */
  flat: 1,

  /** Terrapieno e muro di contenimento sotto il piano. */
  sloped: 1.4,

  /** Banchina: muro fino al fondale, e il piano sale a `quayLevel`. */
  shore: 1.8,

  /**
   * Roccia nuda: nessun riempimento, ma la fondazione va tagliata nel vivo, e
   * la citta' che sale sulla mesa si porta dietro tutto il resto in salita.
   * E' il peso piu' alto proprio perche' il terreno, da solo, sembra gratis.
   */
  rock: 2.2,
} as const;
