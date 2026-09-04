import { mixHex } from './daylight';
import { PALETTE_SLOTS } from './paletteSlots';
import type { Atmosphere } from './themes/theme';

/**
 * L'anno visto dal renderer, in TypeScript puro.
 *
 * Stessa natura di `daylight.ts`, e per le stesse ragioni: non importa Three,
 * non tocca il DOM, gira nei test in ambiente node. Entra una fase dell'anno e
 * un tema, esce lo stesso tema piegato alla stagione — colori e atmosfera,
 * nessuna geometria. I vertici portano l'**indice** di palette e non il colore,
 * quindi far ingiallire un prato non invalida una sola mesh: e' la stessa
 * riscrittura di uniform che fa un cambio di tema.
 *
 * **Il tema resta la firma, la stagione lo modula.** E' la riga di `withHour`,
 * ripetuta qui perche' vale identica: il verde scritto nel tema e' il suo verde
 * d'**estate**, e le altre tre stagioni lo piegano invece di sostituirlo. Cosi'
 * i sette temi restano sette e non ventotto — `neon` in autunno resta `neon`,
 * solo con i prati virati — e aggiungerne uno ottavo non chiede di dipingere
 * quattro palette.
 *
 * **La stagione entra dalla stessa porta della resa.** La fase la calcola
 * `src/sim/seasons.ts` da `tickCount`, e da li' arriva sia il moltiplicatore del
 * raccolto sia questo: le due non possono raccontare due momenti diversi, ed e'
 * il punto — un inverno che si vede e non si sente sarebbe decorazione.
 *
 * **Tre quantita' continue, non quattro caselle.** Un `switch` sulla stagione
 * farebbe cambiare colore all'isola intera in un fotogramma. Qui rigoglio, oro e
 * brina sono tre curve che salgono e scendono, sfasate di un quarto d'anno
 * l'una dall'altra, e a ogni istante due di loro valgono qualcosa: e' cio' che
 * rende ottobre diverso sia da settembre sia da novembre.
 */

/** **Ogni** numero della stagione. Le fasi sono in [0, 1), zero e' l'inizio della primavera. */
export const SEASON_LOOK = {
  /**
   * Il giallo dell'autunno, verso cui vira il prato.
   *
   * Un ocra caldo e non un giallo puro: mescolato a un verde saturo un giallo
   * primario da' un verde acido, mentre l'ocra porta il prato dove ci si aspetta
   * di vederlo. Vale per tutti i temi perche' e' una **destinazione**, e quanta
   * strada si faccia verso di essa dipende da dove il tema parte.
   */
  goldTint: '#c07a35',
  /** Quanto il prato arriva all'ocra nel pieno dell'autunno. */
  goldReach: 0.62,

  /**
   * Il pallido freddo dell'inverno.
   *
   * Non e' bianco: un prato portato al bianco puro diventa neve, e la neve e'
   * un'altra cosa — chiede un blocco suo, un mesher che la posi e un modo di
   * toglierla. Questo e' erba secca sotto una luce fredda, che e' l'inverno che
   * questa citta' puo' raccontare senza cambiare una geometria.
   */
  frostTint: '#b9c3c4',
  /** Quanto il prato arriva alla brina nel pieno dell'inverno. */
  frostReach: 0.58,

  /**
   * Quanto la nebbia si raffredda e si infittisce d'inverno.
   *
   * La densita' e' un moltiplicatore e non un valore: un tema che ha scelto una
   * prospettiva aerea leggera deve restare leggero anche a gennaio, solo un po'
   * meno.
   */
  fogTint: '#c3ced6',
  fogReach: 0.35,
  fogDensityGain: 0.45,

  /** Quanto l'orizzonte si smorza d'inverno: e' il cielo basso che si chiude. */
  horizonReach: 0.22,

  /**
   * Quanto il rimbalzo dal terreno segue il prato.
   *
   * Non e' una manopola di gusto: `bounceLight` **e'** il colore del prato visto
   * di rimbalzo — il tema `natural` lo dichiara — quindi lasciarlo verde sopra
   * un'isola ocra sarebbe una luce che viene da un terreno che non c'e' piu'.
   */
  bounceReach: 0.75,
} as const;

/** Gli slot di palette che la stagione tocca: il prato e nient'altro. */
const VEGETATION: readonly number[] = [
  PALETTE_SLOTS.grass,
  PALETTE_SLOTS.grassDark,
  PALETTE_SLOTS.grassLight,
  PALETTE_SLOTS.grassPale,
];

/**
 * Quanto rigoglio, oro e brina ci sono adesso: tre quantita' in [0, 1].
 *
 * Sono la **stessa** fase letta con tre sfasature diverse, non tre tabelle: cosi'
 * non possono divergere, e sfumano l'una nell'altra per costruzione. Il rigoglio
 * segue la curva della resa — picco a meta' estate — perche' e' la stessa cosa
 * vista dai due lati: quanto cresce e quanto si vede crescere.
 */
export interface SeasonMood {
  /** Uno a meta' estate, zero a meta' inverno. */
  readonly growth: number;
  /** Uno a meta' autunno, zero per tutta la primavera e l'estate. */
  readonly gold: number;
  /** Uno a meta' inverno, zero per tutta la primavera e l'estate. */
  readonly frost: number;
}

export function seasonMood(phase: number): SeasonMood {
  const turn = 2 * Math.PI * (phase - 0.125);
  const swing = Math.sin(turn);
  return {
    growth: 0.5 + 0.5 * swing,
    // Sfasata di un quarto d'anno: l'oro sale mentre il rigoglio scende, ed e'
    // esattamente cio' che succede a una foglia.
    gold: Math.max(0, -Math.cos(turn)),
    frost: Math.max(0, -swing),
  };
}

/**
 * I colori del tema portati a questa stagione.
 *
 * Tocca **solo** i quattro slot del prato. Asfalto, mattone, vetro e metallo non
 * hanno una stagione: farli virare sarebbe un filtro sull'immagine, non un anno
 * che passa — e la citta' smetterebbe di essere lo stesso posto.
 *
 * Torna l'array del tema **inalterato** quando non c'e' niente da fare, cosi' il
 * chiamante puo' confrontare per identita' ed evitare una riscrittura di
 * trentadue colori a estate piena.
 */
export function seasonColors(colors: readonly string[], phase: number): readonly string[] {
  const { gold, frost } = seasonMood(phase);
  const goldAmount = gold * SEASON_LOOK.goldReach;
  const frostAmount = frost * SEASON_LOOK.frostReach;
  if (goldAmount <= 0 && frostAmount <= 0) return colors;

  const out = colors.slice();
  for (const slot of VEGETATION) {
    const base = colors[slot];
    if (base === undefined) continue;
    out[slot] = mixHex(mixHex(base, SEASON_LOOK.goldTint, goldAmount), SEASON_LOOK.frostTint, frostAmount);
  }
  return out;
}

/**
 * L'atmosfera del tema portata a questa stagione.
 *
 * Tocca **solo** cio' che la stagione cambia davvero: il rimbalzo dal terreno,
 * che e' il prato visto da sotto, e l'aria — nebbia e cielo basso. Sole,
 * esposizione, tone mapping, vetro e AO restano quelli del tema, per la stessa
 * ragione per cui `withHour` non li tocca: sono la sua materia, non il suo mese.
 *
 * **L'ora si applica dopo.** Le due composte non commutano — la notte spegne il
 * rimbalzo, e spegnerne uno gia' ingiallito non e' come ingiallirne uno gia'
 * spento — e l'ordine giusto e' questo: la stagione dipinge il posto, l'ora lo
 * illumina.
 */
export function withSeason(atmosphere: Atmosphere, phase: number): Atmosphere {
  const { gold, frost } = seasonMood(phase);
  if (gold <= 0 && frost <= 0) return atmosphere;

  const groundGold = gold * SEASON_LOOK.goldReach * SEASON_LOOK.bounceReach;
  const groundFrost = frost * SEASON_LOOK.frostReach * SEASON_LOOK.bounceReach;
  const air = frost * SEASON_LOOK.fogReach;

  return {
    ...atmosphere,
    bounceLight: {
      ...atmosphere.bounceLight,
      color: mixHex(
        mixHex(atmosphere.bounceLight.color, SEASON_LOOK.goldTint, groundGold),
        SEASON_LOOK.frostTint,
        groundFrost,
      ),
    },
    fog: {
      ...atmosphere.fog,
      color: mixHex(atmosphere.fog.color, SEASON_LOOK.fogTint, air),
      density: atmosphere.fog.density * (1 + frost * SEASON_LOOK.fogDensityGain),
    },
    sky: {
      ...atmosphere.sky,
      horizon: mixHex(atmosphere.sky.horizon, SEASON_LOOK.fogTint, frost * SEASON_LOOK.horizonReach),
    },
  };
}
