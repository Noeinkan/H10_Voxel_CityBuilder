#!/usr/bin/env node
/**
 * Fonde i frammenti di `docs/pending/` in PROJECT_INDEX.md e CHANGELOG.md.
 *
 * Esiste perche' quei due file sono il punto in cui il lavoro parallelo si
 * serializza: li aggiorna chiunque, e sempre nello stesso istante — a fine
 * turno, quando l'incremento vuole atterrare. Sui rifiuti misurati del semaforo
 * fra agenti erano quasi un terzo del totale.
 *
 * Il frammento e' l'artefatto durevole, la fusione e' ritentabile da chiunque:
 * se PROJECT_INDEX.md e' occupato, l'agente lascia il frammento dov'e' e
 * consegna lo stesso; lo fondera' il prossimo che passa. E' questo a togliere
 * il blocco invece di spostarlo.
 *
 * Formato di un frammento (`docs/pending/<nome>.md`):
 *
 *   ## indice — `src/world/traffic/`
 *   | [src/world/traffic/skyRoutes.ts](src/world/traffic/skyRoutes.ts) | Ruolo |
 *
 *   ## changelog
 *   - **Titolo.** Testo della voce.
 *
 * Nel dubbio non indovina: sezione che non esiste, tabella che non si trova,
 * blocco che non si riconosce sono errori con exit 1, e il frammento resta.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PENDING = join(ROOT, 'docs', 'pending');
const INDEX = join(ROOT, 'PROJECT_INDEX.md');
const CHANGELOG = join(ROOT, 'CHANGELOG.md');

/** Due fusioni insieme si sovrascriverebbero a vicenda: la mutua esclusione la
 *  fa il kernel, perche' `mkdir` fallisce con EEXIST invece di sovrascrivere.
 *  Un lucchetto vecchio e' un processo morto con la chiave in mano. */
const MUTEX = join(PENDING, '.merge-lock');
const MUTEX_STALE_MS = 30000;
const MUTEX_WAIT_MS = 5000;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function withMutex(fn) {
  const scadenza = Date.now() + MUTEX_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(MUTEX);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - statSync(MUTEX).mtimeMs > MUTEX_STALE_MS) rmSync(MUTEX, { recursive: true, force: true });
      } catch { /* sparito nel frattempo */ }
      if (Date.now() > scadenza) {
        console.error('Un\'altra fusione e\' in corso. Riprova fra poco: i frammenti restano dove sono.');
        process.exit(1);
      }
      sleep(100);
    }
  }
  try {
    return fn();
  } finally {
    try { rmSync(MUTEX, { recursive: true, force: true }); } catch { /* idem */ }
  }
}

/** Il nome di una sezione, ridotto a cio' che si confronta: niente apici
 *  inversi, niente barra finale, niente sottotitolo dopo il trattino lungo. */
function sectionKey(text) {
  return String(text).split('—')[0].replace(/`/g, '').trim().replace(/\/$/, '').toLowerCase();
}

/** Il path dentro il primo campo di una riga di tabella. */
function rowTarget(row) {
  return (/\]\(([^)]+)\)/.exec(row) ?? [])[1] ?? null;
}

/** Legge un file conservando il suo fine riga: riscriverlo tutto con l'altro
 *  produrrebbe un diff grande quanto il file, e in un repository con piu'
 *  agenti quel diff diventa un avviso di rilettura per chiunque stia aspettando
 *  quel path. */
function readDoc(file) {
  const text = readFileSync(file, 'utf8');
  return { lines: text.split(/\r?\n/), eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

/** Toglie le righe vuote in testa e in coda, non quelle in mezzo. */
function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

/** Divide un frammento nei suoi blocchi `## ...`. */
function parseFragment(text) {
  const blocks = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      current = { heading: heading[1].trim(), lines: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return blocks;
}

/** Inserisce le righe nella tabella della sezione, in ordine alfabetico. Una
 *  riga gia' presente per lo stesso path viene sostituita, non duplicata: cosi'
 *  rilanciare la fusione non moltiplica niente. */
function mergeIndex(lines, sezione, righe, nome) {
  const chiave = sectionKey(sezione);
  const start = lines.findIndex((line) => line.startsWith('## ') && sectionKey(line.slice(3)) === chiave);
  if (start < 0) throw new Error('sezione "' + sezione + '" non trovata in PROJECT_INDEX.md (frammento ' + nome + ')');

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { end = i; break; }
  }
  const separatore = lines.slice(start, end).findIndex((line) => /^\|\s*-{3,}/.test(line));
  if (separatore < 0) throw new Error('nessuna tabella nella sezione "' + sezione + '" (frammento ' + nome + ')');

  let primaRiga = start + separatore + 1;
  let ultimaRiga = primaRiga;
  while (ultimaRiga < end && lines[ultimaRiga].startsWith('|')) ultimaRiga++;

  const tabella = lines.slice(primaRiga, ultimaRiga);
  for (const riga of righe) {
    const target = rowTarget(riga);
    if (!target) throw new Error('riga senza link nel frammento ' + nome + ': ' + riga);
    const esistente = tabella.findIndex((r) => rowTarget(r)?.toLowerCase() === target.toLowerCase());
    if (esistente >= 0) { tabella[esistente] = riga; continue; }
    const dopo = tabella.findIndex((r) => (rowTarget(r) ?? '').toLowerCase() > target.toLowerCase());
    if (dopo < 0) tabella.push(riga);
    else tabella.splice(dopo, 0, riga);
  }
  return [...lines.slice(0, primaRiga), ...tabella, ...lines.slice(ultimaRiga)];
}

/**
 * Aggiunge le voci al changelog: in coda all'incremento in corso, oppure in una
 * sezione nuova in cima se il frammento ne dichiara un titolo diverso. Senza
 * questa distinzione le voci di un incremento finirebbero sotto il titolo di
 * un altro, che con piu' agenti in volo e' la norma, non l'eccezione.
 */
function mergeChangelog(lines, voci, nome, titolo) {
  const start = lines.findIndex((line) => line.startsWith('## '));
  if (start < 0) throw new Error('nessuna sezione aperta in CHANGELOG.md (frammento ' + nome + ')');

  const testa = lines[start].slice(3);
  const attuale = testa.includes('—') ? testa.slice(testa.indexOf('—') + 1) : testa;
  const uguale = (a, b) => a.replace(/`/g, '').trim().toLowerCase() === b.replace(/`/g, '').trim().toLowerCase();
  if (titolo && !uguale(titolo, attuale)) {
    return [...lines.slice(0, start), '## In corso — ' + titolo.trim(), '', ...voci, '', ...lines.slice(start)];
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { end = i; break; }
  }
  while (end > start && !lines[end - 1].trim()) end--;
  return [...lines.slice(0, end), ...voci, ...lines.slice(end)];
}

function main() {
  if (!existsSync(PENDING)) {
    console.log('Niente da fondere: `docs/pending/` non esiste.');
    return 0;
  }
  const frammenti = readdirSync(PENDING)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .sort();
  if (!frammenti.length) {
    console.log('Niente da fondere: nessun frammento in `docs/pending/`.');
    return 0;
  }

  return withMutex(() => {
    const docIndice = readDoc(INDEX);
    const docChangelog = readDoc(CHANGELOG);
    let indice = docIndice.lines;
    let changelog = docChangelog.lines;
    const fatti = [];

    for (const nome of frammenti) {
      const file = join(PENDING, nome);
      const blocchi = parseFragment(readFileSync(file, 'utf8'));
      if (!blocchi.length) throw new Error('nessun blocco `## ...` nel frammento ' + nome);

      for (const blocco of blocchi) {
        const indiceHead = /^indice\s*[—-]?\s*(.+)$/i.exec(blocco.heading);
        const utili = blocco.lines.filter((line) => line.trim());
        if (indiceHead) {
          const righe = utili.filter((line) => line.startsWith('|') && !/^\|\s*-{3,}/.test(line));
          if (righe.length) indice = mergeIndex(indice, indiceHead[1], righe, nome);
          continue;
        }
        const changelogHead = /^changelog\s*(?:[—-]\s*(.+))?$/i.exec(blocco.heading);
        if (changelogHead) {
          // Le righe vuote in mezzo a una voce servono; quelle ai bordi no.
          if (utili.length) changelog = mergeChangelog(changelog, trimBlank(blocco.lines), nome, changelogHead[1]);
          continue;
        }
        throw new Error('blocco non riconosciuto nel frammento ' + nome + ': "## ' + blocco.heading + '"');
      }
      fatti.push({ nome, file });
    }

    writeFileSync(INDEX, indice.join(docIndice.eol));
    writeFileSync(CHANGELOG, changelog.join(docChangelog.eol));
    for (const { file } of fatti) rmSync(file, { force: true });
    console.log('Fusi: ' + fatti.map((f) => f.nome).join(', ') + '.');
    return 0;
  });
}

try {
  process.exit(main());
} catch (err) {
  console.error('Fusione non riuscita: ' + err.message);
  console.error('Niente e\' stato scritto e i frammenti restano dove sono.');
  process.exit(1);
}
