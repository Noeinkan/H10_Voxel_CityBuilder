import { describe, expect, it } from 'vitest';
import { FOOTPATHS } from './config';
import { walkBounds, walkFootpath, type FootpathProbe } from './walk';

/**
 * Il luogo di una prova: una griglia di caratteri, letta come una mappa.
 *
 * `.` prato, `#` muro o acqua, `=` suolo pubblico, e una cifra la quota. Cosi'
 * la premessa di ogni caso si legge nel test invece di doverla ricostruire da
 * una serie di chiamate — che e' l'unica ragione per cui questo dominio e' puro.
 */
function ground(rows: readonly string[]): {
  probe: FootpathProbe;
  isPublic: (x: number, y: number) => boolean;
} {
  const at = (x: number, y: number): string => {
    const row = rows[y];
    if (row === undefined) return '#';
    return row[x] ?? '#';
  };

  const isPublic = (x: number, y: number): boolean => at(x, y) === '=';

  return {
    probe: {
      levelAt: (x, y) => {
        const cell = at(x, y);
        return cell >= '0' && cell <= '9' ? Number(cell) : 0;
      },
      costAt: (x, y) => {
        const cell = at(x, y);
        if (cell === '#') return Number.POSITIVE_INFINITY;
        if (cell === '=') return FOOTPATHS.pavedCost;
        return FOOTPATHS.openCost;
      },
    },
    isPublic,
  };
}

function walk(rows: readonly string[], fromX: number, fromY: number) {
  const { probe, isPublic } = ground(rows);
  return walkFootpath({
    fromX,
    fromY,
    toAny: isPublic,
    bounds: walkBounds(fromX, fromY, FOOTPATHS.reach),
    probe,
  });
}

describe('walkFootpath', () => {
  it('raggiunge il suolo pubblico e si ferma li', () => {
    const result = walk([
      '=....',
      '.....',
      '.....',
    ], 4, 0);

    expect(result).not.toBeNull();
    const steps = result!.steps;
    expect(steps[0]).toMatchObject({ x: 4, y: 0 });
    expect(steps[steps.length - 1]).toMatchObject({ x: 0, y: 0 });
    // Il cammino non prosegue oltre l'approdo: quattro passi, cinque colonne.
    expect(steps).toHaveLength(5);
  });

  it('non conta il capo come arrivo', () => {
    // Il portone cade gia' sulla carreggiata. Fermarsi subito darebbe un cammino
    // di una colonna, indistinguibile da un vicolo vero lungo uno: la ricerca
    // deve invece proseguire fino a un'**altra** colonna pubblica.
    const result = walk([
      '==...',
    ], 0, 0);

    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(2);
    expect(result!.steps[1]).toMatchObject({ x: 1, y: 0 });
  });

  it('aggira un muro invece di attraversarlo', () => {
    const result = walk([
      '=####',
      '.....',
      '.....',
    ], 4, 0);

    expect(result).not.toBeNull();
    const steps = result!.steps;
    // Nessuna colonna del cammino sta sulla fila dei muri, tranne i due capi.
    const wall = steps.filter((step) => step.y === 0 && step.x > 0 && step.x < 4);
    expect(wall).toHaveLength(0);
  });

  it('non passa in diagonale fra due spigoli che si toccano', () => {
    // Il vicolo qui sotto entrerebbe passando dal punto in cui i due muri si
    // incontrano: un varco che esiste nella griglia e non a schermo. L'unico
    // accesso alla colonna pubblica e' quella diagonale, quindi rifiutarla vuol
    // dire non arrivarci affatto — ed e' la risposta giusta.
    expect(walk([
      '#####',
      '#=#..',
      '##...',
      '.....',
    ], 3, 2)).toBeNull();

    // Lo stesso luogo con **uno solo** dei due spigoli pieno: li' si sfiora un
    // angolo, che e' come cammina chiunque, e il vicolo entra.
    expect(walk([
      '#####',
      '#=...',
      '##...',
      '.....',
    ], 3, 2)).not.toBeNull();
  });

  it('sale un gradino che una strada rifiuterebbe, ma non una parete', () => {
    // Quattro voxel in un passo sono `FOOTPATHS.maxStep`: una rampa di scalini.
    const climbable = walk(['=4...'], 4, 0);
    expect(climbable).not.toBeNull();

    // Cinque non lo sono piu': quella non e' una scala, e' una parete.
    const wall = walk(['=5...'], 4, 0);
    expect(wall).toBeNull();
  });

  it('gira attorno al rilievo quando accanto c e il piano', () => {
    const result = walk([
      '.....',
      '=444.',
      '.....',
    ], 4, 1);

    expect(result).not.toBeNull();
    // La linea diretta scavalca un dosso da quattro voxel; una colonna piu' in
    // su o piu' in giu' e' tutto in piano, e costa un terzo.
    expect(result!.steps.every((step) => step.level === 0)).toBe(true);
    expect(result!.steps.some((step) => step.y !== 1)).toBe(true);
  });

  it('torna null quando non c e nessun suolo pubblico da raggiungere', () => {
    expect(walk(['.....', '.....'], 2, 0)).toBeNull();
  });

  it('torna null quando il suolo pubblico e murato', () => {
    expect(walk([
      '=#...',
      '##...',
      '.....',
    ], 3, 0)).toBeNull();
  });
});
