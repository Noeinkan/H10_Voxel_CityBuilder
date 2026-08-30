## changelog — Le opere di terra prendono il pendio

- **`maxTerraceSlope` sale al doppio di `buildableMaxSlope`.** Valeva `0.46`,
  appena un terzo sopra la pendenza edificabile, e su terra emersa rifiutava dal
  3% al 9% delle colonne a seconda del seed — concentrato sul raccordo fra
  pianoro e pianura, cioe' dove il giocatore clicca. Il cartellino «No earthwork
  holds here» compariva su fianchi che un terrapieno regge benissimo. Ora la
  soglia e' `TERRAIN.buildableMaxSlope * 2` (`0.68`): misurato sugli stessi tre
  seed, il rifiuto su terra emersa scende sotto lo 0,1%, e cio' che resta e' la
  parete vera — il campo continuo non passa `0.72` nemmeno sul fianco piu'
  ripido. Il tetto strutturale non cambia e non e' mai stato lui a decidere:
  sotto un'impronta da sei celle il muro piu' alto che questo terreno sappia
  produrre e' di dieci voxel, meno della meta' di `maxWorksStep`.
- **Le scarpate delle fixture si dichiarano rispetto alla soglia.** La riva del
  lago in `actions.test.ts` era scritta `0.6`: diceva «ripida» solo finche' la
  soglia valeva `0.46`, e la ritaratura l'avrebbe trasformata in silenzio in un
  pendio qualunque, svuotando la deroga della marina invece di verificarla.
