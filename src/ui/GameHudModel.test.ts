import { describe, expect, it } from 'vitest';
import type { GrowthStats } from '../game/growthScene';
import { cityCondition } from '../game/cityCondition';
import { onboardingOf } from '../game/onboarding';
import { catalystById } from '../sim/catalysts';
import { createSimState } from '../sim/SimState';
import type { PolicyId } from '../sim/policies';
import { DAYLIGHT, DAYLIGHT_MODE } from '../engine/daylight';
import {
  buildGameHudModel,
  daylightControl,
  decisionNeedsRepaint,
  resolveEscapeTarget,
  selectionMessage,
} from './GameHudModel';

describe('buildGameHudModel', () => {
  it('blocca le azioni finche la città non è pronta', () => {
    const model = buildGameHudModel(null);

    expect(model.ready).toBe(false);
    expect(model.resources.every((resource) => resource.value === '—')).toBe(true);
    expect(model.catalysts.every((action) => !action.available)).toBe(true);
    expect(model.expansion.available).toBe(false);
    expect(model.policies.every((policy) => !policy.available)).toBe(true);
  });

  it('spiega separatamente blocchi per fondi e popolazione', () => {
    const model = buildGameHudModel(stats(100, 0));

    expect(model.catalysts[0]).toMatchObject({ available: false, reason: 'Not enough funds.' });
    expect(model.expansion).toMatchObject({ available: false, reason: 'Requires 48 residents.' });
    expect(model.policies.find((policy) => policy.id === 'denseHousing')).toMatchObject({
      available: false,
      reason: 'Requires 24 residents.',
    });
    expect(model.policies.find((policy) => policy.id === 'austerity')?.available).toBe(true);
  });

  it('abilita tutte le azioni quando i requisiti sono soddisfatti', () => {
    const model = buildGameHudModel(stats(2_000, 100));

    expect(model.catalysts.every((action) => action.available)).toBe(true);
    expect(model.expansion.available).toBe(true);
    expect(model.policies.every((policy) => policy.available)).toBe(true);
  });

  it('durante il tutorial abilita solo il catalizzatore richiesto', () => {
    const model = buildGameHudModel(stats(2_000, 100, [], false));

    expect(model.catalysts[0]?.available).toBe(true);
    expect(model.catalysts[1]).toMatchObject({ available: false });
    expect(model.catalysts[1]?.reason).toContain('Give your city a home');
  });

  it('permette sempre di disattivare una policy già attiva', () => {
    const model = buildGameHudModel(stats(0, 0, ['civicPride']));
    const policy = model.policies.find((candidate) => candidate.id === 'civicPride');

    expect(policy).toMatchObject({ active: true, available: true });
  });

  it('espone valore, delta e tono delle risorse', () => {
    const model = buildGameHudModel(stats(1_250, 12));
    const funds = model.resources.find((resource) => resource.id === 'funds');

    expect(funds).toMatchObject({ value: '1,250', delta: '±0', tone: 'neutral' });
  });

  it('assegna a Escape la superficie aperta con priorità corretta', () => {
    const view = true;
    expect(resolveEscapeTarget(true, true, true, true, { kind: 'expansion' }, view)).toBe('views');
    expect(resolveEscapeTarget(false, true, true, true, { kind: 'expansion' }, view)).toBe('themes');
    expect(resolveEscapeTarget(false, false, true, true, { kind: 'expansion' }, view)).toBe('policies');
    expect(resolveEscapeTarget(false, false, false, true, { kind: 'expansion' }, view)).toBe('help');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'expansion' }, view)).toBe('tool');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'none' }, view)).toBe('view');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'none' }, false)).toBe('none');
  });

  it('Escape esce dalla vista, ma per ultimo', () => {
    // La vista non era fra le cose che Escape chiude, e uscirne voleva dire
    // premere `V` fino a completare il giro o riaprire il picker: due strade che
    // nessuna superficie nominava. Resta l'ultima della lista perche' con uno
    // strumento in mano il toast promette gia' "Esc to cancel".
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'catalyst', class: 0 }, true))
      .toBe('tool');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'none' }, true)).toBe('view');
    // Un pannello aperto sopra la citta' velata si chiude prima: il primo colpo
    // toglie quello che copre, il secondo quello che nasconde.
    expect(resolveEscapeTarget(true, false, false, false, { kind: 'none' }, true)).toBe('views');
  });

  it('Escape molla l’isolato scelto prima di spegnere la vista', () => {
    // Due colpi e non uno: chi sta studiando un isolato e preme Escape quasi
    // sempre vuole tornare a sceglierne un altro, non ritrovarsi la citta'
    // intera. Il secondo colpo fa comunque il resto.
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'none' }, true, true)).toBe('lock');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'none' }, true, false)).toBe('view');
    // Ma non prima di uno strumento in mano, che ha gia' la sua promessa a schermo.
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'expansion' }, true, true)).toBe('tool');
    // Ne' prima di un pannello aperto, che e' cio' che copre.
    expect(resolveEscapeTarget(true, false, false, false, { kind: 'none' }, true, true)).toBe('views');
  });

  it('produce un’istruzione contestuale solo per uno strumento selezionato', () => {
    const model = buildGameHudModel(stats(2_000, 100));
    expect(selectionMessage({ kind: 'catalyst', class: 0 }, model.catalysts)).toContain('Housing selected');
    expect(selectionMessage({ kind: 'expansion' }, model.catalysts)).toContain('choose a coastline edge');
    expect(selectionMessage({ kind: 'none' }, model.catalysts)).toBeNull();
  });

  it('espone la decisione sospesa finche non viene risolta', () => {
    const pendingDecision = {
      id: 'public-space-80',
      family: 'publicSpace',
      title: 'A contested square',
      message: 'Residents and businesses propose different uses.',
      options: [{ id: 'leave-open', label: 'Keep it open', description: 'No cost.', effect: {} }],
    } as const;
    const waiting = stats(1_200, 0, [], true, pendingDecision);
    const resolved = stats(1_200, 0);

    expect(buildGameHudModel(waiting).decision).toBe(pendingDecision);
    expect(buildGameHudModel(resolved).decision).toBeNull();
  });

  it('non ricrea i bottoni della stessa decisione durante i repaint periodici', () => {
    const decision = {
      id: 'public-space-80',
      family: 'publicSpace',
      title: 'A contested square',
      message: 'Residents and businesses propose different uses.',
      options: [],
    } as const;

    expect(decisionNeedsRepaint(null, decision)).toBe(true);
    expect(decisionNeedsRepaint(decision.id, decision)).toBe(false);
    expect(decisionNeedsRepaint(decision.id, null)).toBe(true);
    expect(decisionNeedsRepaint(decision.id, { ...decision, id: 'investment-160' })).toBe(true);
  });
});

describe('daylightControl', () => {
  it('nomina lo stato, dice cosa fa e annuncia il prossimo clic', () => {
    const auto = daylightControl(DAYLIGHT_MODE.cycle);
    expect(auto.label).toBe('Auto');
    expect(auto.frozen).toBe(false);
    // Chi guarda un tramonto vuole sapere quanto dura, non che «e' automatico».
    expect(auto.tooltip).toContain(`${Math.round(DAYLIGHT.daySeconds / 60)} minutes`);
    // Un bottone che cicla deve dire dove porta, o si scopre solo premendolo.
    expect(auto.next).toBe(DAYLIGHT_MODE.day);
    expect(auto.tooltip).toContain('Day');
  });

  it('i due modi fissi si dichiarano fermi', () => {
    for (const mode of [DAYLIGHT_MODE.day, DAYLIGHT_MODE.night]) {
      const control = daylightControl(mode);
      expect(control.frozen).toBe(true);
      expect(control.label.length).toBeGreaterThan(0);
      expect(control.next).not.toBe(mode);
    }
    expect(daylightControl(DAYLIGHT_MODE.night).next).toBe(DAYLIGHT_MODE.cycle);
  });
});

function stats(
  funds: number,
  population: number,
  policies: readonly PolicyId[] = [],
  onboardingComplete = true,
  pendingDecision: GrowthStats['state']['pendingDecision'] = null,
): GrowthStats {
  const catalysts = onboardingComplete
    // I tre ruoli del tutorial: e' il ruolo, non l'uso, a chiudere i passi.
    ? (['market', 'factory', 'park'] as const).map((kind, index) => ({
        x: index * 16,
        y: 0,
        kind,
        class: catalystById(kind).class,
        strength: 1,
        radius: 1,
      }))
    : [];
  const base = createSimState({ policies, catalysts });
  const state = {
    ...base,
    funds: { stock: funds, delta: 0 },
    population: { stock: population, delta: 0 },
    pendingDecision,
  };
  return {
    ready: true,
    tick: 0,
    tickMs: 0,
    buildings: 0,
    countsByClass: [0, 0, 0, 0],
    mixedByClass: [0, 0, 0, 0],
    typologies: [],
    levels: [],
    builder: {
      placed: 0,
      upgraded: 0,
      growing: 0,
      rejected: [0, 0, 0, 0],
      blacklisted: 0,
      surfaceQueued: 0,
      clustered: 0,
      spans: 0,
      spanReach: 0,
      terraces: 0,
      routes: 0,
      piers: 0,
      stacked: 0,
    },
    state,
    paused: false,
    speed: 1,
    message: 'Ready.',
    onboarding: onboardingOf(state),
    condition: cityCondition(state, 0),
    unlockedSectors: [],
  };
}
