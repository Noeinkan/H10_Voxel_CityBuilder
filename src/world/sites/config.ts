/**
 * Unica fonte di verita' dei numeri dei vincoli di sito.
 *
 * Vale la stessa regola di `terrain/config.ts`, `streets/config.ts`,
 * `grading/config.ts` e `buildings/config.ts`: nessun altro file di
 * `src/world/sites/` contiene una distanza, un lato o un dislivello.
 *
 * **Perche' esiste questo dominio.** Dalla 4.2 il terreno si paga invece di
 * essere vietato: `groundKindOf` rifiuta solo cio' che nessuna opera raddrizza,
 * e la battigia e' diventata un lotto come gli altri, per tutti i ruoli. Ne e'
 * seguito il risultato opposto a quello previsto — il porto si piazzava in cima
 * a una collina — perche' con il terreno che ha smesso di dire di no, nessuno
 * dice piu' dove un *ruolo* abbia senso. Questi numeri rispondono a quella
 * domanda, e sono l'unica cosa che distingue il fronte mare dall'entroterra.
 */
export const SITE = {
  /**
   * Distanza entro cui un ruolo costiero deve incontrare l'acqua.
   *
   * Sei celle e non una: chiedere che la colonna *sia* battigia ridurrebbe il
   * porto all'anello di sabbia, largo poche celle e gia' conteso dalla crescita
   * automatica. Sei lascia scegliere fra la banchina e il primo terreno asciutto
   * dietro, che e' esattamente la decisione che un porto vero comporta.
   *
   * Non e' `BUILDER.coastalRadius`, e i due numeri non vanno unificati: quello
   * decide se un mercato e' un mercato sul porto — una questione di *aspetto*,
   * generosa per costruzione — questo decide se un piazzamento e' ammesso.
   */
  coastalRadius: 6,

  /**
   * Lato del quadrato che un ruolo di superficie deve trovare gia' quasi piano.
   *
   * Nove celle sono piu' del doppio dell'impronta massima di un edificio: e' cio'
   * che rende il vincolo una ricerca e non una formalita'. Dispari perche' il
   * quadrato e' centrato sulla colonna cliccata, e con un lato pari il centro
   * cadrebbe fra due celle.
   */
  openSpan: 9,

  /**
   * Dislivello ammesso dentro quel quadrato.
   *
   * Molto sotto `GRADING.maxWorksStep`, e deliberatamente: quel tetto e' tarato
   * sulla banchina che scende sul fondale, cioe' sul caso peggiore che un'opera
   * regge, e qui non serve sapere se il terreno *si puo'* spianare ma se e' gia'
   * abbastanza piano da non doverlo fare. Con il dislivello fra colonne adiacenti
   * sempre 0 o 1 su quest'isola, quattro voxel su nove celle sono un pianoro.
   */
  openMaxStep: 4,
} as const;
