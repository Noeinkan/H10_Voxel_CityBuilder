import type { AmbientLight, SunLight } from '../lighting';

/**
 * Contratto di un tema grafico.
 *
 * Un tema e' solo dato: 32 colori piu' i parametri di atmosfera. Applicarlo
 * riscrive uniform e stato del renderer, mai una geometria — i vertici portano
 * l'indice di palette, non il colore, quindi cambiare tema non puo' invalidare
 * una sola mesh.
 *
 * Questo modulo importa solo tipi: e' il contratto che condividono la tabella
 * dei temi, il materiale, il cielo e la pass d'ombra.
 */

/** Prospettiva aerea: la distanza si impasta e vira al colore dell'aria. */
export interface Fog {
  /** Tinta di base, miscelata in spazio lineare prima del tone mapping. */
  readonly color: string;
  /** Densita' dell'esponenziale. 0 la spegne del tutto. */
  readonly density: number;
  /** Quanto la nebbia tende al colore del cielo invece che alla propria tinta. */
  readonly skyBlend: number;
  /**
   * Quota sotto la quale la nebbia e' piena: le valli si impastano prima delle
   * cime.
   *
   * Va tenuta intorno al pianoro dell'isola (`TERRAIN.seaLevel` piu' qualche
   * cubo). Piu' in basso il decadimento comincia sotto il suolo, e una collina
   * si ritrova gia' scontata alla sua base.
   */
  readonly heightBase: number;

  /**
   * Decadimento della densita' per unita' di quota sopra `heightBase`.
   *
   * **E' l'inverso di un'altezza, quindi segue la scala della citta'.** Valeva
   * ~0,025 quando i tetti stavano a trenta voxel: il gradiente si esauriva in
   * un centinaio di quote, che allora era tutta la citta'. Con la 4.6 le torri
   * arrivano a centocinquanta e quello stesso numero spende tutta la
   * prospettiva aerea nel primo quinto dell'edificato — sopra, ogni piano ha
   * esattamente lo stesso colore, che e' il contrario di cio' per cui la nebbia
   * di quota esiste. Alzando il tetto verticale va abbassata in proporzione.
   */
  readonly heightFalloff: number;
  /** Riscaldamento della foschia guardando verso il sole (scattering in avanti). */
  readonly sunTint: number;
}

/** Fondo procedurale. Il sole qui disegnato e' lo stesso che proietta le ombre. */
export interface Sky {
  readonly top: string;
  readonly horizon: string;
  /** Ampiezza dell'alone attorno al disco solare. */
  readonly sunGlow: number;
  /** Copertura nuvolosa, 0 spegne gli strati. */
  readonly cloudAmount: number;
  readonly cloudSpeed: number;
  readonly cloudTint: string;
}

/** Ombre proiettate del sole. Assente significa nessuna pass d'ombra. */
export interface Shadow {
  /** Quanto la diretta viene spenta all'ombra. 1 la annulla, l'ambiente resta. */
  readonly strength: number;
  /** Raggio del filtro PCF in texel. */
  readonly softness: number;
}

export interface Bloom {
  /** Soglia di luminanza in HDR lineare: sopra 1 passano solo emissivi e cielo. */
  readonly threshold: number;
  readonly strength: number;
  readonly radius: number;
}

/** Sfocatura fuori da una banda orizzontale: il segnale percettivo del diorama. */
export interface TiltShift {
  readonly strength: number;
  /** Altezza della banda a fuoco, 0 in basso e 1 in alto. */
  readonly focus: number;
  readonly width: number;
}

/** Riflesso opaco animato sulla sola faccia superiore dell'acqua. */
export interface Water {
  readonly highlight: string;
  readonly strength: number;
  readonly scale: number;
  readonly speed: number;
}

export interface Atmosphere {
  /**
   * Colore di fondo dietro alla scena, usato prima che il cielo sia disegnato e
   * come sfondo della pagina.
   *
   * Non passa dal tone mapping, mentre la geometria si': con `toneMapping:
   * 'aces'` va scelto guardando il risultato, non facendolo combaciare a occhio
   * con `fog.color`. Sono parametri distinti apposta.
   */
  readonly background: string;

  /**
   * Sole direzionale fisso nel mondo. Sostituisce la vecchia tabella
   * `faceLight[6]`: da una direzione e tre colori discendono da soli il volume,
   * le ombre colorate e la coerenza con il disco solare in cielo.
   */
  readonly sun: SunLight;
  /** Ambiente dall'alto. Tinge le facce in ombra: e' cio' che le fa azzurre. */
  readonly skyLight: AmbientLight;
  /** Ambiente dal basso, il rimbalzo del terreno. */
  readonly bounceLight: AmbientLight;

  /** Quanto scuriscono gli angoli concavi. Consumata dall'AO per-vertice. */
  readonly aoStrength: number;
  /**
   * Ampiezza della variazione cromatica per voxel, da un hash della cella mondo.
   * E' l'antidoto alla piattezza: senza, ogni voxel di uno slot ha esattamente
   * lo stesso colore.
   *
   * Fascia utile misurata a schermo: 0.14 per i temi puliti, 0.24 per quelli
   * materici. Sotto 0.10 non si legge, sopra 0.35 e' rumore.
   */
  readonly colorJitter: number;

  readonly fog: Fog;
  readonly sky: Sky;
  readonly shadow?: Shadow;
  readonly bloom?: Bloom;
  readonly tilt?: TiltShift;

  /** Risposta economica del vetro, senza trasparenza o materiale separato. */
  readonly glassTint?: string;
  readonly glassLift?: number;
  /** Intensita' delle superfici energetiche. Sopra 1 il bloom le raccoglie. */
  readonly emissiveStrength?: number;
  readonly water?: Water;

  readonly toneMapping: 'none' | 'aces';
  readonly exposure: number;
}

export interface Theme {
  readonly id: string;
  readonly name: string;
  /** 32 colori esadecimali, negli stessi slot di `paletteSlots.ts`. */
  readonly colors: readonly string[];
  readonly atmosphere: Atmosphere;
}
