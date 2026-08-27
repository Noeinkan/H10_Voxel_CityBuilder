#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = resolve(ROOT, 'PROJECT_INDEX.md');
const DEFAULT_LIMIT = 12;

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

export function parseArgs(args) {
  const terms = [];
  let limit = DEFAULT_LIMIT;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit') {
      const value = args[++i];
      if (!value || !/^\d+$/.test(value)) throw new Error('`--limit` richiede un intero positivo.');
      limit = Number(value);
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const value = arg.slice('--limit='.length);
      if (!/^\d+$/.test(value)) throw new Error('`--limit` richiede un intero positivo.');
      limit = Number(value);
      continue;
    }
    if (arg.startsWith('--')) throw new Error('Opzione sconosciuta: ' + arg);
    terms.push(arg);
  }

  if (!terms.length) throw new Error('Specifica almeno un termine da cercare.');
  if (limit < 1 || limit > 100) throw new Error('`--limit` deve essere compreso fra 1 e 100.');
  return { terms: terms.map(normalize), limit };
}

export function locateRows(indexText, terms, limit = DEFAULT_LIMIT) {
  const needles = terms.map(normalize);
  const matches = [];
  let section = '';
  let total = 0;

  for (const line of indexText.split(/\r?\n/)) {
    if (/^#{2,3}\s/.test(line)) {
      section = line;
      continue;
    }
    if (!line.startsWith('| [')) continue;

    const haystack = normalize(section + ' ' + line);
    if (!needles.every((needle) => haystack.includes(needle))) continue;
    total++;
    if (matches.length < limit) matches.push({ section, row: line });
  }

  return { matches, total };
}

export function formatMatches(result) {
  const lines = [];
  let previousSection = '';
  for (const match of result.matches) {
    if (match.section !== previousSection) {
      if (lines.length) lines.push('');
      lines.push(match.section);
      previousSection = match.section;
    }
    lines.push(match.row);
  }
  if (result.total > result.matches.length) {
    lines.push('', `... ${result.total - result.matches.length} risultati omessi; restringi la ricerca o aumenta --limit.`);
  }
  return lines.join('\n');
}

function main() {
  try {
    const { terms, limit } = parseArgs(process.argv.slice(2));
    const result = locateRows(readFileSync(INDEX, 'utf8'), terms, limit);
    if (!result.total) {
      console.error('Nessuna voce trovata in PROJECT_INDEX.md.');
      return 1;
    }
    console.log(formatMatches(result));
    return 0;
  } catch (error) {
    console.error(error.message);
    console.error('Uso: npm run locate -- <termine...> [--limit N]');
    return 2;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exit(main());
