import {
  ALL_SPECIALIZATIONS,
  rolesForSpecialization,
  type CatalystId,
  type Specialization,
} from '../../sim';
import { TYPOLOGIES } from './config';

/**
 * Cosa un ruolo **sblocca**, invece di cosa favorisce.
 *
 * Nasce da un difetto dichiarato per iscritto in `typology.ts`: il tooltip di
 * piazzamento elenca le tipologie degli usi che un ruolo favorisce, e il commento
 * lo chiama «un'approssimazione onesta — non quelle che le soglie locali
 * confermeranno». Onesta nell'intento, ma il giocatore la legge come una
 * promessa, e il mondo consegna quello che diciotto soglie nascoste scelgono.
 *
 * Qui c'e' la meta' che mancava: **le forme che quel ruolo, e solo quel ruolo,
 * rende possibili**, con il quartiere che devono attraversare per arrivarci.
 *
 * **Sta in `world/` perche' ha bisogno di entrambe le meta'.** Quali ruoli
 * aprano una specializzazione lo sa `src/sim/`; quali forme una specializzazione
 * apra lo sa il catalogo qui. `src/world/` puo' importare da `src/sim/` e non
 * viceversa, quindi il punto d'incontro non puo' stare da nessun'altra parte.
 */

export interface RoleUnlock {
  readonly specialization: Specialization;
  /** Etichette di catalogo delle forme che quella specializzazione apre. */
  readonly typologies: readonly string[];
}

/**
 * Le specializzazioni che questo ruolo apre, con cosa ci si costruisce dentro.
 *
 * **Derivata da entrambi i cataloghi, non scritta.** Aggiungere un ruolo a una
 * specializzazione in `districts.ts`, o una riga con `specialization` in
 * `config.ts`, compare qui da solo: una terza tabella da tenere allineata a mano
 * sarebbe divergita alla prima aggiunta, che e' gia' successo una volta ed e' il
 * motivo per cui `ALL_SPECIALIZATIONS` esiste.
 *
 * Le specializzazioni senza forme proprie non compaiono: sono vere, ma non c'e'
 * niente da promettere, e una riga di tooltip che non dice niente insegna a
 * saltare le altre.
 */
export function unlocksFor(id: CatalystId): readonly RoleUnlock[] {
  const out: RoleUnlock[] = [];

  for (const specialization of ALL_SPECIALIZATIONS) {
    if (!rolesForSpecialization(specialization).includes(id)) continue;

    const typologies = TYPOLOGIES
      // Il ripiego a priorita' zero non si nomina mai: e' la forma che si vede
      // gia' ovunque, e prometterla non aggiunge niente a chi legge.
      .filter((entry) => entry.specialization === specialization && entry.priority > 0)
      .map((entry) => entry.label);
    if (typologies.length === 0) continue;

    out.push({ specialization, typologies });
  }

  return out;
}
