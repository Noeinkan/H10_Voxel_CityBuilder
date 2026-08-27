import type { CatalystId } from '../sim/catalysts';

export type HudIcon =
  | 'funds' | 'population' | 'food' | 'materials' | 'satisfaction'
  | 'residential' | 'production' | 'civic' | 'expansion' | 'terrace' | 'ropeway' | 'policies' | 'city'
  | 'market' | 'factory' | 'park' | 'greenhouse' | 'power' | 'school' | 'port' | 'ferry' | 'airport' | 'transport' | 'radio' | 'lighthouse'
  | 'university' | 'monument' | 'museum' | 'cathedral' | 'theatre' | 'stadium' | 'marina'
  | 'pause' | 'play' | 'theme' | 'view' | 'swatch' | 'help' | 'close'
  | 'daylight' | 'sun' | 'moon' | 'clouds' | 'cloudsOff';

/*
 * Ogni ruolo della toolbar deve avere la sua icona, e il compilatore lo esige.
 *
 * I due elenchi erano tenuti d'accordo a mano: quando `BALANCE` ha guadagnato
 * museo, cattedrale e deposito, `PATHS` non li ha saputi, `PATHS[name]` e'
 * tornato `undefined` e tre tessere sono uscite **vuote** — con l'etichetta, il
 * prezzo e il tasto al loro posto, cioe' senza sembrare rotte.
 *
 * Questa riga e' cio' che impedisce che accada di nuovo: un ruolo nuovo in
 * `BALANCE` che non trovi il suo disegno qui sotto rompe la compilazione, e non
 * la tessera. Non produce niente a runtime.
 */
type Assert<T extends true> = T;
export type EveryCatalystHasAnIcon = Assert<CatalystId extends HudIcon ? true : false>;

const PATHS: Readonly<Record<HudIcon, string>> = {
  funds: '<circle cx="12" cy="12" r="8"/><path d="M9 10.2c0-1.1 1.2-2 3-2s3 .9 3 2-1.2 1.8-3 1.8-3 .9-3 2 1.2 2 3 2 3-.9 3-2M12 6v12"/>',
  population: '<path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 11a3 3 0 0 0 0-6M21 20v-2a4 4 0 0 0-3-3.9"/>',
  food: '<path d="M12 22V9M7 3c3 0 5 2 5 5-3 0-5-2-5-5ZM17 5c-3 0-5 2-5 5 3 0 5-2 5-5ZM6 14c3 0 6 2 6 5-3 0-6-2-6-5Z"/>',
  materials: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  satisfaction: '<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 14c1 3 7 3 8 0"/>',
  residential: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/>',
  production: '<path d="M3 21V9l6 3V9l6 3V5h4v16H3ZM7 17h2M12 17h2M17 17h2"/>',
  civic: '<path d="m3 9 9-6 9 6M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M3 21h18"/>',
  market: '<path d="M4 10h16l-2-6H6l-2 6ZM5 10v10h14V10M9 20v-6h6v6M4 10c1 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0"/>',
  factory: '<path d="M3 21V9l6 3V9l6 3V5h4v16H3ZM7 17h2M12 17h2M17 17h2"/>',
  park: '<path d="M12 21v-7M7 14h10l-2-3h2l-5-8-5 8h2l-2 3ZM5 21h14"/>',
  // Una casa di vetro a falda con i montanti in vista: e' la serra, e le righe
  // dei vetri sono cio' che la distingue da un capannone pieno. `factory` ha il
  // tetto a dente di sega, qui il colmo e' uno solo.
  greenhouse: '<path d="M3 20V9l2-3h14l2 3v11H3ZM7 20V9M12 20V9M17 20V9M3 13h18M3 16h18"/>',
  port: '<path d="M12 3v14M8 7h8M5 12c0 5 3 8 7 9 4-1 7-4 7-9M3 12h4M17 12h4"/>',
    // Uno scafo con la cabina e l'onda sotto: il porto e' l'ancora, cioe' lo
      // scalo, e il traghetto e' la barca che ci passa. Le due tessere stanno
        // accanto e vogliono la stessa costa, quindi devono distinguersi da lontano —
          // e prima di questa riga il traghetto non aveva icona affatto: `PATHS` non lo
            // conosceva, e la tessera usciva vuota.
              ferry: '<path d="M4 15h16l-2.2 4H6.2L4 15ZM7 15v-4h10v4M10 11V8h4v3M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1"/>',
  airport: '<path d="M12 3c.8 0 1.4.9 1.4 2v4.2l7.1 4v2.1l-7.1-2.2v4.3l2.1 1.6v1.6L12 19.6l-3.5 1V19l2.1-1.6v-4.3l-7.1 2.2v-2.1l7.1-4V5c0-1.1.6-2 1.4-2Z"/>',
  transport: '<path d="M6 18h12M7 18l-2 3M17 18l2 3M5 15V7c0-3 14-3 14 0v8H5ZM8 11h.01M16 11h.01M7 15h10"/>',
  university: '<path d="m3 9 9-6 9 6-9 4-9-4ZM6 11v6M18 11v6M4 20h16M9 12v5M15 12v5"/>',
  monument: '<path d="M8 21h8M9 18h6M10 18V9h4v9M8 9h8l-4-6-4 6Z"/>',
  // Un quadro appeso, non l'ennesimo frontone su colonne: `civic` e `university`
  // hanno gia' quel tetto, e in fila da 22px tre timpani non si distinguono. Qui
  // il segno e' **cio' che il museo contiene**, che e' anche la ragione per cui
  // ci si va.
  museum: '<path d="M4 4h16v13H4zM4 13l4.5-4.5 3 3L16 7l4 4M8.5 8h.01M8 21v-4M16 21v-4"/>',
  // La guglia, il rosone e le due navate basse ai lati: e' la sagoma che si
  // riconosce di profilo da lontano, ed e' l'unica del gruppo identita' che non
  // possa essere scambiata per un edificio civico.
  cathedral: '<path d="M12 2v3.5M10.5 3.5h3M8 21V10l4-4.5 4 4.5v11M4 21v-7l4-3M20 21v-7l-4-3M3 21h18"/><circle cx="12" cy="12.5" r="1.6"/>',
  // Due torri di raffreddamento a clessidra e una ciminiera sottile: il fumo
  // non c'e', e la verticale magra accanto ai due tamburi e' la firma della
  // centrale prima di qualunque colore.
  power: '<path d="M3 20V10l1.5-2.5L6 10v10M9 20V10l1.5-2.5L12 10v10M15 20V4h2v16"/>',
  // Due ali e il corpo che le unisce, con la torre dell'orologio che esce dal
  // tetto: e' il quadrante, non il campanile, a distinguerla dalla cattedrale.
  school: '<path d="M3 20V8h6v12M15 20V8h6v12M9 20h6M12 8V2"/><circle cx="12" cy="4" r="1.3"/>',
  // Un traliccio a croci diagonali e l'antenna in cima: l'aria fra i montanti
  // e' cio' che separa una torre radio da un monumento pieno.
  radio: '<path d="M9 20V5M15 20V5M9 5l3-2 3 2M12 5V2M7 20h10M9 8l6 3M15 8l-6 3M9 12l6 3M15 12l-6 3M9 16l6 3M15 16l-6 3"/>',
  // La torre rastremata, la lanterna accesa e la casa del custode ai piedi:
  // e' l'unica verticale del gruppo collegamenti che parli di costa.
  lighthouse: '<path d="M10 20V8l2-3 2 3v12M10 20h4M10 8h4M12 5V2M11 2h2M3 20h5M4 20v-4h3v4"/>',
  // Torre scenica alta, sala a falda e colonnato d'ingresso: tre altezze
  // diverse che nessun altro ruolo del gruppo identita' compone cosi'.
  theatre: '<path d="M4 20V6h6v14M10 20v-3l5-4 5 4v3M10 20h10M3 14h1M3 17h1M3 20h1"/>',
  // Due ovali concentrici, bassi e larghi: il catino cavo si legge da sopra
  // prima che di taglio, ed e' l'unica sagoma non verticale del catalogo.
  stadium: '<path d="M3 12c0-4 4-6 9-6s9 2 9 6c0 5-4 8-9 8s-9-3-9-8ZM6 12c0-3 2.5-4.5 6-4.5s6 1.5 6 4.5c0 3.5-2.5 5.5-6 5.5s-6-2-6-5.5Z"/>',
  // La banchina con due moli a dita e una barca nel bacino: la planimetria della
  // ricetta, ed e' il vuoto fra i moli a dire "porticciolo" invece che "porto".
  marina: '<path d="M3 21V9h5v12M8 12h6M8 16h6M14 21v-9h3v9M17 12h4M10.5 18.5l2-3 2 3M10.5 18.5v2M14.5 18.5v2"/>',
  expansion: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M3 8l6 6M21 8l-6 6M3 16l6-6M21 16l-6-6"/>',
  // Una torre di taglio con un piano che le esce dal fianco, e la trave sotto:
  // e' la sezione che il generatore disegna davvero, ed e' l'unica cosa che
  // distingue una mensola da un balcone qualunque — cio' che regge si vede.
  terrace: '<path d="M8 21V6h7v15M15 11h6M15 14h5M17 14v-3M20 14v-3M4 21h16"/>',
  // Due torri, la fune che pende fra loro e una cabina appesa a meta': la
  // pancia e' l'unica cosa che distingua una funivia da un ponte sospeso, ed e'
  // la stessa ragione per cui esiste `ROPEWAY.sagRatio`.
  ropeway: '<path d="M4 21V6M20 21V8M4 6c6 7 10 7 16 2M11 11v2M9 13h4v3H9z"/>',
  policies: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
  // Tre edifici di tre altezze su una linea di terra: la dashboard e' la citta'
  // letta tutta insieme, e uno skyline la dice meglio di una pagina di cifre.
  city: '<path d="M3 21h18M5 21v-8h3v8M10 21V11h4v10M16 21V6h5v15"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  theme: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 1 1 0-4h3a6 6 0 0 0 6-6c0-2.2-4-4-9-4Z"/><path d="M7.5 9h.01M10 6.5h.01M14 6.5h.01M17 9h.01"/>',
  // Tre piani sovrapposti visti di taglio: e' la sagoma che le viste hanno in
  // comune — guardare la citta' un livello alla volta. La 7.2 ridisegnera' tutte
  // le icone su due pesi, questa serve a essere riconoscibile intanto.
  view: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m4 12.5 8 4.5 8-4.5M4 17l8 4.5 8-4.5"/>',
  // Una matrice di caselle, che e' letteralmente cio' che si va a vedere: uno
  // slot di palette per colonna, un linguaggio di superficie per riga. Si
  // distingue da `view` — tre piani di taglio — perche' rispondono a due domande
  // diverse: quella guarda dentro la citta', questa guarda di cosa e' fatta.
  swatch: '<path d="M4 4h16v16H4z"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.2 2.3c-1 .6-1.7 1.1-1.7 2.2M12 17h.01"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  // Le tre del ciclo si leggono in fila: un sole sopra la linea dell'orizzonte
  // e' il giro, il sole pieno e' il giorno fermo, la falce e' la notte ferma.
  // La differenza sta nella linea di terra, che solo la prima ha.
  daylight: '<path d="M3 19h18M6.5 19a5.5 5.5 0 0 1 11 0M12 5v2.5M5.6 8.2l1.8 1.8M18.4 8.2l-1.8 1.8"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9"/>',
  moon: '<path d="M20 14.4A8.6 8.6 0 0 1 9.6 4 7.6 7.6 0 1 0 20 14.4Z"/>',
  // I banchi in quota, e sotto le cime che ne escono: un contorno di nuvola da
  // solo direbbe "meteo", mentre qui la cosa da dire e' che qualcosa ci sta
  // dentro. Squadrata come tutto il resto — la nuvola del gioco e' di celle.
  clouds: '<path d="M4 11h4V8h4v3h3V6h4v5h1M4 11v3h16v-3M7 17l2 3M13 17l2 3"/>',
  cloudsOff: '<path d="M4 11h4V8h4v3h3V6h4v5h1M4 11v3h16v-3M4 20 20 4"/>',
};

export function createHudIcon(name: HudIcon): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hud-icon');
  svg.innerHTML = PATHS[name];
  return svg;
}
