import { describe, expect, it } from 'vitest';
import type { GrowthStats } from '../game/growthScene';
import { cityCondition } from '../game/cityCondition';
import { onboardingOf } from '../game/onboarding';
import { milestoneReached } from '../game/milestones';
import { catalystById } from '../sim/catalysts';
import { BALANCE } from '../sim/balance';
import { createSimState } from '../sim/SimState';
import { EMPTY_HARVEST, type FoodReport } from '../sim/farms';
import type { PolicyId } from '../sim/policies';
import { DAYLIGHT, DAYLIGHT_MODE } from '../engine/daylight';
import { arcologyStanding } from '../world/arcology/prospect';
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
    expect(model.needs).toBeNull();
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

  it('la tessera dice cosa il ruolo sblocca, non solo cosa favorisce', () => {
    const model = buildGameHudModel(stats(2_000, 100));
    const factory = model.catalysts.find((action) => action.catalystId === 'factory');
    const market = model.catalysts.find((action) => action.catalystId === 'market');

    // La torre esce dalla promessa incondizionata e rientra con la sua
    // condizione: e' la correzione che questa fase porta al tooltip.
    expect(factory?.typologies).not.toContain('Hydroponic tower');
    expect(factory?.unlocks?.join(' ')).toContain('Hydroponic tower in farming districts');

    // E resta legata al ruolo: chi non apre l'agricoltura non la nomina.
    expect(market?.unlocks?.join(' ') ?? '').not.toContain('Hydroponic tower');
  });

  it('l aeroporto insegna come costruire lo scalo in quota', () => {
    const model = buildGameHudModel(stats(2_000, 100));
    const airport = model.catalysts.find((action) => action.catalystId === 'airport');

    expect(airport?.site).toContain('level 7+ facade at least 8 voxels wide');
    expect(airport?.description).toContain('Skyport');
    expect(airport?.description).toContain('airships, eVTOLs and balloons');
  });

  it('abilita tutte le azioni quando i requisiti sono soddisfatti', () => {
    const model = buildGameHudModel(grownStats());

    expect(model.catalysts.every((action) => action.available)).toBe(true);
    expect(model.expansion.available).toBe(true);
    expect(model.terrace.available).toBe(true);

    // **Non piu' «tutte».** Un catalogo interamente accendibile era il difetto
    // di questo pannello: si premevano gli undici bottoni una volta e non lo si
    // riapriva piu'. Cio' che resta vero e' che niente e' bloccato in silenzio —
    // quel che la citta' puo' permettersi e' acceso, il resto dice cosa manca.
    const reachable = model.policies.filter(
      (policy) => policy.population <= BALANCE.gameplay.success.population,
    );
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.every((policy) => policy.available)).toBe(true);
    for (const policy of model.policies) {
      if (policy.available) continue;
      expect(policy.reason).toContain('Requires');
    }
  });

  it('porta il budget di governo, e ogni scheda porta il proprio prezzo', () => {
    const model = buildGameHudModel(grownStats());

    // Otto civici comprano due slot oltre i tre di base.
    expect(model.policySlotsTotal).toBe(BALANCE.gameplay.governance.baseSlots + 2);
    expect(model.policySlotsUsed).toBe(0);

    // La riga che rende la scheda una scelta: cosa la policy peggiora.
    for (const policy of model.policies) {
      expect(policy.tradeoff.length).toBeGreaterThan(0);
      expect(policy.tradeoff).not.toBe(policy.description);
    }
  });

  it('la scala tiene chiusi i ruoli che la citta non ha ancora meritato', () => {
    // Il difetto che questa fase chiude: dopo i tre passi del tutorial l'intero
    // catalogo era aperto, e l'unico cancello restava il prezzo. Una citta' di
    // cento abitanti senza edifici ha la crescita e la costa, non i monumenti.
    const model = buildGameHudModel(midStats());
    const open = (id: string) => model.catalysts.find((a) => a.catalystId === id)?.available;

    expect(open('greenhouse')).toBe(true);
    expect(open('school')).toBe(true);
    expect(open('port')).toBe(true);
    expect(open('monument')).toBe(false);
    expect(open('stadium')).toBe(false);
  });

  it('un ruolo bloccato dalla scala dice il gradino e quanto manca, non il prezzo', () => {
    // Con i fondi che avanzano e il gradino che no, mostrare «0 / 460 funds»
    // manderebbe a risparmiare per qualcosa che i soldi non aprono.
    const stadium = buildGameHudModel(midStats())
      .catalysts.find((action) => action.catalystId === 'stadium');

    expect(stadium?.locked).toBe(true);
    expect(stadium?.reason).toContain('Metropolis');
    // La soglia mostrata e' quella della scala, non il prezzo: e' la piu'
    // lontana fra quelle che mancano, e i fondi non mancano affatto.
    expect(stadium?.requirement).not.toContain('funds');
    expect(stadium?.progress).toBeLessThan(1);
  });

  it('la condizione propria di un landmark sopravvive al gradino raggiunto', () => {
    // La meta' che da' carattere: lo stadio vuole i negozi che riempiranno le
    // gradinate, e la milestone da sola non basta a fargliele avere.
    const grown = grownStats();
    const model = buildGameHudModel({
      ...grown,
      state: { ...grown.state, buildingCounts: [8, 0, 8, 8] },
    });
    const stadium = model.catalysts.find((action) => action.catalystId === 'stadium');

    expect(stadium?.available).toBe(false);
    expect(stadium?.requirement).toContain('shops');
  });

  it('un blocco per risorse si riempie, e mostra il requisito vincolante', () => {
    // E' la distinzione che 7.4 chiede: sbiadito dice "rotto", riempito dice
    // "manca poco". Senza il progresso, `locked` e `disabled` si vedevano uguali
    // e la progressione spariva proprio dove doveva motivare.
    const half = buildGameHudModel(stats(10, 0)).catalysts[0];
    expect(half.locked).toBe(true);
    expect(half.progress).toBeGreaterThan(0);
    expect(half.progress).toBeLessThan(1);
    expect(half.requirement).toContain('funds');
  });

  it('il requisito mostrato e il piu lontano dei due, non il primo', () => {
    // Chi ha i fondi ma non gli abitanti deve vedere gli abitanti: mostrare il
    // primo requisito prometterebbe un bottone quasi pronto mentre manca
    // tutt'altro.
    const rich = buildGameHudModel(stats(100_000, 1)).expansion;
    expect(rich.requirement).toContain('residents');

    const crowded = buildGameHudModel(stats(0, 100_000)).expansion;
    expect(crowded.requirement).toContain('funds');
  });

  it('un blocco che non si scioglie aspettando non si riempie', () => {
    // Durante il tutorial il catalizzatore fuori ordine e' fermo per una ragione
    // che accumulare denaro non risolve: un riempimento li' direbbe il falso.
    const model = buildGameHudModel(stats(100_000, 0, [], false));
    const gated = model.catalysts.find((action) => action.reason.startsWith('Complete this first'));
    expect(gated).toBeDefined();
    expect(gated?.progress).toBeUndefined();
    expect(gated?.requirement).toBeUndefined();
  });

  it('cio che e disponibile non porta ne progresso ne requisito', () => {
    const ready = buildGameHudModel(stats(100_000, 100_000));
    expect(ready.expansion.available).toBe(true);
    expect(ready.expansion.progress).toBeUndefined();
    expect(ready.terrace.progress).toBeUndefined();
  });

  it('la mensola resta visibile mentre e bloccata, e dice cosa manca', () => {
    // **Bloccata non vuol dire nascosta**, come per i catalizzatori: sapere che
    // la citta' potra' salire e quanto costa e' l'informazione che fa
    // pianificare, e nasconderla renderebbe la quota una sorpresa.
    const poor = buildGameHudModel(stats(2_000, 0)).terrace;
    expect(poor).toMatchObject({ available: false, locked: true });
    expect(poor.reason).toContain('residents');

    const broke = buildGameHudModel(stats(0, 100)).terrace;
    expect(broke).toMatchObject({ available: false, locked: true, reason: 'Not enough funds.' });
    expect(broke.cost).toBeGreaterThan(0);
  });

  it('lo strumento mensola dice di puntare un edificio, non il suolo', () => {
    // E' l'unico strumento che non si posa sul terreno: se il messaggio dicesse
    // «clicca sull'isola», come per gli altri due, si cliccherebbe sul prato.
    const message = selectionMessage({ kind: 'terrace' }, []);
    expect(message).toContain('building');
    expect(message).toContain('Esc to cancel');
  });

  it('durante il tutorial abilita solo il catalizzatore richiesto', () => {
    const model = buildGameHudModel(stats(2_000, 100, [], false));

    expect(model.catalysts[0]?.available).toBe(true);
    expect(model.catalysts[1]).toMatchObject({ available: false });
    expect(model.catalysts[1]?.reason).toContain('Place the Market');
  });

  it('permette sempre di disattivare una policy già attiva', () => {
    const model = buildGameHudModel(stats(0, 0, ['civicPride']));
    const policy = model.policies.find((candidate) => candidate.id === 'civicPride');

    expect(policy).toMatchObject({ active: true, available: true });
  });

  it('espone valore, delta e tono delle risorse', () => {
    const model = buildGameHudModel(stats(1_250, 12));
    const funds = model.resources.find((resource) => resource.id === 'funds');

    // Il delta e' **vuoto** quando non succede niente, non `±0`: cinque `±0` in
    // fila erano rumore che copriva l'unica informazione che conta, cioe' quale
    // risorsa si sta muovendo.
    expect(funds).toMatchObject({ value: '1,250', delta: '', tone: 'neutral' });
  });

  it('senza finestra dei tick la tendenza e ferma e la serie vuota', () => {
    // `buildGameHudModel` resta puro e senza memoria: la finestra e' un
    // parametro, e senza di essa il modello deve restare disegnabile invece di
    // rompersi.
    const model = buildGameHudModel(stats(1_250, 12));
    for (const entry of model.resources) {
      expect(entry.trend).toBe('flat');
      expect(entry.series).toEqual([]);
      expect(entry.magnitude).toBe(0);
    }
  });

  it('il cibo porta un anello ancorato alla soglia della carestia', () => {
    // L'anello e il toast di penuria leggono lo stesso numero: se divergessero,
    // il giocatore vedrebbe un anello tranquillo sopra un avviso di fame.
    const hungry = buildGameHudModel(stats(1_000, 40));
    const food = hungry.resources.find((entry) => entry.id === 'food');

    expect(food?.fill).toBeDefined();
    expect(food?.fill?.value).toBeGreaterThanOrEqual(0);
    expect(food?.fill?.value).toBeLessThanOrEqual(1);
    expect(food?.fill?.label).toContain('shortage below');
  });

  it('denaro e materiali non hanno un tetto, e non fingono di averlo', () => {
    // Inventare un massimo per riempire un anello direbbe che esiste un "pieno"
    // che non c'e': si accumula denaro senza limite, e un anello che si chiude
    // prometterebbe un traguardo.
    const model = buildGameHudModel(stats(1_250, 12));
    expect(model.resources.find((entry) => entry.id === 'funds')?.fill).toBeUndefined();
    expect(model.resources.find((entry) => entry.id === 'materials')?.fill).toBeUndefined();
  });

  it('ogni risorsa porta la sua riga perche', () => {
    // La riga e' il referto in una frase: deve esserci sempre, anche in una
    // citta' appena avviata, o il rail tornerebbe muto proprio quando il
    // giocatore impara a leggere il pannello.
    const model = buildGameHudModel(stats(1_250, 12));
    for (const resource of model.resources) {
      expect(resource.hint).toBeDefined();
      expect((resource.hint ?? '').length).toBeGreaterThan(0);
    }
  });

  it('il blocco bisogni cita residenti e prossimo passo del coach', () => {
    const model = buildGameHudModel(stats(0, 45));

    expect(model.needs?.residents.value).toBe('45 / 120');
    expect(model.needs?.next).toBeNull();
  });

  it('le opere in quota mostrano e verificano anche il costo in materiali', () => {
    const base = stats(2_000, 100);
    const state = { ...base.state, materials: { stock: 0, delta: 0 } };
    const model = buildGameHudModel({ ...base, state });

    expect(model.terrace.materialCost).toBe(BALANCE.gameplay.terrace.materials);
    expect(model.terrace.available).toBe(false);
    expect(model.terrace.reason).toContain('grow industry');
    expect(model.ropeway.materialCost).toBe(BALANCE.gameplay.ropeway.materials);
    expect(model.ropeway.available).toBe(false);
  });

  it('i materiali spiegano produzione, usi e il prossimo cantiere bloccato', () => {
    const base = stats(1_250, 12);
    const state = {
      ...base.state,
      materials: { stock: 7, delta: -3 },
      materialFlows: {
        produced: 5,
        upkeep: 1,
        retail: 2,
        exported: 0,
        imported: 0,
        construction: 5,
        reserve: 12,
        waitingCost: 20,
      },
    };
    const materials = buildGameHudModel({ ...base, state }).resources
      .find((entry) => entry.id === 'materials');

    expect(materials?.breakdown).toEqual([
      { label: 'Industry', amount: 5, direction: 'in' },
      { label: 'Building upkeep', amount: 1, direction: 'out' },
      { label: 'Shops', amount: 2, direction: 'out' },
      { label: 'Construction', amount: 5, direction: 'out' },
    ]);
    expect(materials?.status).toContain('20 materials required');
    expect(materials?.status).toContain('13 still missing');
  });

  it('mostra il molo accanto all industria quando la citta compra materiali', () => {
    // La voce sta fra le entrate e sopra le uscite: chi guarda deve poter
    // rispondere a «quanta di questa roba me la sto comprando» senza sottrarre.
    const base = stats(1_250, 12);
    const state = {
      ...base.state,
      materials: { stock: 40, delta: 6 },
      materialFlows: {
        produced: 5, upkeep: 1, retail: 2, exported: 0, imported: 8,
        construction: 0, reserve: 12, waitingCost: 0,
      },
    };
    const materials = buildGameHudModel({ ...base, state }).resources
      .find((entry) => entry.id === 'materials');

    expect(materials?.breakdown).toEqual([
      { label: 'Industry', amount: 5, direction: 'in' },
      { label: 'Imports', amount: 8, direction: 'in' },
      { label: 'Building upkeep', amount: 1, direction: 'out' },
      { label: 'Shops', amount: 2, direction: 'out' },
    ]);
  });

  it('assegna a Escape la superficie aperta con priorità corretta', () => {
    const view = true;
    expect(resolveEscapeTarget(true, true, true, true, { kind: 'expansion' }, view)).toBe('views');
    expect(resolveEscapeTarget(false, true, true, true, { kind: 'expansion' }, view)).toBe('themes');
    expect(resolveEscapeTarget(false, false, true, true, { kind: 'expansion' }, view)).toBe('policies');
    expect(resolveEscapeTarget(false, false, false, true, { kind: 'expansion' }, view)).toBe('help');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'expansion' }, view)).toBe('tool');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'none' }, view)).toBe('view');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'none' }, false)).toBe('menu');
  });

  it('a riposo Escape apre il menu, e solo a riposo', () => {
    // L'ultimo anello inverte il senso di tutti gli altri: non chiude, apre.
    // Perche' ci si arrivi non deve esserci piu' niente da annullare — un
    // pannello aperto, uno strumento in mano o una vista accesa se lo prendono
    // prima, ed e' quello che rende il menu una porta e non un incidente.
    const empty = { kind: 'none' } as const;
    expect(resolveEscapeTarget(false, false, false, false, empty, false)).toBe('menu');
    expect(resolveEscapeTarget(true, false, false, false, empty, false)).toBe('views');
    expect(resolveEscapeTarget(false, true, false, false, empty, false)).toBe('themes');
    expect(resolveEscapeTarget(false, false, true, false, empty, false)).toBe('policies');
    expect(resolveEscapeTarget(false, false, false, true, empty, false)).toBe('help');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'terrace' }, false)).toBe('tool');
    expect(resolveEscapeTarget(false, false, false, false, empty, false, false, true)).toBe('selection');
    expect(resolveEscapeTarget(false, false, false, false, empty, true, true)).toBe('lock');
    expect(resolveEscapeTarget(false, false, false, false, empty, true)).toBe('view');
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

  it('Escape chiude la scheda dopo lo strumento e prima del soggetto di studio', () => {
    // La scheda e' l'ultima cosa che il giocatore ha aperto, quindi precede cio'
    // che stava gia' guardando; ma non lo strumento in mano, che ha gia' la
    // propria promessa scritta nel toast.
    const open = { kind: 'none' } as const;
    expect(resolveEscapeTarget(false, false, false, false, open, false, false, true))
      .toBe('selection');
    expect(resolveEscapeTarget(false, false, false, false, open, true, true, true))
      .toBe('selection');
    expect(resolveEscapeTarget(false, false, false, false, { kind: 'expansion' }, true, true, true))
      .toBe('tool');
    // Senza scheda aperta la catena resta esattamente quella di prima.
    expect(resolveEscapeTarget(false, false, false, false, open, true, true, false)).toBe('lock');
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
      eventId: 'public-space',
      family: 'publicSpace',
      urgency: 'routine',
      expiresAt: 0,
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
      eventId: 'public-space',
      family: 'publicSpace',
      urgency: 'routine',
      expiresAt: 0,
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
  it('nomina lo stato e dice cosa fa, senza annunciare il prossimo clic', () => {
    const auto = daylightControl(DAYLIGHT_MODE.cycle);
    expect(auto.label).toBe('Auto');
    expect(auto.frozen).toBe(false);
    // Chi guarda un tramonto vuole sapere quanto dura, non che «e' automatico».
    expect(auto.tooltip).toContain(`${Math.round(DAYLIGHT.daySeconds / 60)} minutes`);
    // Ogni modo ha il suo bottone: un tooltip che annuncia il prossimo
    // mentirebbe su cosa fa quello che si sta per premere.
    expect(auto.tooltip).toContain('Auto');
    expect(auto.tooltip).not.toContain('Night');
    // `next` resta perche' il giro e' passato al tasto L, non perche' cicli un
    // bottone: e' l'unico posto in cui l'ordine dei tre modi e' scritto.
    expect(auto.next).toBe(DAYLIGHT_MODE.day);
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

describe('il cibo dice da dove viene', () => {
  /** Uno stato con un raccolto vero addosso: la fixture parte a zero. */
  const fed = (harvest: Partial<FoodReport>): GrowthStats => {
    const base = stats(1000, 240);
    return {
      ...base,
      state: {
        ...base.state,
        food: { stock: 500, delta: 3 },
        harvest: { ...EMPTY_HARVEST, ...harvest },
      },
    };
  };

  const foodRow = (growth: GrowthStats) =>
    buildGameHudModel(growth).resources.find((row) => row.id === 'food');

  it('elenca i produttori che hanno raccolto qualcosa', () => {
    const model = foodRow(fed({
      grown: [12, 5, 7],
      imported: 3,
      eaten: 12,
    }));

    expect(model?.breakdown?.map((row) => row.label))
      .toEqual(['Fields', 'Orchards', 'Towers', 'Imports', 'Residents']);
    expect(model?.breakdown?.find((row) => row.label === 'Residents')?.direction).toBe('out');
    expect(model?.breakdown?.find((row) => row.label === 'Fields')?.direction).toBe('in');
  });

  // Ogni riga dice **chi**: i produttori lo dicevano gia', l'uscita no. «Eaten»
  // nominava il gesto, e la domanda a cui la riga serve e' chi mi mangia il
  // raccolto. Uno solo, e non e' un edificio: sono gli abitanti.
  it('nomina chi consuma, non il consumo', () => {
    const model = foodRow(fed({ grown: [9, 0, 0], eaten: 4 }));

    expect(model?.breakdown?.map((row) => row.label)).not.toContain('Eaten');
    expect(model?.breakdown?.filter((row) => row.direction === 'out'))
      .toEqual([{ label: 'Residents', amount: 4, direction: 'out' }]);
  });

  it('tace sui produttori che non ci sono, invece di scrivere zero', () => {
    // Cinque righe a zero sono la stessa cosa che il `±0` che la barra ha gia'
    // tolto: occupano lo spazio dell'unica informazione che conta.
    const model = foodRow(fed({ grown: [9, 0, 0], eaten: 4 }));
    expect(model?.breakdown?.map((row) => row.label)).toEqual(['Fields', 'Residents']);
  });

  it('le voci vengono dal referto del tick, non da un secondo conto', () => {
    // E' la regola dichiarata su `HudResource.breakdown`: duplicare il
    // bilanciamento qui e' il modo sicuro di far divergere le righe dal numero
    // che le sta sopra. Un raccolto inventato deve arrivare a schermo tale e
    // quale, senza che l'HUD lo ricalcoli dai contatori.
    const model = foodRow(fed({ grown: [42, 0, 0], eaten: 1 }));
    expect(model?.breakdown?.find((row) => row.label === 'Fields')?.amount).toBe(42);
  });

  it('senza raccolto e senza scorte non inventa un elenco', () => {
    const model = foodRow(fed({}));
    expect(model?.breakdown ?? []).toEqual([]);
  });
});

/**
 * Una citta' a meta' strada: crescita e costa aperte, identita' ancora no.
 *
 * Dodici edifici e non sedici, di proposito: e' il gradino `district` a restare
 * fuori, ed e' li' che comincia il gruppo dei monumenti.
 */
function midStats(funds = 5_000): GrowthStats {
  const base = stats(funds, 100);
  const state = {
    ...base.state,
    buildings: Array.from({ length: 12 }, (_, index) => ({
      x: index,
      y: 0,
      class: (index % 4) as GrowthStats['state']['buildings'][number]['class'],
      level: 2,
    })),
  };
  return { ...base, state, milestone: milestoneReached(state) };
}

/**
 * Una citta' matura: scala tutta coperta e condizioni proprie soddisfatte.
 *
 * Serve perche' «tutti i bottoni accesi» ha smesso di essere uno stato che si
 * ottiene con dei fondi: adesso vuole una citta' che abbia fatto delle cose —
 * quattro usi al bersaglio, edifici alti, un'universita', una costa che lavora.
 */
function grownStats(funds = 5_000): GrowthStats {
  const base = stats(funds, BALANCE.gameplay.success.population);
  const coastal = ['university', 'lighthouse'] as const;
  const state = {
    ...base.state,
    satisfaction: 0.8,
    buildings: Array.from({ length: 24 }, (_, index) => ({
      x: index,
      y: 0,
      class: (index % 4) as GrowthStats['state']['buildings'][number]['class'],
      level: 8,
    })),
    buildingCounts: [8, 8, 8, 8],
    catalysts: [
      ...base.state.catalysts,
      ...coastal.map((kind, index) => ({
        x: 64 + index * 32,
        y: 64,
        kind,
        class: catalystById(kind).class,
        strength: 1,
        radius: 1,
      })),
    ],
  };
  return { ...base, state, milestone: milestoneReached(state) };
}

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
      stackedZ: 0,
      lifts: 0,
      ropeways: 0,
      clearing: 0,
      cleared: 0,
      abandoned: 0,
      farmPlots: 0,
      arcologies: 0,
      arcologyRefusal: null,
      arcology: arcologyStanding(0, 0, null),
    },
    state,
    paused: false,
    speed: 1,
    message: 'Ready.',
    // Come nel gioco: la scena non lo inventa, lo misura sullo stato. Fissarlo a
    // mano avrebbe fatto passare la fixture dove la partita si blocca.
    milestone: milestoneReached(state),
    onboarding: onboardingOf(state),
    condition: cityCondition(state, 0),
    coach: null,
    unlockedSectors: [],
  };
}
