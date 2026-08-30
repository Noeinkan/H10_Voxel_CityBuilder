/**
 * Prospettiva aerea del motore, in TypeScript puro.
 *
 * Come `lighting.ts`, non importa Three e non tocca il DOM: gira nei test in
 * ambiente node ed e' la copia leggibile di cio' che il fragment shader riscrive
 * in GLSL. `atmosphere.test.ts` e' cio' che tiene allineate le due copie.
 *
 * **La nebbia integra la quota lungo il raggio, non sul frammento.** E' la
 * differenza che fa esistere questa fase. La densita' ha un profilo esponenziale
 * in altezza:
 *
 *   rho(z) = density * exp(-heightFalloff * (z - heightBase))
 *
 * e cio' che tinge un frammento non e' `rho` alla sua quota ma l'integrale di
 * `rho` lungo il segmento camera -> frammento. La differenza si vede dove serve:
 * due volumi che si sovrappongono a schermo **alla stessa distanza** ma a quote
 * diverse ricevono veli diversi, perche' il raggio che arriva in cima a una torre
 * ha attraversato aria rarefatta e quello che arriva in strada no. Con la densita'
 * valutata sul solo frammento — cio' che si faceva prima — quei due volumi erano
 * indistinguibili, e la nebbia separava le distanze e basta.
 *
 * L'integrale e' in forma chiusa perche' **la quota e' lineare lungo il segmento**,
 * cosa vera di qualunque raggio dritto: la media di un esponenziale su un segmento
 * e' un rapporto di due esponenziali. Quello che l'ortografica comprava era un'altra
 * cosa, ed e' bene non confonderle — con i raggi tutti paralleli il segmento si
 * descrive con **un solo vettore per fotogramma**, e la sua lunghezza e' la
 * profondita' in spazio vista. Da terra i raggi convergono nell'occhio: il
 * segmento va dall'occhio al frammento, la sua lunghezza e' la distanza vera, e
 * `viewDirZ` diventa una quantita' per pixel. Le formule qui sotto non se ne
 * accorgono, perche' `viewDirZ` e `depth` sono gia' argomenti e non ipotesi.
 *
 * **Il profilo non e' troncato sotto `heightBase`.** Sarebbe l'integrale a tratti,
 * con il suo punto di attraversamento; non ne vale il prezzo. Con le altezze di
 * scala in uso (`heightFalloff` intorno a 0,005) venti cubi sotto la base valgono
 * `exp(0,1)`, cioe' un dieci per cento di densita' in piu' sul fondo delle valli:
 * una direzione giusta, non un artefatto.
 */

/**
 * Il sottoinsieme di `Fog` che descrive la geometria del velo.
 *
 * Sta qui e non in `themes/theme.ts` perche' il significato di questi quattro
 * numeri e' la matematica sopra: chi li tara deve poter leggere la formula che
 * li consuma senza cambiare file.
 */
export interface FogModel {
  /** Densita' alla quota di riferimento. 0 spegne la nebbia del tutto. */
  readonly density: number;
  /**
   * Quota di riferimento del profilo: e' li' che la densita' vale esattamente
   * `density`, e da li' in su comincia a decadere.
   *
   * Va tenuta intorno al pianoro dell'isola (`TERRAIN.seaLevel` piu' qualche
   * cubo): e' anche la quota sotto la quale il velo di quota e' pieno.
   */
  readonly heightBase: number;
  /**
   * Inverso dell'altezza di scala del profilo esponenziale.
   *
   * **Segue la scala della citta', non un gusto.** Valeva ~0,025 quando i tetti
   * stavano a trenta voxel; con le torri della 4.6 a centocinquanta, un numero
   * cosi' alto spende tutta la prospettiva aerea nel primo quinto
   * dell'edificato, e sopra ogni piano ha lo stesso colore — il contrario di
   * cio' per cui la nebbia di quota esiste. La regola pratica e' che `1 /
   * heightFalloff` stia nell'ordine dell'altezza dell'edificato: alzando il
   * tetto verticale va abbassata in proporzione.
   */
  readonly heightFalloff: number;
  /** Ampiezza del velo di quota, indipendente dalla distanza. 0 lo spegne. */
  readonly altitudeLift: number;
}

/**
 * Sotto questo dislivello adimensionale il rapporto degenera in 0/0 e si usa il
 * limite analitico. E' una soglia numerica, non estetica.
 */
export const FOG_FLAT_EPSILON = 1e-4;

/**
 * Quante volte piu' ripido del profilo di nebbia decade il velo di quota.
 *
 * Il velo serve a tenere la foschia sulle strade anche a zoom ravvicinato, dove
 * la distanza non basta a produrne: se decadesse con la stessa altezza di scala
 * della nebbia velerebbe anche i tetti, e non separerebbe niente. Quattro e' il
 * fattore per cui, con `heightFalloff` intorno a 0,005, il velo e' dimezzato a
 * una trentina di cubi e spento in cima all'edificato della 4.6.
 */
export const FOG_LIFT_SHARPNESS = 4;

/**
 * Entro quanto cammino il velo di quota si accende, in unita' di mondo.
 *
 * Il velo non dipende dalla distanza — e' il suo scopo, sopravvivere allo zoom
 * ravvicinato — ma quel «non dipende» era scritto per una camera parcheggiata a
 * centinaia di unita' dalla scena, dove nessun frammento visibile e' mai vicino.
 * Con l'occhio dentro la citta' la stessa riga dipinge di lattiginoso il muro a
 * due voxel dal naso, e con `altitudeLift` intorno a 0,1 e' un decimo di velo su
 * tutto lo schermo.
 *
 * Ventiquattro unita' sono la larghezza di una carreggiata piu' i suoi fronti:
 * dentro quel raggio il velo sale da zero al suo valore, oltre non cambia niente.
 * **Sotto ortografica e' un no-op per costruzione**, perche' li' la profondita'
 * del frammento piu' vicino e' comunque nell'ordine delle centinaia — ed e'
 * questo che permette di applicarlo senza un interruttore di modo.
 */
export const FOG_LIFT_NEAR = 24;

/**
 * Quanto in fretta il gradiente del cielo percorre l'elevazione del raggio.
 *
 * Serve solo quando i raggi convergono, cioe' quando il gradiente smette di
 * seguire l'altezza di schermo e comincia a seguire l'orizzonte vero. A uno il
 * cielo userebbe tutta la sua escursione fra il nadir e lo zenit, e guardando
 * l'orizzonte si vedrebbe solo la meta' bassa della scala; a 1,6 satura intorno
 * ai quaranta gradi di elevazione, che e' quanto sta in campo con un obiettivo
 * da cinquanta.
 */
export const SKY_ELEVATION_GAIN = 1.6;

/**
 * Media di `exp(-heightFalloff * (z - heightBase))` sul segmento fra due quote.
 *
 * E' il solo pezzo di matematica della nebbia: moltiplicata per densita' e
 * lunghezza da' lo spessore ottico. Simmetrica nei due argomenti, quindi non
 * importa quale sia l'ingresso e quale l'uscita.
 */
export function fogShape(entryHeight: number, exitHeight: number, fog: FogModel): number {
  const a = fog.heightFalloff * (entryHeight - fog.heightBase);
  const b = fog.heightFalloff * (exitHeight - fog.heightBase);
  const span = b - a;
  // Raggio quasi orizzontale: la quota non cambia e la media e' il valore stesso.
  if (Math.abs(span) < FOG_FLAT_EPSILON) return Math.exp(-a);
  return (Math.exp(-a) - Math.exp(-b)) / span;
}

/**
 * Spessore ottico fra la camera e un frammento.
 *
 * `depth` e' la profondita' in spazio vista (`vFogDepth`), `height` la quota
 * mondo del frammento, `viewDirZ` la componente verticale della direzione di
 * sguardo — con una camera ortografica e' un numero per frame, non per pixel.
 */
export function fogOpticalDepth(
  depth: number,
  height: number,
  viewDirZ: number,
  fog: FogModel,
): number {
  const entry = height - viewDirZ * depth;
  return fog.density * depth * fogShape(entry, height, fog);
}

/** Frazione di velo dovuta alla distanza percorsa, in 0..1. */
export function fogAmount(depth: number, height: number, viewDirZ: number, fog: FogModel): number {
  return 1 - Math.exp(-fogOpticalDepth(depth, height, viewDirZ, fog));
}

/**
 * Velo di quota: la parte dichiaratamente non fisica.
 *
 * Non dipende dalla distanza, quindi sopravvive allo zoom ravvicinato dove
 * l'integrale e' quasi zero. Serve a questo e a nient'altro.
 *
 * `pathLength` non lo rende dipendente dalla distanza: lo **accende**. Vedi
 * `FOG_LIFT_NEAR` per il perche' — in breve, «non dipende dalla distanza» era
 * scritto quando nessun frammento visibile poteva essere vicino, e da terra
 * possono esserlo tutti.
 */
export function fogAltitudeLift(height: number, fog: FogModel, pathLength: number): number {
  const above = Math.max(0, height - fog.heightBase);
  const near = smoothstep01(pathLength / FOG_LIFT_NEAR);
  return fog.altitudeLift * Math.exp(-FOG_LIFT_SHARPNESS * fog.heightFalloff * above) * near;
}

/**
 * Dove sta il gradiente del cielo per questo raggio, in 0..1.
 *
 * Una funzione sola per il fondo procedurale e per la nebbia, perche' si toccano
 * proprio all'orizzonte e due copie che divergono ci cuciono una riga. Con i
 * raggi paralleli e' l'**altezza di schermo**, e non e' una scorciatoia: tutti i
 * raggi hanno la stessa elevazione, quindi un gradiente su di essa darebbe una
 * tinta piatta. Quando convergono e' l'elevazione vera, ed e' li' che l'orizzonte
 * compare.
 */
export function skyGradientT(rayDirZ: number, screenY: number, converging: boolean): number {
  if (!converging) return smoothstep01(screenY);
  const elevation = clamp01(rayDirZ * SKY_ELEVATION_GAIN * 0.5 + 0.5);
  return smoothstep01(elevation);
}

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Velo totale con cui il frammento tende al colore dell'aria, in 0..1.
 *
 * I due contributi si compongono per trasmittanza — `1 - (1-a)(1-b)` — invece che
 * per somma: due veli in fila non possono superare l'opacita' piena.
 */
export function fogVeil(depth: number, height: number, viewDirZ: number, fog: FogModel): number {
  const amount = fogAmount(depth, height, viewDirZ, fog);
  const lift = fogAltitudeLift(height, fog, depth);
  return 1 - (1 - amount) * (1 - clamp01(lift));
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
