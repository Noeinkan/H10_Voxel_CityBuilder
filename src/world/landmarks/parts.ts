import { FACING, type Facing } from '../streets/streetGrid';
import { inPlan, onPlanEdge } from '../planMask';
import type { SurfaceKind } from '../visualBlock';
import { put, type LandmarkCanvas } from './canvas';
import {
  drawArch,
  drawButtress,
  drawDome,
  drawSpire,
  drawTracery,
} from './ornaments';

export { createCanvas, type LandmarkCanvas } from './canvas';

/**
 * Il vocabolario con cui si descrive un landmark.
 *
 * **Dieci primitive, non dieci generatori.** Un porto e un monumento non hanno
 * niente in comune come immagine, ma sono la stessa scatola, lo stesso prisma
 * verticale e la stessa fila di pilastri composti in modo diverso. Tenere
 * piccolo il vocabolario e' cio' che rende una ricetta una riga di tabella
 * invece di una funzione: `config.ts` elenca parti, questo file sa disegnarle,
 * e nessuno dei due sa cosa sia un porto.
 *
 * **Tre di loro escono dal prisma, e sono le tre che si vedono.** Sette
 * primitive su dieci sono un prisma con una maschera simmetrica, e a distanza
 * isometrica un prisma resta un prisma qualunque colore abbia. Lo scafo
 * rastremato dichiara «barca» prima di qualunque palette; il traliccio ha aria
 * dentro, ed e' l'aria a dire «struttura»; la falda e' l'unica sommita' non
 * piatta del vocabolario, e finche' non c'era, otto ruoli finivano tutti su un
 * piano orizzontale a quote diverse.
 *
 * **Lo smusso e' un campo, non un'undicesima voce.** `Part.chamfer` taglia gli
 * angoli della pianta di quasi tutte le primitive: una scatola smussata e' un
 * tamburo, una scatola cava smussata un anello ottagonale, una piramide a
 * gradoni smussata una cupola. Tre forme nuove per un campo invece che per tre
 * voci, ed e' l'unico modo che questo dominio ha di uscire dall'angolo retto
 * senza imparare a disegnare un cerchio.
 *
 * **Una parte e' un dato, non una chiamata.** E' la differenza che permette a un
 * test di misurare l'ingombro di una ricetta senza disegnarla, e a
 * `generateLandmark` di ruotare una ricetta intera trasformando dei numeri
 * invece di ridisegnare. Il modello e' `BAND_OP` in `buildings/config.ts`: la
 * grammatica sta in tabella, il codice la interpreta.
 */

export const PART = {
  /** Scatola piena: banchine, basamenti, container, casseri. */
  slab: 0,
  /** Scatola cava in pianta — solo il perimetro: capannoni, quadrilateri. */
  shell: 1,
  /** Prisma verticale: ciminiere, guglie, gambe di gru, torri di controllo. */
  mast: 2,
  /** Prisma orizzontale: bracci di gru, impalcati, architravi. */
  boom: 3,
  /** Pilastri a passo regolare, con architrave in cima: portici e peristili. */
  colonnade: 4,
  /** Piramide a gradoni: zoccoli monumentali, scalinate, terrazzamenti. */
  steps: 5,
  /** Piano spesso un voxel: tetti, grembiuli, piste. */
  deck: 6,
  /** Scafo rastremato ai due capi: barche ormeggiate, pontoni, chiatte. */
  hull: 7,
  /** Traliccio: montanti agli spigoli e correnti a passo regolare, vuoto in mezzo. */
  truss: 8,
  /** Falda a due spioventi lungo l'asse maggiore: tetti a capanna, pensiline. */
  pitch: 9,

  // Le cinque ornate. Disegnate in `ornaments.ts`, per la ragione scritta li':
  // non aggiungono un mestiere, aggiungono ornamento, e chi legge il vocabolario
  // minimo non deve scorrerle.

  /** Muro con un'apertura arcuata passante: portali, archi di trionfo, porte urbiche. */
  arch: 10,
  /** Cupola a profilo convesso, con oculo facoltativo: musei, rotonde, tiburi. */
  dome: 11,
  /** Due contrafforti rampanti che si appoggiano al centro: navate, absidi. */
  buttress: 12,
  /** Guglia rastremata fino alla punta, con collarini: campanili, obelischi, pinnacoli. */
  spire: 13,
  /** Parete traforata a montanti e traversi: rosoni, gradinate, fusti gotici. */
  tracery: 14,
} as const;

export type PartKind = (typeof PART)[keyof typeof PART];

/**
 * Una parte di landmark, nell'orientamento canonico.
 *
 * Il canonico e' **fronte a est**: l'asse lungo corre lungo `x` e cio' che la
 * struttura guarda — l'acqua per il porto, la strada per gli altri — sta a `x`
 * crescente. `orientPart` porta la ricetta sul verso vero; l'autore della
 * ricetta non deve pensarci.
 */
export interface Part {
  readonly kind: PartKind;
  /** Angolo minimo del riquadro in pianta, in voxel dallo spigolo dello stamp. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Quota di base, in voxel dal piano finito dello stamp. */
  readonly z: number;
  readonly height: number;
  readonly palette: number;
  readonly surface: SurfaceKind;
  /**
   * `colonnade`: passo dei pilastri. `steps`: rientranza di ogni gradone.
   * `hull`: colonne di rastremazione a ciascun capo. `truss`: passo dei
   * correnti. `pitch`: quanto sale la falda per ogni colonna verso il colmo.
   * `arch`: semiluce dell'apertura. `dome`: raggio dell'oculo, in unita'
   * doppie. `buttress`: larghezza del piedritto. `spire`: passo dei collarini.
   * `tracery`: passo di montanti e traversi. Ignorato dalle altre.
   */
  readonly step?: number;

  /**
   * Angoli tagliati in pianta, in voxel di lato.
   *
   * Non e' una primitiva ma un **modificatore della pianta**, e per questo vale
   * su quasi tutte: una scatola smussata e' un tamburo, una scatola cava
   * smussata e' un anello ottagonale, una piramide a gradoni smussata e' una
   * cupola. Tre forme nuove per un campo invece che per tre voci di vocabolario,
   * ed e' l'unico modo che questo dominio ha di uscire dall'angolo retto senza
   * imparare a disegnare un cerchio.
   *
   * Il taglio e' la diagonale di Manhattan: cade la cella la cui somma delle
   * distanze dai due bordi piu' vicini sta sotto la soglia. Resta simmetrica
   * allo scambio degli assi, che e' la condizione perche' `orientPart` possa
   * ruotare la parte senza cambiarne il conto di voxel.
   */
  readonly chamfer?: number;
  /**
   * Colore dell'ultimo voxel in quota: cornice, coronamento, cappello di un
   * silo, architrave di un portico.
   *
   * E' la stessa idea di `bodyAlt` negli edifici, e serve alla stessa cosa: una
   * riga chiara in cima da' la scala al volume, e a distanza di gioco e' spesso
   * l'unica cosa che distingua un prisma progettato da un blocco.
   */
  readonly cap?: number;

  /**
   * Cornici marcapiano: una fascia sporgente ogni `step` quote.
   *
   * **E' un campo e non una primitiva, per la ragione dello smusso.** `cap` da'
   * la scala a un volume una volta sola, in cima; questo gliela da' per tutta
   * l'altezza, ed e' la differenza fra una ciminiera e un campanile disegnati
   * con la stessa scatola. Sui volumi alti — e questo dominio ne avra' molti —
   * e' l'ornamento che rende di piu' per riga scritta, ed e' il vocabolario che
   * l'art deco ha ricavato dalla stessa costrizione: se il volume deve salire,
   * gli si da' un ritmo orizzontale.
   *
   * **La cornice e' il riquadro dichiarato, e il corpo rientra.** Farla sporgere
   * *oltre* `w` e `h` renderebbe `partBounds` una bugia, e il test che verifica
   * che una ricetta stia nel proprio `span` smetterebbe di misurare qualcosa.
   * Cosi' invece l'ingombro resta quello scritto e a rientrare e' il pieno fra
   * una cornice e l'altra — che dall'esterno e' la stessa immagine.
   *
   * Vale sui prismi (`slab`, `shell`, `mast`, `boom`, `deck`); le altre voci lo
   * ignorano. `depth` oltre meta' del lato piu' corto viene troncato: sotto
   * quella soglia il corpo si chiuderebbe e resterebbero le sole cornici a
   * mezz'aria.
   */
  readonly cornice?: { readonly step: number; readonly depth: number };
}

/**
 * Una parte scritta come una frase invece che come nove numeri.
 *
 * Non e' un'astrazione: e' un nome per ciascun argomento posizionale. Sta qui e
 * non nella tabella che la usa perche' le tabelle sono ormai due — i landmark e
 * le arcologie — e la seconda copia avrebbe cominciato a divergere sull'ordine
 * degli argomenti, che e' l'unica cosa che questa funzione ha da sbagliare.
 */
export function box(
  kind: Part['kind'],
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  height: number,
  palette: number,
  surface: Part['surface'],
  extra: Partial<Pick<Part, 'step' | 'cap' | 'chamfer' | 'cornice'>> = {},
): Part {
  return { kind, x, y, w, h, z, height, palette, surface, ...extra };
}

/** Riquadro occupato in pianta e in quota, per misurare senza disegnare. */
export interface PartBounds {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
}

/** Estremi **inclusi** di una parte. Non disegna niente. */
export function partBounds(part: Part): PartBounds {
  return {
    x0: part.x,
    y0: part.y,
    z0: part.z,
    x1: part.x + part.w - 1,
    y1: part.y + part.h - 1,
    z1: part.z + part.height - 1,
  };
}

/**
 * La stessa parte vista da un altro verso, dentro un riquadro `span`.
 *
 * `span` e' la coppia `[lungo, corto]` della ricetta, cioe' l'ingombro
 * canonico: la rotazione di 90 gradi scambia i due assi, e lo stamp che ne esce
 * e' largo `short` e profondo `long`. E' per questo che `VoxelStamp` tiene
 * `sizeX` e `sizeY` separati, e che `generateBuilding` — che invece impone il
 * quadrato — non poteva servire qui.
 */
export function orientPart(part: Part, facing: Facing, long: number, short: number): Part {
  switch (facing) {
    case FACING.east:
      return part;
    case FACING.west:
      // Mezzo giro: il fronte passa da `x` massimo a `x` minimo.
      return { ...part, x: long - part.x - part.w, y: short - part.y - part.h };
    case FACING.north:
      // Un quarto di giro antiorario: `x` canonico diventa `y` del mondo.
      return { ...part, x: part.y, y: part.x, w: part.h, h: part.w };
    default:
      return {
        ...part,
        x: short - part.y - part.h,
        y: long - part.x - part.w,
        w: part.h,
        h: part.w,
      };
  }
}

/** Ingombro dello stamp per un verso: la rotazione di 90 gradi scambia gli assi. */
export function orientedSpan(facing: Facing, long: number, short: number): {
  sizeX: number;
  sizeY: number;
} {
  return facing === FACING.east || facing === FACING.west
    ? { sizeX: long, sizeY: short }
    : { sizeX: short, sizeY: long };
}

/**
 * Disegna una parte gia' orientata.
 *
 * Cio' che cade fuori dalla tela viene **scartato in silenzio**, e non e' una
 * comodita': una ricetta che sfora e' un errore d'autore, e il posto dove si
 * scopre e' il test che confronta `partBounds` con lo `span` dichiarato. Qui
 * scartare e' solo cio' che tiene la scrittura dentro il buffer.
 */
export function drawPart(canvas: LandmarkCanvas, part: Part): void {
  switch (part.kind) {
    case PART.shell:
      return drawPrism(canvas, part, true);
    case PART.colonnade:
      return drawColonnade(canvas, part);
    case PART.steps:
      return drawSteps(canvas, part);
    case PART.hull:
      return drawHull(canvas, part);
    case PART.truss:
      return drawTruss(canvas, part);
    case PART.pitch:
      return drawPitch(canvas, part);
    case PART.arch:
      return drawArch(canvas, part);
    case PART.dome:
      return drawDome(canvas, part);
    case PART.buttress:
      return drawButtress(canvas, part);
    case PART.spire:
      return drawSpire(canvas, part);
    case PART.tracery:
      return drawTracery(canvas, part);
    default:
      // `slab`, `mast`, `boom` e `deck` sono lo stesso prisma pieno: a
      // distinguerli sono le proporzioni che la ricetta gli da', non il codice
      // che li disegna. Tenerli come voci separate serve a chi legge la
      // ricetta, che vede «ciminiera» e non «scatola 2x2x16».
      return drawPrism(canvas, part, false);
  }
}

/** Prisma pieno o cavo, sulla pianta che lo smusso ha lasciato. */
function drawPrism(canvas: LandmarkCanvas, part: Part, hollow: boolean): void {
  const chamfer = part.chamfer ?? 0;
  const top = part.z + part.height - 1;
  // La cornice e' il riquadro dichiarato: a rientrare e' il pieno fra una fascia
  // e l'altra. Il troncamento tiene il corpo largo almeno un voxel — sotto,
  // resterebbero le sole cornici a mezz'aria.
  const cornice = part.cornice;
  const recess = cornice === undefined
    ? 0
    : Math.max(0, Math.min(cornice.depth, Math.floor((Math.min(part.w, part.h) - 1) / 2)));
  const pitch = Math.max(2, cornice?.step ?? 2);

  for (let z = part.z; z <= top; z++) {
    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    // Fascia sporgente alla base, in cima e a ogni passo: senza quella in cima
    // il volume finirebbe con il corpo rientrato, che legge come un troncamento.
    const band = recess === 0 || (z - part.z) % pitch === 0 || z === top;
    const inset = band ? 0 : recess;
    const w = part.w - inset * 2;
    const h = part.h - inset * 2;

    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        const keep = hollow
          ? onPlanEdge(lx, ly, w, h, chamfer)
          : inPlan(lx, ly, w, h, chamfer);
        if (!keep) continue;
        put(canvas, part.x + inset + lx, part.y + inset + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * Pilastri a passo `step` sul perimetro, con l'architrave in cima.
 *
 * E' l'unica primitiva che produce vuoto *sotto* un pieno, ed e' il motivo per
 * cui esiste: il mercato, il portico universitario e il peristilio del
 * monumento si leggono da lontano proprio per quel vuoto, che nessuna scatola
 * cava sa dare.
 */
function drawColonnade(canvas: LandmarkCanvas, part: Part): void {
  const step = Math.max(2, part.step ?? 2);
  const chamfer = part.chamfer ?? 0;
  const top = part.z + part.height - 1;

  for (let ly = 0; ly < part.h; ly++) {
    for (let lx = 0; lx < part.w; lx++) {
      if (!onPlanEdge(lx, ly, part.w, part.h, chamfer)) continue;
      // L'architrave corre su tutto il perimetro; i pilastri solo sul passo.
      const pillar = onPillarPitch(lx, part.w, step) && onPillarPitch(ly, part.h, step);
      const from = pillar ? part.z : top;
      for (let z = from; z <= top; z++) {
        const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
        put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * true se il pilastro cade su questa colonna, contando dall'estremo piu' vicino.
 *
 * Contare da un capo solo — `v % step` — sembra la stessa cosa e non lo e': un
 * lato che non e' un multiplo del passo si ritrova i pilastri su un bordo e
 * l'architrave nudo sull'altro, e la ricetta smette di essere invariante per
 * rotazione. Dove due parti si sovrappongono quell'asimmetria si vede come un
 * conto di voxel diverso a seconda del verso, ed e' cosi' che e' saltata fuori.
 */
function onPillarPitch(v: number, size: number, step: number): boolean {
  return Math.min(v, size - 1 - v) % step === 0;
}

/**
 * Piramide a gradoni: ogni quota rientra di `step` per lato rispetto a quella
 * sotto, e non scende mai sotto un voxel di lato.
 */
function drawSteps(canvas: LandmarkCanvas, part: Part): void {
  const step = Math.max(1, part.step ?? 1);
  const chamfer = part.chamfer ?? 0;
  const top = part.z + part.height - 1;

  for (let z = part.z; z <= top; z++) {
    const inset = (z - part.z) * step;
    const w = part.w - inset * 2;
    const h = part.h - inset * 2;
    if (w < 1 || h < 1) return;

    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        // Lo smusso si misura sul gradone corrente, non sulla base: e' cosi' che
        // una piramide smussata sale come una cupola invece che come un tronco
        // di piramide con un solo taglio in fondo.
        if (!inPlan(lx, ly, w, h, chamfer)) continue;
        put(canvas, part.x + inset + lx, part.y + inset + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * Traliccio: montanti agli spigoli e correnti orizzontali a passo `step`.
 *
 * E' la primitiva che mancava alle cose che *reggono* invece di chiudere. Una
 * gamba di gru, un pilone radio, una torre di servizio disegnati come `mast`
 * sono prismi pieni, e a distanza isometrica un prisma pieno alto venti voxel
 * legge come un muro stretto: il traliccio ha aria dentro, e l'aria e' cio' che
 * dice «struttura» prima di qualunque colore.
 *
 * I montanti sono i quattro spigoli e salgono sempre; il resto del perimetro
 * compare solo sui correnti. Il corrente in cima c'e' comunque, altrimenti la
 * parte finirebbe su quattro punte staccate invece che su un telaio chiuso.
 */
function drawTruss(canvas: LandmarkCanvas, part: Part): void {
  const step = Math.max(2, part.step ?? 2);
  const chamfer = part.chamfer ?? 0;
  const top = part.z + part.height - 1;

  for (let z = part.z; z <= top; z++) {
    const course = (z - part.z) % step === 0 || z === top;
    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    for (let ly = 0; ly < part.h; ly++) {
      for (let lx = 0; lx < part.w; lx++) {
        if (!onPlanEdge(lx, ly, part.w, part.h, chamfer)) continue;
        // Il montante e' la cella che sta sul bordo in **tutte e due** le
        // direzioni: e' la definizione di spigolo che sopravvive allo smusso,
        // dove «lx === 0 e ly === 0» non descrive piu' un angolo.
        const post = !inPlan(lx - 1, ly, part.w, part.h, chamfer) ||
          !inPlan(lx + 1, ly, part.w, part.h, chamfer);
        const beam = !inPlan(lx, ly - 1, part.w, part.h, chamfer) ||
          !inPlan(lx, ly + 1, part.w, part.h, chamfer);
        if (!(post && beam) && !course) continue;
        put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * Falda a due spioventi: il colmo corre lungo l'asse maggiore.
 *
 * **Segue l'asse lungo, non `x`**, per la stessa ragione dello scafo: una falda
 * fissata su `lx` ruotata di un quarto di giro cambierebbe forma e conteggio, e
 * il test del catalogo misura proprio quel conteggio su ogni verso.
 *
 * E' l'unica primitiva che non ha una sommita' piatta, ed e' per questo che
 * esiste: fino a qui ogni landmark finiva su un piano orizzontale, e otto tetti
 * piatti a quote diverse restano otto tetti piatti. `cap` qui non colora
 * l'ultima quota ma la **linea di colmo**, che e' l'unico posto in cui una falda
 * ha davvero un coronamento.
 */
function drawPitch(canvas: LandmarkCanvas, part: Part): void {
  const alongX = part.w >= part.h;
  const short = alongX ? part.h : part.w;
  const rise = Math.max(1, part.step ?? 1);
  const ridge = Math.min(part.height, 1 + Math.floor((short - 1) / 2) * rise);

  for (let ly = 0; ly < part.h; ly++) {
    for (let lx = 0; lx < part.w; lx++) {
      const across = alongX ? ly : lx;
      const fromEaves = Math.min(across, short - 1 - across);
      const columnTop = Math.min(part.height, 1 + fromEaves * rise);
      for (let dz = 0; dz < columnTop; dz++) {
        const crown = dz === columnTop - 1 && columnTop === ridge && part.cap !== undefined;
        put(
          canvas,
          part.x + lx,
          part.y + ly,
          part.z + dz,
          crown ? part.cap! : part.palette,
          part.surface,
        );
      }
    }
  }
}

/**
 * Scafo: prisma rastremato ai due capi dell'asse lungo.
 *
 * **La rastremazione segue l'asse lungo, non `x`.** Le altre sette maschere sono
 * simmetriche allo scambio degli assi, quindi `orientPart` puo' ruotarle
 * scambiando `w` e `h` senza che il codice se ne accorga. Una prua fissata su
 * `lx` no: ruotata di un quarto di giro finirebbe sul lato corto e la barca
 * cambierebbe forma — e conteggio — a seconda del verso. Guardare quale dei due
 * lati e' il maggiore e' cio' che tiene lo scafo invariante per rotazione, che
 * e' esattamente quello che il test del catalogo misura su ogni ricetta.
 *
 * **Rastremata a tutti e due i capi**, e non solo a prua. Serve alla stessa
 * invarianza — il mezzo giro specchia gli assi — ma prima ancora e' la forma
 * giusta: un traghetto e' a doppia estremita' perche' attracca dai due lati
 * senza girarsi, ed e' proprio la barca che questo porto ospita.
 *
 * La chiglia non si chiude mai: `maxInset` la tiene larga almeno un voxel, cosi'
 * una ricetta con un `step` generoso ottiene una punta e non un buco.
 */
function drawHull(canvas: LandmarkCanvas, part: Part): void {
  const alongX = part.w >= part.h;
  const long = alongX ? part.w : part.h;
  const short = alongX ? part.h : part.w;
  const taper = Math.max(1, part.step ?? 1);
  const maxInset = Math.floor((short - 1) / 2);
  const top = part.z + part.height - 1;

  for (let z = part.z; z <= top; z++) {
    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    for (let ly = 0; ly < part.h; ly++) {
      for (let lx = 0; lx < part.w; lx++) {
        const alongPos = alongX ? lx : ly;
        const acrossPos = alongX ? ly : lx;
        const fromEnd = Math.min(alongPos, long - 1 - alongPos);
        const inset = Math.min(maxInset, Math.max(0, taper - fromEnd));
        if (acrossPos < inset || acrossPos >= short - inset) continue;
        put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
      }
    }
  }
}
