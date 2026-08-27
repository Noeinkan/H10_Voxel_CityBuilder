import {
  funnelOf,
  TRAFFIC,
  VEHICLE,
  type VehicleFunnel,
  type VehicleKind,
} from '../world/traffic/config';

/**
 * La forma dei mezzi, in scatole.
 *
 * **Perche' sta fuori da `TrafficView`.** Qui non c'e' una riga di Three.js:
 * entra un tipo di mezzo, esce un elenco di prismi in voxel. E' cio' che permette
 * di verificare in ambiente node che il fumaiolo disegnato finisca dove
 * `TRAFFIC.funnel` dice che esce il fumo, invece di scoprirlo da uno screenshot.
 * A cucire le scatole in una geometria e' la vista, che resta l'unica a
 * conoscere il renderer.
 *
 * **Restano scatole, e sono molte.** Il resto della scena e' fatto di cubi di un
 * voxel: una silhouette liscia in mezzo si vedrebbe come un corpo estraneo. La
 * cura per una barca che sembra un mattone non e' arrotondarla, e' la stessa che
 * `mesher/microGeometry.ts` applica agli edifici — prismi piu' piccoli del voxel
 * dove la forma cambia. Uno scafo si rastrema in tre conci, la fascia di
 * galleggiamento e' spessa tre decimi, il parapetto due: a distanza isometrica
 * sono proprio quei bordi a dire che la cosa e' costruita.
 *
 * **L'origine e' il centro del mezzo sul pelo dell'acqua** — o sul piano, per
 * cio' che vola — e `+x` e' la prua: e' la stessa convenzione dell'orientamento
 * canonico dei landmark, e serve alla stessa cosa, poter ruotare senza pensarci.
 */

export interface HullBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly palette: number;
  /**
   * Vero se questa scatola e' una luce accesa e non un pezzo d'ottone.
   *
   * E' un campo e non una deduzione dallo slot di palette, e la differenza si
   * vede di notte: `lightPalette` veste anche le pinne di un dirigibile, e dedurre
   * l'emissione dalla tinta le accenderebbe come due tubi al neon. Chi disegna la
   * sagoma sa quale scatola e' un fanale; il fragment non puo' saperlo.
   */
  readonly lamp: boolean;
}

/**
 * Quanto pesca uno scafo, in voxel.
 *
 * Uguale per tutto cio' che galleggia, ed e' voluto: l'immersione la si legge dal
 * confronto fra due barche vicine, e due pescaggi diversi si vedrebbero come un
 * errore prima che come una scelta.
 */
const DRAFT = 0.6;

/** Foglio di appunti su cui una sagoma scrive: l'unico stato di questo modulo. */
class Hull {
  readonly blocks: HullBlock[] = [];

  box(
    x: number,
    y: number,
    z: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    palette: number,
  ): void {
    this.blocks.push({ x, y, z, sizeX, sizeY, sizeZ, palette, lamp: false });
  }

  /** Due scatole speculari rispetto all'asse: ali, motori, parapetti, parabordi. */
  pair(
    x: number,
    y: number,
    z: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    palette: number,
  ): void {
    this.box(x, y, z, sizeX, sizeY, sizeZ, palette);
    this.box(x, -y, z, sizeX, sizeY, sizeZ, palette);
  }

  /**
   * Un fanale: la stessa scatola, ma dichiarata accesa.
   *
   * La tinta non e' un parametro perche' non e' una scelta della sagoma — una
   * luce di via e' `lightPalette` su ogni mezzo, e lasciar decidere al chiamante
   * significherebbe soltanto poter sbagliare.
   */
  lamp(x: number, y: number, z: number, sizeX: number, sizeY: number, sizeZ: number): void {
    this.blocks.push({
      x, y, z, sizeX, sizeY, sizeZ, palette: TRAFFIC.lightPalette, lamp: true,
    });
  }

  /** Due fanali speculari: le estremita' alari, i capi di un traghetto. */
  lampPair(x: number, y: number, z: number, sizeX: number, sizeY: number, sizeZ: number): void {
    this.lamp(x, y, z, sizeX, sizeY, sizeZ);
    this.lamp(x, -y, z, sizeX, sizeY, sizeZ);
  }

  /**
   * La riga scura sul pelo dell'acqua.
   *
   * Sborda dai fianchi di sei centesimi, ed e' tutto il trucco: una fascia a filo
   * non farebbe ombra e si leggerebbe come una decalcomania. Va chiamata una
   * volta per concio di scafo, cosi' la riga segue la rastremazione invece di
   * uscire dalla prua.
   */
  waterline(x: number, sizeX: number, beam: number): void {
    this.box(x, 0, 0.02, sizeX, beam + 0.12, 0.36, TRAFFIC.bandPalette);
  }
}

/**
 * Le scatole di un tipo di mezzo.
 *
 * Nessuna cache: `TrafficView` chiama questa funzione una volta per tipo alla
 * costruzione, e la geometria che ne esce e' condivisa da tutti i mezzi di quel
 * tipo.
 */
export function hullBlocks(kind: VehicleKind): readonly HullBlock[] {
  const hull = new Hull();
  SHAPES[kind](hull);
  return hull.blocks;
}

/**
 * Barca da lavoro: scafo tozzo, timoneria a poppa, coperta ingombra.
 *
 * E' la sagoma piu' piccola, quindi quella dove il dettaglio conta di piu': a
 * sette voxel di lunghezza un cubetto di tre decimi e' ancora un oggetto
 * riconoscibile — un parabordo, un fanale — e senza quelli lo scafo e' solo un
 * parallelepipedo arancione.
 */
function boatShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.boat];
  const deck = size.height - DRAFT;

  // Scafo: corpo, tre conci di prua che si stringono, specchio di poppa.
  hull.box(-0.35, 0, 0.4, 4.6, 3.0, 2.0, size.palette);
  hull.box(2.35, 0, 0.475, 0.8, 2.4, 1.85, size.palette);
  hull.box(2.95, 0, 0.55, 0.4, 1.7, 1.7, size.palette);
  hull.box(3.3, 0, 0.65, 0.3, 0.9, 1.5, size.palette);
  hull.box(-3.0, 0, 0.5, 0.7, 2.7, 1.8, size.palette);
  hull.waterline(-0.35, 4.62, 3.0);
  hull.waterline(2.35, 0.82, 2.4);

  // Coperta e capodibanda: il ponte rientra, la falchetta lo borda e sporge.
  hull.box(-0.35, 0, deck + 0.08, 5.2, 2.5, 0.16, TRAFFIC.deckPalette);
  hull.pair(-0.35, 1.42, deck + 0.22, 5.4, 0.22, 0.44, size.palette);
  hull.pair(0.3, 1.48, deck - 0.1, 0.3, 0.3, 0.55, TRAFFIC.trimPalette);
  hull.pair(-1.7, 1.48, deck - 0.1, 0.3, 0.3, 0.55, TRAFFIC.trimPalette);

  // Timoneria: tuga chiara, fascia di vetri che sporge, tetto scuro.
  hull.box(-1.15, 0, 2.285, 1.9, 1.9, 1.45, TRAFFIC.housePalette);
  hull.box(-1.15, 0, 2.62, 1.96, 1.96, 0.44, TRAFFIC.cabinPalette);
  hull.box(-1.15, 0, 3.08, 2.1, 2.1, 0.14, TRAFFIC.trimPalette);
  hull.box(-1.95, 0, 3.4, 0.28, 0.28, 1.0, TRAFFIC.trimPalette);

  // Albero con il fanale di testa, carico di coperta, fanale di via a prua.
  hull.box(-0.4, 0, 3.9, 0.16, 0.16, 1.5, TRAFFIC.trimPalette);
  hull.lamp(-0.4, 0, 4.78, 0.26, 0.26, 0.26);
  hull.box(0.75, 0.6, 1.94, 1.1, 1.15, 0.75, TRAFFIC.cratePalettes[0]);
  hull.box(0.75, -0.6, 1.94, 1.1, 1.15, 0.75, TRAFFIC.cratePalettes[2]);
  hull.lamp(3.2, 0, 1.55, 0.24, 0.24, 0.24);
}

/**
 * Yacht da diporto: scafo slanciato, tuga corta, albero da diporto.
 *
 * **La firma e' l'assenza di lavoro.** La barca da lavoro porta parabordi,
 * fanale di via e carico di coperta; questo e' il contrario — fianchi puliti e
 * una tuga bassa — e a cinque voxel di lunghezza e' proprio cio' che resta a
 * distinguerlo dal suo gemello da pesca quando due barche stanno ormeggiate
 * vicine. La prua rastremata e' la stessa in due conci, come sull'altra.
 */
function yachtShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.yacht];
  const deck = size.height - DRAFT;

  // Scafo: corpo, due conci di prua, specchio di poppa.
  hull.box(-0.25, 0, 0.4, 3.4, 2.0, 2.0, size.palette);
  hull.box(1.55, 0, 0.475, 0.7, 1.5, 1.85, size.palette);
  hull.box(2.05, 0, 0.55, 0.35, 0.8, 1.7, size.palette);
  hull.box(-2.2, 0, 0.5, 0.5, 1.8, 1.8, size.palette);
  hull.waterline(-0.25, 3.42, 2.0);
  hull.waterline(1.55, 0.72, 1.5);

  // Coperta e falchetta: il ponte rientra e la falchetta lo borda.
  hull.box(-0.25, 0, deck + 0.08, 3.9, 1.7, 0.16, TRAFFIC.deckPalette);
  hull.pair(-0.25, 1.0, deck + 0.22, 4.0, 0.18, 0.4, size.palette);

  // Tuga corta e parabrezza: la fascia di vetri sporge, il tetto chiude scuro.
  hull.box(-1.35, 0, 2.28, 1.7, 1.6, 1.1, TRAFFIC.housePalette);
  hull.box(-1.35, 0, 2.6, 1.76, 1.66, 0.4, TRAFFIC.cabinPalette);
  hull.box(-1.35, 0, 3.02, 1.9, 1.8, 0.12, TRAFFIC.trimPalette);

  // Albero da diporto con il fanale di testa, e il fanale di via a prua.
  hull.box(0.7, 0, 3.35, 0.14, 0.14, 1.4, TRAFFIC.trimPalette);
  hull.lamp(0.7, 0, 4.35, 0.24, 0.24, 0.24);
  hull.lamp(2.3, 0, 1.55, 0.2, 0.2, 0.2);
}

/**
 * Traghetto di linea: doppia estremita', tuga lunga, plancia alta, ciminiera.
 *
 * Le due estremita' uguali non sono pigrizia della sagoma, sono la cosa che
 * dichiara il mezzo: un traghetto di linea non gira, inverte. E' anche il motivo
 * per cui il fanale di via sta a **tutt'e due** i capi.
 */
function ferryShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.ferry];
  const deck = size.height - DRAFT;
  const funnel = funnelOf(VEHICLE.ferry)!;

  hull.box(0, 0, 0.9, 8.0, 4.0, 3.0, size.palette);
  hull.waterline(0, 8.02, 4.0);
  for (const side of [1, -1]) {
    hull.box(side * 4.45, 0, 1.05, 0.9, 3.2, 2.7, size.palette);
    hull.box(side * 5.2, 0, 1.2, 0.6, 2.0, 2.4, size.palette);
    hull.waterline(side * 4.45, 0.92, 3.2);
    hull.lamp(side * 4.9, 0, deck + 0.35, 0.3, 0.3, 0.3);
  }

  // Ponte di coperta e parapetto: la coppia che rende il traghetto una cosa su
  // cui si sale, invece di un blocco chiuso con una fascia di vetri.
  hull.box(0, 0, deck + 0.09, 9.6, 3.5, 0.18, TRAFFIC.deckPalette);
  hull.pair(0, 1.92, deck + 0.28, 9.2, 0.2, 0.5, TRAFFIC.trimPalette);

  // Tuga passeggeri, plancia arretrata, e le due zattere sul tetto.
  hull.box(-0.5, 0, 3.33, 6.6, 3.0, 1.5, TRAFFIC.housePalette);
  hull.box(-0.5, 0, 3.45, 6.66, 3.06, 0.52, TRAFFIC.cabinPalette);
  hull.box(-0.5, 0, 4.16, 6.8, 3.2, 0.16, TRAFFIC.trimPalette);
  hull.pair(-3.0, 1.15, 4.44, 1.3, 0.6, 0.4, TRAFFIC.deckPalette);
  hull.box(1.3, 0, 4.715, 2.6, 2.3, 0.95, TRAFFIC.housePalette);
  hull.box(1.3, 0, 4.86, 2.66, 2.36, 0.4, TRAFFIC.cabinPalette);
  hull.box(1.3, 0, 5.26, 2.8, 2.5, 0.14, TRAFFIC.trimPalette);

  // Ciminiera: il fusto parte dentro il tetto della tuga, il cappello chiude
  // alla quota da cui `plume.ts` fa uscire gli sbuffi.
  funnelStack(hull, 4.2, funnel, 1.3);

  hull.box(1.3, 0, 6.03, 0.16, 0.16, 1.4, TRAFFIC.trimPalette);
  hull.lamp(1.3, 0, 6.86, 0.26, 0.26, 0.26);
}

/**
 * Nave da carico: la sagoma piu' lunga che naviga, e l'unica con un carico.
 *
 * I container sono il carico e insieme il modo di leggere la scala: quattro
 * campate di scatole diverse dicono che la nave e' lunga diciassette voxel
 * meglio di quanto lo dica lo scafo, che e' una superficie sola.
 */
function cargoShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.cargo];
  const deck = size.height - DRAFT;
  const funnel = funnelOf(VEHICLE.cargo)!;

  // Scafo: corpo, tre conci di prua, poppa a specchio in due gradini.
  hull.box(-1.0, 0, 1.4, 12.0, 5.0, 4.0, size.palette);
  hull.box(5.6, 0, 1.5, 1.2, 4.3, 3.8, size.palette);
  hull.box(6.75, 0, 1.6, 1.1, 3.2, 3.6, size.palette);
  hull.box(7.9, 0, 1.7, 1.2, 1.6, 3.4, size.palette);
  hull.box(-7.5, 0, 1.55, 1.0, 4.4, 3.7, size.palette);
  hull.box(-8.25, 0, 1.65, 0.5, 3.2, 3.5, size.palette);
  hull.waterline(-1.0, 12.02, 5.0);
  hull.waterline(5.6, 1.22, 4.3);
  hull.waterline(-7.5, 1.02, 4.4);

  hull.box(-0.3, 0, deck + 0.1, 15.0, 4.4, 0.2, TRAFFIC.deckPalette);
  hull.pair(-0.3, 2.42, deck + 0.28, 14.6, 0.22, 0.55, TRAFFIC.trimPalette);

  // Quattro campate di container, due per campata e tinte a rotazione, con un
  // secondo strato sopra ognuna: e' il carico a dire che la nave e' carica, e
  // uno strato solo su uno scafo alto quattro voxel legge come un pianale.
  // Il secondo strato e' largo quanto la stiva a campate alterne, cosi' il
  // profilo del carico ha un dente invece di essere un muro.
  const bays = [4.3, 1.7, -0.9, -3.5];
  for (let i = 0; i < bays.length; i++) {
    hull.box(bays[i], 1.1, deck + 0.78, 2.3, 2.0, 1.15, crate(i));
    hull.box(bays[i], -1.1, deck + 0.78, 2.3, 2.0, 1.15, crate(i + 1));
    hull.box(bays[i], 0, deck + 1.9, 2.2, i % 2 === 0 ? 4.1 : 2.1, 1.1, crate(i + 2));
  }

  // Castello di poppa: due ordini di finestre e le due alette di plancia, che
  // sporgono oltre il fianco perche' e' da li' che si guarda la banchina.
  hull.box(-5.5, 0, 5.0, 3.0, 4.2, 2.8, TRAFFIC.housePalette);
  hull.box(-5.5, 0, 4.5, 3.06, 4.26, 0.36, TRAFFIC.cabinPalette);
  hull.box(-5.5, 0, 5.75, 3.06, 4.26, 0.36, TRAFFIC.cabinPalette);
  hull.pair(-5.5, 2.4, 5.75, 1.4, 0.7, 0.36, TRAFFIC.housePalette);
  hull.box(-5.5, 0, 6.49, 3.2, 4.4, 0.18, TRAFFIC.trimPalette);
  funnelStack(hull, 6.5, funnel, 2.0);

  // Alberi: quello di prua porta il fanale di via, quello di plancia il fanale
  // di testa. Non e' decorazione — sono le due verticali che tengono in scala
  // una sagoma altrimenti tutta orizzontale.
  hull.box(6.4, 0, 4.9, 0.26, 0.26, 2.6, TRAFFIC.trimPalette);
  hull.lamp(6.4, 0, 6.35, 0.3, 0.3, 0.3);
  hull.box(-4.7, 0, 7.2, 0.16, 0.16, 1.3, TRAFFIC.trimPalette);
  hull.lamp(-4.7, 0, 7.98, 0.26, 0.26, 0.26);
  hull.lamp(8.0, 0, deck + 0.3, 0.3, 0.3, 0.3);
  hull.lamp(-8.1, 0, deck + 0.3, 0.3, 0.3, 0.3);
}

/**
 * Aereo di linea: fusoliera rastremata, ala a freccia in quattro pannelli,
 * gondole sotto l'ala, coda con la deriva in tinta.
 *
 * **L'ala a freccia e' il pezzo che cambia tutto.** Un'ala a un solo pannello e'
 * una tavola messa di traverso, e a distanza legge come una croce; quattro
 * pannelli che arretrano e si accorciano danno una freccia e un rastremarsi, che
 * sono le due cose da cui si riconosce un aereo visto dall'alto — che e' poi
 * l'unico modo in cui questa camera lo vede.
 */
function planeShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.plane];

  // Fusoliera: corpo, tre conci di muso, cono di coda che si alza.
  hull.box(-0.5, 0, 1.05, 5.0, 1.5, 1.5, size.palette);
  hull.box(2.55, 0, 1.05, 1.1, 1.3, 1.3, size.palette);
  hull.box(3.45, 0, 1.05, 0.7, 1.0, 1.0, size.palette);
  hull.box(4.0, 0, 1.05, 0.4, 0.6, 0.6, size.palette);
  hull.box(-3.6, 0, 1.15, 1.2, 1.15, 1.15, size.palette);
  hull.box(-4.35, 0, 1.3, 0.3, 0.5, 0.5, size.palette);

  // Cupolino e fascia dei finestrini: sporgono di tre centesimi, cosi' la riga
  // dei vetri gira su tutti e due i fianchi con una scatola sola.
  hull.box(2.6, 0, 1.42, 1.0, 1.36, 0.4, TRAFFIC.cabinPalette);
  hull.box(-0.55, 0, 1.3, 4.7, 1.56, 0.28, TRAFFIC.cabinPalette);

  // Ala: quattro pannelli per lato, ognuno piu' corto, piu' sottile e piu'
  // arretrato del precedente; alle estremita' le alette.
  hull.pair(-0.55, 1.3, 0.72, 2.7, 1.6, 0.36, size.palette);
  hull.pair(-0.9, 2.55, 0.73, 2.2, 1.0, 0.32, size.palette);
  hull.pair(-1.25, 3.45, 0.74, 1.7, 0.85, 0.28, size.palette);
  hull.pair(-1.55, 4.1, 0.75, 1.2, 0.55, 0.24, size.palette);
  hull.pair(-1.65, 4.3, 1.1, 0.9, 0.22, 0.8, size.palette);
  hull.lampPair(-1.2, 4.3, 1.55, 0.24, 0.24, 0.24);

  // Motori: gondola scura appesa a un pilone, con l'anello chiaro della presa.
  hull.pair(0.1, 1.75, 0.15, 2.1, 0.85, 0.85, TRAFFIC.trimPalette);
  hull.pair(1.2, 1.75, 0.15, 0.25, 0.95, 0.95, TRAFFIC.housePalette);
  hull.pair(-0.4, 1.75, 0.66, 0.9, 0.4, 0.5, TRAFFIC.trimPalette);

  // Coda: deriva in due conci — il secondo in tinta di livrea — e piani
  // orizzontali con le loro estremita'.
  hull.box(-3.5, 0, 2.3, 1.5, 0.3, 1.2, size.palette);
  hull.box(-3.85, 0, 3.15, 0.95, 0.26, 0.85, TRAFFIC.cabinPalette);
  hull.pair(-3.75, 0.95, 1.72, 1.4, 1.4, 0.26, size.palette);
  hull.pair(-3.95, 1.85, 1.72, 0.95, 0.5, 0.22, size.palette);
}

/**
 * Dirigibile: involucro a sigaro in otto conci, pinne a croce e gondola.
 *
 * **La sagoma si legge dal ritmo dei conci, non dal loro numero.** Un involucro
 * di tre scatole era un fuso senza direzione — prua e poppa uguali, come un
 * pallone steso. Quattro conci che crescono verso il centro e tre che calano
 * verso la coda danno la rastremazione asimmetrica di un dirigibile vero: il
 * muso piu' lungo e pieno, la coda che si chiude in fretta sulle pinne. La
 * gondola esce dal ventre con una fascia vetrata, e i pattini la staccano dal
 * vuoto.
 */
function airshipShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.airship];
  const half = size.length / 2;
  const axis = size.height / 2 + 0.6;

  // Muso: quattro conci che crescono verso il corpo. Il primo e' il cono di prua,
  // e da lui in poi ogni concio e' piu' largo e piu' alto del precedente.
  hull.box(half - 0.3, 0, axis, 0.6, 0.8, 0.8, size.palette);
  hull.box(half - 1.1, 0, axis, 1.0, 2.0, 2.0, size.palette);
  hull.box(half - 2.1, 0, axis, 1.2, 3.2, 3.2, size.palette);
  hull.box(half - 3.3, 0, axis, 1.4, 4.2, 4.2, size.palette);
  // Corpo cilindrico centrale: la pancia piena del mezzo.
  hull.box(0, 0, axis, size.length * 0.5, size.width, size.height, size.palette);
  // Coda: tre conci che calano in fretta verso le pinne.
  hull.box(-half + 3.0, 0, axis, 2.0, 4.0, 4.0, size.palette);
  hull.box(-half + 1.6, 0, axis, 1.0, 3.0, 3.0, size.palette);
  hull.box(-half + 0.5, 0, axis, 0.5, 1.6, 1.6, size.palette);

  // Gondola: corpo, fascia vetrata e pattini. La fascia sporge appena, cosi' la
  // riga dei vetri gira sui due fianchi con una scatola sola.
  hull.box(0.6, 0, 0.4, 3.6, 1.8, 1.2, TRAFFIC.housePalette);
  hull.box(0.6, 0, 1.2, 3.7, 1.86, 0.5, TRAFFIC.cabinPalette);
  hull.pair(0.6, 0.7, 0.1, 3.0, 0.2, 0.3, TRAFFIC.trimPalette);

  // Pinne di coda: una croce di quattro in tinta di livrea. Restano spente — il
  // fanale e' un campo della scatola, non una deduzione dallo slot — ed e' il
  // motivo per cui il test del catalogo le tiene separate dai fanali veri.
  hull.box(-half + 0.8, 0, axis, 1.4, size.width * 1.4, 0.4, TRAFFIC.lightPalette);
  hull.box(-half + 0.8, 0, axis, 1.4, 0.4, size.height * 1.4, TRAFFIC.lightPalette);

  // Fanale di prua e di coda: le due luci di navigazione.
  hull.lamp(half - 0.3, 0, axis, 0.4, 0.4, 0.4);
  hull.lamp(-half + 0.5, 0, axis, 0.3, 0.3, 0.3);
}

/**
 * eVTOL: cabina rastremata, quattro bracci e quattro dischi con il mozzo.
 *
 * **E' l'opposto dell'aereo, e deve esserlo.** Quello ha la fusoliera lunga e
 * l'ala a freccia; questo e' piu' largo che lungo e da sopra — l'unico modo in
 * cui questa camera lo vede — e' un quadrato con quattro cerchi agli angoli. Se
 * si somigliassero, uno scalo in quota sembrerebbe un aeroporto piccolo invece
 * che un'altra cosa.
 *
 * **Il disco e' una lastra con un mozzo, non un cilindro.** Un cerchio pieno a
 * distanza isometrica legge come un coperchio; il mozzo scuro al centro e la
 * lastra sottile attorno sono cio' che dicono «rotore fermo». I pattini sotto la
 * cabina restano l'unica parte che dichiari che questo mezzo **si posa**.
 */
function evtolShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.evtol];

  // Cabina: corpo che si stringe verso il muso, cupolino vetrato, coda con la
  // deriva. La fascia dei vetri sporge per girare sui fianchi con una scatola sola.
  hull.box(0, 0, 1.0, 2.6, 1.6, 1.3, size.palette);
  hull.box(1.4, 0, 1.05, 0.7, 1.2, 1.0, size.palette);
  hull.box(0, 0, 1.35, 2.7, 1.7, 0.5, TRAFFIC.cabinPalette);
  hull.box(1.4, 0, 1.35, 0.8, 1.3, 0.55, TRAFFIC.cabinPalette);
  hull.box(-1.6, 0, 1.2, 0.9, 0.8, 0.8, size.palette);
  hull.box(-2.1, 0, 1.9, 0.26, 0.2, 1.0, TRAFFIC.cabinPalette);

  // Pattini: due travi e i quattro montanti che le tengono staccate dal ventre.
  hull.pair(0, 0.8, 0.14, 2.8, 0.22, 0.3, TRAFFIC.trimPalette);
  hull.pair(0.8, 0.8, 0.5, 0.2, 0.2, 0.5, TRAFFIC.trimPalette);
  hull.pair(-0.8, 0.8, 0.5, 0.2, 0.2, 0.5, TRAFFIC.trimPalette);

  // Bracci, gondole dei motori e dischi. Due bracci per lato (prua e poppa), e
  // in cima a ciascuno il disco con il mozzo: la lastra e' spessa un decimo di
  // voxel, che e' proprio lo spessore a cui un'elica ferma smette di sembrare un
  // cilindro.
  for (const along of [1.2, -1.2]) {
    hull.pair(along, 1.7, 1.4, 0.4, 2.2, 0.26, TRAFFIC.trimPalette);
    hull.pair(along, 2.6, 1.6, 0.7, 0.7, 0.42, TRAFFIC.housePalette);
    hull.pair(along, 2.6, 1.95, 1.9, 1.9, 0.1, TRAFFIC.deckPalette);
    hull.pair(along, 2.6, 2.02, 0.5, 0.5, 0.14, TRAFFIC.trimPalette);
  }
  hull.lamp(1.8, 0, 1.35, 0.3, 0.3, 0.22);
}

/**
 * Mongolfiera: cesto intrecciato, bruciatore e involucro a sette conci.
 *
 * **L'unica sagoma che sta quasi tutta sopra la propria origine.** Uno scafo
 * pende sotto il ponte; qui il volume e' in cima e l'origine e' il fondo del
 * cesto, cioe' il punto che si appoggia al pilone.
 *
 * I conci alternano due tinte, ed e' l'unico trucco che serve: uno spicchio di
 * pallone e' fatto di teli di colori diversi, e senza quell'alternanza sette
 * scatole concentriche leggono come una pigna invece che come un involucro. Il
 * cesto porta i montanti verticali — e' intrecciato, non imbullonato — e la
 * fiamma e' l'unica cosa accesa del mezzo.
 */
function balloonShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.balloon];

  // Cesto: corpo intrecciato, bordo e montanti d'angolo. E' la sola parte alla
  // scala di chi ci sta.
  hull.box(0, 0, 0.65, 1.6, 1.6, 1.3, TRAFFIC.deckPalette);
  hull.box(0, 0, 1.35, 1.8, 1.8, 0.18, TRAFFIC.trimPalette);
  for (const along of [0.7, -0.7]) {
    hull.pair(along, 0.7, 1.2, 0.14, 0.14, 0.9, TRAFFIC.trimPalette);
  }

  // Montanti e bruciatore: la fiamma e' l'unica cosa accesa del mezzo.
  hull.pair(0.65, 0.65, 1.95, 0.14, 0.14, 1.1, TRAFFIC.trimPalette);
  hull.pair(-0.65, 0.65, 1.95, 0.14, 0.14, 1.1, TRAFFIC.trimPalette);
  hull.box(0, 0, 2.9, 0.7, 0.7, 0.4, TRAFFIC.trimPalette);
  hull.lamp(0, 0, 3.3, 0.6, 0.6, 0.5);

  // Involucro: bocca stretta, pancia larga quanto l'ingombro, calotta e corona.
  hull.box(0, 0, 3.7, 2.2, 2.2, 0.9, size.palette);
  hull.box(0, 0, 4.6, 3.8, 3.8, 1.1, TRAFFIC.housePalette);
  hull.box(0, 0, 5.7, size.width, size.width, 1.3, size.palette);
  hull.box(0, 0, 7.0, 4.6, 4.6, 1.0, TRAFFIC.housePalette);
  hull.box(0, 0, 8.0, 2.6, 2.6, 0.7, size.palette);
  hull.box(0, 0, 8.6, 1.0, 1.0, 0.4, TRAFFIC.trimPalette);
}

/**
 * Cabina di funivia: la sola sagoma che pende invece di poggiare.
 *
 * **L'origine e' la pancia, non il pelo dell'acqua.** La rotta di una cabina e'
 * la fune scontata di `ROPEWAY.cabinDrop`, e quel drop e' l'altezza della
 * scatola piu' l'attacco: la cabina va quindi da `0` al proprio tetto e l'attacco
 * sale oltre, fino a stringere la fune. Se questa sagoma scendesse sotto lo
 * zero, la cabina passerebbe piu' in basso di quanto la fune e' stata alzata per
 * farla passare.
 *
 * Il tetto e' l'unico pezzo largo quanto l'ingombro dichiarato: la scatola
 * rientra, cosi' i quattro montanti d'angolo hanno un filo su cui stare e la
 * cabina legge come una gabbia vetrata invece che come un dado.
 */
function gondolaShape(hull: Hull): void {
  const size = TRAFFIC.hull[VEHICLE.gondola];
  const roof = size.height;

  hull.box(0, 0, roof / 2 + 0.05, 3.6, 2.6, roof - 0.1, size.palette);
  hull.box(0, 0, roof / 2 + 0.15, 3.66, 2.66, 0.9, TRAFFIC.cabinPalette);
  hull.box(0, 0, 0.09, 3.9, 2.9, 0.18, TRAFFIC.deckPalette);
  hull.box(0, 0, roof + 0.09, size.length, size.width, 0.22, TRAFFIC.housePalette);
  for (const along of [1.7, -1.7]) {
    hull.pair(along, 1.25, roof / 2 + 0.08, 0.2, 0.2, roof - 0.2, TRAFFIC.trimPalette);
  }

  // Attacco: il montante sale dal tetto e la morsa stringe la fune, che passa
  // esattamente a `gondolaHanger` sopra il tetto.
  const cable = roof + TRAFFIC.gondolaHanger;
  hull.box(0, 0, (roof + 0.2 + cable) / 2, 0.3, 0.3, cable - roof - 0.2, TRAFFIC.trimPalette);
  hull.box(0, 0, cable, 0.8, 0.5, 0.3, TRAFFIC.trimPalette);
}

/**
 * Fusto e cappello di una ciminiera.
 *
 * Prende posizione e quota della bocca da `TRAFFIC.funnel` invece di
 * dichiararne di proprie: e' l'unico modo di garantire che il fumo esca dal
 * fumaiolo e non da mezzo voxel sopra il cappello. Il fusto parte da `base` —
 * che il chiamante prende dentro il proprio tetto, cosi' non resta sospeso — e
 * il cappello chiude esattamente a `mouth`.
 */
function funnelStack(
  hull: Hull,
  base: number,
  funnel: VehicleFunnel,
  depth: number,
): void {
  const cap = 0.16;
  const top = funnel.mouth - cap;
  hull.box(funnel.along, 0, (base + top) / 2, funnel.width, depth, top - base, funnel.palette);
  hull.box(
    funnel.along,
    0,
    funnel.mouth - cap / 2,
    funnel.width * 1.2,
    depth * 1.14,
    cap,
    TRAFFIC.trimPalette,
  );
}

/** Le tinte dei container, a rotazione: l'indice non deve stare nel chiamante. */
function crate(index: number): number {
  return TRAFFIC.cratePalettes[index % TRAFFIC.cratePalettes.length];
}

const SHAPES: Readonly<Record<VehicleKind, (hull: Hull) => void>> = {
  [VEHICLE.boat]: boatShape,
  [VEHICLE.yacht]: yachtShape,
  [VEHICLE.ferry]: ferryShape,
  [VEHICLE.cargo]: cargoShape,
  [VEHICLE.plane]: planeShape,
  [VEHICLE.airship]: airshipShape,
  [VEHICLE.evtol]: evtolShape,
  [VEHICLE.balloon]: balloonShape,
  [VEHICLE.gondola]: gondolaShape,
};
