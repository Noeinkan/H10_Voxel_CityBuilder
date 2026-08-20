/**
 * shotkit config — screenshot dell'app.
 *
 *   node C:/Personal_utilities/screenshot-kit/shotkit.mjs --serve
 *
 * L'app non ha salvataggio: ogni scatto ricostruisce la citta' da zero — isola
 * dal seed 1337, i tre catalizzatori nell'ordine dell'onboarding, poi crescita
 * a 4x. `seedCity` e' quindi il seeder sintetico che la skill chiede: nessun
 * dato reale entra mai nell'inquadratura.
 *
 * `SHOTKIT_BASE_URL` punta a un'istanza gia' avviata altrove (per esempio un
 * worktree pulito, quando l'albero di lavoro e' in mezzo a un refactor).
 */

const BASE_URL = process.env.SHOTKIT_BASE_URL || 'http://localhost:8020';

/** Centro dell'isola nella viewport dopo `frameIsland`. */
const ISLAND = { x: 720, y: 430 };

/** Il terreno arriva da un worker: le risorse restano "—" finche' non ha finito. */
async function terrainReady(page) {
  await page.waitForFunction(
    () => /\d/.test(document.querySelector('.resource-value')?.textContent ?? ''),
    null,
    { timeout: 180000 },
  );
}

/** `F` inquadra tutto il mondo, oceano compreso: lo zoom riporta l'isola a pieno campo. */
async function frameIsland(page, steps = 8) {
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1200);
  await page.mouse.move(ISLAND.x, ISLAND.y);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1500);
}

async function pickTool(page, name) {
  await page.getByRole('button', { name: new RegExp('^' + name, 'i') }).first().click();
  await page.waitForTimeout(250);
}

async function cursorState(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.cursor-card');
    if (card === null || card.hidden) return null;
    return { valid: card.dataset.valid === 'true', text: card.innerText.replace(/\n/g, ' | ') };
  });
}

/**
 * Spirale attorno al punto voluto. Il raycast prende anche il piano d'acqua, e
 * un molo e' una posizione valida ma sta sul bordo: per i catalizzatori urbani
 * serve terra piena, quindi di default il molo viene scartato.
 */
async function findLand(page, cx, cy, { allowQuay = false } = {}) {
  for (let r = 0; r <= 320; r += 22) {
    for (let a = 0; a < 360; a += 24) {
      const x = Math.round(cx + r * Math.cos((a * Math.PI) / 180));
      const y = Math.round(cy + r * Math.sin((a * Math.PI) / 180) * 0.6);
      if (x < 60 || x > 1380 || y < 130 || y > 790) continue;
      await page.mouse.move(x, y);
      await page.waitForTimeout(40);
      const state = await cursorState(page);
      if (state?.valid && (allowQuay || !/quay/.test(state.text))) return { x, y };
      if (r === 0) break;
    }
  }
  return null;
}

async function placeCatalyst(page, name, cx, cy, options) {
  await pickTool(page, name);
  const spot = await findLand(page, cx, cy, options);
  if (spot === null) return false;
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(600);
  return true;
}

/** Le carte evento restano aperte finche' non si sceglie: qui si sceglie sempre la prima. */
async function answerDecision(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.decision-card');
    if (card === null || card.hidden) return false;
    const option = card.querySelector('button');
    if (option === null) return false;
    option.click();
    return true;
  });
}

/**
 * Fuori dalla canvas e lontano dai bottoni: niente segnaposto nello scatto.
 * Il blur serve oltre allo spostamento del mouse: dopo un click il bottone
 * resta a fuoco, e il tooltip del dock e' agganciato al fuoco, non all'hover.
 *
 * `escape` va spento dopo aver aperto un pannello: `Esc` non annulla solo lo
 * strumento, chiude anche il cassetto appena aperto.
 */
async function parkPointer(page, { escape = true } = {}) {
  if (escape) await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(1418, 460);
  await page.waitForTimeout(400);
}

/** Avanza a 4x per `ms`, rispondendo alle carte evento invece di lasciarle aperte. */
async function grow(page, ms, { answer = true } = {}) {
  await page.getByRole('button', { name: /Simulation speed 4/i }).click();
  await parkPointer(page);
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    if (answer) await answerDecision(page);
  }
}

/** Isola generata, catalizzatori piazzati, crescita avviata. */
async function seedCity(page, { growMs = 45000, extras = true, answer = true } = {}) {
  await terrainReady(page);
  await frameIsland(page);
  await placeCatalyst(page, 'Market', ISLAND.x - 20, ISLAND.y - 10);
  await placeCatalyst(page, 'Factory', ISLAND.x + 110, ISLAND.y + 45);
  await placeCatalyst(page, 'Park', ISLAND.x - 110, ISLAND.y + 45);
  if (extras) {
    await placeCatalyst(page, 'University', ISLAND.x + 30, ISLAND.y - 110);
    await placeCatalyst(page, 'Monument', ISLAND.x - 60, ISLAND.y + 140);
  }
  await grow(page, growMs, { answer });
  await parkPointer(page);
}

export default {
  baseUrl: BASE_URL,
  server: {
    command: 'npm run dev',
    readyUrl: BASE_URL + '/',
    timeoutMs: 120000,
  },

  outDir: '.shots',
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  settleMs: 2000,
  mask: [],

  // L'aiuto del primo avvio copre mezza scena: lo si marca come gia' visto,
  // che e' lo stato in cui il gioco si trova dalla seconda partita in poi.
  async setup(_page, context) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('h10-cozy-help-seen-v1', '1');
      } catch {
        /* storage disabilitato: l'aiuto resta chiudibile a mano */
      }
    });
  },

  shots: [
    {
      name: '01-city-overview',
      path: '/',
      timeoutMs: 300000,
      shows:
        'la citta cresciuta sull isola procedurale: strade, isolati e tipologie decise dalla simulazione, barra risorse in alto e dock di costruzione in basso',
      alt: 'Isometric view of a voxel city on a terraced green island, dense blocks and streets at the centre, trees along the coast',
      async prepare(page) {
        await seedCity(page, { growMs: 60000 });
      },
    },
    {
      name: '02-placement-cursor',
      path: '/',
      timeoutMs: 300000,
      shows:
        'lo strumento di piazzamento attivo: segnaposto 3D sul terreno e cartellino con costo pesato dal sito, raggio di influenza, usi favoriti e tipologie che possono nascerne',
      alt: 'Placement marker on a voxel city with a card listing cost, influence radius and the building typologies the site can grow',
      async prepare(page) {
        await seedCity(page, { growMs: 45000 });
        await pickTool(page, 'Port');
        const spot = await findLand(page, ISLAND.x + 150, ISLAND.y + 120, { allowQuay: true });
        if (spot !== null) {
          await page.mouse.move(spot.x, spot.y);
          await page.waitForTimeout(800);
        }
      },
    },
    {
      name: '03-event-decision',
      path: '/',
      timeoutMs: 300000,
      shows:
        'una carta evento della simulazione: la citta ha esaurito le scorte e chiede una scelta, con le tre risposte e il loro costo',
      alt: 'A decision card asking how to respond to a food shortage, with three options, over the voxel city',
      async prepare(page) {
        // Nessuna risposta automatica: la carta arriva quando le scorte non
        // coprono piu' i residenti, quindi serve una citta' gia' popolosa.
        await seedCity(page, { growMs: 60000, answer: false });
        await page.waitForSelector('.decision-card:not([hidden])', { timeout: 240000 });
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '04-policies-and-trade',
      path: '/',
      timeoutMs: 300000,
      shows:
        'il cassetto delle politiche: leve attivabili, pannello del commercio con la produzione per settore e le strategie di scambio',
      alt: 'Side drawer with city policies, commerce figures and trade strategies open over the city',
      async prepare(page) {
        await seedCity(page, { growMs: 45000 });
        await parkPointer(page);
        await page.getByRole('button', { name: /^Policies/i }).click();
        await page.waitForSelector('.policy-drawer:not([hidden])', { timeout: 15000 });
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '05-theme-neon',
      path: '/?theme=neon',
      timeoutMs: 300000,
      shows:
        'lo stesso motore con un tema diverso: 32 colori e parametri di atmosfera scambiati a caldo, nessuna geometria rigenerata, con il selettore dei temi aperto',
      alt: 'The same voxel city rendered in a neon night palette, next to the theme picker listing the available looks',
      async prepare(page) {
        await seedCity(page, { growMs: 45000 });
        await parkPointer(page);
        await page.getByRole('button', { name: /Change visual theme/i }).click();
        await page.waitForSelector('.theme-picker:not([hidden])', { timeout: 15000 });
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '06-debug-overlay',
      path: '/?debug=1&grow=1',
      timeoutMs: 300000,
      shows:
        'l harness di misura: frame budget, draw call, triangoli, stato del mesher e del pool di worker accanto alle statistiche di crescita',
      alt: 'The voxel city with technical overlays showing frame timings, draw calls, chunk counts and growth statistics',
      async prepare(page) {
        await seedCity(page, { growMs: 45000 });
      },
    },
    {
      name: '07-biome-map',
      path: '/?debug=1&terrain=1337',
      timeoutMs: 300000,
      settleMs: 4000,
      shows:
        'l isola ricolorata per bioma (tasto B) con l overlay del terreno: istogramma dei biomi, colonne edificabili e tempo di generazione nel worker',
      alt: 'Voxel island recoloured into flat biome bands, beside a panel listing the biome histogram and generation timings',
      async prepare(page) {
        await page.waitForFunction(() => globalThis.__terrainStats?.().done === true, null, {
          timeout: 180000,
        });
        await frameIsland(page, 7);
        await page.keyboard.press('KeyB');
        await page.waitForTimeout(6000);
        await page.mouse.move(1418, 460);
      },
    },
    {
      name: '08-simulation-lab',
      path: '/?debug=1&sim=1',
      timeoutMs: 300000,
      shows:
        'la scena di simulazione isolata: desiderabilita, candidati di costruzione classificati e leve di politica, senza il gioco attorno',
      alt: 'Simulation panel with desirability figures, ranked candidate build sites and policy toggles above the island',
      async prepare(page) {
        await page.waitForFunction(() => globalThis.__terrainStats?.().done === true, null, {
          timeout: 180000,
        });
        await frameIsland(page, 7);
        await page.evaluate(() => globalThis.__simTick?.(400));
        await page.waitForTimeout(4000);
        await page.mouse.move(1418, 460);
      },
    },
  ],
};
