## indice — Radice
| [PERFORMANCE.md](PERFORMANCE.md) | Piano prestazioni: dove sta il tempo misurato, le fasi per rientrare nel budget del frame e i contatori con cui si difende |

## indice — Test e bench
| [src/world/chunkCoords.test.ts](src/world/chunkCoords.test.ts) | Iniettività di `columnKey` e dominio in cui resta un intero piccolo. |

## changelog — La chiave di colonna diventa un intero

- **Le mappe per colonna del registro non allocano più una stringa a
  interrogazione.** `columns`, `groundColumns`, `buckets` e la blacklist dei siti
  del `Builder` erano indicizzate da `` `${x},${y}` ``: una stringa nuova per
  ogni lettura, e le letture sono più di un milione ogni sessanta tick perché
  `lotIsFree` scandisce il riquadro di ricerca colonna per colonna. `columnKey`
  in `chunkCoords.ts` le impacchetta in un intero — quindici bit per asse più il
  bias, quindi dentro l'intero piccolo di V8 — e la sola lettura misura 2,5 volte
  più veloce sulla stessa città matura. Il dominio è ±16384 colonne per lato,
  contro le 384 dell'isola più grande, ed è fissato da un test perché una chiave
  numerica che collide non dà un errore: dà un edificio dentro un altro.
