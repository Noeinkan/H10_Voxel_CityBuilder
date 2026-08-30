## changelog — La suite tornava a non finire mai
- **Un ciclo che non poteva chiudersi teneva ferma l'intera suite.** In
  `landmarkGrowth.test.ts` la crescita del sedime aspettava la fine dello
  sventramento a colpi di `builder.step()`, senza guardia. Ma `step()` muove
  soltanto la coda di crescita e quella di superficie: i cantieri avanzano
  dentro `onTick`, via `clearance.pass`. Con `clearing` a uno il ciclo non aveva
  modo di scendere, e girava per sempre. Adesso alterna `tick` e `onTick` come
  gia' faceva il test gemello sotto, con la stessa guardia a 5000 giri.
- **Il costo era l'intera suite, non un file.** `npm test`, `test:fast` e
  `test:fast:all` incontrano tutti quel file: ogni run che partiva non tornava
  piu'. Una era rimasta appesa **diciotto ore** come processo orfano, e le altre
  finivano uccise da chi si stancava di aspettare — da cui l'idea che la suite
  fosse «lenta». Non lo era: `vitest run --exclude src/**/*.slow.test.ts` chiude
  in **68,6 s** su macchina scarica.
- **Il metodo per ritrovarlo, se ricapita.** Sweep a dimezzamento con tetto di
  tempo duro e `taskkill /T /F` su chi lo sfora — per cartella di `src/`, poi
  per sottocartella, poi per file. Tre giri, pochi minuti, e senza `/T` il figlio
  vitest sopravvive e diventa lo zombie successivo. Aspettare una run che non
  finira' mai e' l'unica mossa che non porta informazione.
