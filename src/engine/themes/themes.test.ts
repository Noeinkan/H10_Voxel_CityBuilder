import { describe, expect, it } from 'vitest';
import { faceLuminance } from '../lighting';
import { isValidHexColor, PALETTE_SIZE, toPaletteArray } from '../palette';
import { DEFAULT_THEME_ID, resolveTheme, themeById, THEMES } from './index';

describe('temi', () => {
  it('ce n’e’ almeno uno e gli id sono univoci', () => {
    expect(THEMES.length).toBeGreaterThan(0);
    const ids = THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('il tema di default esiste ed e’ quello che risolve i valori assenti', () => {
    expect(themeById(DEFAULT_THEME_ID)).toBeDefined();
    expect(resolveTheme(null).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme('non-esiste').id).toBe(DEFAULT_THEME_ID);
    for (const theme of THEMES) {
      expect(resolveTheme(theme.id)).toBe(theme);
    }
  });

  it('ogni tema riempie esattamente i 32 slot con colori validi', () => {
    for (const theme of THEMES) {
      expect(theme.colors.length, theme.id).toBe(PALETTE_SIZE);
      for (let i = 0; i < theme.colors.length; i++) {
        expect(isValidHexColor(theme.colors[i]), `${theme.id}[${i}]`).toBe(true);
      }
      // Lo slot 0 e' il vuoto: non viene mai disegnato, ma deve restare nero
      // perche' nessuno si affidi al suo colore per sbaglio.
      expect(theme.colors[0], theme.id).toBe('#000000');
    }
  });

  it('ogni tema si converte nell’uniform senza sorprese', () => {
    for (const theme of THEMES) {
      const array = toPaletteArray(theme.colors);
      expect(array.length).toBe(PALETTE_SIZE * 3);
      for (const value of array) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('la faccia superiore resta la piu’ illuminata in ogni tema', () => {
    // Prima questo vincolo era dichiarato a mano come `faceLight[4] = 1.0`. Ora
    // discende dal sole e dall'ambiente, quindi va verificato: un tema con il
    // sole troppo basso farebbe brillare una parete piu' del tetto, e il diorama
    // smetterebbe di leggersi dall'alto. Se salta, alza `sun.elevation` oppure
    // `skyLight.intensity` invece di allentare il test.
    for (const theme of THEMES) {
      const luminance = faceLuminance(theme.atmosphere);
      expect(luminance, theme.id).toHaveLength(6);
      expect(Math.max(...luminance), theme.id).toBe(luminance[4]);
    }
  });

  it('il sole di ogni tema sta sopra l’orizzonte con margine', () => {
    for (const theme of THEMES) {
      const { sun } = theme.atmosphere;
      // Sotto i 30 gradi il primato del tetto si perde con i valori d'ambiente
      // in uso: vedi `lighting.test.ts`.
      expect(sun.elevation, theme.id).toBeGreaterThanOrEqual(30);
      expect(sun.elevation, theme.id).toBeLessThanOrEqual(90);
      expect(isValidHexColor(sun.color), theme.id).toBe(true);
      expect(sun.intensity, theme.id).toBeGreaterThanOrEqual(0);
      expect(sun.intensity, theme.id).toBeLessThanOrEqual(2);
      expect(sun.wrap, theme.id).toBeGreaterThanOrEqual(0);
      expect(sun.wrap, theme.id).toBeLessThanOrEqual(1);
    }
  });

  it('gli ambienti sono colori validi con intensita’ in range', () => {
    for (const theme of THEMES) {
      for (const ambient of [theme.atmosphere.skyLight, theme.atmosphere.bounceLight]) {
        expect(isValidHexColor(ambient.color), theme.id).toBe(true);
        expect(ambient.intensity, theme.id).toBeGreaterThanOrEqual(0);
        expect(ambient.intensity, theme.id).toBeLessThanOrEqual(2);
      }
      // Il cielo deve illuminare piu' del rimbalzo, altrimenti le facce in ombra
      // diventano piu' chiare dei tetti e il volume si rovescia.
      expect(
        theme.atmosphere.skyLight.intensity,
        theme.id,
      ).toBeGreaterThan(theme.atmosphere.bounceLight.intensity);
    }
  });

  it('nebbia e cielo hanno colori validi e parametri in range', () => {
    for (const theme of THEMES) {
      const { fog, sky, background } = theme.atmosphere;
      expect(isValidHexColor(background), theme.id).toBe(true);
      expect(isValidHexColor(fog.color), theme.id).toBe(true);
      expect(fog.density, theme.id).toBeGreaterThanOrEqual(0);
      // La camera ortografica resta a centinaia di unita' dal target: densita'
      // maggiori saturano l'esponenziale e tingono di nebbia anche il primo piano.
      expect(fog.density, theme.id).toBeLessThanOrEqual(0.0005);
      for (const value of [fog.skyBlend, fog.sunTint]) {
        expect(value, theme.id).toBeGreaterThanOrEqual(0);
        expect(value, theme.id).toBeLessThanOrEqual(1);
      }
      expect(fog.heightFalloff, theme.id).toBeGreaterThanOrEqual(0);
      // `1 / heightFalloff` e' l'altezza di scala del profilo, e deve stare
      // nell'ordine dell'altezza dell'edificato: sopra 0,02 il gradiente si
      // esaurisce nei primi cinquanta cubi e le torri della 4.6 hanno tutte lo
      // stesso colore, che e' esattamente cio' che la 4.7 e' venuta a togliere.
      expect(fog.heightFalloff, theme.id).toBeLessThanOrEqual(0.02);
      // Il velo di quota non e' nebbia: sopra un quarto smette di separare le
      // quote e comincia solo a slavare la citta' bassa.
      expect(fog.altitudeLift, theme.id).toBeGreaterThanOrEqual(0);
      expect(fog.altitudeLift, theme.id).toBeLessThanOrEqual(0.25);

      expect(isValidHexColor(sky.top), theme.id).toBe(true);
      expect(isValidHexColor(sky.horizon), theme.id).toBe(true);
      expect(isValidHexColor(sky.cloudTint), theme.id).toBe(true);
      for (const value of [sky.sunGlow, sky.cloudAmount]) {
        expect(value, theme.id).toBeGreaterThanOrEqual(0);
        expect(value, theme.id).toBeLessThanOrEqual(1);
      }
      expect(sky.cloudSpeed, theme.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('lo strato di nuvole, dove c’e’, sta sopra la citta’ e lascia varchi', () => {
    for (const theme of THEMES) {
      const deck = theme.atmosphere.cloudDeck;
      if (deck === undefined) continue;

      // Sopra il pianoro dell'isola e sotto le cime della 4.6: piu' in basso e
      // copre la citta' al suolo e basta, piu' in alto e non ci passa niente
      // sotto, cioe' non separa piu' nessuna quota da nessun'altra.
      expect(deck.height, theme.id).toBeGreaterThan(theme.atmosphere.fog.heightBase);
      expect(deck.height, theme.id).toBeLessThan(150);
      expect(deck.thickness, theme.id).toBeGreaterThan(0);

      for (const value of [deck.amount, deck.coverage]) {
        expect(value, theme.id).toBeGreaterThanOrEqual(0);
        expect(value, theme.id).toBeLessThanOrEqual(1);
      }
      // **Una copertura piena e' un coperchio**, e un coperchio cancella i
      // livelli inferiori invece di lasciarli intravedere: e' esattamente cio'
      // che questo strato esiste per non fare.
      expect(deck.coverage, theme.id).toBeLessThan(0.8);

      // La scala e' un divisore del punto di attraversamento, e macchie sotto
      // la decina di voxel non sono nuvole ma rumore per pixel.
      expect(deck.scale, theme.id).toBeGreaterThan(10);
      expect(deck.speed, theme.id).toBeGreaterThanOrEqual(0);
      if (deck.tint !== undefined) expect(isValidHexColor(deck.tint), theme.id).toBe(true);
    }
  });

  it('i parametri di superficie e di output restano in range', () => {
    for (const theme of THEMES) {
      const a = theme.atmosphere;
      expect(a.aoStrength, theme.id).toBeGreaterThanOrEqual(0);
      expect(a.aoStrength, theme.id).toBeLessThanOrEqual(1);
      // Tetto misurato a schermo, non stimato: a 0.45 il terreno diventa
      // francamente rumoroso, sotto 0.10 il jitter non si legge proprio. La
      // fascia utile sta fra 0.14 e 0.24 a seconda di quanto il tema vuole
      // sembrare materico.
      expect(a.colorJitter, theme.id).toBeGreaterThanOrEqual(0);
      expect(a.colorJitter, theme.id).toBeLessThanOrEqual(0.35);

      for (const color of [a.glassTint, a.water?.highlight]) {
        if (color !== undefined) expect(isValidHexColor(color), theme.id).toBe(true);
      }
      expect(a.glassLift ?? 0, theme.id).toBeGreaterThanOrEqual(0);
      expect(a.glassLift ?? 0, theme.id).toBeLessThanOrEqual(1);
      expect(a.emissiveStrength ?? 0, theme.id).toBeGreaterThanOrEqual(0);
      expect(a.emissiveStrength ?? 0, theme.id).toBeLessThanOrEqual(2);
      expect(a.water?.strength ?? 0, theme.id).toBeGreaterThanOrEqual(0);
      expect(a.water?.strength ?? 0, theme.id).toBeLessThanOrEqual(1);
      if (a.water?.shallowTint !== undefined) {
        expect(isValidHexColor(a.water.shallowTint), theme.id).toBe(true);
      }
      for (const value of [a.water?.calm ?? 0, a.water?.glitter ?? 0]) {
        expect(value, theme.id).toBeGreaterThanOrEqual(0);
        expect(value, theme.id).toBeLessThanOrEqual(1);
      }

      // L'occlusione di cielo e' geometrica e non dipende dall'ora: sopra 0,8 il
      // rimbalzo resta l'unica luce e ogni copertura diventa una macchia piatta.
      expect(a.skyOcclusion, theme.id).toBeGreaterThanOrEqual(0);
      expect(a.skyOcclusion, theme.id).toBeLessThanOrEqual(0.8);

      expect(a.exposure, theme.id).toBeGreaterThan(0);
      expect(a.exposure, theme.id).toBeLessThanOrEqual(2);
    }
  });

  it('i parametri delle pass opzionali, quando ci sono, sono sensati', () => {
    for (const theme of THEMES) {
      const { shadow, bloom, tilt } = theme.atmosphere;
      if (shadow !== undefined) {
        expect(shadow.strength, theme.id).toBeGreaterThanOrEqual(0);
        expect(shadow.strength, theme.id).toBeLessThanOrEqual(1);
        expect(shadow.softness, theme.id).toBeGreaterThan(0);
      }
      if (bloom !== undefined) {
        expect(bloom.threshold, theme.id).toBeGreaterThanOrEqual(0);
        expect(bloom.strength, theme.id).toBeGreaterThanOrEqual(0);
        expect(bloom.radius, theme.id).toBeGreaterThanOrEqual(0);
        expect(bloom.radius, theme.id).toBeLessThanOrEqual(1);
      }
      if (tilt !== undefined) {
        for (const value of [tilt.strength, tilt.focus, tilt.width]) {
          expect(value, theme.id).toBeGreaterThanOrEqual(0);
          expect(value, theme.id).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('usa il diorama naturale come default senza rimuovere i temi storici', () => {
    expect(DEFAULT_THEME_ID).toBe('natural');
    expect(THEMES.map((theme) => theme.id)).toEqual(
      expect.arrayContaining(['natural', 'pastel', 'neon', 'industrial', 'scifi', 'enchanted', 'diorama']),
    );
  });
});
