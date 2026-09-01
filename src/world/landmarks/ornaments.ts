import { inPlan, onPlanEdge } from '../planMask';
import { put, type LandmarkCanvas } from './canvas';
import type { Part } from './parts';

/**
 * Le cinque primitive ornate.
 *
 * **Perche' un file a parte.** Le dieci di `parts.ts` sono il vocabolario
 * minimo con cui si dice *cosa fa* una struttura — una banchina, una ciminiera,
 * un braccio di gru — e sette su dieci sono un prisma con una maschera
 * simmetrica. Queste cinque non aggiungono mestieri: aggiungono **ornamento**,
 * cioe' la sola cosa che distingua un monumento da un volume alto. Tenerle
 * insieme e' quello che permette di leggere il vocabolario minimo senza
 * scorrerle, e di aggiungerne una sesta senza far crescere il file che tutti
 * aprono.
 *
 * **La regola che le tiene tutte.** Ogni maschera dipende dalla posizione solo
 * attraverso una funzione **simmetrica** — la distanza dal capo piu' vicino, o
 * la distanza dal centro — e mai da `lx` contro `ly`. E' la stessa disciplina di
 * `hull` e `pitch`, e serve alla stessa cosa: `orientPart` ruota una parte
 * scambiando `w` e `h` senza ridisegnarla, quindi una maschera asimmetrica
 * cambierebbe il conto di voxel a seconda del verso — che e' esattamente cio'
 * che il test del catalogo misura su ogni ricetta e su ogni verso.
 *
 * Nessuna di loro tocca il mesher, e nessuna introduce uno slot di palette o un
 * tipo di superficie: l'ornamento fine continua ad arrivare da
 * `engine/mesher/microGeometry.ts` attraverso il `SURFACE_KIND` che la parte
 * dichiara (invarianti 4, 5 e 6).
 */

/**
 * Portale passante: un muro con un'apertura arcuata che lo attraversa.
 *
 * **E' la primitiva che rende ammissibile un landmark grosso.** Il passo della
 * maglia stradale e' venti voxel: sopra i ventotto una struttura attraversa una
 * carreggiata, e senza un passaggio quello che resta non e' un monumento ma un
 * muro in mezzo a un isolato. L'arco e' il modo in cui l'architettura ha sempre
 * risolto lo stesso problema, e qui e' anche l'unico vuoto **orizzontale** del
 * vocabolario: `colonnade` da' aria sotto un pieno, questo la da' *attraverso*.
 *
 * L'apertura corre lungo l'asse **corto** — si passa attraverso lo spessore — ed
 * e' centrata sull'asse lungo. `step` e' la semiluce in celle: `1` apre tre
 * colonne, `2` ne apre cinque. L'archivolto scende a gradoni verso i piedritti,
 * cosi' il vuoto ha una testa arcuata invece di essere una finestra quadrata.
 */
export function drawArch(canvas: LandmarkCanvas, part: Part): void {
  const alongX = part.w >= part.h;
  const long = alongX ? part.w : part.h;
  const chamfer = part.chamfer ?? 0;
  const top = part.z + part.height - 1;
  // La semiluce in unita' **doppie**, come la distanza dal centro qui sotto: e'
  // l'unico modo di centrare un'apertura su un lato pari senza usare mezze
  // colonne, e senza mezze colonne la maschera resta simmetrica al mezzo giro.
  const opening = 2 * Math.max(1, part.step ?? 1);

  for (let z = part.z; z <= top; z++) {
    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    for (let ly = 0; ly < part.h; ly++) {
      for (let lx = 0; lx < part.w; lx++) {
        if (!inPlan(lx, ly, part.w, part.h, chamfer)) continue;

        // Distanza dal centro dell'asse lungo, raddoppiata: e' pari su un lato
        // dispari e dispari su uno pari, e in tutti e due i casi e' la stessa a
        // sinistra e a destra. E' la simmetria da cui dipende tutto il resto.
        const along = alongX ? lx : ly;
        const fromMiddle = Math.abs(2 * along - (long - 1));
        // L'archivolto: la testa del vuoto scende di una quota ogni due colonne
        // di allontanamento dalla chiave, e l'ultima quota resta piena — un arco
        // senza il proprio concio di chiave sarebbe una breccia.
        const head = part.height - 1 - (fromMiddle >> 1);
        const hollow = fromMiddle <= opening && z - part.z < head;
        if (hollow) continue;

        put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * Cupola su tamburo: profilo **convesso**, non a gradoni.
 *
 * `steps` con lo smusso da' una piramide tagliata agli angoli, e il commento di
 * `parts.ts` lo ammetteva gia' — «la cosa piu' vicina a una cupola che questo
 * vocabolario sappia dire». La differenza sta nel profilo: quello del gradone e'
 * **lineare** e si legge come un tronco di piramide, questo segue un quarto di
 * cerchio e si legge come una calotta. A distanza di gioco e' la sola cosa che
 * separi il museo dal municipio di un city builder qualunque.
 *
 * `step`, quando c'e', e' il raggio dell'**oculo** in unita' doppie: il foro in
 * cima da cui una cupola vera prende luce.
 */
export function drawDome(canvas: LandmarkCanvas, part: Part): void {
  const top = part.z + part.height - 1;
  const spanX = Math.max(1, part.w - 1);
  const spanY = Math.max(1, part.h - 1);
  const oculus = 2 * (part.step ?? 0);

  for (let z = part.z; z <= top; z++) {
    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    // Il raggio a questa quota, come frazione di quello di base: e' il seno del
    // quarto di cerchio, cioe' cio' che rende il profilo convesso invece che
    // rettilineo. Alla base vale 1, in cima 0.
    const t = part.height <= 1 ? 0 : (z - part.z) / (part.height - 1);
    const shrink = Math.sqrt(Math.max(0, 1 - t * t));

    for (let ly = 0; ly < part.h; ly++) {
      for (let lx = 0; lx < part.w; lx++) {
        const dx = Math.abs(2 * lx - (part.w - 1)) / spanX;
        const dy = Math.abs(2 * ly - (part.h - 1)) / spanY;
        if (dx * dx + dy * dy > shrink * shrink) continue;
        // L'oculo si apre solo sull'ultima quota: piu' in basso sarebbe un pozzo
        // dentro il pieno, che dall'esterno non si vede e costa voxel.
        if (z === top && oculus > 0) {
          const ox = Math.abs(2 * lx - (part.w - 1));
          const oy = Math.abs(2 * ly - (part.h - 1));
          if (ox <= oculus && oy <= oculus) continue;
        }
        put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * Contrafforti rampanti: due piedritti e gli archi che si appoggiano al centro.
 *
 * **Sono due e non uno, e non e' una scelta di gusto.** `orientPart` ruota una
 * parte spostandone il riquadro, non ridisegnandola: una forma con il piedritto
 * a un capo solo, mezza girata, si ritroverebbe il piedritto dal lato sbagliato
 * della navata. Due piedritti simmetrici che si appoggiano al centro sono la
 * stessa immagine — la navata stretta fra i suoi contrafforti — e sono
 * invarianti per costruzione.
 *
 * `step` e' la larghezza del piedritto in colonne. Il rampante e' spesso due
 * quote e sale dal piedritto verso il centro: e' la pendenza a dire «scarica il
 * peso» dove una fascia orizzontale direbbe solo «ballatoio».
 */
export function drawButtress(canvas: LandmarkCanvas, part: Part): void {
  const alongX = part.w >= part.h;
  const long = alongX ? part.w : part.h;
  const chamfer = part.chamfer ?? 0;
  const top = part.z + part.height - 1;
  const pier = Math.max(1, part.step ?? 1);
  // Da dove nasce il rampante: meta' del piedritto. Piu' in alto l'arco sarebbe
  // una cornice, piu' in basso passerebbe sotto la gronda della navata.
  const spring = part.z + (part.height >> 1);
  // Le colonne che l'arco percorre dal piedritto alla parete. Il `+ 1` non e'
  // una svista: e' la colonna centrale, dove il rampante *arriva*. Senza,
  // l'arco tocca la cima una colonna prima e l'ultimo tratto e' orizzontale.
  const reach = Math.max(1, ((long - 1) >> 1) - pier + 1);

  for (let ly = 0; ly < part.h; ly++) {
    for (let lx = 0; lx < part.w; lx++) {
      if (!inPlan(lx, ly, part.w, part.h, chamfer)) continue;
      const along = alongX ? lx : ly;
      const fromEnd = Math.min(along, long - 1 - along);

      if (fromEnd < pier) {
        for (let z = part.z; z <= top; z++) {
          const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
          put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
        }
        continue;
      }

      // La quota a cui l'arco arriva in questa colonna: dal piedritto sale fino
      // alla cima nel punto in cui incontra la parete, cioe' il centro.
      const climb = Math.min(1, (fromEnd - pier + 1) / reach);
      const crest = Math.min(top, spring + Math.round(climb * (top - spring)));
      for (let z = Math.max(part.z, crest - 1); z <= crest; z++) {
        put(canvas, part.x + lx, part.y + ly, z, part.palette, part.surface);
      }
    }
  }
}

/**
 * Guglia: rastremazione **continua** fino alla punta, con collarini.
 *
 * Oggi una guglia e' `mast` piu' `steps`, cioe' un prisma e due gradoni: due
 * scalini, non una punta. Qui la rientranza e' una frazione dell'altezza, quindi
 * la stessa parte da' una punta aguzza su venti quote e un cono tozzo su sei
 * senza che la ricetta debba tarare niente.
 *
 * `step`, quando c'e', e' il passo dei **collarini**: una quota ogni `step`
 * sporge di un voxel per lato, ed e' il davanzale su cui una guglia vera
 * appoggia i propri pinnacoli. Sono loro a dare la scala alla verticale —
 * senza, un cono alto trenta voxel e uno alto quindici hanno la stessa
 * immagine. Sporgere di **uno** e non «tenere la pianta di sotto» e' quello che
 * li rende visibili a qualunque altezza: con una rastremazione dolce due quote
 * vicine hanno spesso la stessa pianta, e un collarino che la copiasse non si
 * vedrebbe.
 */
export function drawSpire(canvas: LandmarkCanvas, part: Part): void {
  const top = part.z + part.height - 1;
  const chamfer = part.chamfer ?? 0;
  const collar = Math.max(0, part.step ?? 0);
  // Fin dove si puo' rientrare prima che la pianta si chiuda: la punta e' un
  // voxel, mai un buco.
  const maxInset = Math.floor((Math.min(part.w, part.h) - 1) / 2);

  for (let z = part.z; z <= top; z++) {
    const t = part.height <= 1 ? 1 : (z - part.z) / (part.height - 1);
    let inset = Math.round(t * maxInset);
    // Il collarino sporge di un voxel per lato: e' una sporgenza per
    // sottrazione, e non costa un secondo elemento.
    if (collar > 0 && z > part.z && z < top && (z - part.z) % collar === 0) {
      inset = Math.max(0, inset - 1);
    }

    const w = part.w - inset * 2;
    const h = part.h - inset * 2;
    if (w < 1 || h < 1) continue;

    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;
    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        if (!inPlan(lx, ly, w, h, chamfer)) continue;
        put(canvas, part.x + inset + lx, part.y + inset + ly, z, palette, part.surface);
      }
    }
  }
}

/**
 * Traforo: una parete di soli montanti e traversi, con il vuoto in mezzo.
 *
 * **Non e' il traliccio.** `truss` tiene i quattro spigoli e i correnti, quindi
 * legge come un'impalcatura: struttura nuda, ferro. Qui i montanti stanno su
 * **tutto** il perimetro a passo regolare e i traversi li legano, e quello che
 * ne esce e' una parete lavorata — il rosone, la gradinata di uno stadio, il
 * fusto traforato di una guglia gotica. La differenza si vede: uno ha aria
 * dentro, l'altra ha aria *nel muro*.
 *
 * `step` e' il passo, in colonne e in quote insieme: e' quello che la fa leggere
 * come un disegno regolare invece che come un muro rotto.
 */
export function drawTracery(canvas: LandmarkCanvas, part: Part): void {
  const step = Math.max(2, part.step ?? 2);
  const chamfer = part.chamfer ?? 0;
  const top = part.z + part.height - 1;

  for (let z = part.z; z <= top; z++) {
    // Il traverso: la prima quota, l'ultima e una ogni `step`. Senza quello in
    // cima la parete finirebbe su una fila di punte staccate.
    const course = (z - part.z) % step === 0 || z === top;
    const palette = z === top && part.cap !== undefined ? part.cap : part.palette;

    for (let ly = 0; ly < part.h; ly++) {
      for (let lx = 0; lx < part.w; lx++) {
        if (!onPlanEdge(lx, ly, part.w, part.h, chamfer)) continue;

        // **Il passo si conta lungo la parete a cui la cella appartiene**, non
        // sui due assi insieme. Chiedere «o l'una o l'altra» sembra lo stesso e
        // non lo e': ogni cella del lato nord ha `ly` sul bordo, quindi
        // passerebbe sempre, e il traforo tornerebbe una scatola cava — misurato
        // esatto, 440 voxel contro 440. Le due maschere di parete sono le stesse
        // di `drawTruss`, e sopravvivono allo smusso.
        const wallX = !inPlan(lx - 1, ly, part.w, part.h, chamfer) ||
          !inPlan(lx + 1, ly, part.w, part.h, chamfer);
        const wallY = !inPlan(lx, ly - 1, part.w, part.h, chamfer) ||
          !inPlan(lx, ly + 1, part.w, part.h, chamfer);
        // Il montante si conta dal capo **piu' vicino**, come i pilastri del
        // colonnato e per la stessa ragione: contando da un capo solo, un lato
        // che non e' multiplo del passo perde la simmetria e con lei
        // l'invarianza per rotazione.
        const mullion = (wallX && onEdgePitch(ly, part.h, step)) ||
          (wallY && onEdgePitch(lx, part.w, step));
        if (!mullion && !course) continue;
        put(canvas, part.x + lx, part.y + ly, z, palette, part.surface);
      }
    }
  }
}

/** true se la colonna cade sul passo, contata dall'estremo piu' vicino. */
function onEdgePitch(v: number, size: number, step: number): boolean {
  return Math.min(v, size - 1 - v) % step === 0;
}
