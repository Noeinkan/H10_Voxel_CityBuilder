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
import { TYPOLOGIES } from '../world/buildings/config';
import { GROUND } from '../world/grading/grade';
import { TIER } from '../world/skyline/tiers';
import type { ColumnInfo } from '../game/selection';
import { pairingLines, prospectRows, yieldLine } from './prospects';

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
    // tre ruoli e' in raggio. Aspettare che una soglia salga non servirebbe, e la
    // riga deve nominare un gesto invece di un numero.
    const become = valueOf(prospectRows(column(profileOf(['port']))), 'Could become');

    expect(become).toBe('farming — needs factory or university or greenhouse in range');
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
    // La soglia si chiede al catalogo: scritta a mano, questo test verificava
    // «la riga dice cinque» invece di «la riga dice il minimo della tipologia»,
    // e diventava rosso a ogni ritaratura di quel numero.
    const tower = TYPOLOGIES.find((entry) => entry.id === 'hydroponicTower');

    expect(valueOf(prospectRows(column(profile, { allowedLevel: 1 })), 'Could grow'))
      .toContain(`level ${tower?.minLevel}`);
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

describe('con chi accostare un ruolo', () => {
  it('dice il quartiere che la coppia fa, e con chi farlo', () => {
    // E' la sola sinergia del gioco e non compariva da nessuna parte: si
    // scopriva piazzando catalizzatori a duecento fondi l'uno.
    expect(pairingLines('port')).toEqual(['Market or Factory → harbor quarter']);
  });

  it('vale nei due versi: chi e nominato lo nomina', () => {
    // La regola non distingue chi dei due sia arrivato prima, e il giocatore
    // nemmeno: un mercato in mano deve poter leggere che accanto a un porto fa
    // un porto commerciale, non solo il contrario.
    expect(pairingLines('market')).toContain('Port → harbor quarter');
    expect(pairingLines('factory')).toContain('Port → harbor quarter');
  });

  it('tace sui quartieri che un ruolo fa da solo', () => {
    // `industrial`, `transit` e `market` non chiedono un partner: nominarli qui
    // spaccerebbe per sinergia cio' che si ottiene comunque.
    for (const line of pairingLines('transport')) expect(line).not.toContain('transit');
    for (const line of pairingLines('factory')) expect(line).not.toContain('industrial');
  });

  it('usa il nome che il giocatore vede, non l id interno', () => {
    // `transport` si chiama Transit ovunque nell'interfaccia: l'id nudo qui
    // sarebbe l'unico posto in cui compare il nome di dentro.
    const lines = pairingLines('university');
    expect(lines.join(' ')).toContain('Transit');
    expect(lines.join(' ')).not.toContain('transport');
  });
});

describe('cosa ne ricava la citta', () => {
  it('lega l uso favorito alla risorsa che porta', () => {
    // Un catalizzatore non produce niente: producono gli edifici che fa nascere.
    // Fra lo strumento in mano e la barra delle risorse non c'era altro.
    expect(yieldLine('factory')).toContain('materials');
    expect(yieldLine('market')).toContain('funds');
  });

  it('il cibo sta sotto le case, perche e li che si mangia', () => {
    // Nessun uso urbano produce cibo: lo consumano gli abitanti, e i campi
    // arrivano da soli quando il conto non torna. Dirlo qui e' dire la
    // conseguenza di far crescere le case.
    expect(yieldLine('market')).toContain('food');
  });

  it('si ferma ai due usi principali', () => {
    // Un ruolo che ne tocca tre elencherebbe mezza economia e non direbbe piu'
    // niente su di se'. La separazione e' una sola.
    for (const catalyst of ['transport', 'monument', 'port'] as const) {
      expect(yieldLine(catalyst)!.split(', then ')).toHaveLength(2);
    }
  });

  it('la serra rende cibo, non materiali', () => {
    // La serra non accende l'industria: la converte. La sua resa e' il cibo dei
    // campi e delle torri idroponiche, e non passa dai favori perche' il cibo non
    // e' un uso urbano.
    expect(yieldLine('greenhouse')).toContain('food');
    expect(yieldLine('greenhouse')).not.toContain('materials');
  });
});
