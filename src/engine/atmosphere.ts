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
 * L'integrale e' in forma chiusa perche' la camera e' ortografica: tutti i raggi
 * di vista sono paralleli, quindi la quota lungo il segmento e' lineare e la media
 * di un esponenziale su un segmento e' un rapporto di due esponenziali.
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
 */
export function fogAltitudeLift(height: number, fog: FogModel): number {
  const above = Math.max(0, height - fog.heightBase);
  return fog.altitudeLift * Math.exp(-FOG_LIFT_SHARPNESS * fog.heightFalloff * above);
}

/**
 * Velo totale con cui il frammento tende al colore dell'aria, in 0..1.
 *
 * I due contributi si compongono per trasmittanza — `1 - (1-a)(1-b)` — invece che
 * per somma: due veli in fila non possono superare l'opacita' piena.
 */
export function fogVeil(depth: number, height: number, viewDirZ: number, fog: FogModel): number {
  const amount = fogAmount(depth, height, viewDirZ, fog);
  const lift = fogAltitudeLift(height, fog);
  return 1 - (1 - amount) * (1 - clamp01(lift));
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
