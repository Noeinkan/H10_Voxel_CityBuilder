// @ts-expect-error I test girano in Node, ma il progetto non include intenzionalmente @types/node.
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error I test girano in Node, ma il progetto non include intenzionalmente @types/node.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSimState, tickMany } from './index';
import { testTerrain } from './testTerrain';

describe('isolamento registry', () => {
  it('la simulazione completa 500 tick senza un registry', () => {
    expect(tickMany(createSimState(), testTerrain({ chunksX: 1, chunksY: 1 }), 500).tickCount).toBe(500);
  });

  it('src/sim non importa il dominio degli edifici voxel', () => {
    const root = join('.', 'src', 'sim');
    for (const name of (readdirSync(root) as string[]).filter((file: string) => file.endsWith('.ts'))) {
      expect(readFileSync(join(root, name), 'utf8')).not.toMatch(/world\/buildings/);
    }
  });
});
