/**
 * shotkit config — screenshot dell'app.
 *
 *   node C:/Personal_utilities/screenshot-kit/shotkit.mjs --serve
 *
 * L'app non ha salvataggio: ogni scatto ricostruisce la citta' da zero — isola
 * dal seed 1337, i tre catalizzatori nell'ordine dell'onboarding, poi crescita
 * a 4x. `seedCity` e' quindi il seeder sintetico che la skill chiede: nessun
 * dato reale entra mai nell'inquadratura. Il seed e' **fissato nei path**
 * perche' il default dell'app e' ormai casuale, e le coordinate di piazzamento
 * qui sotto valgono solo sull'isola 1337.
 *
 * `SHOTKIT_BASE_URL` punta a un'istanza gia' avviata altrove (per esempio un
 * worktree pulito, quando l'albero di lavoro e' in mezzo a un refactor).
 *
 * **Con altri agenti che scrivono in `src/`, il server di sviluppo non va
 * usato.** Ogni salvataggio altrui fa ricaricare la pagina per HMR, e una
 * ricarica riporta l'app alla schermata del titolo: lo scatto viene, non da'
 * nessun errore, e mostra il menu sopra una citta' che era cresciuta davvero.
 * E' successo, ed e' costato cinque corse a capirlo — la diagnosi che sembrava
 * ovvia (il selettore, il timeout, il clic) era sempre sbagliata. Il rimedio e'
 * servire una build statica, che non ha HMR:
 *
 *     npx vite build
 *     npx vite preview --port 8021 --strictPort
 *     $env:SHOTKIT_BASE_URL='http://localhost:8021'
 *     node C:/Personal_utilities/screenshot-kit/shotkit.mjs --only <shot> --gpu
 *
 * (senza `--serve`: il server c'e' gia'). Con l'albero fermo, `--serve` va
 * benissimo e resta il default.
 */

const BASE_URL = process.env.SHOTKIT_BASE_URL || 'http://localhost:8020';

/** Centro dell'isola nella viewport dopo `frameIsland`. */
const ISLAND = { x: 720, y: 430 };

/**
 * Attraversa la schermata del titolo, **se c'e'**.
 *
 * **`?play=1` la salta davvero, e adesso e' vero anche a schermo.** Non lo era
 * quando questi scatti sono stati scritti: la porta d'ingresso restava sopra la
 * partita e `prepare` girava dietro un velo. La decisione sta ora in `boot.ts`
 * ed e' **sincrona al caricamento** — `opensEntryMenu` sceglie fra il titolo e
 * l'import dinamico di `main.ts`, quindi la schermata o nasce subito o non nasce
 * affatto. Aspettare `.title-button--primary` dove non comparira' mai e' quattro
 * minuti di timeout, ed e' cosi' che l'intero set si e' fermato al primo scatto.
 *
 * Il ramo del titolo resta perche' un indirizzo senza `play=1` — `10-road-network`
 * e `11-road-hierarchy` — ci passa ancora. Li' il bottone grande e' `Play` a mani
 * vuote e `Continue` quando c'e' qualcosa da riprendere: si clicca quello, senza
 * sapere quale dei due sia.
 */
async function enterGame(page, { seed = '1337', freezeClock = true } = {}) {
  // Un respiro solo: se il titolo deve nascere, e' gia' nel DOM al primo frame.
  await page.waitForTimeout(800);
  if ((await page.locator('.title-screen').count()) > 0) {
    const primary = page.locator('.title-screen .title-button--primary:visible').first();
    // Il bottone compare quando l'elenco dei salvataggi e' letto: misurato, una
    // cinquantina di secondi. E sparire gli costa altrettanto — la schermata si
    // toglie di mezzo (`root.remove()`) solo a mondo pronto, non al clic — quindi
    // qui i minuti sono tre e non uno: a sessanta secondi lo scatto falliva
    // mentre l'isola stava ancora nascendo.
    await primary.waitFor({ state: 'visible', timeout: 240000 });
    await primary.click();
    await page.waitForTimeout(800);

    // **`Play` non avvia niente: apre il pannello «New island».** Il bottone vero
    // e' `Create island`, e il campo accanto vuole il seed — lasciato vuoto ne
    // sorteggia uno, e due scatti dello stesso set mostrerebbero due mondi
    // diversi. Con un salvataggio il bottone grande e' invece `Continue` e il
    // pannello non compare: il ramo va tenuto, non ci si arriva sempre.
    const create = page.locator('.title-screen [data-role="create"]:visible').first();
    if ((await create.count()) > 0) {
      const field = page.locator('.title-screen .title-field:visible').first();
      if ((await field.count()) > 0) await field.fill(seed);
      await create.click();
    }
  }
  // La condizione e' il **dock**, non la sparizione del velo: l'HUD esiste nel
  // DOM anche dietro la schermata del titolo, quindi `terrainReady` la
  // attraversa senza accorgersene — ed e' cosi' che uno scatto poteva crescere
  // una citta' per ottanta secondi e fotografare il menu senza un solo avviso.
  // La classe e' `build-dock` (`BuildDock.ts`), non `hud-dock`: un selettore
  // inventato qui non fallisce, aspetta e basta.
  await page.locator('.build-dock').first().waitFor({ state: 'visible', timeout: 180000 });
  // `Create island` ricarica componendo il proprio indirizzo, e per strada
  // perde i parametri messi qui: `hour=` non sopravvive. L'ora si ferma quindi
  // dal gioco — `L` cicla ciclo → giorno fisso — o due scatti dello stesso
  // soggetto arriverebbero con due luci diverse.
  //
  // `?daylight=` invece sopravvive: lo riscrive `applyLook` sull'indirizzo che
  // il gioco compone. Chi lo passa ha gia' l'orologio fermo dove lo voleva, e
  // premere `L` qui lo sposterebbe — il giro e' ciclo → giorno → notte, quindi
  // da notte fissa si finirebbe sul ciclo.
  if (freezeClock) {
    await page.keyboard.press('KeyL');
    await page.waitForTimeout(1200);
  }
}

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
  const tile = page.getByRole('button', { name: new RegExp('^' + name, 'i') }).first();
  // I costi lievitano col bilancio: un extra (Monument, 440 fondi) puo' essere
  // ancora inaccessibile quando seedCity passa a piazzarlo. Lo si salta invece
  // di far fallire lo scatto: la citta' cresce comunque, e il soggetto e'
  // quello che vale.
  if ((await tile.count()) === 0 || (await tile.isDisabled())) return false;
  await tile.click();
  await page.waitForTimeout(250);
  return true;
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
  if (!(await pickTool(page, name))) return false;
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
 *
 * A mani vuote `Esc` **apre il menu principale**, che mette la citta' in pausa:
 * senza richiuderlo, `grow()` aspetterebbe secondi durante i quali non passa un
 * tick, e le citta' negli scatti resterebbero vuote. Un secondo `Esc` non
 * basta — alterna, quindi lo riaprirebbe a turno — e la chiusura va chiesta
 * esplicitamente, che e' anche l'unico gesto idempotente.
 */
async function parkPointer(page, { escape = true } = {}) {
  if (escape) await page.keyboard.press('Escape');
  await page.evaluate(() => {
    // Il menu di pausa non e' un cassetto e non ha `.drawer-close`: e' vestito
    // come la schermata del titolo, quindi si chiude dal suo bottone grande —
    // `Resume`, l'unico `title-button--primary` che ha.
    const veil = document.querySelector('.main-menu-veil');
    if (veil !== null && !veil.hidden) veil.querySelector('.title-button--primary')?.click();
  });
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

/**
 * I pannelli di debug sono `<details>` e nascono chiusi: la riga di riepilogo
 * da sola non mostra nulla di cio' che l'harness misura davvero.
 */
async function openDebugPanels(page) {
  await page.evaluate(() => {
    for (const panel of document.querySelectorAll('details.debug-panel')) panel.open = true;
  });
  await page.waitForTimeout(1500);
}

/** Il pool di mesher lavora in coda: senza aspettarlo si fotografa un mondo a meta'. */
async function mesherIdle(page, timeout = 120000) {
  // `__voxelStats` esiste solo sotto `?debug=1` o `?perf=1`: senza, la
  // `waitForFunction` non e' falsa, e' cieca — aspetta il timeout intero e fa
  // fallire uno scatto che stava andando bene. Su una partita normale si ripiega
  // su un'attesa fissa, che e' tutto cio' che si puo' onestamente fare.
  const measurable = await page.evaluate(() => typeof globalThis.__voxelStats === 'function');
  if (!measurable) {
    await page.waitForTimeout(8000);
    return;
  }
  await page.waitForFunction(
    () => {
      const stats = globalThis.__voxelStats?.();
      return stats !== undefined && stats.queued === 0 && stats.inFlight === 0;
    },
    null,
    { timeout },
  );
  await page.waitForTimeout(1500);
}

/**
 * Clicca finche' sotto il cursore non c'e' una **struttura**.
 *
 * Il click a mani vuote apre sempre la scheda — anche sul prato, dove pero'
 * mancano proprio le righe che valgono lo scatto. La spirale cerca quindi la
 * carta Structure, non il pannello: tutte le sezioni stanno impilate nella
 * stessa colonna, e quella della struttura e' la sola che scompare sul prato.
 */
async function selectBuilding(page, cx, cy) {
  for (let r = 0; r <= 260; r += 26) {
    for (let a = 0; a < 360; a += 30) {
      const x = Math.round(cx + r * Math.cos((a * Math.PI) / 180));
      const y = Math.round(cy + r * Math.sin((a * Math.PI) / 180) * 0.6);
      if (x < 60 || x > 1080 || y < 130 || y > 790) continue;
      await page.mouse.click(x, y);
      await page.waitForTimeout(180);
      const picked = await page.evaluate(() => {
        const panel = document.querySelector('.selection-panel');
        if (panel === null || panel.hidden) return null;
        const card = [...panel.querySelectorAll('.selection-card')]
          .find((el) => el.querySelector('.selection-card-eyebrow')?.textContent === 'Structure');
        return card === undefined ? null : panel.querySelector('.selection-title')?.textContent;
      });
      if (picked !== null) return { x, y, title: picked };
      if (r === 0) break;
    }
  }
  return null;
}

/**
 * Sceglie una vista informativa dal picker del dock, poi richiude il picker.
 *
 * Il bottone del dock **cambia etichetta** con la vista accesa
 * (`GameHud.setInfoView`): a vista spenta e' `Read the city by data · I`, e da
 * li' in poi `Reading: <vista> · I to change`. Si aggancia quindi la prima, che
 * e' l'unica che esista prima del clic.
 *
 * Il picker si chiude dal **suo** bottone e non con `Esc`: la catena di `Esc`
 * spegne anche la vista appena scelta, che e' esattamente il soggetto.
 */
async function pickInfoView(page, label) {
  await page.getByRole('button', { name: /Read the city by data/i }).click();
  await page.waitForSelector('.info-picker:not([hidden])', { timeout: 15000 });
  const chosen = await page.evaluate((wanted) => {
    const option = [...document.querySelectorAll('.info-picker .view-option')].find(
      (el) => el.querySelector('strong')?.textContent === wanted,
    );
    if (option === undefined) return false;
    option.click();
    return true;
  }, label);
  if (!chosen) throw new Error(`vista informativa assente nel picker: ${label}`);
  // La heatmap si ricostruisce a scaglioni dentro il budget di frame: al clic
  // c'e' ancora mezza citta' senza tinta.
  await page.waitForTimeout(2500);
  await page.locator('.info-picker .drawer-close').first().click();
  await page.waitForTimeout(1000);
}

/** Come `pickInfoView`, per le viste d'ispezione: `.view-picker`, e la targa in alto a sinistra. */
async function pickInspectView(page, label) {
  await page.getByRole('button', { name: /Look inside the city/i }).click();
  await page.waitForSelector('.view-picker:not([hidden])', { timeout: 15000 });
  const chosen = await page.evaluate((wanted) => {
    const option = [...document.querySelectorAll('.view-picker .view-option')].find(
      (el) => el.querySelector('strong')?.textContent === wanted,
    );
    if (option === undefined) return false;
    option.click();
    return true;
  }, label);
  if (!chosen) throw new Error(`vista d'ispezione assente nel picker: ${label}`);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const picker = document.querySelector('.view-picker');
    if (picker !== null && !picker.hidden) picker.querySelector('.drawer-close')?.click();
  });
  // La targa «Looking inside» compare solo a vista accesa: e' la conferma che il
  // clic ha preso, e nello scatto e' anche cio' che nomina il modo.
  await page.locator('.view-bar').first().waitFor({ state: 'visible', timeout: 15000 });
}

/**
 * Scende a terra: `O` arma la discesa, il clic sceglie dove stare.
 *
 * `O` si preme **una volta sola**. Un rifiuto — acqua sotto il cursore, niente
 * su cui posare l'occhio — lascia la discesa armata (`placeEye` esce prima di
 * `armed = false`), quindi ripremerlo la annullerebbe a turni alterni. La
 * conferma e' la targa di strada: `.street-bar` esce da `hidden` solo a occhio
 * posato.
 */
async function descendToStreet(page, cx, cy) {
  await page.keyboard.press('KeyO');
  await page.waitForTimeout(400);
  for (let r = 0; r <= 260; r += 32) {
    for (let a = 0; a < 360; a += 40) {
      const x = Math.round(cx + r * Math.cos((a * Math.PI) / 180));
      const y = Math.round(cy + r * Math.sin((a * Math.PI) / 180) * 0.6);
      if (x < 120 || x > 1100 || y < 170 || y > 750) continue;
      await page.mouse.click(x, y);
      await page.waitForTimeout(900);
      const down = await page.evaluate(() => {
        const bar = document.querySelector('.street-bar');
        return bar !== null && !bar.hidden;
      });
      // La discesa cambia profilo di qualita' e rifa' la shadow map: il primo
      // frame a terra e' piu' scuro di quello dopo.
      if (down) {
        await page.waitForTimeout(2500);
        return { x, y };
      }
      if (r === 0) break;
    }
  }
  return null;
}

/** Isola generata, catalizzatori piazzati, crescita avviata. */
async function seedCity(
  page,
  { growMs = 45000, extras = true, answer = true, freezeClock = true, greenhouse = true } = {},
) {
  await enterGame(page, { freezeClock });
  await terrainReady(page);
  await frameIsland(page);
  await placeCatalyst(page, 'Market', ISLAND.x - 20, ISLAND.y - 10);
  await placeCatalyst(page, 'Factory', ISLAND.x + 110, ISLAND.y + 45);
  await placeCatalyst(page, 'Park', ISLAND.x - 110, ISLAND.y + 45);
  // **La serra sta fra i primi e non fra gli extra: il freno vero e' il cibo.**
  // Senza, la corsa si ferma sotto il centinaio di residenti con «Growth held
  // back: not enough food» in cima all'HUD — e il fotogramma mostra un'isola
  // quasi vuota qualunque sia il soggetto dello scatto.
  //
  // La si toglie **solo** per lo scatto della carta evento: la carestia e' la
  // decisione che arriva prima e piu' spesso, e una citta' sfamata puo' passare
  // il minuto di crescita senza chiedere niente.
  if (greenhouse) await placeCatalyst(page, 'Greenhouse', ISLAND.x - 150, ISLAND.y - 90);
  // Un primo tratto di crescita prima degli extra: i costi lievitano col
  // bilancio, ma il bilancio di partenza sono 1.200 fondi — quattro catalizzatori
  // li consumano, e University e Monument sarebbero disabilitati al primo giro.
  const warmMs = Math.min(20000, Math.round(growMs / 3));
  await grow(page, warmMs, { answer });
  if (extras) {
    // Gli extra restano facoltativi anche di fatto: a seconda del bilancio del
    // tick, uno di questi puo' essere ancora inaccessibile e `pickTool` lo salta.
    await placeCatalyst(page, 'School', ISLAND.x + 150, ISLAND.y - 60);
    await placeCatalyst(page, 'University', ISLAND.x + 30, ISLAND.y - 110);
    await placeCatalyst(page, 'Monument', ISLAND.x - 60, ISLAND.y + 140);
  }
  await grow(page, Math.max(0, growMs - warmMs), { answer });
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
        // I salvataggi di una corsa precedente vanno via: il bottone grande
        // deve essere `Play` e non `Continue`, o ogni scatto ripartirebbe da
        // una citta' cresciuta chissa' quando — e da un formato che nel
        // frattempo puo' essere cambiato sotto i piedi.
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('h10.save.')) localStorage.removeItem(key);
        }
      } catch {
        /* storage disabilitato: l'aiuto resta chiudibile a mano */
      }
    });
  },

  // `play=1` su ogni indirizzo di gioco: dalla porta d'ingresso in poi il menu
  // si apre a **ogni** caricamento, e finche' e' aperto la citta' e' ferma.
  // Senza, ogni scatto partirebbe da un velo sopra un'isola che non cresce.
  shots: [
    {
      name: '01-city-overview',
      path: '/?play=1&seed=1337',
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
      path: '/?play=1&seed=1337',
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
      path: '/?play=1&seed=1337',
      timeoutMs: 300000,
      shows:
        'una carta evento della simulazione: la citta ha esaurito le scorte e chiede una scelta, con le tre risposte e il loro costo',
      alt: 'A decision card asking how to respond to a food shortage, with three options, over the voxel city',
      async prepare(page) {
        // Nessuna risposta automatica: la carta arriva quando le scorte non
        // coprono piu' i residenti, quindi serve una citta' gia' popolosa — e
        // **senza serra**, o la carestia che la apre non si presenta.
        await seedCity(page, { growMs: 60000, answer: false, greenhouse: false });
        await page.waitForSelector('.decision-card:not([hidden])', { timeout: 240000 });
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '04-policies-and-trade',
      path: '/?play=1&seed=1337',
      timeoutMs: 300000,
      shows:
        'il cassetto delle politiche: leve attivabili e strategie di scambio, separate dalla dashboard della citta',
      alt: 'Side drawer with city policies and trade strategies open over the city',
      async prepare(page) {
        await seedCity(page, { growMs: 45000 });
        await parkPointer(page);
        await page.getByRole('button', { name: /^Policies/i }).click();
        await page.waitForSelector('.policies-drawer:not([hidden])', { timeout: 15000 });
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '05-theme-neon',
      path: '/?play=1&seed=1337&theme=neon',
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
      path: '/?play=1&seed=1337&debug=1&grow=1',
      timeoutMs: 300000,
      shows:
        'l harness di misura: frame budget, draw call, triangoli, stato del mesher e del pool di worker accanto alle statistiche di crescita',
      alt: 'The voxel city with technical overlays showing frame timings, draw calls, chunk counts and growth statistics',
      async prepare(page) {
        await seedCity(page, { growMs: 45000 });
        await openDebugPanels(page);
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
        // `B` sporca tutti i chunk: la ricolorazione si vede solo quando il pool
        // di mesher ha finito di ripassarli, e sono 256 blocchi.
        await page.waitForFunction(
          () => globalThis.__terrainStats?.().biomeView === true,
          null,
          { timeout: 30000 },
        );
        await mesherIdle(page);
        await openDebugPanels(page);
        await page.mouse.move(1418, 460);
      },
    },
    {
      name: '09-selection-card',
      path: '/?play=1&seed=1337',
      timeoutMs: 300000,
      shows:
        'la scheda di selezione aperta su un edificio: in cima la carta di cio che serve per crescere, poi struttura, isolato, colonna e voxel impilate nella stessa colonna scorrevole, e il contorno azzurro sull impronta nel mondo',
      alt: 'Voxel city with a side card describing the clicked building — a growth summary on top, structure, block, column and voxel sections stacked below — and a blue outline around its footprint',
      async prepare(page) {
        await seedCity(page, { growMs: 60000 });
        // In pausa prima di scegliere: a 4x la citta' continua a crescere
        // mentre la spirale cerca, e una carta evento arriverebbe a coprire
        // proprio l'edificio selezionato.
        await page.getByRole('button', { name: /Pause simulation/i }).click();
        await answerDecision(page);
        await page.waitForTimeout(400);
        const picked = await selectBuilding(page, ISLAND.x, ISLAND.y);
        if (picked === null) throw new Error('nessuna struttura sotto la spirale di click');
        // Lo zoom **non** tocca la selezione: la camera si avvicina al punto
        // cliccato e il contorno resta sulla stessa impronta. A pieno campo un
        // edificio e' sei colonne su un'isola da mille, e la fascia che lo
        // circonda sarebbe qualche pixel. La rotella va mandata **sulla canvas**:
        // sopra il pannello la prende lui e la camera non si muove.
        await page.mouse.move(picked.x, picked.y);
        for (let i = 0; i < 7; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1500);
        // Niente `Escape`: adesso chiuderebbe proprio la scheda da fotografare.
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '10-road-network',
      path: '/?seed=1337&intro=0',
      timeoutMs: 720000,
      settleMs: 3000,
      shows:
        'il tracciato stradale che la citta si e data: un tronco largo che entra nel centro, i viali che lo alimentano e i vicoli da un voxel fra le case, con il percorso deciso dal rilievo invece che da un reticolo',
      alt: 'Voxel city seen from above with a dark wide artery running into the centre, narrower streets branching off it and thin lanes between the blocks',
      async prepare(page) {
        await seedCity(page, { growMs: 75000 });
        await mesherIdle(page);
        await parkPointer(page);
      },
    },
    {
      name: '11-road-hierarchy',
      path: '/?seed=1337&intro=0',
      timeoutMs: 720000,
      settleMs: 3000,
      shows:
        'la gerarchia da vicino: le quattro larghezze di carreggiata a confronto e il salto di tinta del tronco, con gli edifici affacciati sul fronte strada',
      alt: 'Close view of a voxel city block showing a wide dark road, medium streets and one-voxel lanes with buildings fronting them',
      async prepare(page) {
        await seedCity(page, { growMs: 75000 });
        await mesherIdle(page);
        // In pausa: a 4x la citta continua a crescere mentre la camera scende,
        // e un rimescolamento a meta zoom sposta proprio cio che si inquadra.
        await page.getByRole('button', { name: /Pause simulation/i }).click();
        await page.mouse.move(ISLAND.x, ISLAND.y);
        for (let i = 0; i < 9; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(150);
        }
        await mesherIdle(page);
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '08-simulation-lab',
      path: '/?play=1&seed=1337&debug=1&sim=1',
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
        await openDebugPanels(page);
        await page.mouse.move(1418, 460);
      },
    },
    {
      name: '12-info-view',
      path: '/?play=1&seed=1337',
      timeoutMs: 360000,
      settleMs: 3000,
      shows:
        'una vista informativa accesa sopra la citta: ogni isolato tinto dal distretto a cui appartiene, con la legenda delle fasce e il dock che dice cosa si sta leggendo',
      alt: 'Voxel city with a data overlay colouring each block by the district it belongs to, and a legend naming the bands',
      async prepare(page) {
        await seedCity(page, { growMs: 75000 });
        // In pausa: la heatmap si rifa' solo quando il campo cambia, e a 4x
        // cambierebbe mentre il picker e' ancora aperto.
        await page.getByRole('button', { name: /Pause simulation/i }).click();
        await answerDecision(page);
        await parkPointer(page);
        // A pieno campo la tinta cade su isolati alti pochi pixel e la vista si
        // legge come una velatura sull'isola invece che come un dato.
        await page.mouse.move(ISLAND.x, ISLAND.y);
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1200);
        await pickInfoView(page, 'Districts');
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '13-street-eye',
      path: '/?play=1&seed=1337',
      timeoutMs: 360000,
      settleMs: 3000,
      shows:
        'la discesa a terra: la stessa citta dal ciglio di una sua strada, in prospettiva invece che in assonometria, con la targa che dice come si risale',
      alt: 'First-person view from a street inside the voxel city, buildings rising on both sides',
      async prepare(page) {
        await seedCity(page, { growMs: 60000 });
        await page.getByRole('button', { name: /Pause simulation/i }).click();
        await answerDecision(page);
        await parkPointer(page);
        // Da vicino: a pieno campo il raggio prende un tetto, e l'occhio finisce
        // su una terrazza invece che sul marciapiede.
        await page.mouse.move(ISLAND.x, ISLAND.y);
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1200);
        const eye = await descendToStreet(page, ISLAND.x, ISLAND.y);
        if (eye === null) throw new Error('nessun punto dove posare l occhio');
        // Niente `Escape`: da terra risalirebbe. Il puntatore si sposta e basta —
        // la rotazione vuole il pointer lock, che un clic solo non prende.
        await page.mouse.move(1418, 460);
        await page.waitForTimeout(600);
      },
    },
    {
      name: '14-winter',
      path: '/?play=1&seed=1337&season=0.875',
      timeoutMs: 360000,
      shows:
        'la stessa isola nel pieno dell inverno: prato, rimbalzo del terreno, nebbia e orizzonte piegati dalla fase dell anno, e l HUD che nomina la stagione quando sposta il raccolto',
      alt: 'The voxel city under a winter palette, pale frosted ground and cold horizon',
      async prepare(page) {
        // `?season=` sopravvive a `Create island` perche' `newGameUrl` riparte
        // dalla query in vigore: a differenza di `hour=`, nessun comando di
        // gioco lo scioglie.
        await seedCity(page, { growMs: 60000 });
      },
    },
    {
      name: '15-cutaway',
      path: '/?play=1&seed=1337',
      timeoutMs: 360000,
      settleMs: 3000,
      shows:
        'una vista d ispezione: il taglio cade sulla strada piu vicina all isolato puntato e apre la citta in sezione, con la targa che nomina il modo e il gesto per cambiarlo',
      alt: 'The voxel city cut open along a street, showing the inside of the blocks, with a panel naming the view',
      async prepare(page) {
        await seedCity(page, { growMs: 60000 });
        await page.getByRole('button', { name: /Pause simulation/i }).click();
        await answerDecision(page);
        await parkPointer(page);
        await page.mouse.move(ISLAND.x, ISLAND.y);
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1000);
        await pickInspectView(page, 'Cutaway');
        // Il taglio segue l'isolato **puntato**: senza tornare sulla citta'
        // resterebbe dove il cursore era rimasto, cioe' sul picker.
        await page.mouse.move(ISLAND.x, ISLAND.y);
        await page.waitForTimeout(2500);
      },
    },
    {
      name: '16-city-dashboard',
      path: '/?play=1&seed=1337',
      timeoutMs: 360000,
      shows:
        'il cruscotto della citta: popolazione e mix degli usi, i bisogni per classe, gli obiettivi in corso e i mandati aperti, cioe il referto che la simulazione scrive su se stessa',
      alt: 'Side drawer with the city dashboard: population, use mix, needs per class and open goals',
      async prepare(page) {
        await seedCity(page, { growMs: 60000 });
        await parkPointer(page);
        await page.getByRole('button', { name: /^City/i }).click();
        await page.waitForSelector('.city-drawer:not([hidden])', { timeout: 15000 });
        await parkPointer(page, { escape: false });
      },
    },
    {
      name: '17-form-catalogue',
      path: '/?scene=swatch',
      timeoutMs: 300000,
      settleMs: 4000,
      shows:
        'il campionario delle forme: la fascia delle arcologie schierata su un basamento, con il pannello che nomina cio che sta sotto il cursore e conta i prismi di dettaglio',
      alt: 'A row of arcology forms lined up on a plinth, beside a panel naming the band and counting its detail prisms',
      async prepare(page) {
        // Il campionario non passa dalla schermata del titolo: e' una scena, non
        // una partita. Manca pero' `__voxelStats` senza `?debug=1`, quindi
        // `mesherIdle` ripiega sull'attesa fissa — ed e' quanto serve.
        await mesherIdle(page);
        // Le fasce sono cinque e l'inquadratura iniziale le tiene tutte: da li'
        // si vede una massa sola. Il bottone della fascia la inquadra da solo.
        const framed = await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find(
            (el) => el.textContent?.trim() === 'Arcologies',
          );
          if (button === undefined) return false;
          button.click();
          return true;
        });
        if (!framed) throw new Error('fascia Arcologies assente nel campionario');
        await page.waitForTimeout(2500);
        // `frameRegion` tiene dentro tutta la fascia, che e' una fila lunga in
        // diagonale: il rettangolo che la contiene e' quasi tutto cielo. La
        // rotella riporta i soggetti a riempire il fotogramma.
        await page.mouse.move(830, 430);
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1200);
        await mesherIdle(page);
        // Il pannello dell'ispezione e' una seconda voce che qui non dice niente:
        // il soggetto e' il campionario, e il suo pannello resta aperto apposta.
        await page.evaluate(() => {
          for (const panel of document.querySelectorAll('details.debug-panel')) {
            if (panel.querySelector('summary')?.textContent?.includes('INSPECT')) panel.open = false;
          }
        });
        await page.mouse.move(1418, 300);
        await page.waitForTimeout(800);
      },
    },
    {
      name: '18-night-city',
      path: '/?play=1&seed=1337&daylight=night',
      timeoutMs: 360000,
      settleMs: 3000,
      shows:
        'la citta di notte con il tema di casa: finestre e insegne accese dagli emissivi, il mare che riflette il cielo notturno e nessun pannello aperto',
      alt: 'The voxel city at night, lit windows and signs, the sea reflecting a dark sky',
      async prepare(page) {
        // Senza `L`: `?daylight=night` ha gia' fermato l'orologio sulla notte, e
        // il tasto lo rimetterebbe sul ciclo. `__voxelHour` non e' un'alternativa
        // qui — si registra solo con `?debug=1`, e questo scatto e' pulito.
        await seedCity(page, { growMs: 60000, freezeClock: false });
        await parkPointer(page);
      },
    },
  ],
};
