## changelog — Polishing dell'HUD

- **L'HUD si adatta allo schermo invece di spegnere le parole.** L'unità di
  misura non è più il pixel ma `--hud-unit`, che vale 1px su una viewport da 1080
  e scala con la quota fra un pavimento (0.85, sotto cui i corpi di testo non si
  leggono e i bersagli non si colpiscono) e un tetto (1.15, oltre cui la cornice
  mangia la città invece di servirla). Ogni token di spazio, testo, raggio e
  taglia ne è un multiplo, quindi la scala è continua: niente scatti, niente
  soglie, niente sparizioni.
- **Le colonne del dock le decide la quota disponibile.** Dodici catalizzatori su
  tre colonne fanno sette righe, ed erano quelle a chiedere ~975px di rail: più
  di quanti un 1080p ne abbia davvero una volta tolte le barre del browser, ed è
  il motivo per cui quasi tutti vedevano il ramo compatto. Gli stessi quattro
  gruppi (4, 4, 4, 3) su quattro colonne stanno in quattro righe, una per gruppo.
  Le tre colonne restano sopra i 1200px, dove c'è abbondanza vera: sono la
  disposizione bella, non quella normale.
- **Le rinunce cominciano dove prima erano già finite.** Il prezzo e la cifra del
  requisito cedono a 700px di quota, l'etichetta a 600 — prima cedevano a 900 e
  800, cioè su quasi ogni schermo reale. Fra gli 800 e i 600 ora ci si arriva con
  le parole al loro posto.
- **La colonna di ogni tessera è passata dal JS al CSS.** Deve cambiare insieme
  al numero di colonne, e chi decide le colonne è la media query: tenere il
  conteggio in `BuildDock` significava avere due fonti per lo stesso numero, con
  la scheda che si sarebbe disallineata al primo ridimensionamento.
