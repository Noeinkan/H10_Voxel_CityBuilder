## indice — `src/engine/`
| [src/engine/VehicleMaterial.ts](src/engine/VehicleMaterial.ts) | I materiali di mezzi e scia: non hanno uniform propri, prendono in prestito quelli del voxel. |
| [src/engine/shaders/scene.glsl.ts](src/engine/shaders/scene.glsl.ts) | Il GLSL che i materiali di scena condividono: palette, luce, materia, ombra, prospettiva aerea. |
| [src/engine/shaders/vehicle.glsl.ts](src/engine/shaders/vehicle.glsl.ts) | Il programma dei mezzi: normale che ruota con la sagoma, fasciame, finestrini accesi, fanali. |
| [src/engine/shaders/wake.glsl.ts](src/engine/shaders/wake.glsl.ts) | Il programma della schiuma: bordo che si spegne e granello sulla cella del mondo. |

## indice — `src/world/`
| [src/world/traffic/wake.ts](src/world/traffic/wake.ts) | La scia sull'acqua: il pennacchio letto in orizzontale, dalle pose passate. |

## indice — Test e bench
| [src/engine/VehicleMaterial.test.ts](src/engine/VehicleMaterial.test.ts) | Che gli uniform dei mezzi siano gli stessi oggetti del voxel, non delle copie. |
| [src/world/traffic/wake.test.ts](src/world/traffic/wake.test.ts) | Che la V si apra, che i segni si tocchino e che una barca all'ormeggio non lasci niente. |

## changelog — Mezzi dentro il paesaggio
- **I mezzi passano per un materiale di scena invece che per i colori nei
  vertici.** Erano `MeshBasicMaterial` con la tinta di palette gia' moltiplicata
  per l'ombra della faccia, riscritta alla cadenza dell'HUD: funzionava, e si
  vedeva — una nave in fondo alla rada restava satura mentre la costa dietro si
  scioglieva nella nebbia, quindi non stava *nel* paesaggio, ci stava sopra come
  una figurina. Ora c'e' un programma proprio che prende **in prestito gli
  uniform del voxel** — gli stessi oggetti, non delle copie — quindi stesso sole,
  stessa ombra proiettata, stessa prospettiva aerea, stesso banco di nuvole, per
  costruzione e non per allineamento manuale.
- **Il GLSL condiviso vive in `shaders/scene.glsl.ts`, in tre blocchi.** Nebbia,
  luce e ombra erano scritte dentro `voxel.frag.ts` perche' li' c'era l'unico
  programma che le usasse; con tre materiali di scena una seconda copia sarebbe
  una copia che diverge. I blocchi sono tre e non uno perche' un uniform
  dichiarato e mai letto e' codice morto che sembra vivo: la schiuma non ha una
  normale da cui campionare un'ombra, e non deve dichiarare la shadow map.
- **Le sagome guadagnano fasciame, grana e finestrini accesi.** Il reticolo di
  lamiera al passo del voxel e la variazione per cella si leggono nel **sistema
  del mezzo** e non del mondo: agganciate alle coordinate mondo, scorrerebbero
  sotto lo scafo mentre naviga. Di notte le fasce vetrate si accendono a
  finestrino, come le facciate della citta'.
- **I fanali sono dichiarati, non dedotti.** `HullBlock.lamp` viene dalla
  scatola: `lightPalette` veste anche le pinne di un dirigibile, e dedurre
  l'emissione dalla tinta le accenderebbe come due tubi al neon.
- **Gli scafi lasciano una scia.** `world/traffic/wake.ts` e' il pennacchio letto
  in orizzontale — la stessa posa letta nel passato, piu' un'apertura laterale
  lineare — quindi in pausa si ferma, a 4x si allunga con la nave e due partite
  identiche lasciano gli stessi segni. Serviva a una cosa sola: uno scafo che
  scivola su un mare intatto e' una figurina appoggiata sopra, e nessun dettaglio
  di sagoma corregge quella lettura. Una barca all'ormeggio non lascia niente.
