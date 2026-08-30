## indice — `src/world/buildings/` — crescita voxel
| [lotSearch.ts](src/world/buildings/lotSearch.ts) | Dove c'e' posto per un edificio, in pianta e in quota: la ricerca del lotto oltre il proprio isolato, la scelta dell'impalcato, e le tre memorie con cui si risponde a «questa colonna e' libera?» — il memo d'infornata, i rettangoli esauriti e i siti bocciati per sempre | `LotSearch`, `DeckProbe` |
| [frontage.ts](src/world/buildings/frontage.ts) | Il fronte strada di un lotto: lo scorrimento che accosta l'impronta al vicino, la raccolta dei termini di fila dal registry e i contatori dell'aggregazione | `Frontage` |

## changelog — Ricerca del lotto e fronte strada fuori dal Builder
- **`Builder.ts` scende da 1544 a 1148 righe.** La ricerca del lotto — memo
  d'infornata, rettangoli esauriti, siti bocciati, scelta dell'impalcato — vive
  in `lotSearch.ts`, e l'aggregazione sul fronte strada in `frontage.ts`. Il
  `Builder` resta quello che la documentazione dichiarava: il ciclo, la nascita
  di un edificio sul lotto e le statistiche. Nessun cambio di comportamento: i
  metodi sono gli stessi, con le stesse dipendenze prese dal `BuildContext`.
- **La citta' in quota entra nella ricerca da due sole domande.** `LotSearch`
  riceve un `DeckProbe` — `hasDeck` e `decksOpened` — invece dell'`AerialDriver`
  intero: la freccia fra i due resta in un verso solo e dichiarata nel tipo.
