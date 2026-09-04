import { ACESFilmicToneMapping, Color, NoToneMapping, SRGBColorSpace } from 'three';
import type { Vector3, WebGLRenderer } from 'three';
import {
  DAYLIGHT,
  DAYLIGHT_MODE,
  modeHour,
  nightFactor,
  normaliseHour,
  withHour,
  type DaylightMode,
} from './daylight';
import { sunDirection } from './lighting';
import type { PostProcessingHandle } from './PostProcessing';
import { seasonColors, withSeason } from './season';
import type { SkyBackgroundHandle } from './SkyBackground';
import { THEMES, type Theme } from './themes';
import type { VoxelMaterialHandle } from './VoxelMaterial';

/**
 * Passo minimo, in ore, fra due riscritture dell'atmosfera.
 *
 * Un centesimo d'ora e' mezzo minuto di gioco: sotto, il sole si sposta di
 * meno di un decimo di grado e non c'e' immagine da guadagnare.
 */
const HOUR_STEP = 0.01;

/**
 * Passo minimo, in frazione d'anno, fra due riscritture della stagione.
 *
 * Un anno dura trecentosessanta secondi a velocita' uno, quindi un
 * duecentocinquantaseiesimo e' poco piu' di un secondo: piu' fitto di cosi' non
 * si vede, e ogni scatto costa **anche** una riscrittura di trentadue colori —
 * l'ora da sola non la paga, la stagione si'.
 */
const SEASON_STEP = 1 / 256;

export interface AtmosphereOptions {
  readonly renderer: WebGLRenderer;
  readonly paletteHandle: VoxelMaterialHandle;
  readonly post: PostProcessingHandle;
  readonly skyBackground: SkyBackgroundHandle;

  /** Scritto a ogni riscrittura: la direzione del sole nel mondo, riusata dal frame. */
  readonly sunWorld: Vector3;

  readonly theme: Theme;
  readonly mode: DaylightMode;
  readonly hour: number;

  /**
   * Dove sta l'anno, in [0, 1). E' `yearPhaseAt(tickCount)` della simulazione,
   * ed e' l'unico numero che l'engine riceve sulla stagione: la resa e il colore
   * discendono entrambi da qui, quindi non possono raccontare due momenti
   * diversi. Assente, la citta' resta all'estate del tema.
   */
  readonly season?: number;
  /** Vero se la fase arriva da `?season=`: l'anno resta fermo dove il parametro lo mette. */
  readonly seasonPinned?: boolean;

  /** Vero se l'ora arriva da `?hour=`: il ciclo resta fermo finche' non si tocca il bottone. */
  readonly pinned: boolean;

  /** Cablaggio verso l'HUD, che l'engine non conosce. */
  readonly onTheme?: (theme: Theme) => void;
  readonly onMode?: (mode: DaylightMode) => void;
}

/**
 * Chi possiede tema, ora e modo del giorno, e li scrive dove vanno.
 *
 * Nasce dividendo il bootstrap, dove queste sette variabili vivevano fra le
 * altre quaranta. Stanno insieme perche' si leggono a vicenda e nessun altro le
 * legge: l'ora decide l'atmosfera, l'atmosfera decide la forza dell'ombra, e il
 * tema decide da quale curva partono entrambe.
 *
 * Sta in `engine/` e non in `game/` perche' scrive nel renderer, nel composer e
 * nel materiale: e' cablaggio dell'engine, non una regola di gioco.
 */
export interface AtmosphereControl {
  readonly theme: Theme;
  /**
   * Il tema **come si vede adesso**: colori e atmosfera gia' piegati alla
   * stagione, l'ora ancora no.
   *
   * Esiste perche' fuori di qui ci sono altri due consumatori della palette — la
   * pioggia e il traffico — e leggere `theme` da la citta' di un altro mese: i
   * prati sarebbero ocra e le barche verdi. `theme` resta l'**identita'** (id,
   * nome, cosa il giocatore ha scelto), questo e' il suo aspetto.
   */
  readonly look: Theme;
  readonly hour: number;
  readonly mode: DaylightMode;
  readonly season: number;
  readonly seasonPinned: boolean;
  readonly pinned: boolean;

  /** Forza dell'ombra dell'ora corrente: di notte scende a zero. */
  readonly shadowStrength: number;

  applyTheme(next: Theme): void;
  applyAtmosphere(): void;
  advance(dt: number): void;
  setHour(next: number): void;
  setSeason(phase: number): void;
  /** Inchioda l'anno a una fase, o lo restituisce alla simulazione con `null`. */
  pinSeason(phase: number | null): void;
  setMode(mode: DaylightMode): void;
  cycleTheme(index: number): void;
}

export function createAtmosphereControl(options: AtmosphereOptions): AtmosphereControl {
  const { renderer, paletteHandle, post, skyBackground, sunWorld } = options;

  let theme = options.theme;
  let mode = options.mode;
  let hour = options.hour;
  let season = options.season ?? 0;
  /**
   * Vero se la stagione arriva da `?season=` o dall'hook di debug.
   *
   * Ha bisogno di un interruttore proprio e non puo' riusare quello dell'ora:
   * l'anno lo scrive il frame a ogni giro dalla simulazione, quindi senza un
   * fermo una fase scelta a mano durerebbe esattamente un fotogramma. E' anche
   * cio' che rende verificabile a schermo un inverno che altrimenti si aspetta
   * quattro minuti.
   */
  let seasonPinned = options.seasonPinned ?? false;
  let pinned = options.pinned;

  /**
   * Il tema piegato alla stagione: si ricalcola quando cambia uno dei due, e non
   * a ogni frame. E' anche cio' che l'HUD e gli altri due consumatori di palette
   * leggono, quindi ce n'e' una copia sola e nessuno puo' dipingere un mese
   * diverso da quello in cui la citta' sta.
   */
  let look = seasonedTheme(theme, season);

  /** Ora con cui l'atmosfera in vigore e' stata scritta. */
  let appliedHour = hour;
  /** Fase d'anno con cui la palette in vigore e' stata scritta. */
  let appliedSeason = season;
  let shadowStrength = theme.atmosphere.shadow?.strength ?? 0;

  /** Riusato a ogni scrittura del fondo: `applyAtmosphere` gira spesso. */
  const backgroundColor = new Color();

  /**
   * Riscrive la sola atmosfera dell'ora corrente: uniform e stato del renderer.
   *
   * Sta separata da `applyTheme` perche' e' l'unica delle due che l'ora chiama, e
   * la chiama molte volte per partita: il tone mapping e la palette non c'entrano
   * niente con il momento della giornata, e ricompilare un programma o riscrivere
   * trentadue colori a ogni scatto d'orologio sarebbe lavoro per niente.
   */
  function applyAtmosphere(): void {
    // Prima la stagione, poi l'ora, e l'ordine non e' indifferente: la notte
    // spegne il rimbalzo dal terreno, e spegnerne uno gia' ingiallito non e' la
    // stessa cosa che ingiallirne uno gia' spento. La stagione dipinge il posto,
    // l'ora lo illumina.
    const atmosphere = withHour(look.atmosphere, hour);
    appliedHour = hour;

    paletteHandle.setAtmosphere(atmosphere);
    post.setAtmosphere(atmosphere);
    skyBackground.setAtmosphere(atmosphere);
    skyBackground.setAspect(window.innerWidth / Math.max(1, window.innerHeight));
    sunWorld.fromArray(sunDirection(atmosphere.sun.azimuth, atmosphere.sun.elevation));
    shadowStrength = atmosphere.shadow?.strength ?? 0;
    // La luce che esce dalle facciate vale solo di notte, e la notte e' la stessa
    // quantita' da cui discende tutto il resto dell'ora.
    paletteHandle.setNight(nightFactor(hour, theme.atmosphere.sun.elevation));

    backgroundColor.setStyle(atmosphere.background, SRGBColorSpace);
    renderer.setClearColor(backgroundColor, 1);

    // Il fondo della pagina era duplicato a mano nel CSS: qui c'e' una sola fonte,
    // cosi' il primo frame non lampeggia con il colore di un altro tema.
    document.body.style.background = atmosphere.background;
  }

  /**
   * Applica un tema: colori, atmosfera, fondo e tone mapping.
   *
   * Non tocca una sola geometria — i vertici portano l'indice di palette, non il
   * colore. Il conteggio di quad e i byte di geometria nell'overlay devono
   * restare fermi mentre si cambia tema: e' la verifica che l'invariante regge.
   */
  function applyTheme(next: Theme): void {
    theme = next;
    look = seasonedTheme(theme, season);
    appliedSeason = season;

    paletteHandle.setPalette(look.colors);
    applyAtmosphere();

    const toneMapping =
      next.atmosphere.toneMapping === 'aces' ? ACESFilmicToneMapping : NoToneMapping;
    if (renderer.toneMapping !== toneMapping) {
      renderer.toneMapping = toneMapping;
      // Il tone mapping e' un define, non un uniform: cambiarlo ricompila il
      // programma. E' l'unica cosa che un cambio di tema ricostruisce, e non
      // tocca comunque una sola geometria.
      paletteHandle.material.needsUpdate = true;
    }
    renderer.toneMappingExposure = next.atmosphere.exposure;
  }

  /** Porta l'orologio a un'ora scelta a mano, e la applica subito. */
  function setHour(next: number): void {
    hour = normaliseHour(next);
    applyAtmosphere();
  }

  /**
   * Porta l'anno dove la simulazione dice che sia.
   *
   * La chiama il frame a ogni giro, ma **scrive** solo quando la fase si e'
   * mossa abbastanza: una stagione costa piu' di un'ora — trentadue colori oltre
   * agli uniform — e a sessanta hertz sarebbe la stessa palette riscritta
   * ventimila volte per un giallo che non si distingue.
   */
  function setSeason(phase: number): void {
    if (!Number.isFinite(phase) || seasonPinned) return;
    season = phase - Math.floor(phase);
    const drift = Math.abs(season - appliedSeason);
    if (Math.min(drift, 1 - drift) < SEASON_STEP) return;

    look = seasonedTheme(theme, season);
    appliedSeason = season;
    paletteHandle.setPalette(look.colors);
    applyAtmosphere();
  }

  /**
   * Inchioda l'anno a una fase scelta a mano, o lo scioglie.
   *
   * Scioglierlo non riporta la stagione dov'era: il frame dopo la simulazione
   * scrive la sua, e sarebbe uno stacco in piu' per niente.
   */
  function pinSeason(phase: number | null): void {
    seasonPinned = phase !== null;
    if (phase === null || !Number.isFinite(phase)) return;
    // Senza passare da `setSeason`: quello ha un passo minimo, giusto per un
    // anno che cammina e sbagliato per una fase chiesta a mano, che deve
    // arrivare esatta anche se dista un millesimo da quella in vigore.
    season = phase - Math.floor(phase);
    appliedSeason = season;
    look = seasonedTheme(theme, season);
    paletteHandle.setPalette(look.colors);
    applyAtmosphere();
  }

  return {
    get theme() {
      return theme;
    },
    get look() {
      return look;
    },
    get hour() {
      return hour;
    },
    get mode() {
      return mode;
    },
    get season() {
      return season;
    },
    get seasonPinned() {
      return seasonPinned;
    },
    get pinned() {
      return pinned;
    },
    get shadowStrength() {
      return shadowStrength;
    },

    applyTheme,
    applyAtmosphere,
    setHour,
    setSeason,
    pinSeason,

    /**
     * Avanza l'orologio e riscrive l'atmosfera solo quando l'ora e' cambiata
     * abbastanza da vedersi.
     *
     * Il passo minimo non e' un'ottimizzazione micro: `applyAtmosphere` scrive
     * decine di uniform e ricompone stringhe di colore, e farlo a sessanta hertz
     * per uno spostamento di un centesimo di grado del sole e' spesa senza
     * immagine.
     */
    advance(dt: number): void {
      if (pinned || mode !== DAYLIGHT_MODE.cycle) return;
      // L'ora avanza **sempre**; a essere condizionata e' la scrittura. Fermare
      // anche l'orologio significherebbe non avanzare mai, perche' il passo di un
      // frame e' sempre sotto la soglia.
      hour = normaliseHour(hour + (dt * 24) / DAYLIGHT.daySeconds);
      const drift = Math.abs(hour - appliedHour);
      if (Math.min(drift, 24 - drift) >= HOUR_STEP) applyAtmosphere();
    },

    /**
     * Ciclo, giorno fisso o notte fissa.
     *
     * Tornando al ciclo l'ora **non** si tocca: il sole riparte da dov'era, e
     * riportarlo a mezzogiorno sarebbe uno stacco che nessuno ha chiesto. Andando
     * su un modo fisso si', perche' quello e' esattamente cio' che si e' chiesto.
     */
    setMode(next: DaylightMode): void {
      mode = next;
      // Un `?hour=` in coda all'URL vincerebbe su ogni clic successivo: il primo
      // comando di gioco lo scioglie, o il bottone resterebbe inerte senza dirlo.
      pinned = false;
      const fixed = modeHour(next);
      if (fixed !== null) setHour(fixed);
      options.onMode?.(next);
      console.info(`[daylight] ${next}`);
    },

    cycleTheme(index: number): void {
      const next = THEMES[index];
      if (next === undefined || next.id === theme.id) return;
      applyTheme(next);
      options.onTheme?.(next);
      console.info(`[theme] ${next.name} (${next.id}), no mesh rebuild`);
    },
  };
}

/**
 * Il tema con addosso la stagione, identita' compresa.
 *
 * `id` e `name` restano quelli: un `natural` d'autunno e' ancora `natural`, o
 * `cycleTheme` non riconoscerebbe piu' il tema in vigore e la scorciatoia
 * riapplicherebbe quello che c'e' gia'.
 */
function seasonedTheme(theme: Theme, phase: number): Theme {
  const colors = seasonColors(theme.colors, phase);
  const atmosphere = withSeason(theme.atmosphere, phase);
  // A estate piena le due tornano gli originali per identita': in quel caso il
  // tema stesso e' gia' il suo aspetto, e non serve un secondo oggetto.
  return colors === theme.colors && atmosphere === theme.atmosphere
    ? theme
    : { ...theme, colors, atmosphere };
}
