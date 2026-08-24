import { hashCoords } from '../rng';
import type { BlockId } from '../streets/streetGrid';
import { STYLE, STYLES, styleById, type ClassProfile, type StyleDefinition } from './config';

/**
 * Di che materia e' fatto un quartiere.
 *
 * **Non contiene numeri e non contiene slot.** Il catalogo sta in `config.ts`,
 * come quello delle tipologie: qui c'e' solo la regola che mette in relazione un
 * luogo e una riga. Aggiungere uno stile e' aggiungere una riga, non modificare
 * questa funzione — e' lo stesso patto di `typology.ts`.
 *
 * **E' una funzione pura del seed e dell'isolato, e questa e' la decisione della
 * fase.** Non c'e' stato, non c'e' niente da salvare e niente da invalidare
 * quando arriva un catalizzatore: e' la stessa scelta della maglia stradale, e
 * per la stessa ragione. Ne segue la coerenza d'isolato **per costruzione** —
 * due edifici dello stesso quartiere non possono uscire di materia diversa
 * perche' nessuno lo ha ricordato — e la rigenerabilita': `recordStamp` ritrova
 * lo stile di un edificio costruito mille tick fa senza che nessuno lo abbia
 * conservato.
 *
 * **Perche' non il distretto**, che sembrerebbe la chiave ovvia. Due ragioni,
 * misurate e non supposte. La prima: `districtOf` risponde `outskirts` finche'
 * due ruoli di catalizzatore non si sovrappongono sulla stessa colonna, e su
 * un'isola vera e' la stragrande maggioranza del costruito — il tessuto
 * resterebbe spento quasi ovunque. La seconda, e da sola basterebbe: il
 * distretto **cambia quando la citta' cresce**, quindi la sagoma da cancellare
 * cambierebbe sotto i piedi di chi la deve cancellare. E' esattamente il
 * difetto che `recordStamp` esiste per non avere.
 */

/**
 * Stile dell'isolato che contiene una colonna.
 *
 * Prende l'isolato e non la colonna, ed e' la firma a garantire la coerenza:
 * una funzione che ricevesse `(x, y)` potrebbe rispondere due cose diverse a due
 * angoli dello stesso quartiere, e nessun test lo scoprirebbe finche' non
 * capita.
 */
export function styleAt(worldSeed: number, block: BlockId): StyleDefinition {
  // Il quartiere e' piu' largo dell'isolato: vedi `STYLE.blocksPerQuarter`.
  // `Math.floor` e non uno shift perche' gli indici di isolato sono negativi
  // meta' delle volte, e `>> 1` su un negativo arrotonda dalla parte sbagliata —
  // il quartiere a cavallo dell'origine verrebbe largo il doppio.
  const qx = Math.floor(block.kx / STYLE.blocksPerQuarter);
  const qy = Math.floor(block.ky / STYLE.blocksPerQuarter);
  // Due giri di hash e non uno: il primo lega il quartiere a questo mondo, il
  // secondo separa questa domanda da ogni altra posta sulle stesse coordinate.
  const key = hashCoords(worldSeed, qx, qy);
  return STYLES[hashCoords(STYLE.salt, key, 0) % STYLES.length];
}

/**
 * Il profilo di disegno con sopra il tessuto dello stile.
 *
 * **L'ordine e' il contenuto di questa funzione.** Lo stile si applica *dopo*
 * la tipologia, e solo agli slot che la sua riga elenca. Applicarlo prima
 * significherebbe che ogni riga di catalogo che dichiara un colore — cioe'
 * quasi tutte — cancella il quartiere, e gli stili si vedrebbero solo sui
 * ripieghi. Applicarlo dopo su *tutti* gli slot cancellerebbe invece l'accento,
 * cioe' la sola cosa che dice cosa quell'edificio fa.
 */
export function styledProfile(profile: ClassProfile, style: StyleDefinition): ClassProfile {
  return { ...profile, ...style.palette };
}

/** Lo stile registrato di un edificio, o il ripiego neutro se non ne ha uno. */
export function styleOf(id: string | undefined): StyleDefinition {
  return (id === undefined ? null : styleById(id)) ?? STYLES[0];
}
