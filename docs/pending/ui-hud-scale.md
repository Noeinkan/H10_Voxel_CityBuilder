## changelog — Polishing dell'HUD

- **Una scala di token al posto dei numeri a mano.** `hud.css` guadagna uno
  strato geometrico accanto a quello cromatico: spaziatura su griglia 4pt, scala
  tipografica a ratio stretto, quattro raggi, una scala di quote. Erano dodici
  padding, dieci raggi e dodici corpi di testo decisi uno per uno; i valori del
  tema restano derivati a runtime da `hudTokens.ts` e non sono stati toccati.
- **I cinque pannelli del bordo destro hanno una larghezza sola.** Dashboard,
  policy, viste, temi, aiuto e scheda di selezione andavano da 300 a 470px, e
  siccome condividono lo stesso bordo destro il bordo *sinistro* saltava a ogni
  cambio di pannello, scoprendo e ricoprendo la città. Adesso è `--panel-w`, e
  una sola riga di media query li stringe tutti insieme.
- **Il requisito non tocca più il bordo della tessera.** Lo spazio che ospita la
  cifra sotto una tessera bloccata è diventato `--tile-foot`, e si spegne insieme
  al testo: le media query sull'altezza stringevano il padding senza sapere che
  ci stava dentro qualcosa.
- **La condizione della città è una targa, non un paragrafo.** Il toast in basso
  a sinistra portava titolo e spiegazione — la stessa coppia che il cassetto
  Città apre in cima alla colonna — e restava aperto per tutta la crisi. Ora
  resta il titolo; il perché sta dove c'è spazio per leggerlo.
- **Museo, cattedrale e deposito avevano la tessera vuota.** `HudIcon` non
  conosceva i tre ruoli aggiunti a `BALANCE`, `PATHS[name]` tornava `undefined` e
  le tessere uscivano senza disegno — con etichetta, prezzo e tasto al loro
  posto, cioè senza sembrare rotte. Aggiunte le tre icone e rimosso il cast in
  `BuildDock` che lo lasciava passare: ora un ruolo senza icona rompe la
  compilazione.
- **Meno cose che si contraddicono.** `--hud-ink-soft`, usata e mai definita, era
  un colore che non smorzava niente; `--dock-tiles` era scritto a ogni corsia del
  dock con un commento che descriveva un `flex-grow` che nessuna regola CSS
  applicava; allarme e avvertimento erano due regole di toast identiche parola
  per parola, e il tooltip del rail era la stessa regola scritta due volte.
