# Regole per `src/world/arcology/`

Prima di modificare questo dominio, leggi integralmente
[`docs/world/arcology.md`](../../../docs/world/arcology.md).

Quando tocchi registry, occupazione o crescita condivisa, leggi anche
[`docs/world/streets-buildings.md`](../../../docs/world/streets-buildings.md).

- L'arcologia nasce da condizioni di citta', non da uno strumento.
- Cresce per delta e conserva vuoti e piazzali misurati dalla ricetta.
- Due famiglie, e a sceglierle e' il **bonus di quota**, non la fascia: la torre
  prende la cresta del cono (`heightBonusAt >= SKYLINE.coneBonus`), il cratere la
  spalla. `recipe.sunken` distingue le ricette; per una interrata `z = 0` e' il
  fondo del pozzo e il piano di campagna sta in cima.
- **La fascia da sola non distingue niente**, ed e' misurato: su una citta'
  cresciuta il denso e' tutto `core` e il resto e' rado e costiero, quindi
  `tier !== core` non aveva un solo sito. Vale per ogni condizione nuova di
  questo dominio: misurala sugli isolati veri prima di scriverla.
- Le profondita' di scavo si **misurano** prima di scriverle: l'isola vera arriva
  a 34 quote, non alle 80 di `TERRAIN.maxHeight`. Guarda `sunkenSites.test.ts`.
