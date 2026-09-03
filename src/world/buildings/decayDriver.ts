import { BALANCE, isDecayArmed, nextDecaySites, type SimState } from '../../sim';
import { envelopeOf, type BuildingRecord } from './BuildingRegistry';
import type { BuildContext } from './buildContext';
import type { ClearanceSites } from './clearanceSite';
import { BUILDER } from './config';
import { traitsOf } from './structureKind';

/**
 * Il declino: chi se ne va, e quando.
 *
 * **E' lo speculare della promozione, non della fondazione.** `UpgradeDriver`
 * gira sul registro a cursore e chiede al campo se un edificio si e' meritato un
 * livello in piu'; qui si gira sugli edifici a cursore e si chiede alla
 * copertura se il posto li regge ancora. Fondare e' l'altro mestiere — cerca
 * celle *vuote*, quindi deve scandire tutto il campo — e imitarlo qui avrebbe
 * fatto pagare al declino un costo che cresce con la mappa.
 *
 * **Non demolisce da se'.** Apre un cantiere di sgombero e se ne va: a smontare
 * i voxel a budget, a togliere il record dal registro e a dirlo alla
 * simulazione con `removeBuildings` e' `ClearanceSites`, la stessa macchina del
 * monumento che si fa posto e della gomma. Un secondo percorso di rimozione
 * divergerebbe dal primo al primo caso limite, e qui i casi limite — una campata
 * che poggiava, due cantieri sovrapposti, un record gia' rimosso — sono la parte
 * difficile.
 *
 * **Un edificio per passata**, e non per risparmiare: un isolato che sparisce
 * tutto insieme non si legge come una conseguenza.
 */
export class DecayDriver {
  private cursor = 0;
  private abandonedCount = 0;

  constructor(
    private readonly ctx: BuildContext,
    private readonly clearance: ClearanceSites,
  ) {}

  /** Quanti edifici il declino ha portato via da inizio partita. */
  get count(): number {
    return this.abandonedCount;
  }

  /**
   * Apre i cantieri dell'abbandono, se il fronte e' armato.
   *
   * **Non tocca lo stato**, ed e' il verso giusto: la simulazione perde
   * l'edificio quando i suoi voxel non ci sono piu', cioe' qualche passata piu'
   * tardi, e a dirglielo e' `clearance.pass` che gira comunque a ogni tick.
   * Toglierlo qui aprirebbe la finestra in cui il suolo legge libero mentre
   * l'edificio e' ancora in piedi.
   */
  pass(state: SimState): void {
    // Il fronte prima di tutto: senza, un angolo scoperto di una citta' sana
    // basterebbe a far sparire una casa, e il declino smetterebbe di essere una
    // cosa che il giocatore ha fatto succedere.
    if (!isDecayArmed(state)) return;

    const scan = nextDecaySites(state, BUILDER.decaysPerPass, this.cursor);
    this.cursor = scan.cursor;

    let opened = 0;
    for (const site of scan.sites) {
      if (opened >= BUILDER.abandonPerPass) break;

      const record = this.ordinaryAt(site.x, site.y, site.class);
      if (record === null) continue;

      // Il rifiuto del cantiere si crede: un monumento nel riquadro, una
      // struttura protetta, o un record che un altro cantiere ha gia' condannato.
      // Il sito tornera' nella lista al giro dopo se e' ancora scoperto.
      const opening = this.clearance.start(
        envelopeOf(record),
        BALANCE.gameplay.abandonment.clearing,
        () => {},
        // Nessun recinto: li' non arrivera' nessuna struttura a sostituire il
        // vuoto, e un anello di cantiere attorno a un prato direbbe per sempre
        // che sta per succedere qualcosa.
        { fence: false },
      );
      if (!opening) continue;

      opened++;
      this.abandonedCount++;
    }
  }

  /**
   * Il record ordinario ancorato a quella colonna con quell'uso.
   *
   * Le tre domande servono tutte. **L'ancoraggio**: `at` risponde per colonna
   * occupata, e un'impronta larga occupa colonne che non sono la sua origine,
   * mentre la simulazione conosce solo quella. **I tratti**: un landmark,
   * un'arcologia, una campata o un pezzo di citta' in quota non si abbandonano —
   * e' la stessa tabella che dice chi non promuove, letta per l'altro verso.
   * **Cio' che regge**: chi porta un impalcato in quota non se ne va, o
   * lascerebbe qualcosa per aria.
   *
   * L'ultima domanda si fa al **registry** e non al driver della citta' in
   * quota, ed e' voluto: qui non serve sapere se una mensola vuota cadrebbe da
   * sola — quella e' la domanda della promozione, che ha una sagoma nuova da far
   * stare — serve sapere se sopra c'e' qualcosa. `decksOf` risponde con l'array
   * vuoto senza materializzare niente per quasi tutta la citta'.
   */
  private ordinaryAt(x: number, y: number, cls: number): BuildingRecord | null {
    for (const record of this.ctx.registry.at(x, y)) {
      if (record.x !== x || record.y !== y || record.class !== cls) continue;
      if (!traitsOf(record).promotes) continue;
      if (this.ctx.registry.decksOf(record.id).length > 0) continue;
      return record;
    }
    return null;
  }
}
