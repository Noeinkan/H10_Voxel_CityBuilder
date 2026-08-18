/**
 * Cadenza fissa della simulazione, staccata dal frame rate.
 *
 * La simulazione e' deterministica: legarla al `dt` significherebbe farne
 * dipendere l'esito dalla macchina che la guarda, e due partite con lo stesso
 * seed divergerebbero per il solo fatto che una gira su un portatile. Se un
 * frame e' stato lungo si recuperano piu' tick, mai un tick piu' grande.
 *
 * Non importa Three.js e non tocca il DOM: il rendering resta dov'e', in
 * `renderer.setAnimationLoop`, e non passa da qui. E' anche cio' che rende
 * questo file verificabile in ambiente `node` come tutto il resto.
 */
export class FixedStepLoop {
  private accumulator = 0;

  constructor(
    /** Tick al secondo. */
    private readonly tickRate: number,
    /**
     * Tick al massimo recuperabili in una chiamata.
     *
     * Tornando da una scheda rimasta in background per un minuto il `dt` vale
     * sessanta secondi: senza tetto sarebbero seicento tick in un frame solo,
     * cioe' una finestra bloccata proprio nel momento in cui l'utente ci torna.
     */
    private readonly maxCatchUpTicks: number,
  ) {}

  /** Tick ancora da eseguire, come frazione di passo. Serve alle misure. */
  get pending(): number {
    return this.accumulator * this.tickRate;
  }

  /**
   * Consuma `dt` secondi e chiama `onStep` una volta per ogni tick dovuto.
   * Restituisce quanti ne ha eseguiti.
   */
  advance(dt: number, onStep: () => void): number {
    const step = 1 / this.tickRate;
    this.accumulator += dt;

    let budget = this.maxCatchUpTicks;
    let ran = 0;
    // Le somme di decimali binari possono lasciare 0.299999… al posto di 0.3:
    // una tolleranza microscopica evita di rimandare un tick dovuto al frame dopo.
    while (this.accumulator + Number.EPSILON >= step && budget > 0) {
      this.accumulator -= step;
      if (this.accumulator < 0) this.accumulator = 0;
      budget--;
      onStep();
      ran++;
    }

    // Il residuo oltre il tetto si butta invece di conservarlo: tenerlo
    // significherebbe restare in debito di tick per i minuti successivi,
    // recuperando `maxCatchUpTicks` a ogni frame e non raggiungendo mai il
    // presente.
    if (this.accumulator > step * this.maxCatchUpTicks) this.accumulator = 0;

    return ran;
  }
}
