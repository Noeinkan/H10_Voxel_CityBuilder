import type { LandmarkRecipe } from '../config';
import { PALETTE_SLOTS } from '../../../engine/paletteSlots';
import { SURFACE_KIND } from '../../visualBlock';
import { PART, box } from '../parts';
import { BERTH } from '../berths';
import { bollard, craneAt, entrance, quay, signBand } from '../vocab';

/**
 * Le ricette dei ruoli che collegano l'isola al mondo e la muovono dentro.
 *
 * Sono le tre forme **lineari per natura** — un molo, un altro molo, una pista —
 * ed e' la ragione per cui stanno insieme: hanno l'asse lungo maggiore di tutte
 * le altre, e schiacciarle in un quadrato le farebbe leggere come monconi.
 * Tutte e tre guardano l'acqua, e sono le sole ricette del progetto che
 * dichiarino `waterline` e ormeggi.
 *
 * La quarta forma lineare — la stazione — sta in `station.ts`: e' l'unica che
 * sospende invece di appoggiare, e da quando cresce di sedime e' anche la piu'
 * lunga del catalogo.
 */

// Il fronte canonico guarda l'acqua: `x` cresce verso il mare, la banchina sta
// sotto il click, i moli davanti e i magazzini alle spalle.
//
// **La forma in pianta e' il porto.** Due bracci che escono dalla banchina, un
// pontile in mezzo, e fra loro due specchi d'acqua che la ricetta ottiene *non
// disegnando niente*: l'opera di terra si getta solo dove una parte poggia,
// quindi cio' che resta vuoto qui resta mare la' fuori. E' l'unica differenza
// fra un porto e un piazzale sul mare, e prima non c'era.
export const PORT: LandmarkRecipe = {
  kind: 'port',
  span: [20, 12],
  height: 18,
  anchor: [10, 6],
  apron: 4,
  stages: [0, 6, 16, 32],
  parts: [
    [
      // Stadio zero: la banchina, il braccio di sopravento e la capitaneria in
      // punta — l'accesso e l'identita' minima. Il bacino esiste da subito, ed
      // e' l'acqua che il molo ha appena chiuso su un lato; le bitte dicono
      // dove ormeggia, e l'ufficio del porto e' la prima verticale.
      quay(0, 0, 12, 12),
      quay(12, 0, 8, 2),
      box(PART.mast, 17, 0, 2, 2, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      bollard(11, 4),
      bollard(11, 7),
      bollard(13, 1),
      bollard(17, 1),
    ],
    [
      // Stadio uno: la massa funzionale — il magazzino che la banchina serve.
      box(PART.shell, 1, 1, 7, 5, 1, 8, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 1, 1, 7, 5, 9, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
    ],
    [
      // Stadio due: l'attrezzatura caratteristica — il braccio di sottovento
      // chiude il bacino e la prima gru porta lo sbraccio sull'acqua.
      quay(12, 10, 8, 2),
      ...craneAt(3),
      bollard(13, 10),
      bollard(17, 10),
    ],
    [
      // Stadio tre: il coronamento e il segnale — la seconda gru, i serbatoi
      // e la vetrata accesa della capitaneria: la sola cosa illuminata di
      // notte in un ruolo fatto di lamiera.
      ...craneAt(7),
      box(PART.slab, 1, 7, 3, 2, 1, 3, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.slab, 5, 7, 3, 2, 1, 2, PALETTE_SLOTS.glassDeep, SURFACE_KIND.industrial),
      box(PART.shell, 8, 8, 4, 4, 1, 6, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.deck, 8, 8, 4, 4, 7, 1, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech),
      box(PART.slab, 16, 0, 4, 2, 13, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      box(PART.deck, 16, 0, 4, 2, 15, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
  ],
  // La banchina piena finisce a `x` 11 e i bracci escono da 12: **e' li' che
  // il porto pretende il mare**, ed e' quello che il piazzamento va a cercare
  // sul terreno vero invece di sperare che il click ci sia caduto sopra.
  waterline: 12,
  // Il bacino e' `x` 12..19, `y` 2..9: la nave da carico accosta al braccio di
  // sopravento, la barca da lavoro sta in fondo. Sono punti d'acqua vera —
  // l'opera di terra non li tocca — quindi i mezzi ci galleggiano alla quota
  // del mare invece che sei voxel sopra come quando l'ormeggio era disegnato.
  moorings: [
    { x: 15, y: 4, z: 0, berth: BERTH.cargo, heading: 0 },
    { x: 14, y: 8, z: 0, berth: BERTH.vessel, heading: 0 },
  ],
  variants: [
    // Merci alla rinfusa: silo, silo, nastro. La sagoma resta quella del
    // porto — banchina, magazzini, gru — e cambia cosa ci si scarica.
    {
      name: 'granaio',
      parts: [
        [],
        [box(PART.slab, 8, 1, 3, 3, 1, 12, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
          chamfer: 1,
          cap: PALETTE_SLOTS.concretePale,
        })],
        [
          box(PART.slab, 8, 4, 3, 3, 1, 9, PALETTE_SLOTS.concrete, SURFACE_KIND.industrial, {
            chamfer: 1,
            cap: PALETTE_SLOTS.concretePale,
          }),
          // Il nastro esce sopra il molo di sopravento: passa alto, e passare
          // alto e' cio' che gli permette di scavalcare l'acqua senza che
          // l'opera di terra debba riempirla.
          box(PART.boom, 9, 1, 9, 2, 13, 2, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
            cap: PALETTE_SLOTS.metalBrass,
          }),
        ],
        [entrance(1, 2, 1, 2, 3)],
      ],
    },
    // Cantiere navale: due tralicci, uno per braccio, e il ponte che li unisce
    // scavalcando il bacino. E' il portale sotto cui passa lo scafo, ed e'
    // l'unico esemplare che si legge da sopra prima che di taglio. I montanti
    // stanno **sui moli** e mai sull'acqua: una gamba piantata nel bacino lo
    // farebbe riempire di terra, che e' il difetto che questa fase toglie.
    {
      name: 'cantiere',
      parts: [
        [],
        [box(PART.truss, 13, 0, 2, 2, 1, 12, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          step: 3,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.truss, 13, 10, 2, 2, 1, 12, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          step: 3,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.boom, 13, 0, 2, 12, 13, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
      ],
    },
    // Terminal passeggeri: falda sul magazzino, insegna e ingresso sul fronte.
    // E' l'esemplare che di notte si vede, perche' e' il solo con una fascia
    // luminosa dove gli altri hanno lamiera.
    {
      name: 'stazione',
      parts: [
        [],
        [box(PART.pitch, 1, 1, 7, 5, 10, 4, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [signBand(7, 2, 1, 3, 6)],
        [entrance(7, 2, 1, 3, 4)],
      ],
    },
  ],
};

// Il contrario del porto sullo stesso fronte mare: niente gru, niente
// capannoni, e al posto della banchina un molo stretto che esce in mezzo
// all'acqua con un pontile per lato. E' la sagoma a dire che di qui passano
// persone e non container — e sono i due ormeggi, vuoti finche' la citta' non
// e' cresciuta, a dire che a un molo solo manca ancora qualcosa.
export const FERRY: LandmarkRecipe = {
  kind: 'ferry',
  span: [22, 12],
  height: 16,
  anchor: [4, 6],
  apron: 4,
  stages: [0, 5, 14, 28],
  parts: [
    [
      // Stadio zero: il piazzale a terra e le bitte — l'accesso. Il molo e i
      // due accosti arrivano con la massa, e sono i vuoti a dire «di qui
      // passano persone» prima ancora che ci sia una pensilina.
      quay(0, 0, 8, 12),
      bollard(9, 4),
      bollard(9, 7),
    ],
    [
      // Stadio uno: la massa funzionale — il molo che esce in mezzo all'acqua
      // e la stazione marittima che lo serve.
      quay(8, 4, 14, 4),
      box(PART.shell, 1, 3, 6, 6, 1, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 1, 3, 6, 6, 7, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      // Stadio due: l'attrezzatura — la pensilina sul molo (il vuoto sotto un
      // tetto e' cio' che nessuna scatola cava sa dare) e le sale d'attesa,
      // a terra e in testa al molo.
      box(PART.colonnade, 9, 4, 7, 4, 1, 5, PALETTE_SLOTS.wood, SURFACE_KIND.habitat, {
        step: 3,
        cap: PALETTE_SLOTS.brickLight,
      }),
      bollard(13, 4),
      bollard(13, 7),
      box(PART.shell, 16, 4, 4, 4, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 16, 4, 4, 4, 6, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
      box(PART.shell, 1, 9, 6, 3, 1, 5, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 1, 9, 6, 3, 6, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      // Stadio tre: il coronamento e il segnale notturno — il fanale in punta,
      // da lontano e' quello a separare un molo da una lingua di terra.
      box(PART.mast, 20, 5, 2, 2, 1, 12, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.metalGold,
      }),
      box(PART.slab, 20, 5, 2, 2, 13, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
      bollard(21, 4),
      bollard(21, 7),
    ],
  ],
  // Il piazzale a terra e' `x` 0..7 e il molo esce da 8: e' quella la colonna
  // su cui il piazzamento porta la battigia. Il ferry se la cavava gia' quasi
  // sempre — gli accosti stanno a `x` 13, cioe' nove colonne oltre il click, e
  // il mare entro sei le copriva comunque — ma «quasi sempre» qui vuol dire
  // che il molo comincia sulla sabbia invece che sull'acqua.
  waterline: 8,
  // I due accosti, uno per lato del molo. Quello di nord e' il capolinea della
  // traversata — se esiste un secondo imbarco, e' da li' che la barca parte —
  // e quello di sud tiene la barca da lavoro che c'e' comunque: **un imbarco
  // solo non e' una linea**, ed e' esattamente cio' che deve leggersi a
  // schermo prima che nel tooltip.
  moorings: [
    { x: 13, y: 2, z: 0, berth: BERTH.ferry, heading: 0 },
    { x: 13, y: 9, z: 0, berth: BERTH.vessel, heading: 0 },
  ],
  variants: [
    // Imbarcadero: la tettoia sul molo, l'ingresso e l'insegna. E' il ferry
    // che si comporta da stazione, e la falda sopra il colonnato e' cio' che
    // lo distingue dal molo nudo.
    {
      name: 'imbarcadero',
      parts: [
        [],
        [box(PART.pitch, 9, 4, 7, 4, 6, 3, PALETTE_SLOTS.roofPale, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [entrance(6, 5, 1, 2, 4)],
        [signBand(6, 4, 1, 4, 5)],
      ],
    },
    // Faro in punta al molo: tamburo smussato, ballatoio e cappello sopra il
    // fanale. E' l'unico landmark che di notte fa luce sull'acqua, e il
    // cappello sta **sopra** la lanterna del tronco invece che addosso: una
    // cupola posata li' sopra la spegnerebbe, che e' il modo piu' silenzioso
    // che un esemplare ha di rovinare la ricetta che varia.
    {
      name: 'faro',
      parts: [
        [],
        [box(PART.slab, 19, 4, 3, 4, 1, 10, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
          chamfer: 1,
          cap: PALETTE_SLOTS.metalGold,
        })],
        [box(PART.steps, 18, 4, 4, 4, 11, 2, PALETTE_SLOTS.stone, SURFACE_KIND.roofTech, {
          step: 1,
          chamfer: 1,
        })],
        [box(PART.steps, 19, 4, 3, 4, 15, 1, PALETTE_SLOTS.metalGold, SURFACE_KIND.roofTech, {
          step: 1,
          chamfer: 1,
        })],
      ],
    },
    // Darsena da lavoro: la gru che serve gli accosti, e il braccio che
    // scavalca l'acqua passando alto. Stesso molo, altro mestiere.
    {
      name: 'darsena',
      parts: [
        [],
        [box(PART.truss, 10, 4, 2, 2, 1, 11, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          step: 3,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.boom, 10, 2, 2, 4, 11, 2, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.slab, 2, 0, 4, 2, 1, 3, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalBrass,
        })],
      ],
    },
  ],
};

// **Un campo di volo, non una striscia d'asfalto accanto a una scatola.** La
// ricetta di prima aveva una pista larga quattro e lunga quattordici in un
// angolo del riquadro, e il resto era prato: da sopra non si leggeva come un
// aeroporto perche' mancava tutto quello che di un aeroporto si riconosce —
// il campo erboso spianato, il raccordo che porta la pista al piazzale, le
// piazzole di sosta, gli hangar in fondo. Qui la pista corre per tutta la
// lunghezza dell'ingombro, il raccordo la lega al piazzale e gli aerei di
// `world/traffic/` ci rullano davvero.
export const AIRPORT: LandmarkRecipe = {
  kind: 'airport',
  span: [26, 12],
  height: 20,
  anchor: [6, 3],
  apron: 4,
  stages: [0, 10, 24, 44],
  parts: [
    [
      // Il campo spianato per intero: e' la prima cosa che dice «aeroporto»
      // vista da sopra, ed e' anche cio' che rende l'opera di terra un piano
      // unico invece di tre strisce a quote diverse.
      box(PART.deck, 0, 0, 26, 12, 0, 1, PALETTE_SLOTS.grass, SURFACE_KIND.plain),
      box(PART.deck, 0, 0, 12, 5, 0, 1, PALETTE_SLOTS.concrete, SURFACE_KIND.utility),
      box(PART.shell, 1, 0, 8, 4, 1, 6, PALETTE_SLOTS.concreteWhite, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.glassPale,
      }),
      box(PART.deck, 1, 0, 8, 4, 7, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      // La pista, il raccordo e la segnaletica. Le soglie e la mezzeria sono
      // lo stesso piano riscritto piu' chiaro: una pista senza segni e' una
      // striscia d'asfalto, e a distanza di gioco non si legge.
      box(PART.deck, 2, 6, 24, 3, 0, 1, PALETTE_SLOTS.asphaltDark, SURFACE_KIND.utility),
      box(PART.deck, 2, 6, 2, 3, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      box(PART.deck, 24, 6, 2, 3, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      box(PART.deck, 7, 7, 3, 1, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      box(PART.deck, 13, 7, 3, 1, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      box(PART.deck, 19, 7, 3, 1, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      box(PART.deck, 2, 5, 10, 1, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      // Le luci di avvicinamento in testa alla pista: due cubi accesi, ed e'
      // l'unica cosa che di notte dica da che parte si atterra.
      box(PART.mast, 0, 6, 1, 3, 1, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
    ],
    [
      // La torre di controllo: il contrasto fra il piano lungo e la verticale
      // sottile e' cio' che dice il ruolo prima di qualunque dettaglio.
      box(PART.mast, 9, 1, 3, 3, 1, 14, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
        cap: PALETTE_SLOTS.concretePale,
      }),
      box(PART.slab, 8, 0, 5, 5, 15, 3, PALETTE_SLOTS.glassPale, SURFACE_KIND.civic),
      box(PART.deck, 8, 0, 5, 5, 18, 1, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech),
    ],
    [
      // Gli hangar e il loro raccordo. Sono in fondo al campo, dalla parte
      // opposta all'aerostazione: e' come si dispone uno scalo vero, e da
      // sopra e' la simmetria spezzata a dire che i due lati fanno due cose.
      box(PART.deck, 12, 9, 2, 3, 0, 1, PALETTE_SLOTS.asphalt, SURFACE_KIND.utility),
      box(PART.shell, 14, 9, 10, 3, 1, 6, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
        cap: PALETTE_SLOTS.metalBrass,
      }),
      box(PART.deck, 14, 9, 10, 3, 7, 1, PALETTE_SLOTS.metalDark, SURFACE_KIND.roofTech),
      // Le due piazzole di attesa a bordo pista: sono i riquadri chiari dove
      // gli aerei del traffico stanno fermi fra un giro e l'altro, e stanno
      // **lontano dai volumi** — un'ala di sei voxel parcheggiata contro
      // l'aerostazione le passerebbe dentro.
      box(PART.deck, 11, 3, 4, 2, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
      box(PART.deck, 17, 3, 4, 2, 0, 1, PALETTE_SLOTS.concretePale, SURFACE_KIND.utility),
    ],
  ],
  // Le due soglie della pista e le due piazzole. Le soglie non ospitano
  // niente: sono i capi da cui il circuito di volo si costruisce, cioe' la
  // sola cosa che di una pista il traffico deve sapere.
  moorings: [
    { x: 2, y: 7, z: 0, berth: BERTH.runway, heading: 0 },
    { x: 25, y: 7, z: 0, berth: BERTH.runway, heading: 0 },
    { x: 13, y: 4, z: 0, berth: BERTH.aircraft, heading: 0 },
    { x: 19, y: 4, z: 0, berth: BERTH.aircraft, heading: 0 },
  ],
  variants: [
    // Hub passeggeri: falda sull'aerostazione, un finger sul piazzale,
    // ingresso e insegna sul fronte citta'.
    {
      name: 'hub',
      parts: [
        [],
        [box(PART.pitch, 1, 0, 8, 4, 8, 3, PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech, {
          step: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.boom, 2, 4, 6, 2, 3, 2, PALETTE_SLOTS.concretePale, SURFACE_KIND.civic, {
          cap: PALETTE_SLOTS.glassPale,
        })],
        [entrance(1, 1, 1, 2, 4), signBand(1, 0, 1, 4, 5)],
      ],
    },
    // Scalo merci: capannone a traliccio, cisterna smussata, torre di sfiato.
    // Nessuna fascia luminosa: di notte questo esemplare resta buio, ed e'
    // esattamente cio' che lo distingue dall'hub a colpo d'occhio.
    {
      name: 'merci',
      parts: [
        [],
        [box(PART.truss, 14, 9, 10, 3, 7, 7, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          step: 3,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.slab, 22, 0, 4, 4, 1, 5, PALETTE_SLOTS.metalDark, SURFACE_KIND.industrial, {
          chamfer: 1,
          cap: PALETTE_SLOTS.metalBrass,
        })],
        [box(PART.mast, 20, 1, 2, 2, 1, 16, PALETTE_SLOTS.metalRust, SURFACE_KIND.industrial, {
          cap: PALETTE_SLOTS.metalGold,
        })],
      ],
    },
    // Radar: un traliccio in fondo al campo con la cupola accesa in cima. E'
    // l'esemplare che si legge di notte da lontano quanto di giorno.
    {
      name: 'radar',
      parts: [
        [],
        [box(PART.truss, 21, 0, 4, 4, 1, 15, PALETTE_SLOTS.concrete, SURFACE_KIND.civic, {
          step: 3,
          cap: PALETTE_SLOTS.concretePale,
        })],
        [box(PART.slab, 22, 1, 2, 2, 16, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous)],
        [
          box(PART.mast, 16, 4, 1, 1, 1, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
          box(PART.mast, 20, 4, 1, 1, 1, 2, PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous),
        ],
      ],
    },
  ],
};
