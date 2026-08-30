import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeChangelog, mergeIndex, parseFragment } from './docs-merge.mjs';

const CARD = `# Indice — meshing e rendering

## \`src/engine/\` — meshing e rendering

| File | Ruolo |
| --- | --- |
| [palette.ts](src/engine/palette.ts) | Palette |

### \`src/engine/mesher/\` — puro, senza Three.js

| File | Ruolo |
| --- | --- |
| [greedyMesher.ts](src/engine/mesher/greedyMesher.ts) | Greedy meshing |
`.split('\n');

test('inserisce in ordine alfabetico nella sezione dichiarata', () => {
  const riga = '| [lighting.ts](src/engine/lighting.ts) | Modello di luce |';
  const out = mergeIndex(CARD, '`src/engine/` — meshing e rendering', [riga], 'x.md');

  assert.ok(out.includes(riga));
  assert.ok(out.indexOf(riga) < out.findIndex((line) => line.includes('palette.ts')));
  // la riga non deve finire nella tabella della sottosezione
  assert.ok(out.indexOf(riga) < out.findIndex((line) => line.startsWith('### ')));
});

test('una riga gia’ presente viene sostituita, non duplicata', () => {
  const riga = '| [palette.ts](src/engine/palette.ts) | Palette, validazione e HMR |';
  const out = mergeIndex(CARD, '`src/engine/`', [riga], 'x.md');

  assert.equal(out.filter((line) => line.includes('](src/engine/palette.ts)')).length, 1);
  assert.ok(out.includes(riga));
});

test('una sottosezione `###` e’ un bersaglio valido', () => {
  const riga = '| [carveMarks.ts](src/engine/mesher/carveMarks.ts) | Ricette di scavo |';
  const out = mergeIndex(CARD, '`src/engine/mesher/` — puro, senza Three.js', [riga], 'x.md');

  const sotto = out.findIndex((line) => line.startsWith('### '));
  assert.ok(out.indexOf(riga) > sotto);
  assert.ok(out.includes(riga));
});

test('una sezione che non esiste e’ un errore, non un indovinello', () => {
  assert.throws(
    () => mergeIndex(CARD, '`src/world/harbor/`', ['| [x.ts](src/world/harbor/x.ts) | X |'], 'x.md'),
    /non trovata/,
  );
});

const CHANGELOG = `# Changelog

---

## In corso — Il titolo di adesso

- **Prima voce.** Testo.
`.split('\n');

test('le voci finiscono in coda all’incremento in corso', () => {
  const out = mergeChangelog(CHANGELOG, ['- **Seconda voce.** Testo.'], 'x.md', 'Il titolo di adesso');

  assert.equal(out.filter((line) => line.startsWith('## ')).length, 1);
  assert.ok(out.indexOf('- **Seconda voce.** Testo.') > out.indexOf('- **Prima voce.** Testo.'));
});

test('un titolo diverso apre una sezione nuova in cima', () => {
  const out = mergeChangelog(CHANGELOG, ['- **Voce mia.** Testo.'], 'x.md', 'Un altro incremento');

  const titoli = out.filter((line) => line.startsWith('## '));
  assert.equal(titoli.length, 2);
  assert.equal(titoli[0], '## In corso — Un altro incremento');
  assert.ok(out.indexOf('- **Voce mia.** Testo.') < out.indexOf('- **Prima voce.** Testo.'));
});

test('divide il frammento nei suoi blocchi', () => {
  const blocchi = parseFragment('## indice — `src/engine/`\n| riga |\n\n## changelog — Titolo\n- voce\n');

  assert.deepEqual(blocchi.map((blocco) => blocco.heading), ['indice — `src/engine/`', 'changelog — Titolo']);
});
