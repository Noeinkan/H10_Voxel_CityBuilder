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
  readonly hour: number;
  readonly mode: DaylightMode;
  readonly pinned: boolean;

  /** Forza dell'ombra dell'ora corrente: di notte scende a zero. */
  readonly shadowStrength: number;

  applyTheme(next: Theme): void;
  applyAtmosphere(): void;
  advance(dt: number): void;
  setHour(next: number): void;
  setMode(mode: DaylightMode): void;
  cycleTheme(index: number): void;
}

export function createAtmosphereControl(options: AtmosphereOptions): AtmosphereControl {
  const { renderer, paletteHandle, post, skyBackground, sunWorld } = options;

  let theme = options.theme;
  let mode = options.mode;
  let hour = options.hour;
  let pinned = options.pinned;

  /** Ora con cui l'atmosfera in vigore e' stata scritta. */
  let appliedHour = hour;
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
    const atmosphere = withHour(theme.atmosphere, hour);
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

    paletteHandle.setPalette(next.colors);
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

  return {
    get theme() {
      return theme;
    },
    get hour() {
      return hour;
    },
    get mode() {
      return mode;
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
