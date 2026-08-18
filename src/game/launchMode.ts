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
    : defaultExperience;

  return {
    debugEnabled,
    growEnabled: params.get('grow') === '1' || defaultExperience,
    simEnabled: debugEnabled && params.get('sim') === '1',
  };
}
