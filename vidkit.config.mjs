/**
 * vidkit config — video dimostrativo del gameplay.
 *
 *   npx vite build
 *   npx vite preview --port 8011 --strictPort
 *   node C:/Personal_utilities/video-kit/vidkit.mjs --gpu --speed-idle 4
 *
 * **La build statica non e' un dettaglio, e' il prerequisito.** Il server di
 * sviluppo ricarica la pagina a ogni salvataggio altrui (HMR), e una ricarica
 * riporta l'app alla schermata del titolo: il video viene, non da' nessun
 * errore, e mostra il menu sopra una citta' che era cresciuta davvero. Vale piu'
 * qui che per gli scatti — una presa dura minuti, non secondi. Il perche' esteso
 * sta in `shotkit.config.mjs`, insieme alle funzioni di avvio da cui queste
 * discendono.
 *
 * `VIDKIT_BASE_URL` punta a un'istanza avviata altrove.
 *
 * Le coordinate qui sotto valgono sull'**isola 1337 a 1440×900**: il seed e' nei
 * path perche' il default dell'app e' casuale, e due riprese dello stesso
 * soggetto mostrerebbero due mondi diversi.
 */

const BASE_URL = process.env.VIDKIT_BASE_URL || 'http://localhost:8011';

/** Centro dell'isola nella viewport dopo `frameIsland`. */
const ISLAND = { x: 720, y: 430 };

/** Fuori dalla canvas: il puntatore non copre la citta' mentre si guarda. */
const PARK = { x: 1418, y: 460 };

/* ------------------------------------------------------------- avvio --- */

/**
 * Attraversa la schermata del titolo, **fuori camera**.
 *
 * `?play=1` non la salta: il parametro esiste, ma misurato con `shotkit probe`
 * la porta d'ingresso resta su schermo e il resto gira dietro un velo. Il
 * bottone grande e' `Play` a mani vuote e `Continue` quando c'e' un
 * salvataggio: si clicca quello, senza sapere quale dei due sia.
 */
async function enterGame(page, seed = '1337') {
  const primary = page.locator('.title-screen .title-button--primary:visible').first();
  await primary.waitFor({ state: 'visible', timeout: 120000 });
  await primary.click();
  await page.waitForTimeout(800);

  // `Play` non avvia niente: apre il pannello «New island». Il bottone vero e'
  // `Create island`, e il campo accanto vuole il seed — lasciato vuoto ne
  // sorteggia uno. Con un salvataggio il pannello non compare: il ramo va
  // tenuto, non ci si arriva sempre.
  const create = page.locator('.title-screen [data-role="create"]:visible').first();
  if ((await create.count()) > 0) {
    const field = page.locator('.title-screen .title-field:visible').first();
    if ((await field.count()) > 0) await field.fill(seed);
    await create.click();
  }
  // La condizione e' la **sparizione della schermata del titolo**, non il dock:
  // l'HUD esiste nel DOM anche dietro il velo e risulta gia' visibile mentre la
  // schermata dice ancora «Growing the island…» — misurato, 556 ms invece dei
  // venti secondi veri. Aspettare il dock qui vorrebbe dire cliccare gli
  // strumenti attraverso un velo che li copre ancora.
  await page.locator('.title-screen').first().waitFor({ state: 'hidden', timeout: 180000 });
  await page.locator('.build-dock').first().waitFor({ state: 'visible', timeout: 60000 });
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

/** Ferma l'orologio: due riprese dello stesso soggetto con due luci diverse non si montano. */
async function pinDaylight(page) {
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(1000);
}

async function pickTool(page, name) {
  const tile = page.getByRole('button', { name: new RegExp('^' + name, 'i') }).first();
  // I costi lievitano col bilancio: un extra puo' essere ancora inaccessibile
  // quando `seedCity` passa a piazzarlo. Lo si salta invece di far fallire la
  // ripresa: la citta' cresce comunque.
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
 * Fuori dalla canvas e lontano dai bottoni. Il blur serve oltre allo
 * spostamento: dopo un clic il bottone resta a fuoco, e il tooltip del dock e'
 * agganciato al fuoco, non all'hover.
 *
 * A mani vuote `Esc` **apre il menu principale**, che mette la citta' in pausa:
 * senza richiuderlo, `grow()` aspetterebbe secondi durante i quali non passa un
 * tick. Un secondo `Esc` non basta — alterna — e la chiusura va chiesta
 * esplicitamente, che e' anche l'unico gesto idempotente.
 */
async function parkPointer(page, { escape = true } = {}) {
  if (escape) await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const veil = document.querySelector('.main-menu-veil');
    if (veil !== null && !veil.hidden) veil.querySelector('.title-button--primary')?.click();
  });
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(PARK.x, PARK.y);
  await page.waitForTimeout(400);
}

async function setSpeed(page, speed) {
  await page.getByRole('button', { name: new RegExp('Simulation speed ' + speed, 'i') }).click();
  await page.waitForTimeout(200);
}

/** Avanza per `ms`, rispondendo alle carte evento invece di lasciarle aperte. */
async function grow(page, ms, { answer = true, speed = 4 } = {}) {
  await setSpeed(page, speed);
  await parkPointer(page);
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    if (answer) await answerDecision(page);
  }
}

/** Il pool di mesher lavora in coda: senza aspettarlo si riprende un mondo a meta'. */
async function mesherIdle(page, timeout = 120000) {
  // `__voxelStats` esiste solo sotto `?debug=1` o `?perf=1`: senza, la
  // `waitForFunction` non e' falsa, e' cieca — aspetta il timeout intero. Su una
  // partita normale si ripiega su un'attesa fissa, che e' tutto cio' che si puo'
  // onestamente fare.
  const measurable = await page.evaluate(() => typeof globalThis.__voxelStats === 'function');
  if (!measurable) {
    await page.waitForTimeout(6000);
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
 * Cerca una **struttura** sotto il cursore e riporta il punto, lasciando la
 * selezione pulita.
 *
 * Il clic a mani vuote apre sempre la scheda — anche sul prato, dove pero'
 * mancano proprio le righe che valgono la ripresa. La spirale cerca quindi la
 * carta Structure, non il pannello: e' la sola che scompare sul prato. Girare la
 * spirale **fuori camera** e poi ripetere un clic solo davanti all'obiettivo e'
 * la differenza fra una selezione e venti clic a vuoto in campo.
 */
async function findBuilding(page, cx, cy) {
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
        const card = [...panel.querySelectorAll('.selection-card')].find(
          (el) => el.querySelector('.selection-card-eyebrow')?.textContent === 'Structure',
        );
        return card === undefined ? null : (panel.querySelector('.selection-title')?.textContent ?? '');
      });
      if (picked !== null) {
        // La scheda si richiude: il clic che la riapre e' quello che si filma.
        await page.evaluate(() => {
          document.querySelector('.selection-panel .drawer-close, .selection-panel button')?.click();
        });
        await page.waitForTimeout(200);
        return { x, y, title: picked };
      }
      if (r === 0) break;
    }
  }
  return null;
}

/** Isola generata, catalizzatori piazzati, crescita avviata. */
async function seedCity(page, { growMs = 40000, extras = true, answer = true } = {}) {
  await enterGame(page);
  await terrainReady(page);
  await frameIsland(page);
  await pinDaylight(page);
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

/* ------------------------------------------------------------ config --- */

export default {
  baseUrl: BASE_URL,
  // Nessun `server`: la build statica va avviata a mano (vedi in cima). vidkit
  // salta l'avvio quando `baseUrl` risponde gia'.

  outDir: '.videos',
  // 1440×900 e non il default 1280×800: le coordinate dell'isola qui sotto sono
  // misurate su questa viewport, ed e' la stessa di `shotkit.config.mjs`.
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',

  // 700 invece di 600: l'HUD e' denso e ogni azione muove piu' di un pannello.
  beatMs: 700,
  typeDelayMs: 95,
  tailMs: 1800,

  // La generazione del terreno e la crescita sono attese lunghe e non sono il
  // soggetto: `--speed-idle 4` le comprime senza toccare il ritmo delle azioni.
  speedIdle: 4,
  idleThresholdMs: 1500,

  // La citta' e' una canvas WebGL che ridisegna in continuazione, non una pagina
  // con animazioni CSS: `calmAnimations` non la tocca. Resta acceso per le
  // transizioni dell'HUD, che sono l'unica cosa qui che possa correre da sola.
  calmAnimations: true,

  mask: [],

  async setup(_page, context) {
    await context.addInitScript(() => {
      try {
        // L'aiuto del primo avvio copre mezza scena: lo si marca come gia'
        // visto, che e' lo stato dalla seconda partita in poi.
        localStorage.setItem('h10-cozy-help-seen-v1', '1');
        // I salvataggi di una presa precedente vanno via: il bottone grande deve
        // essere `Play` e non `Continue`, o ogni scena ripartirebbe da una
        // citta' cresciuta chissa' quando.
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('h10.save.')) localStorage.removeItem(key);
        }
      } catch {
        /* storage disabilitato: l'aiuto resta chiudibile a mano */
      }
    });
  },

  scenes: [
    {
      name: '01-new-island',
      path: '/',
      waitFor: '.title-screen .title-button--primary',
      timeoutMs: 300000,
      chapter: {
        title: 'H10 Voxel City',
        description: 'A seed is a city — the same number always grows the same island',
      },
      shows:
        'la porta d ingresso: si digita un seed e l isola nasce da quello, scendendo dal cielo un chunk per volta',
      async act(page, v) {
        await v.click('.title-screen .title-button--primary');
        await v.caption('Every island is generated — the seed is the whole world');
        const field = page.locator('.title-screen .title-field:visible').first();
        await field.fill('');
        await v.type(field, '1337');
        // Rete di sicurezza muta: il campo nasce con un seed casuale gia'
        // dentro, e se una battuta si perdesse l'isola sarebbe un'altra — le
        // coordinate delle altre scene valgono solo sulla 1337.
        if ((await field.inputValue()) !== '1337') await field.fill('1337');
        await v.click('.title-screen [data-role="create"]');
        // **Non aspettare il dock**: l'HUD esiste nel DOM anche dietro il velo,
        // quindi risulta visibile mentre la schermata dice ancora «Growing the
        // island…» — misurato, 556 ms invece dei venti secondi veri, e la
        // didascalia finiva sopra un caricamento. La schermata del titolo se ne
        // va (`root.remove()`) nell'istante in cui il mondo e' pronto, ed e'
        // esattamente l'istante in cui i chunk cominciano a cadere.
        await v.waitHidden('.title-screen', { timeout: 180000 });
        await v.caption('The island lands, chunk by chunk');
        await v.beat(4000);
      },
    },

    {
      name: '02-place-a-catalyst',
      path: '/',
      waitFor: '.title-screen .title-button--primary',
      timeoutMs: 300000,
      chapter: { title: 'Place a catalyst', description: 'You do not draw the city. You give it a reason' },
      shows:
        'il piazzamento: si sceglie uno strumento dal dock, il segnaposto 3D segue il terreno e il cartellino pesa il sito — costo, raggio di influenza, tipologie che possono nascerne',
      async prepare(page) {
        await seedCity(page, { growMs: 30000 });
      },
      async act(page, v) {
        await v.click('University');
        await v.caption('Pick a catalyst from the dock');
        // Il punto si cerca fuori camera: la spirale di `findLand` sarebbe venti
        // scatti del puntatore prima di trovare terra buona.
        const spot = (await findLand(page, ISLAND.x + 40, ISLAND.y - 140)) ?? {
          x: ISLAND.x,
          y: ISLAND.y,
        };
        await page.mouse.move(spot.x - 130, spot.y + 90);
        await page.waitForTimeout(300);
        await page.mouse.move(spot.x, spot.y, { steps: 24 });
        await page.waitForTimeout(900);
        await v.caption('The card weighs the site: cost, reach, and what can grow here');
        await v.beat(2200);
        await page.mouse.click(spot.x, spot.y);
        await v.caption('Placed — the neighbourhood starts to want things');
        await v.beat(2400);
      },
    },

    {
      name: '03-the-city-grows',
      path: '/',
      waitFor: '.title-screen .title-button--primary',
      timeoutMs: 420000,
      chapter: { title: 'The city grows itself', description: 'Buildings are decided by the simulation, not placed by hand' },
      shows:
        'il cuore del gioco: alzando la velocita la simulazione decide dove e cosa costruire, le strade si allungano e la barra delle risorse si muove da sola',
      async prepare(page) {
        // Catalizzatori e un primo abbozzo di citta' fuori camera, poi si torna
        // a 1× per far vedere l'accelerazione partire davanti all'obiettivo.
        await seedCity(page, { growMs: 45000 });
        await setSpeed(page, 1);
        await parkPointer(page, { escape: false });
      },
      async act(page, v) {
        await v.caption('Three catalysts, and a simulation that decides the rest');
        await v.click('Simulation speed 4');
        await parkPointer(page, { escape: false });
        await v.caption('Roads reach out, blocks fill in, typologies are chosen per site');
        // Quattro respiri invece di uno lungo: le carte evento vanno chiuse
        // mentre si guarda, o coprono proprio la citta' che sta crescendo.
        for (let i = 0; i < 4; i++) {
          await v.beat(3000);
          await answerDecision(page);
        }
        await v.caption('Nothing here was drawn by hand');
        await v.beat(2400);
      },
    },

    {
      name: '04-inspect-a-building',
      path: '/',
      waitFor: '.title-screen .title-button--primary',
      timeoutMs: 420000,
      chapter: { title: 'Ask the city why', description: 'Every building can explain itself' },
      shows:
        'la scheda di selezione: si clicca un edificio e il gioco spiega cosa gli serve per crescere, con struttura, isolato, colonna e voxel impilati sotto e il contorno azzurro sull impronta',
      async prepare(page) {
        await seedCity(page, { growMs: 55000 });
        // In pausa prima di scegliere: a 4× la citta' continua a crescere mentre
        // si cerca, e una carta evento arriverebbe a coprire l'edificio.
        await setSpeed(page, 1);
        await page.getByRole('button', { name: /Pause simulation/i }).click();
        await answerDecision(page);
        await page.waitForTimeout(400);
        const picked = await findBuilding(page, ISLAND.x, ISLAND.y);
        if (picked === null) throw new Error('nessuna struttura sotto la spirale di clic');
        this.spot = picked;
        // Lo zoom **non** tocca la selezione, e serve: a pieno campo un edificio
        // e' sei colonne su un'isola da mille. La rotella va mandata sulla
        // canvas — sopra un pannello la prende lui e la camera non si muove.
        await page.mouse.move(picked.x, picked.y);
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(150);
        }
        await mesherIdle(page);
        await parkPointer(page, { escape: false });
      },
      async act(page, v) {
        const spot = this.spot ?? ISLAND;
        await v.caption('Click any building');
        await page.mouse.move(spot.x, spot.y, { steps: 22 });
        await page.waitForTimeout(400);
        await page.mouse.click(spot.x, spot.y);
        await v.wait('.selection-panel:not([hidden])');
        await v.beat(2600);
        await v.caption('What it is, what it needs to grow, and the ground it stands on');
        await v.scrollBy(320);
        await v.beat(2600);
      },
    },

    {
      name: '05-themes-and-night',
      path: '/',
      waitFor: '.title-screen .title-button--primary',
      timeoutMs: 420000,
      chapter: { title: 'Same city, different light', description: 'Palettes and the clock swap hot — no geometry is rebuilt' },
      shows:
        'il look: il selettore dei temi cambia 32 colori e i parametri di atmosfera a caldo, e il bottone del giorno porta la stessa citta nella notte senza rigenerare una geometria',
      async prepare(page) {
        await seedCity(page, { growMs: 50000 });
        await parkPointer(page);
      },
      async act(page, v) {
        await v.click('Change visual theme');
        await v.wait('.theme-picker:not([hidden])');
        await v.caption('Seven palettes, swapped without rebuilding a single chunk');
        await v.click('Use Neon theme');
        await v.beat(2600);
        await page.keyboard.press('Escape');
        await parkPointer(page, { escape: false });
        // `L` cicla ciclo → giorno fisso → notte fissa: due pressioni dal ciclo
        // arrivano alla notte, che e' l'ora in cui `neon` si legge davvero.
        await v.press('KeyL');
        await v.press('KeyL');
        await v.caption('Night is a real hour, not a filter — light, fog, water and emissives follow');
        await v.beat(3200);
      },
    },
  ],
};
