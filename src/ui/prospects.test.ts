import { describe, expect, it } from 'vitest';
import {
  catalystById,
  ReachCache,
  urbanProfileAt,
  type Catalyst,
  type CatalystId,
  type CharterId,
  type LocalUrbanProfile,
} from '../sim';
import { GROUND } from '../world/grading/grade';
import { TIER } from '../world/skyline/tiers';
import type { ColumnInfo } from '../game/selection';
import { prospectRows } from './prospects';

function source(kind: CatalystId): Catalyst {
  const definition = catalystById(kind);
  return {
    x: 0,
    y: 0,
    kind,
    class: definition.class,
    strength: definition.strength,
    radius: definition.radius,
  };
}

/** Un profilo vero, dai catalizzatori: ruoli, quartiere e metriche restano coerenti. */
function profileOf(kinds: readonly CatalystId[], charters: readonly CharterId[] = []): LocalUrbanProfile {
  // Senza costo di passo la portata resta la Chebyshev di sempre: qui si misura
  // cosa la scheda dice, non come il terreno piega l'influenza.
  return urbanProfileAt(
    { catalysts: kinds.map(source), policies: [], charters, reach: new ReachCache() },
    0,
    0,
  );
}

function column(profile: LocalUrbanProfile, extra: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    x: 0,
    y: 0,
    height: 10,
    biome: 0,
    slope: 0.05,
    buildable: true,
    waterTop: 0,
    ground: GROUND.flat,
    buildWeight: 1,
    tier: TIER.middle,
    allowedLevel: 6,
    desirability: [120, 80, 40, 20],
    crowd: 2,
    stack: 0,
    profile,
    coastal: false,
    ...extra,
  };
}

function valueOf(rows: readonly { label: string; value: string }[], label: string): string | undefined {
  return rows.find((row) => row.label === label)?.value;
}

describe('cosa potrebbe crescere qui', () => {
  it('non nomina un quartiere dove la citta non arriva', () => {
    // Fuori dall'influenza di ogni catalizzatore le sei specializzazioni sono
    // tutte lontane uguali: sceglierne una sarebbe sceglierla a caso, e una riga
    // con un requisito irraggiungibile insegna solo a saltare la riga.
    expect(valueOf(prospectRows(column(profileOf([]))), 'Could become')).toBeUndefined();
  });

  it('manda a piazzare quando manca il ruolo, non ad aspettare', () => {
    // Un porto: l'uso dominante e' industriale, quindi la forma in prospettiva e'
    // la torre idroponica — che pretende l'agricoltura, di cui pero' nessuno dei
    // due ruoli e' in raggio. Aspettare che una soglia salga non servirebbe, e la
    // riga deve nominare un gesto invece di un numero.
    const become = valueOf(prospectRows(column(profileOf(['port']))), 'Could become');

    expect(become).toBe('farming — needs factory or university in range');
  });

  /**
   * La proprieta' per cui questa scheda vale la pena.
   *
   * Le due righe devono raccontare **una** storia: la seconda nomina la forma, la
   * prima spiega il quartiere che quella forma pretende. Scollegate — «il
   * quartiere piu' vicino» accanto a «la forma piu' alta» — costerebbero lo
   * stesso spazio senza comporre una catena, ed e' la catena a mancare oggi.
   */
  it('la riga del quartiere spiega quella della forma', () => {
    const rows = prospectRows(column(profileOf(['factory'])));

    expect(valueOf(rows, 'Could grow')).toContain('a farming district');
    expect(valueOf(rows, 'Could become')).toMatch(/^farming — /);
  });

  it('nomina la soglia vincolante quando il ruolo c e gia', () => {
    // Con la fabbrica in raggio l'agricoltura ha il suo ruolo: cio' che manca e'
    // una soglia, e la riga deve dire quale e a che punto sta.
    const rows = prospectRows(column(profileOf(['factory', 'university'])));
    const become = valueOf(rows, 'Could become');

    expect(become).toBeDefined();
    // `nome — metrica 0.xx of 0.yy`, con il valore di adesso prima del minimo.
    expect(become).toMatch(/^[a-z]+ — [a-z]+ \d\.\d\d of \d\.\d\d$/);
  });

  it('nomina la tipologia che il luogo non raggiunge, e cosa le manca', () => {
    const rows = prospectRows(column(profileOf(['factory', 'university'])));
    const grow = valueOf(rows, 'Could grow');

    expect(grow).toBeDefined();
    expect(grow).toMatch(/ — needs /);
  });

  it('il livello entra nella riga solo quando e il livello a mancare', () => {
    // Lo stesso luogo a due tetti diversi. Il livello e' l'unica condizione che
    // nessun catalizzatore risolve, quindi va detta dove morde e taciuta dove
    // non morde: una riga che la ripetesse sempre smetterebbe di distinguere.
    const profile = profileOf(['factory']);

    expect(valueOf(prospectRows(column(profile, { allowedLevel: 1 })), 'Could grow'))
      .toContain('level 5');
    expect(valueOf(prospectRows(column(profile, { allowedLevel: 6 })), 'Could grow'))
      .not.toContain('level');
  });

  it('non promette la stessa cosa due volte', () => {
    // Le due righe rispondono a domande diverse — il quartiere e la forma — e se
    // portassero lo stesso testo una delle due sarebbe rumore.
    const rows = prospectRows(column(profileOf(['factory', 'university'])));
    expect(new Set(rows.map((row) => row.value)).size).toBe(rows.length);
  });
});
