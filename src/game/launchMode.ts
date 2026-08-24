export interface LaunchMode {
  debugEnabled: boolean;
  growEnabled: boolean;
  simEnabled: boolean;
}

/**
 * La radice e' l'esperienza completa mostrata all'avvio. I parametri di scena
 * restano espliciti perche' servono come harness isolati nelle verifiche.
 */
export function resolveLaunchMode(params: URLSearchParams): LaunchMode {
  const hasExplicitScene = ['scene', 'terrain', 'sim', 'grow'].some((key) => params.has(key));
  const defaultExperience = !hasExplicitScene;
  const debugEnabled = params.has('debug')
    ? params.get('debug') === '1'
    : false;

  return {
    debugEnabled,
    growEnabled: params.get('grow') === '1' || defaultExperience,
    simEnabled: debugEnabled && params.get('sim') === '1',
  };
}

/**
 * L'indirizzo del campionario dei voxel, con addosso il look che si sta guardando.
 *
 * Sta accanto a `resolveLaunchMode` perche' e' la stessa corrispondenza letta al
 * contrario — da modalita' a parametri invece che da parametri a modalita' — e
 * due copie di quella tabella divergerebbero al primo parametro nuovo.
 *
 * **Tema e ora viaggiano insieme al link** perche' il campionario esiste per
 * confrontare: aprirlo a mezzogiorno mentre la citta' e' al neon di notte
 * mostrerebbe un vocabolario diverso da quello che ha fatto nascere la domanda.
 * Entrambi valgono anche senza `debug`, e l'ora **ferma** l'orologio — un
 * campione che cambia luce da solo mentre lo si giudica non e' un campione.
 *
 * Non porta `debug=1`: la partita resta viva nella scheda di sotto e questa e'
 * una scena da guardare, non una da misurare. Il referto del campionario si apre
 * da se' (e' la legenda dello strumento, non una metrica), gli overlay tecnici
 * restano dietro `F3`.
 */
export function swatchUrl(theme: string, hour: number): string {
  const params = new URLSearchParams({
    scene: 'swatch',
    theme,
    hour: hour.toFixed(2),
  });
  return `?${params.toString()}`;
}
