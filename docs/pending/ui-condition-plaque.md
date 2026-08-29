## changelog — La targa della condizione dice di nuovo qualcosa

- **La targa è alta due righe, e smette di tagliare il rimedio.**
  `.hud-toast[data-kind="condition"]` stava su una riga sola con l'ellissi,
  mentre i titoli di crisi di `game/tips.ts` sono frasi intere *proprio perché*
  il messaggio non si vede: portano causa e rimedio insieme. Due decisioni
  ragionevoli separatamente, e insieme garantivano il taglio peggiore — a 440px
  l'ellissi cadeva sempre dopo la causa, cioè mangiava la metà che dice cosa
  fare («Food shortage: no tower yet — overlap the Greenhouse with the ...»). Il
  clamp a due righe le contiene tutte e resta un tetto: la targa non può
  ricrescere in paragrafo, che era la ragione della riga sola.
- **Sette titoli smettono di essere un'etichetta.** Erano il guasto opposto e
  sullo stesso schermo: «Build more homes», «Place a Factory», «Plant more
  farms», «Budget deficit», «Critical happiness» e un «Goal · self-sufficient
  city» che non cambiava mai per l'intera partita. Entravano nella targa e non
  dicevano niente, perché la misura che li rendeva utili — il 42% di organico, i
  lotti mancanti, la felicità, le classi a posto, gli abitanti — stava nel
  messaggio, cioè nel cassetto Città che si apre solo se lo si apre. Ora la
  misura è nel titolo, dove si guarda.
- **Due consigli chiedevano l'unico gesto che il giocatore non ha.** Case e campi
  crescono da soli: i lotti li pianta il driver di `src/world/` sul terreno
  fertile che trova libero, e le case nascono intorno al Market. «Build more
  homes» e «Plant more farms» erano istruzioni per un pulsante che non esiste —
  esattamente l'errore che il commento in testa a `tips.ts` esiste per vietare.
  Il gesto vero è il catalizzatore che li fa nascere, e adesso è quello che il
  titolo nomina.
- **Il contratto della targa ha due prove.** `tips.test.ts` verifica che ogni
  titolo entri nel budget di due righe, che separi la causa dal gesto, e che
  nessuno torni a chiedere case o campi; una terza prova enumera gli id coperti,
  perché senza di quella le prime due passerebbero anche misurando metà dei
  consigli.
