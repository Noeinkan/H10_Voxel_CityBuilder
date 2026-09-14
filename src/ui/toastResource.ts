import type { ActionFailure } from '../game/actions';
import type { ResourceIcon } from './hudIcons';

/**
 * Quale risorsa un toast sta nominando, se ne nomina una.
 *
 * Il toast e' una delle superfici su cui la 7.2 chiede la stessa identita' della
 * barra: «You do not have enough funds yet» e la carestia parlano di una risorsa
 * precisa, e con l'icona e la tinta di quella risorsa davanti si legge **quale**
 * prima di leggere la frase. Le altre — tutorial, coach, un tasto che ha
 * cambiato vista — non ne nominano nessuna e restano senza icona: un'icona messa
 * a tutti i toast smetterebbe di voler dire qualcosa.
 *
 * Puro e fuori da `GameHud.ts`: e' una tabella, e il test la legge in `node`.
 */

const FAILURE_RESOURCE: Partial<Readonly<Record<ActionFailure, ResourceIcon>>> = {
  'insufficient-funds': 'funds',
  'insufficient-materials': 'materials',
  'population-required': 'population',
};

/**
 * Per id di consiglio (`src/game/tips.ts`), non per titolo: i titoli portano
 * cifre e gesti che cambiano a ogni tick, l'id resta.
 */
const TIP_RESOURCE: Readonly<Record<string, ResourceIcon>> = {
  'food-shortage': 'food',
  'budget-deficit': 'funds',
  'unhappy-city': 'satisfaction',
  // Scaffali vuoti e campagna indietro sono colli di bottiglia di una risorsa
  // prima che di un servizio: i materiali finiti, i campi che non bastano.
  'empty-shelves': 'materials',
  'countryside-behind': 'food',
  'short-handed': 'population',
};

export function failureResource(failure: ActionFailure): ResourceIcon | null {
  return FAILURE_RESOURCE[failure] ?? null;
}

export function tipResource(tipId: string | undefined): ResourceIcon | null {
  if (tipId === undefined) return null;
  return Object.hasOwn(TIP_RESOURCE, tipId) ? TIP_RESOURCE[tipId] : null;
}
