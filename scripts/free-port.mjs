// Libera la porta del dev server prima che vite provi a prenderla.
// `strictPort` in vite.config.ts fa fallire l'avvio quando la porta è occupata
// (di proposito: così l'URL nella documentazione resta valido), e chi la tiene è
// quasi sempre un vite dimenticato in un altro terminale. Qui lo togliamo di
// mezzo invece di far fallire `npm start`.
//
// Uccidiamo solo processi node: se la porta la tiene un programma estraneo
// lasciamo fallire vite, che è il male minore rispetto a terminare alla cieca
// qualcosa che non è nostro.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WINDOWS = process.platform === 'win32';
const CONFIG = fileURLToPath(new URL('../vite.config.ts', import.meta.url));

/** Esegue un comando ignorando qualsiasi fallimento: qui nessuna diagnosi vale
 *  il prezzo di bloccare l'avvio del dev server. */
function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** La porta ha una sola fonte di verità, `vite.config.ts`. Leggerla da lì invece
 *  di ripeterla in package.json evita che i due valori divergano in silenzio. */
function devPort() {
  const match = /server:\s*\{[^}]*?port:\s*(\d+)/.exec(readFileSync(CONFIG, 'utf8'));
  return match ? Number(match[1]) : null;
}

/** PID in ascolto sulla porta.
 *  Due trappole di netstat su Windows, ed è per questo che il filtro è fatto
 *  così: `-p tcp` mostra solo IPv4 e nasconderebbe proprio il caso normale
 *  (vite ascolta su `[::1]`, proto `TCPv6`); e lo stato "LISTENING"
 *  è tradotto sulle installazioni localizzate. Basta l'indirizzo *locale*. */
function listeners(port) {
  if (!WINDOWS) {
    const out = run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
    return [...new Set(out.split(/\s+/).filter(Boolean).map(Number))];
  }
  const pids = new Set();
  for (const line of run('netstat', ['-ano']).split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const [proto, local, , , pid] = parts;
    if (!/^tcp/i.test(proto) || !local.endsWith(`:${port}`)) continue;
    pids.add(Number(pid));
  }
  return [...pids].filter((pid) => pid > 4);
}

function isNode(pid) {
  if (WINDOWS) {
    return /(^|,)"node\.exe"/i.test(run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']));
  }
  return /node/.test(run('ps', ['-p', String(pid), '-o', 'comm=']));
}

function kill(pid) {
  if (WINDOWS) {
    run('taskkill', ['/PID', String(pid), '/T', '/F']);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* già morto */
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const port = devPort();
if (port === null) {
  console.warn('[free-port] porta del dev server non trovata in vite.config.ts, non tocco niente');
  process.exit(0);
}

for (const pid of listeners(port)) {
  if (!isNode(pid)) {
    console.warn(`[free-port] la porta ${port} è di un processo non-node (pid ${pid}): lo lascio stare`);
    continue;
  }
  kill(pid);
  console.log(`[free-port] terminata l'istanza precedente sulla porta ${port} (pid ${pid})`);
}

// Il socket in ascolto sparisce qualche decina di ms dopo il kill: senza questa
// attesa vite ripartirebbe troppo presto e troverebbe la porta ancora occupata.
for (let i = 0; i < 20 && listeners(port).length > 0; i++) sleep(100);
