# Razionalizzazione: ridurre il costo per feature

## Contesto

La domanda di partenza era: si spendono troppo tempo e troppi token su questa
repo, si possono razionalizzare dei componenti e riusarli?

**La risposta misurata e' che non c'e' copia-incolla da togliere.** `jscpd` su
`src/` (escluso `*.test.ts`, 319 file) trova 11 cloni esatti per 178 righe:
**0.23%**. Un giro di DRY classico non troverebbe niente da fare.

Il costo sta altrove, e sono quattro cose distinte:

1. **La domanda «che tipo di struttura e' questo record?» e' scritta a mano ~60
   volte in 19 file.** Ogni punto enumera un sottoinsieme diverso di
   `record.landmark / span / aerial / arcology / ropeway / aloft`. Il commento in
   [capture.ts:124](src/game/save/capture.ts#L124) lo dice gia' da solo: «l'unica
   cosa da tenere allineata se un giorno nasce una sesta struttura». Ce ne sono
   sei, e le sedi da allineare sono 19. **Questa e' la tassa vera su ogni dominio
   nuovo**: un agente deve aprire tutti quei file per decidere, uno per uno, in
   quale sottoinsieme entra il marker nuovo.
2. **I 10 driver ripetono la stessa quaterna di piazzamento** con nomi diversi:
   `dirtyChunkCount` → `registry.overlaps` → `registry.add` → `growth.enqueue`
   (27 / 28 / 16 occorrenze). E ognuno ricostruisce a mano le 5-6 closure della
   sonda sul mondo (`ground`, `land`, `solid`, `firm`, `free`, `top`, `occupied`),
   che leggono le stesse tre fonti con nomi di dominio diversi.
3. **Le letture dominano la spesa.** `rtk gain`: 10.0M dei 16.4M token risparmiati
   vengono da `rtk read`, contro 2.3M di `grep` e 1.8M di test. Il materiale piu'
   grosso che viene aperto: `ROADMAP.md` 183 KB (~46k token), `main.ts` 3396
   righe, `docs/index/structures.md` 25 KB, `README.md` 32 KB.
4. **Non c'e' un indice semantico.** Si naviga con `locate` + `rg` + lettura di
   file interi; nessuno strumento risponde a livello di simbolo.

Esito atteso: un dominio nuovo si aggiunge toccando il suo `config.ts`, il suo
piano e una riga di tabella — non 19 file — e una sessione tipica apre meno
byte per arrivare allo stesso punto.

---

## Leva 1 — I tratti sul record (migrazione completa)

**Il pattern esiste gia' nella repo e va solo alzato di livello.**
[`aerial/config.ts:77-84`](src/world/aerial/config.ts#L77-L84) ha esattamente
questa idea per un dominio solo: `takesGround(part)` e `isBuildable(part)`
rispondono per nome invece di far enumerare le parti al chiamante. E
[`BuildingRegistry.ts:1124`](src/world/buildings/BuildingRegistry.ts#L1124)
(`takesGroundOf`) e' gia' la versione a livello di record, per un tratto solo.

### Nuovo file: `src/world/buildings/structureKind.ts`

Un modulo piccolo, l'unico posto della repo che legge i campi marker:

- `STRUCTURE_KIND` — il discriminante: `plain`, `landmark`, `rooftopLandmark`
  (`landmark` + `aloft`), `span`, `aerial`, `arcology`, `ropeway`.
- `structureKindOf(record): StructureKind` — **l'unica funzione che guarda
  `record.landmark`, `record.span`, `record.aerial`, `record.arcology`,
  `record.ropeway`, `record.aloft`.**
- `STRUCTURE_TRAITS: Record<StructureKind, StructureTraits>` — la tabella.
- I predicati con nome, che leggono la tabella e nient'altro.

### I tratti si ricavano dai 60 punti esistenti, non si inventano

Questo e' il passo che decide se il refactor e' onesto. **Prima di scrivere la
tabella, censire tutti i punti e raggrupparli per domanda posta**, non per
sottoinsieme di campi. Dalla ricognizione le domande distinte sono queste, e
ognuna ha gia' un rappresentante nel codice:

| Predicato | Domanda | Sedi di riferimento |
| --- | --- | --- |
| `takesGround` | occupa il suolo delle sue colonne? | `BuildingRegistry.ts:1124` (gia' fatto) |
| `canAnchor` | ci si puo' appendere una campata o un ponte? | `crossingDriver.ts:183`, `spanDriver.ts:395`, `landmarkDriver.ts:339`, `aerialDriver.ts:803` |
| `promotes` | puo' salire di livello? | `upgradeDriver.ts:71-80` |
| `countedBySim` | la simulazione lo conta come edificio? | `capture.ts:134`, `BuildingRegistry.tally` |
| `rebuildableFromRecord` | `recordStamp` lo ridisegna dal solo record? | `capture.ts:113`, `recordStamp.ts:40-57` |

La selezione (`ui/SelectionPanelModel.ts:491-631`, `game/selection.ts:440-670`)
**non e' un booleano ma un dispatch**: li' si usa `structureKindOf` come
discriminante di uno `switch`, non un tratto.

**Regola di sicurezza, da rispettare alla lettera:** i sottoinsiemi oggi
differiscono per ragioni vere — `spanDriver` esclude 2 marker, `crossingDriver`
6, `capture` 3. Dove un punto non coincide con nessun tratto della tabella,
**resta esplicito con un commento che dice perche'**, e non viene piegato al
tratto piu' vicino. Appiattire una distinzione reale e' l'unico modo in cui
questo refactor puo' peggiorare le cose.

### Ambito: tutti e 19 i file

`world/buildings/` (11 file, `arcologyDriver`, `aerialDriver`, `landmarkDriver`,
`crossingDriver`, `guideDriver`, `spanDriver`, `upgradeDriver`, `harborDriver`,
`clearanceSite`, `recordStamp`, `BuildingRegistry`), piu' `game/growthScene.ts`,
`game/selection.ts`, `game/save/capture.ts`, `ui/SelectionPanelModel.ts`.

**`game/save/capture.ts` e' il punto delicato**: `unrenderable` e
`countedBuilding` decidono cosa la cattura pota. Un tratto sbagliato li' non da'
un test rosso subito, da' un salvataggio che al caricamento perde pezzi. Quel
file si migra **per ultimo e da solo**, con `restore.test.ts` e i test di `save/`
in verde prima e dopo.

---

## Leva 2 — Il protocollo di piazzamento

### Nuovo file: `src/world/buildings/placeStructure.ts`

La quaterna che i 10 driver ripetono, detta una volta:

```
placeStructure(ctx, {
  rect, baseZ, height, budget,     // dirtyChunkCount vs il tetto del dominio
  exempt,                          // gli id eccettuati da overlaps
  record,                          // i campi propri del dominio (marker, supports)
  stamp,                           // cosa accodare a growth
}): BuildingRecord | null
```

Riusa `dirtyChunkCount` ([chunkBudget.ts](src/world/buildings/chunkBudget.ts)),
`anchorOf` ([growthQueue.ts](src/world/buildings/growthQueue.ts)) e
`hashCoords` ([rng.ts](src/world/rng.ts)) — non ne sostituisce nessuno.

Il caso piu' semplice, `ropewayDriver.build` (~40 righe), deve ridursi al giro
sulle due stazioni piu' una chiamata. `crossingDriver` e `guideDriver` sono i
due banchi di prova per `exempt` e per i piani a piu' segmenti.

### Nuovo file: `src/world/buildings/worldProbe.ts`

Le letture che ogni driver ricostruisce, con **un nome canonico ciascuna**:
`heightAt`, `topAt` (terreno o tetto di chi ci sta sopra), `isLand`, `isFirm`,
`isFree`, `isSolid`. I tipi di sonda dei domini (`RopewayProbe`, `AerialProbe`,
`CrossingProbe`) **restano dove sono** — sono il contratto che tiene le regole
pure e testabili senza registry — e i driver li compongono dalla sonda canonica
invece di riscrivere le closure.

**Non toccare** `arcologyDriver`, `landmarkDriver` e `aerialDriver` in questa
leva: sono i tre piu' grandi e hanno varianti di piazzamento proprie. Prima i
sette semplici; i tre grandi sono un incremento a se', da valutare sui risultati.

---

## Leva 3 — La dieta del contesto

Da eseguire con la skill `token-diet`, che copre gia' questo lavoro.

- **`ROADMAP.md`, 183 KB.** E' il file singolo piu' costoso della repo. Le fasi
  chiuse vanno in `docs/roadmap/` come il changelog fa gia' in
  `docs/changelog/`, e in root resta l'attivo piu' l'indice. Usare la skill
  `roadmap-format` per non rompere la convenzione letta da repo-radar.
- **`src/main.ts`, 3396 righe.** Per `CLAUDE.md` e' un file di composizione,
  quindi la soglia delle 1000 righe non lo riguarda: **si spezza per costo di
  lettura, non per regola.** I confini ci sono gia', marcati a commento —
  `// --- Scena di simulazione ---` (1820), `// --- Viste di ispezione ---`
  (2062), `// --- Viste informative ---` (2096). Estrarre i gruppi coesi
  (salvataggio/slot, viste, intro, traffico/vitalita') in `src/boot/`, lasciando
  in `main.ts` il solo cablaggio.
- **Misurare prima e dopo**, con la stessa metrica: byte dei file che una
  sessione tipica apre davvero. Senza numeri questa leva e' opinione.

### Fatto, e cosa resta

**La roadmap e' fatta e misurata**: 181 → 86 kB, 50k → 24k token, venti schede in
`docs/roadmap/`. Le attivita' sono rimaste in radice perche' repo-radar legge solo
quel file e riconosce un task dal testo: spostarle avrebbe dichiarato il progetto
al 20% invece che all'87% e perso il cycle time di ognuna. `verify.mjs` conferma
zero sezioni e zero righe perse, e l'anteprima della dashboard e' identica.

**`src/main.ts` e' fatto**, 3440 → 1849 righe. Il primo giro aveva tolto solo
cio' che era sicuro — le etichette del cursore (pure) e il salvataggio (unico
blocco con uno stato suo) — e aveva lasciato il resto perche' non era una
potatura ma un incremento di progettazione: quelle righe erano **una chiusura
sola su quarantasette `let` di modulo condivisi**, e estrarne un gruppo significa
*decidere di chi e' quello stato*, non spostare righe.

La decisione e' stata presa gruppo per gruppo, e sono dieci moduli in
`src/shell/`, ognuno proprietario del proprio stato: `pointerPick` (il raycaster
e le tre domande sul mondo), `placementTools` (`selectedTool` e cio' che il
puntatore ne fa), `demolishGesture` (la gomma, unico strumento in due tempi),
`selectionScene` (la cella scelta, la scheda, il contorno, il coach),
`streetEye` (la discesa a terra), `swatchScene` (il campionario),
`infoViewScene`, `entryDrop`, `frameStats`, `debugHooks`. In radice restano il
montaggio, il ciclo di frame a budget, il gating di qualita' e il router della
tastiera — cioe' cio' che un composition root deve fare.

Due vincoli hanno guidato la forma. **Cio' che nasce dopo arriva come funzione**
(`inspect`, `hud`, `map`, `registry`, `generator`), perche' l'ordine di
costruzione e' reale: la discesa a terra esiste prima delle viste d'ispezione
perche' il gating di qualita' la interroga gia'. E **l'ordine di registrazione
dei listener e' rimasto identico**, perche' e' un contratto: il primo che si
prende il clic lo toglie a tutti quelli dopo.

Verificato con `typecheck`, `build` e una sonda headless su Chromium: quindici
hook globali registrati, isola generata, `V` e `I` che ciclano le viste, uno
strumento preso dal dock, la scheda che si apre a un clic, la targa della vista
da terra, `__voxelDrop()` che rimanda in cielo 113 chunk. Nessun errore di
pagina. Il campionario provato a parte: soggetto sotto il cursore, scelta, `Esc`
che la molla e rimette l'inquadratura.

---

## Leva 4 — L'indice semantico

Valutazione, non adozione al buio. Aggiungere
[Serena](https://github.com/oraios/serena) come server MCP locale su questa repo
e misurare su due compiti reali gia' fatti (uno di ricerca, uno di modifica) i
token spesi con e senza. Serena lavora a simbolo via LSP invece che a file
intero, ed e' il candidato piu' diretto per la voce `rtk read`.

Due punti da verificare prima di tenerlo: che il TypeScript LSP regga 520 file
senza tempi di avvio assurdi, e che non entri in conflitto con `npm run locate`,
che risponde gia' bene alla domanda «dove sta». **Se la misura non mostra un
guadagno chiaro, si scarta** — e' una dipendenza esterna, non e' gratis.

### Misurato, e scartato

**I due punti da verificare passano tutti e due.** Il TypeScript LSP indicizza
602 file in 27 secondi comprese l'installazione via `uvx` e la generazione del
progetto, e il server MCP si alza in 7,5 secondi: nessun tempo assurdo. E il
conflitto con `locate` non c'e', perche' i due non rispondono alla stessa
domanda — `npm run locate -- structureKindOf` dice «Nessuna voce trovata nel
Project Index», ed e' corretto: l'indice ha una riga per **file**, e un simbolo
non e' un file. Erano le due obiezioni previste, e cadono entrambe.

**A bocciarlo e' il conto, misurato parlando MCP al server su tre domande
vere.**

| Domanda | Serena | Percorso attuale |
| --- | --- | --- |
| Dove sta `structureKindOf`, e com'e' fatto | 693 byte, 1,2 s | `rg` piu' una `Read` mirata, ~1 860 byte |
| Chi chiama `structureKindOf` | 13 654 byte, 6,6 s | `rg -n`, 2 829 byte |
| Cosa c'e' dentro `main.ts` | 3 414 byte, 0,7 s | 6 839 byte a `grep` dei simboli, 75 076 a leggerlo intero |

Vince due domande su tre — e la terza, «chi lo chiama», la perde di quasi cinque
volte, perche' `find_referencing_symbols` restituisce il codice attorno a ogni
chiamante mentre `rg` restituisce la riga.

**Il costo fisso e' quello che chiude il discorso: 26 173 byte di schemi degli
strumenti, cioe' ~6 500 token in *ogni* richiesta di *ogni* sessione**, ventuno
strumenti di cui tredici sono di scrittura o di memoria e non c'entrano con la
lettura a simbolo. Il risparmio per interrogazione sta fra i 300 e gli 850
token: servono dalle otto alle venti interrogazioni per sessione solo per
rientrare, e una sessione tipica ne fa molte meno. Ridotto ai sei strumenti di
lettura resterebbero 10 849 byte (~2 700 token), che rientrano in tre o quattro
interrogazioni: e' l'unica configurazione in cui varrebbe la pena riaprirlo.

**E c'e' un motivo che non e' di token.** L'hook del semaforo intercetta
`Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell` — **non** gli strumenti MCP.
I sette strumenti di scrittura di Serena (`replace_symbol_body`,
`insert_after_symbol`, `rename_symbol`, `replace_in_files`, `safe_delete_symbol`
e gli altri) scriverebbero su disco senza passare dal lucchetto, in una repo su
cui lavorano piu' agenti in parallelo e il cui intero protocollo di
coordinamento poggia su quell'hook. Una configurazione di sola lettura non ha
questo problema, ma va imposta, non sperata.

**Esito: scartato**, come il piano prevedeva per il caso «guadagno non chiaro».
Gli artefatti della prova (`.serena/`, 35 MB) sono stati rimossi. Se un giorno
si riapre, si riapre con i soli strumenti di lettura e con l'hook del semaforo
esteso agli strumenti MCP — in quest'ordine.

---

## Ordine

Le leve 3 e 4 sono indipendenti dalle prime due e si possono fare in parallelo o
in un'altra sessione. Fra 1 e 2, **la 1 viene prima**: il protocollo di
piazzamento vorra' chiedere «questo record e' un appoggio valido?», e con i
tratti gia' in piedi la risposta esiste.

1. ~~Leva 1, censimento dei 60 punti e tabella dei tratti.~~ **Fatto**:
   `structureKind.ts`, sette tipi e sette colonne.
2. ~~Leva 1, migrazione di `world/buildings/`.~~ **Fatto**, con due code
   raccolte dopo: `BuildingRegistry.tally` e `save/capture.ts`.
3. ~~Leva 1, migrazione di `game/` e `ui/`.~~ **Fatto**: `selection.ts`,
   `growthScene.ts`, `SelectionPanelModel.ts`, `selectionVerdict.ts` e il
   `facadeHostAt` di `main.ts`, piu' la colonna `hasUrbanUse`.
4. ~~Leva 2, `placeStructure` + `worldProbe`.~~ **Fatto sui quattro driver
   semplici** — campate, ponti fra settori, guide, funivia. Landmark, arcologie
   e citta' in quota restano fuori per scelta: hanno varianti di piazzamento
   proprie, e farcele entrare riporterebbe le eccezioni dentro il protocollo.
5. ~~Leva 3, dieta.~~ **Fatta**: ROADMAP misurata, `main.ts` 3440 → 1849 righe
   su dieci moduli di `src/shell/`, ognuno proprietario del proprio stato.
6. ~~Leva 4, misura di Serena e decisione.~~ **Misurata e scartata**: i due
   punti da verificare passano, a bocciarla e' il costo fisso di ~6 500 token
   per richiesta e il fatto che i suoi strumenti di scrittura scavalcherebbero
   il semaforo (vedi sopra).

Ogni passo e' consegnabile e reversibile da solo.

### Cosa resta di leggibile nei marker

Dopo il passo 3 i punti che nominano ancora un campo marker sono di tre specie,
e **due su tre vanno lasciate stare**: la lettura del *carico* (`record.arcology`
per la ricetta, `record.landmark` per il catalizzatore), che non e' una domanda
sul tipo; e cio' che la tabella non poteva dire, cioe' `takesGroundOf` e gli
indici di `BuildingRegistry.index`, che dipendono dalla *parte* in quota e non
dal tipo. La terza specie — classificazioni scritte a mano — era vera coda del passo 2, ed
e' **chiusa**: `guideDriver`, `ropewayDriver` e `frontage` passano ora per tre
predicati nuovi di `structureKind.ts` (`isSpan`, `isRopewayTower`,
`isLandmark`). Non sono diventati colonne della tabella, e il commento di ognuno
dice perche': sono domande sul **tipo**, non tratti. `harborDriver` non era coda
affatto — quel `record.landmark` e' la lettura del *carico*, cioe' la ricetta, e
resta dov'e'.

**La coda ha fatto emergere un rosso silenzioso.** `Builder.countRestored`
riconosceva un edificio impilato con un elenco di marker che escludeva quota,
campate e monumenti sul tetto ma **lasciava passare arcologie e monumenti a
terra**, che portano `supports` per un'altra ragione: una citta' caricata diceva
uno `stacked` che la stessa citta', costruita, non avrebbe mai detto. Adesso la
domanda e' `isPlainBuilding`, che e' esattamente cio' che conta il percorso
vivo. E' un conteggio da overlay, non stato di gioco, ma e' la prova che
l'elenco scritto a mano nascondeva la divergenza invece di dirla.

## Verifica

Verifica proporzionata, come impone `AGENTS.md`:

- `npm run typecheck` a ogni passo.
- `npm run test:related -- <i sorgenti toccati>` durante l'iterazione. Per il
  passo 2 questo pesca `Builder.test.ts`, `arcologyDriver.test.ts`,
  `generate.test.ts`, `overhang.test.ts`; per il passo 3, `restore.test.ts`,
  `SelectionPanelModel.test.ts`, `growthScene.test.ts`.
- **La suite intera solo a fine leva, e chiedendo prima** — non e' un gesto da
  prendere di iniziativa su questa repo.
- Passo 3 (salvataggio): oltre ai test, un giro a mano con `?debug=1` — salvare
  una citta' cresciuta, ricaricarla, verificare che il conteggio dell'HUD e le
  strutture in quota siano gli stessi. I test non coprono la potatura della
  cattura end-to-end.
- Passo 5 (`main.ts`): `npm run build`, perche' tocca il punto di composizione.

## Documentazione dovuta

`structureKind.ts`, `placeStructure.ts` e `worldProbe.ts` sono file di
produzione: serve un frammento in `docs/pending/` fuso con `npm run docs:merge`,
non una riga scritta a mano in `PROJECT_INDEX.md`. Se i tratti cambiano il modo
di aggiungere un dominio, va aggiornato anche
[`src/world/AGENTS.md`](src/world/AGENTS.md).
