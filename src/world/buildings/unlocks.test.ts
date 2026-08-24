import { describe, expect, it } from 'vitest';
import { ALL_SPECIALIZATIONS, CATALYSTS, rolesForSpecialization } from '../../sim';
import { TYPOLOGIES } from './config';
import { unlocksFor } from './unlocks';

describe('cosa sblocca un ruolo', () => {
  it('nomina la torre idroponica solo dove l agricoltura puo nascere', () => {
    // I due ruoli che aprono l'agricoltura la promettono; nessun altro lo fa, ed
    // e' il punto: prima la torre compariva accanto a ogni ruolo che favorisse
    // l'industria, cioe' anche dove non sarebbe mai arrivata.
    for (const id of ['factory', 'university'] as const) {
      const farming = unlocksFor(id).find((entry) => entry.specialization === 'farming');
      expect(farming?.typologies).toContain('Hydroponic tower');
    }

    for (const catalyst of CATALYSTS) {
      if (catalyst.id === 'factory' || catalyst.id === 'university') continue;
      const promised = unlocksFor(catalyst.id).flatMap((entry) => entry.typologies);
      expect(promised).not.toContain('Hydroponic tower');
    }
  });

  /**
   * La proprieta' che tiene la tabella derivata invece che scritta.
   *
   * Ogni coppia ruolo/specializzazione dichiarata in `districts.ts` deve
   * comparire qui, a meno che quella specializzazione non apra nessuna forma:
   * un elenco a mano sarebbe divergito alla prima riga aggiunta al catalogo, che
   * e' gia' successo una volta.
   */
  it('copre ogni coppia ruolo/specializzazione che apra una forma', () => {
    for (const specialization of ALL_SPECIALIZATIONS) {
      const forms = TYPOLOGIES.filter(
        (entry) => entry.specialization === specialization && entry.priority > 0,
      );

      for (const role of rolesForSpecialization(specialization)) {
        const found = unlocksFor(role).some((entry) => entry.specialization === specialization);
        expect(found).toBe(forms.length > 0);
      }
    }
  });

  it('non promette un ripiego', () => {
    // Le righe a priorita' zero sono la forma che si vede gia' ovunque:
    // nominarle come una conquista non aggiungerebbe niente a chi legge.
    for (const catalyst of CATALYSTS) {
      for (const unlock of unlocksFor(catalyst.id)) {
        for (const label of unlock.typologies) {
          expect(TYPOLOGIES.find((entry) => entry.label === label)?.priority).toBeGreaterThan(0);
        }
      }
    }
  });

  it('non inventa righe vuote', () => {
    for (const catalyst of CATALYSTS) {
      for (const unlock of unlocksFor(catalyst.id)) {
        expect(unlock.typologies.length).toBeGreaterThan(0);
      }
    }
  });
});
