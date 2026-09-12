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
 * **Quantita' continue, non caselle.** Un `switch` sulla stagione farebbe
 * cambiare colore all'isola intera in un fotogramma. Qui germoglio, rigoglio,
 * oro e brina sono quattro curve che salgono e scendono, sfasate di un quarto
 * d'anno l'una dall'altra, e a ogni istante due o tre di loro valgono qualcosa:
 * e' cio' che rende ottobre diverso sia da settembre sia da novembre.
 */

/** **Ogni** numero della stagione. Le fasi sono in [0, 1), zero e' l'inizio della primavera. */
export const SEASON_LOOK = {
  /**
   * L'anno di ogni slot di prato: il germoglio, poi il giallo, poi il fuoco.
   *
   * **Una riga per slot e non una tabella per stagione**, perche' e' lo slot a
   * camminare: il verde scritto nel tema sta in mezzo — e' il suo agosto — e
   * queste tre tinte sono dove quello stesso verde va negli altri trimestri.
   *
   * **In autunno due tappe, non una destinazione sola.** Una foglia non passa
   * dal verde al rosso in linea retta: prima se ne va la clorofilla e resta il
   * giallo (`leaf`), poi arrivano i rossi (`fire`). E la linea retta non e'
   * nemmeno una scorciatoia accettabile — miscelare verde e rosso in sRGB passa
   * per il cachi a meta' strada, l'unico colore che l'autunno non ha, ed e'
   * esattamente li' che l'isola si fermava con una tinta ocra sola per tutti e
   * quattro gli slot.
   *
   * **In primavera una tappa sola, e piu' corta.** Da verde a verde non c'e'
   * nessun cachi da scavalcare, quindi `bud` e' una destinazione e basta: piu'
   * gialla e piu' chiara di quella d'estate, che e' la differenza fra una foglia
   * nuova e una matura. Il difetto era l'opposto di quello d'autunno — non una
   * tinta sbagliata ma **nessuna tinta**: senza germoglio la primavera era
   * l'estate ricopiata, cioe' l'unica stagione che non si vedeva.
   *
   * **Quattro percorsi e non uno.** I quattro slot non sono quattro gradazioni
   * dello stesso prato: `flora.ts` li impila anche come i toni di una chioma,
   * dal piu' scuro in basso al piu' chiaro in cima. Portarli tutti alla stessa
   * tinta appiattirebbe l'albero proprio nelle stagioni in cui dovrebbe leggersi
   * di piu'. Qui ognuno cammina sulla **stessa rampa sfalsato di un gradino**,
   * in tutte e due le direzioni: d'autunno la chioma si accende dal basso, di
   * primavera si schiarisce tutta restando in ordine di luminanza.
   */
  grassYear: [
    // forest, e il ventre in ombra delle chiome
    { slot: PALETTE_SLOTS.grassDark, bud: '#5e9a2c', leaf: '#b3b232', fire: '#8f0000' },
    // plain, e il corpo delle chiome
    { slot: PALETTE_SLOTS.grass, bud: '#86bd38', leaf: '#d8cb34', fire: '#c12700' },
    // hill, e la cima delle chiome
    { slot: PALETTE_SLOTS.grassLight, bud: '#b0dc4e', leaf: '#f9c046', fire: '#f4ae42' },
    // le erbette del prato, le macchie d'alta quota e la punta delle betulle
    { slot: PALETTE_SLOTS.grassPale, bud: '#dcf09a', leaf: '#f9d77e', fire: '#f9c046' },
  ],
  /**
   * Quanto si cammina lungo quel percorso nel pieno dell'autunno.
   *
   * Mezzo percorso e' il giallo, uno intero e' il fuoco pieno: a 0.85 ottobre
   * sta a due terzi buoni fra i due, cioe' dove l'autunno si vede senza che
   * l'isola diventi un incendio. Sotto la meta' non ci arriva nemmeno al giallo,
   * e restava li' il grigiore che si voleva togliere.
   */
  goldReach: 0.85,

  /**
   * Quanto il prato arriva al germoglio nel pieno della primavera.
   *
   * Tre quarti e non il percorso intero: oltre, il verde del tema sparirebbe
   * sotto una tinta uguale per tutti e sette, e i sette temi resterebbero sette
   * solo tre stagioni su quattro. L'autunno puo' spingersi a 0.85 perche' li' la
   * foglia cambia davvero mestiere; qui si sveglia soltanto.
   */
  bloomReach: 0.75,

  /**
   * Il colore che il terreno rimanda in su d'autunno.
   *
   * Non e' nessuno dei quattro, ed e' voluto: `bounceLight` e' la **media** del
   * suolo vista di sotto, e il suolo e' fatto soprattutto di plain e hill — i
   * due slot chiari — non del rosso profondo della foresta. Un rimbalzo portato
   * al rosso tingerebbe di sangue le facce basse di ogni edificio.
   */
  goldBounce: '#d97f28',

  /**
   * Il colore che il terreno rimanda in su di primavera.
   *
   * Vale la nota qui sopra a parti invertite: e' la media del suolo, fatta
   * soprattutto di plain e hill. Di primavera il rimbalzo non e' solo piu'
   * verde, e' piu' **chiaro** — e' la stessa ragione per cui si schiarisce il
   * prato, e senza quella una citta' su un'isola appena rinverdita starebbe
   * ancora appoggiata sull'oliva di agosto.
   */
  bloomBounce: '#9ac24a',

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
   * Sotto questa quantita' una stagione non muove nemmeno un canale.
   *
   * **Non e' una tolleranza di gusto, e' quanto un colore a otto bit sa
   * mostrare**: `mixHex` arrotonda al canale, quindi mezzo canale su 256 e' la
   * soglia esatta sotto la quale una miscela restituisce il colore di partenza.
   *
   * Serve perche' `Math.cos(Math.PI / 2)` non fa zero ma 6e-17, e a meta' estate
   * il germoglio ne eredita il residuo — l'oro no, perche' lo stesso residuo gli
   * arriva col segno meno e cade sotto il `max`. Senza la soglia il patto
   * dell'identita' — a meta' estate torna **lo stesso array**, e chi lo riceve
   * puo' evitare una riscrittura di trentadue colori — cadrebbe per un numero
   * che nessuno vedrebbe mai.
   */
  minVisible: 1 / 512,

  /**
   * Quanto il rimbalzo dal terreno segue il prato.
   *
   * Non e' una manopola di gusto: `bounceLight` **e'** il colore del prato visto
   * di rimbalzo — il tema `natural` lo dichiara — quindi lasciarlo verde sopra
   * un'isola ocra sarebbe una luce che viene da un terreno che non c'e' piu'.
   */
  bounceReach: 0.75,
} as const;

/**
 * Un solo slot di prato portato all'autunno.
 *
 * `t` e' il cammino, non una miscela: zero e' il verde d'estate, mezzo il
 * giallo della clorofilla che se ne va, uno il fuoco pieno. Spezzarlo in due
 * gambe e' tutta la differenza fra un ottobre dorato e il cachi che si ottiene
 * tirando una retta dal verde al rosso.
 */
function alongGold(base: string, leaf: string, fire: string, t: number): string {
  return t <= 0.5 ? mixHex(base, leaf, t * 2) : mixHex(leaf, fire, (t - 0.5) * 2);
}

/**
 * Quanto germoglio, rigoglio, oro e brina ci sono adesso: quattro quantita' in
 * [0, 1].
 *
 * Sono la **stessa** fase letta con sfasature diverse, non quattro tabelle:
 * cosi' non possono divergere, e sfumano l'una nell'altra per costruzione. Il
 * rigoglio segue la curva della resa — picco a meta' estate — perche' e' la
 * stessa cosa vista dai due lati: quanto cresce e quanto si vede crescere.
 */
export interface SeasonMood {
  /** Uno a meta' estate, zero a meta' inverno. */
  readonly growth: number;
  /** Uno a meta' primavera, zero da meta' estate a meta' inverno. */
  readonly bloom: number;
  /** Uno a meta' autunno, zero dalla meta' dell'inverno a quella dell'estate. */
  readonly gold: number;
  /** Uno a meta' inverno, zero per tutta la primavera e l'estate. */
  readonly frost: number;
}

export function seasonMood(phase: number): SeasonMood {
  const turn = 2 * Math.PI * (phase - 0.125);
  const swing = Math.sin(turn);
  const lean = Math.cos(turn);
  return {
    growth: 0.5 + 0.5 * swing,
    // Germoglio e oro sono **una sola** coseno divisa dal segno, come rigoglio e
    // brina sono lo stesso seno. Da qui due cose che nessuno deve scrivere: sono
    // sfasati di mezzo anno rispetto al rigoglio, quindi l'oro sale mentre la
    // foglia smette di crescere e il germoglio sale mentre ricomincia; e non
    // possono accendersi insieme, cosi' le due destinazioni di uno slot non si
    // contendono mai lo stesso prato. Si danno il cambio a meta' estate, che e'
    // il solo istante dell'anno in cui il tema si vede com'e' scritto.
    bloom: Math.max(0, lean),
    gold: Math.max(0, -lean),
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
  const { bloom, gold, frost } = seasonMood(phase);
  const bloomAmount = bloom * SEASON_LOOK.bloomReach;
  const goldAmount = gold * SEASON_LOOK.goldReach;
  const frostAmount = frost * SEASON_LOOK.frostReach;
  const { minVisible } = SEASON_LOOK;
  if (bloomAmount < minVisible && goldAmount < minVisible && frostAmount < minVisible) return colors;

  const out = colors.slice();
  for (const { slot, bud, leaf, fire } of SEASON_LOOK.grassYear) {
    const base = colors[slot];
    if (base === undefined) continue;
    // Nell'ordine dell'anno, e i primi due non sono mai accesi insieme: quello
    // spento lascia passare il colore intatto, quindi una sola catena copre
    // tutte e quattro le stagioni senza un ramo per stagione.
    const young = mixHex(base, bud, bloomAmount);
    out[slot] = mixHex(alongGold(young, leaf, fire, goldAmount), SEASON_LOOK.frostTint, frostAmount);
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
  const { bloom, gold, frost } = seasonMood(phase);
  const { minVisible } = SEASON_LOOK;
  if (bloom < minVisible && gold < minVisible && frost < minVisible) return atmosphere;

  const groundBloom = bloom * SEASON_LOOK.bloomReach * SEASON_LOOK.bounceReach;
  const groundGold = gold * SEASON_LOOK.goldReach * SEASON_LOOK.bounceReach;
  const groundFrost = frost * SEASON_LOOK.frostReach * SEASON_LOOK.bounceReach;
  const air = frost * SEASON_LOOK.fogReach;

  // Lo stesso ordine e la stessa catena del prato, ed e' il punto: il rimbalzo
  // **e'** il prato visto di sotto, quindi se le due sequenze divergessero la
  // luce verrebbe da un terreno diverso da quello che si vede.
  let bounce = mixHex(atmosphere.bounceLight.color, SEASON_LOOK.bloomBounce, groundBloom);
  bounce = mixHex(bounce, SEASON_LOOK.goldBounce, groundGold);
  bounce = mixHex(bounce, SEASON_LOOK.frostTint, groundFrost);

  return {
    ...atmosphere,
    bounceLight: { ...atmosphere.bounceLight, color: bounce },
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
