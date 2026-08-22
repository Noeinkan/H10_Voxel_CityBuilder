import type { Atmosphere } from './themes/theme';

/**
 * Ciclo giorno/notte, in TypeScript puro.
 *
 * Come `lighting.ts` e `atmosphere.ts`: non importa Three, non tocca il DOM e
 * gira nei test in ambiente node. Entra un'ora e un'atmosfera di tema, esce
 * un'altra atmosfera. Nessuna geometria viene toccata — applicarla e' la stessa
 * riscrittura di uniform che fa un cambio di tema.
 *
 * **Il tema resta la firma, l'ora la modula.** L'atmosfera scritta nel tema e'
 * quella di **mezzogiorno**: azimut ed elevazione del sole sono il suo picco, e
 * i colori sono il suo look a sole alto. Il ciclo li piega verso l'orizzonte e
 * verso la notte, ma non li sostituisce: `neon` a mezzogiorno resta `neon`, e
 * `natural` a mezzanotte resta un diorama, solo al buio.
 *
 * **La notte non e' una soglia sull'ora, e' l'altezza del sole.** Quanto sia
 * giorno si ricava da `elevation`, non da un secondo elenco di orari: cosi' il
 * crepuscolo esiste per costruzione — dura quanto il sole ci mette ad
 * attraversare quei pochi gradi — e non c'e' modo che le due tabelle divergano.
 *
 * **A sole radente una parete illuminata supera il tetto**, ed e' proprio il
 * caso da cui `SunLight.elevation` mette in guardia: sotto i quaranta gradi
 * circa il diorama smette di leggersi «dall'alto». Qui non e' un difetto ma
 * un'ora del giorno, e non si corregge — l'alternativa sarebbe raddoppiare
 * l'ambiente di cielo, che slava la scena invece di salvarla. Quello che il
 * ciclo garantisce, e che `daylight.test.ts` verifica a ogni ora, e' che il
 * tetto non diventi mai la faccia **piu' scura**: li' il volume si perderebbe.
 */

/**
 * **Ogni** numero del ciclo. Le ore sono ore di gioco, in [0, 24).
 *
 * La traiettoria e' dichiaratamente stilizzata: nessuna latitudine, nessuna
 * stagione, nessuna equazione del tempo. Un arco simmetrico fra alba e tramonto
 * e' tutto cio' che serve a raccontare l'ora a chi guarda una citta' isometrica.
 */
export const DAYLIGHT = {
  sunrise: 6,
  sunset: 19,
  /** Ampiezza dello spazzamento dell'azimut, in gradi, da alba a tramonto. */
  azimuthSweep: 180,
  /** Sotto questa elevazione e' notte piena; sopra la seconda e' giorno pieno. */
  duskElevation: -4,
  dawnElevation: 9,
  /** Fin dove il sole vira al caldo scendendo: sopra, e' il colore del tema. */
  warmthElevation: 26,
  /** Quanto il colore del sole arriva alla tinta d'orizzonte a sole radente. */
  warmthReach: 0.75,
  /**
   * Quanto la notte porta i colori del tema verso i propri.
   *
   * Non 1: a uno la notte sarebbe identica per tutti i temi, e la firma che la
   * fase 4.7 ha costruito sparirebbe proprio nelle ore in cui la 4.8 vuole che
   * la citta' si legga.
   */
  nightReach: 0.82,
  /** Quanto resta dell'ambiente di cielo e di rimbalzo a notte piena. */
  nightSkyScale: 0.3,
  nightBounceScale: 0.45,
  /** La foschia notturna e' piu' fitta: e' quello che fa aloni sotto le insegne. */
  nightFogScale: 1.5,
  /** Emissivi a notte piena, se il tema non dichiara il proprio diurno. */
  nightEmissive: 2.1,
  dayEmissive: 0.35,
  /** Tinte della notte, mescolate a quelle del tema e mai sostituite. */
  nightSun: '#8ea6df',
  nightSky: '#5a6f9e',
  nightBounce: '#2c3550',
  nightFog: '#141d35',
  nightSkyTop: '#070c1e',
  nightSkyHorizon: '#1b2749',
  nightBackground: '#080d20',
  nightCloud: '#2b3760',
  /** Tinta verso cui vira il sole radente, all'alba e al tramonto. */
  duskSun: '#ff9a55',
} as const;

/** Ora normalizzata in [0, 24): accetta valori fuori scala e giri interi. */
export function normaliseHour(hour: number): number {
  const wrapped = hour % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

/**
 * Elevazione del sole a quest'ora, in gradi, dato il picco del tema.
 *
 * Negativa di notte, e continua: e' un seno sulla frazione di giorno, quindi
 * non c'e' un salto all'alba ne' al tramonto. Fuori dall'arco diurno il seno
 * diventa negativo da solo, che e' esattamente «il sole e' sotto l'orizzonte».
 */
export function sunElevation(hour: number, peak: number): number {
  const t = (normaliseHour(hour) - DAYLIGHT.sunrise) / (DAYLIGHT.sunset - DAYLIGHT.sunrise);
  return peak * Math.sin(Math.PI * t);
}

/** Azimut del sole a quest'ora: spazza `azimuthSweep` gradi centrati sul tema. */
export function sunAzimuth(hour: number, noon: number): number {
  const t = (normaliseHour(hour) - DAYLIGHT.sunrise) / (DAYLIGHT.sunset - DAYLIGHT.sunrise);
  return noon + (t - 0.5) * DAYLIGHT.azimuthSweep;
}

/**
 * Quanto e' giorno, 0..1, dall'altezza del sole e non dall'ora.
 *
 * `peak` entra perche' un tema con il sole basso non deve avere un giorno piu'
 * corto: la soglia si legge sull'elevazione vera, e un picco di dieci gradi
 * passerebbe la giornata in crepuscolo se le soglie fossero assolute.
 */
export function dayPhase(hour: number, peak: number): number {
  const elevation = sunElevation(hour, peak);
  const scale = Math.max(1, peak) / 48;
  return smoothstep(DAYLIGHT.duskElevation * scale, DAYLIGHT.dawnElevation * scale, elevation);
}

/** Il complemento: 1 a notte piena, 0 a sole alto. */
export function nightFactor(hour: number, peak: number): number {
  return 1 - dayPhase(hour, peak);
}

/**
 * L'atmosfera del tema portata a quest'ora.
 *
 * Tocca **solo** cio' che l'ora cambia davvero: luce, cielo, nebbia, ombra ed
 * emissivi. Acqua, vetro, AO, jitter, tone mapping ed esposizione restano quelli
 * del tema — sono la sua materia, non la sua ora.
 */
export function withHour(atmosphere: Atmosphere, hour: number): Atmosphere {
  const peak = atmosphere.sun.elevation;
  const day = dayPhase(hour, peak);
  const night = 1 - day;
  const elevation = sunElevation(hour, peak);

  // Il sole vira al caldo scendendo, non calando l'ora: e' la stessa quantita'
  // che decide il crepuscolo, quindi le due cose non possono sfasarsi.
  const warmth = (1 - smoothstep(0, DAYLIGHT.warmthElevation, elevation)) * DAYLIGHT.warmthReach;
  const reach = night * DAYLIGHT.nightReach;

  return {
    ...atmosphere,
    background: mixHex(atmosphere.background, DAYLIGHT.nightBackground, reach),
    sun: {
      ...atmosphere.sun,
      azimuth: sunAzimuth(hour, atmosphere.sun.azimuth),
      elevation,
      color: mixHex(mixHex(atmosphere.sun.color, DAYLIGHT.duskSun, warmth), DAYLIGHT.nightSun, reach),
      // Sotto l'orizzonte la diretta e' spenta del tutto: quello che resta di
      // notte e' ambiente, ed e' giusto che sia lui a raccontare la luna.
      intensity: atmosphere.sun.intensity * day,
    },
    skyLight: {
      color: mixHex(atmosphere.skyLight.color, DAYLIGHT.nightSky, reach),
      intensity: atmosphere.skyLight.intensity * lerp(DAYLIGHT.nightSkyScale, 1, day),
    },
    bounceLight: {
      color: mixHex(atmosphere.bounceLight.color, DAYLIGHT.nightBounce, reach),
      intensity: atmosphere.bounceLight.intensity * lerp(DAYLIGHT.nightBounceScale, 1, day),
    },
    fog: {
      ...atmosphere.fog,
      color: mixHex(atmosphere.fog.color, DAYLIGHT.nightFog, reach),
      density: atmosphere.fog.density * lerp(DAYLIGHT.nightFogScale, 1, day),
    },
    sky: {
      ...atmosphere.sky,
      top: mixHex(atmosphere.sky.top, DAYLIGHT.nightSkyTop, reach),
      horizon: mixHex(atmosphere.sky.horizon, DAYLIGHT.nightSkyHorizon, reach),
      // Le nuvole si spengono con il cielo. Senza, restano bianche a mezzanotte
      // e sono la cosa piu' luminosa dell'inquadratura: una citta' che si deve
      // leggere per luci accese non puo' avere il cielo piu' chiaro di lei.
      cloudTint: mixHex(atmosphere.sky.cloudTint, DAYLIGHT.nightCloud, reach),
      // L'alone del sole scende con la diretta: sotto l'orizzonte non c'e' disco
      // da alonare, e quello che resta e' il chiarore dell'ultima luce.
      sunGlow: atmosphere.sky.sunGlow * lerp(0.15, 1, day),
    },
    // Un sole sotto l'orizzonte non proietta ombre. Spegnerla e' anche cio' che
    // evita la shadow map che si allunga all'infinito a sole radente.
    shadow: atmosphere.shadow === undefined
      ? undefined
      : { ...atmosphere.shadow, strength: atmosphere.shadow.strength * day },
    emissiveStrength: lerp(
      DAYLIGHT.nightEmissive,
      atmosphere.emissiveStrength ?? DAYLIGHT.dayEmissive,
      day,
    ),
  };
}

/** Miscela due colori `#rrggbb`. In spazio sRGB: e' un colore d'autore, non un integrale. */
export function mixHex(from: string, to: string, amount: number): string {
  const t = clamp01(amount);
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  let out = '#';
  for (let shift = 16; shift >= 0; shift -= 8) {
    const channel = Math.round(lerp((a >> shift) & 0xff, (b >> shift) & 0xff, t));
    out += channel.toString(16).padStart(2, '0');
  }
  return out;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 === edge0) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
