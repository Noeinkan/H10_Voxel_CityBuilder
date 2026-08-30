import assert from 'node:assert/strict';
import test from 'node:test';

import { formatMatches, locateDocs, locateRows, parseArgs } from './project-locate.mjs';

const INDEX = `# Indice

## Radice
| File | Ruolo |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Regole globali |

## \`src/engine/\` — rendering
| File | Ruolo | Export principali |
| --- | --- | --- |
| [daylight.ts](src/engine/daylight.ts) | Luce diurna e modalità notte | \`withHour\` |
| [lighting.ts](src/engine/lighting.ts) | Modello di luce puro | \`faceLight\` |
| [mesher.ts](src/engine/mesher.ts) | Greedy meshing | \`greedyMesh\` |
`;

test('trova righe e conserva la sezione pertinente', () => {
  const result = locateRows(INDEX, ['luce']);

  assert.equal(result.total, 2);
  assert.equal(result.matches[0].section, '## `src/engine/` — rendering');
  assert.match(formatMatches(result), /daylight\.ts/);
  assert.match(formatMatches(result), /lighting\.ts/);
});

test('normalizza accenti e separatori di percorso', () => {
  const result = locateRows(INDEX, ['modalita', 'src\\engine']);

  assert.equal(result.total, 1);
  assert.match(result.matches[0].row, /daylight\.ts/);
});

test('limita l’output ma conserva il totale', () => {
  const result = locateRows(INDEX, ['engine'], 2);

  assert.equal(result.total, 3);
  assert.equal(result.matches.length, 2);
  assert.match(formatMatches(result), /1 risultati omessi/);
});

const CARD = `# Indice — il suolo

## \`src/world/terrain/\` — isola procedurale
| File | Ruolo | Export principali |
| --- | --- | --- |
| [biomes.ts](src/world/terrain/biomes.ts) | Bioma da altezza e pendenza | \`classifyBiome\` |
`;

test('cerca su radice e schede insieme, e dice da quale scheda viene una riga', () => {
  const docs = [
    { file: 'PROJECT_INDEX.md', text: INDEX },
    { file: 'docs/index/world.md', text: CARD },
  ];
  const result = locateDocs(docs, ['bioma']);

  assert.equal(result.total, 1);
  assert.equal(result.matches[0].file, 'docs/index/world.md');
  const reso = formatMatches(result);
  assert.match(reso, /^docs\/index\/world\.md$/m);
  assert.match(reso, /biomes\.ts/);
});

test('il limite taglia sull’insieme delle schede, non su ognuna', () => {
  const docs = [
    { file: 'PROJECT_INDEX.md', text: INDEX },
    { file: 'docs/index/world.md', text: CARD },
  ];
  const result = locateDocs(docs, ['ts'], 2);

  assert.equal(result.matches.length, 2);
  assert.equal(result.total, 5);
  assert.ok(result.matches.every((match) => match.file === 'PROJECT_INDEX.md'));
});

test('analizza termini e limite', () => {
  assert.deepEqual(parseArgs(['luce', '--limit', '4']), { terms: ['luce'], limit: 4 });
  assert.throws(() => parseArgs([]), /almeno un termine/);
  assert.throws(() => parseArgs(['luce', '--limit=0']), /compreso fra 1 e 100/);
});
