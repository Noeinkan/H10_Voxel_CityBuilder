import { describe, expect, it } from 'vitest';

/**
 * I vincoli di dipendenza di `src/sim/`, verificati sul sorgente.
 *
 * Sono contratti che si rompono per distrazione, non per scelta: basta un
 * `import` di comodo per trascinare Three.js dentro una cartella che deve girare
 * in Node, o una scrittura su `setBlock` dove ne serviva una su `setData`. Un
 * test che legge i file costa niente e li tiene fermi.
 *
 * I sorgenti arrivano da `import.meta.glob` e non da `node:fs` perche' il
 * progetto non ha `@types/node` fra le dipendenze e questo prompt non ne
 * aggiunge: la lettura passa quindi da Vite, che e' gia' in `types`.
 */

const SOURCES = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Solo i moduli, senza i test e senza il bench. */
const MODULES = Object.entries(SOURCES).filter(
  ([path]) => !path.endsWith('.test.ts') && !path.endsWith('.bench.ts'),
);

function importedModules(source: string): string[] {
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
}

/** Toglie commenti e stringhe: restano solo i letterali del codice vero. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'[^']*'/g, "''")
    .replace(/`[^`]*`/g, '``');
}

describe('src/sim — vincoli di dipendenza', () => {
  it('trova i moduli da controllare', () => {
    const names = MODULES.map(([path]) => path);
    expect(names).toContain('./tick.ts');
    expect(names).toContain('./DesirabilityField.ts');
    expect(names).toContain('./nextBuildSites.ts');
    expect(names.length).toBeGreaterThan(9);
  });

  it('nessun modulo importa Three.js', () => {
    for (const [path, source] of MODULES) {
      for (const specifier of importedModules(source)) {
        expect(`${path} -> ${specifier}`).not.toMatch(/three/i);
      }
    }
  });

  it('nessun modulo importa da src/engine', () => {
    for (const [path, source] of MODULES) {
      for (const specifier of importedModules(source)) {
        expect(`${path} -> ${specifier}`).not.toMatch(/engine\//);
      }
    }
  });

  it('nessun modulo scrive nel layer blocks', () => {
    for (const [path, source] of MODULES) {
      expect({ path, setBlock: source.includes('setBlock(') }).toEqual({ path, setBlock: false });
      expect({ path, dirty: source.includes('markAllDirty') }).toEqual({ path, dirty: false });
    }
  });

  it('l’unico modulo che tocca il VoxelWorld e’ debugData, e passa da setData', () => {
    const touching = MODULES.filter(([, source]) =>
      importedModules(source).some((specifier) => specifier.includes('VoxelWorld')),
    );

    expect(touching.map(([path]) => path)).toEqual(['./debugData.ts']);
    // E il contatto e' di solo tipo: a runtime `src/sim/` non tira dentro nulla
    // del mondo voxel.
    expect(touching[0][1]).toMatch(/import type \{ VoxelWorld \}/);
    expect(touching[0][1]).toContain('world.setData(');
  });

  it('i coefficienti stanno solo in balance.ts', () => {
    // `0`, `1` e `2` restano ammessi: sono aritmetica (un indice, un
    // complemento, un rimappaggio), non calibrazione. Qualsiasi altro letterale
    // nel nucleo sarebbe un numero di bilanciamento fuori posto.
    const arithmetic = new Set(['0', '1', '2']);

    for (const name of ['./tick.ts', './DesirabilityField.ts', './nextBuildSites.ts']) {
      const literals = [...code(SOURCES[name]).matchAll(/(?<![\w.$])\d+(?:\.\d+)?/g)].map(
        (match) => match[0],
      );
      const stray = [...new Set(literals.filter((value) => !arithmetic.has(value)))];
      expect({ file: name, stray }).toEqual({ file: name, stray: [] });
    }
  });

  it('balance.ts non importa niente dalla simulazione', () => {
    // Se `balance.ts` dipendesse da un altro modulo di `src/sim/` smetterebbe di
    // essere la radice della calibrazione e diventerebbe parte del grafo.
    expect(importedModules(SOURCES['./balance.ts'])).toEqual([]);
  });
});
