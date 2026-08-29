export interface LaunchMode {
  debugEnabled: boolean;
  perfEnabled: boolean;
  growEnabled: boolean;
  simEnabled: boolean;
}

/**
 * La radice e' l'esperienza completa mostrata all'avvio. I parametri di scena
 * restano espliciti perche' servono come harness isolati nelle verifiche.
 *
 * `perf` sta fuori dal gate del debug come le viste: misurare la partita vera
 * — quella che parte dalla radice — e' il suo scopo, e attivarla non deve
 * cambiare cio' che si misura.
 */
export function resolveLaunchMode(params: URLSearchParams): LaunchMode {
  const hasExplicitScene = ['scene', 'terrain', 'sim', 'grow'].some((key) => params.has(key));
  const defaultExperience = !hasExplicitScene;
  const debugEnabled = params.has('debug')
    ? params.get('debug') === '1'
    : false;

  return {
    debugEnabled,
    perfEnabled: params.get('perf') === '1',
    growEnabled: params.get('grow') === '1' || defaultExperience,
    simEnabled: debugEnabled && params.get('sim') === '1',
  };
}

/**
 * Seed della partita: quello dichiarato da `?seed=`, altrimenti uno casuale.
 *
 * Il default non e' piu' un numero fisso: ogni partita nasce su un mondo
 * diverso, come in Minecraft. Il determinismo non e' perso — chi vuole
 * rivedere un'isola la dichiara nell'URL, e il seed sorteggiato viene
 * riscritto nella barra degli indirizzi da `main.ts`, quindi il ricaricamento
 * riporta lo stesso mondo.
 *
 * Lo zero non e' un seed valido (restava escluso anche dal vecchio default
 * con `||`), e un `?seed=` illeggibile vale quanto un seed assente.
 */
export function resolveSeed(params: URLSearchParams, randomUint32: () => number): number {
  const raw = params.get('seed');
  if (raw !== null) {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed !== 0) return parsed;
  }
  return randomUint32() >>> 0;
}

/**
 * La stessa partita, con la misura accesa o spenta.
 *
 * Accendere `?perf=1` **ricaricando** non e' un ripiego: pannello e referto
 * nascono con la pagina, e cio' che devono misurare e' una partita nata
 * misurata — innestare la misura a meta' corsa vorrebbe dire misurare anche
 * l'innesto. Il resto dell'indirizzo viaggia con noi, `seed` per primo (quello
 * che `main.ts` riscrive nella barra), quindi si torna sulla stessa isola; la
 * citta' che ci sta sopra la riporta l'autosalvataggio, che scatta su
 * `pagehide` prima che la pagina se ne vada.
 *
 * Senza piu' nulla da dichiarare torna `./` invece di un `?` orfano: e' la
 * radice, ed e' esattamente cio' che si sta chiedendo.
 */
export function perfToggleUrl(search: string, enabled: boolean): string {
  const params = new URLSearchParams(search);
  if (enabled) params.set('perf', '1');
  else params.delete('perf');
  const query = params.toString();
  return query === '' ? './' : `?${query}`;
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
