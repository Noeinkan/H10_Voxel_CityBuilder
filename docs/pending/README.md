# Frammenti di documentazione in attesa

Qui si scrive quello che andrebbe in `PROJECT_INDEX.md` e in `CHANGELOG.md`,
**un file per agente**, e `npm run docs:merge` lo fonde al posto giusto.

Non è burocrazia: quei due file li aggiorna chiunque, e sempre nello stesso
istante — a fine turno, quando l'incremento vuole atterrare. Con più agenti in
parallelo erano quasi un terzo dei rifiuti del semaforo. Scrivendo prima il
frammento, il lavoro è al sicuro anche se in quel momento l'indice è occupato:
il frammento resta qui e lo fonde il prossimo che passa.

## Come si scrive

Il nome del file è libero, basta che sia tuo: l'area su cui lavori va benissimo
(`world-traffic.md`). Se è già preso, il semaforo te lo dirà: aggiungi un
suffisso.

```markdown
## indice — `src/world/traffic/`
| [src/world/traffic/skyRoutes.ts](src/world/traffic/skyRoutes.ts) | Rotte in quota: … |

## changelog — Titolo dell'incremento
- **Titolo della voce.** Cos'è cambiato e perché.
```

- La sezione dopo `## indice —` è il titolo della sezione di `PROJECT_INDEX.md`
  in cui la riga deve finire, esattamente com'è scritto lì (`Radice`,
  `Documentazione operativa`, `` `src/engine/` ``). Le righe entrano in ordine
  alfabetico; una riga già presente per lo stesso path viene sostituita, non
  duplicata.
- **Un `*.test.ts` o un `*.bench.ts` non ha una riga d'indice.** Il file di test
  sta accanto a quello che copre e `npm run test:related` lo trova dal grafo
  degli import: una riga in più non aggiunge un posto dove guardare, aggiunge
  una fusione da fare e un rifiuto del semaforo da aspettare.
- Il blocco `## changelog` finisce in coda all'incremento in corso. Se il tuo è
  un incremento diverso, dagli un titolo (`## changelog — Il tuo titolo`): apre
  una sezione nuova in cima invece di infilare le voci sotto il titolo di un
  altro.
- I due blocchi sono indipendenti: se hai solo l'uno o solo l'altro, scrivi solo
  quello.

Se una sezione non esiste, la fusione fallisce dicendo quale e non scrive
niente: meglio un errore che una riga messa a caso.
