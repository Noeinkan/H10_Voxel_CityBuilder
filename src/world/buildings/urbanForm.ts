import type { LocalUrbanProfile } from '../../sim';
import { BUILDER, DEFAULT_BUILDING_FORM, type BuildingForm } from './config';

/**
 * Come il profilo locale della simulazione diventa forma costruita.
 *
 * Tre funzioni e nessuno stato. Vivono fuori dalle passate perche' le usano
 * **tutte e due**: la nascita legge il bonus di livello, la promozione lo sconto
 * di soglia, e `formOf` traduce per entrambe. I pesi stanno in `BUILDER`, come
 * ogni altra taratura della costruzione.
 */

export function formOf(profile: LocalUrbanProfile | null): BuildingForm {
  if (profile === null) return DEFAULT_BUILDING_FORM;
  return {
    density: profile.density,
    wealth: profile.wealth,
    accessibility: profile.accessibility,
    satisfaction: profile.satisfaction,
  };
}

export function localLevelBonus(form: BuildingForm): number {
  const weight = BUILDER.localLevel;
  return Math.floor(
    form.density * weight.density +
    form.wealth * weight.wealth +
    form.accessibility * weight.accessibility +
    form.satisfaction * weight.satisfaction,
  );
}

export function localUpgradeDiscount(form: BuildingForm): number {
  const weight = BUILDER.localUpgrade;
  return Math.min(
    weight.maxDiscount,
    Math.floor(
      form.density * weight.density +
      form.wealth * weight.wealth +
      form.accessibility * weight.accessibility +
      form.satisfaction * weight.satisfaction,
    ),
  );
}
