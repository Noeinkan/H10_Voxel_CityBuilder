# Fase 4.15 — Un isolato si può scegliere e girarci attorno

Il ragionamento dietro una fase chiusa: cosa si voleva, com'è stata risolta,
cosa ha insegnato. L'elenco delle attività e il loro stato restano in
[ROADMAP.md](../../ROADMAP.md), che è il file che la dashboard legge.

Dipende dalla 4.11 per il motore delle viste e dalla 4.13 per le superfici che le
spiegano. Vive in `src/engine/` (`inspect.ts`, `IsoCameraController.ts`), in
`src/ui/` e in `src/main.ts`.

**Stato implementazione:** completata.

**Perché adesso.** Il gate della fase 4 chiede che «il singolo edificio regga
anche l'inquadratura ravvicinata», e non c'era modo di produrne una: la camera
aveva quattro angoli e un'inclinazione sola, e Block focus perdeva il soggetto al
primo movimento del mouse. Le due mancanze erano la stessa — nessun modo di
guardare **una** cosa — e si chiudono insieme.

Le tre regole, che sono il contenuto vero della fase:

- **Puntare e scegliere sono due tempi.** Il velo al 68% risponde a «come si
  connette» e resta esattamente com'era; il clic porta la densità a `cut` e
  risponde a «com'è fatto». Stessa geometria, stesso rettangolo, un numero
  diverso: per questo non è un modo in più nel ciclo di `V`.
- **Ciò che si sceglie smette di inseguire.** Con un isolato scelto
  `applyInspect` non rilegge il puntatore. Era il difetto che rendeva la vista
  inutilizzabile per studiare, ed è lo stesso della 4.13 portato un passo avanti:
  lì il fuoco si agganciava, qui si ferma del tutto.
- **La camera si restituisce.** L'inquadratura la muove lo strumento, non il
  giocatore: uscendo torna identica — yaw, scatto, inclinazione, perno, altezza e
  zoom.


**Vincolo:** nessuna uniform nuova e nessun modo nuovo. La vista resta una lente
sul rendering e non uno stato della città (vincolo della 4.13): `src/sim/` e
`src/game/` continuano a non sapere che esiste, non si salva, e al ricaricamento
si riparte da Normal — l'isolato scelto compreso.

**Perché l'inclinazione si ferma a 12° e 82°.** Non è un gusto. Sotto,
`1 / sin(pitch)` — la correzione che fa seguire il cursore al trascinamento —
esplode, e con lei il pan e l'inversione schermo→terra. Sopra, `camera.lookAt`
degenera perché la direzione di vista diventa parallela a `up`: è lo stesso
scoglio che `SunShadow` aggira con un `up` di ripiego.

**Resta aperto.** Le ombre proiettate **si spengono ancora** mentre si studia, ed
è la stessa cosa lasciata aperta da 4.11 e 4.13: il predicato dell'ispezione vive
nel materiale di scena e non in quello di profondità, quindi il volume tolto
continuerebbe a proiettare ombra sul modellino. Qui il costo si sente più che
altrove — un oggetto isolato senza ombra propria legge piatto — e la risposta
resta il predicato nel `depthMaterial` di `SunShadow`, cioè un secondo shader da
tenere allineato a mano.

Inoltre: il **cielo è un quad in spazio schermo** (scelta motivata in
`SkyBackground.ts`), quindi abbassando l'inclinazione il gradiente non segue
l'orizzonte; e la **nebbia sopravvive allo zoom** per costruzione (`fogLift`),
quindi un isolato guardato da molto vicino può uscire lattiginoso — si tara sul
tema, non sullo shader. Nessuna delle due è un difetto di questa fase, ma
entrambe si notano solo da qui in poi.

**Riferimenti**
- [Camera Tool di Cities: Skylines II](https://skylines.paradoxwikis.com/Camera_Tool):
  già citato in 4.11 come «la strada opposta, perché la camera qui è ortografica e
  vincolata». Resta ortografica: l'orbita è un modo circoscritto a un soggetto, e
  la città non ci finisce mai dentro.
- Il **modellino** come metafora: Tiny Glade e i diorami di Townscaper mostrano
  che un oggetto staccato dal contesto si legge per silhouette e ombra propria —
  ed è esattamente l'ombra che qui manca ancora.
