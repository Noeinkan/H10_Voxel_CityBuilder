import { describe, expect, it } from 'vitest';
import {
  ALL_CLASSES,
  BUILDING_CLASS,
  type BuildingClass,
  type DistrictId,
  type Specialization,
} from '../../sim';
import {
  BAND_OP,
  CLASS_PROFILE,
  CROWN_KIND,
  DEFAULT_TYPOLOGY_SHAPE,
  GRAMMAR,
  TYPOLOGIES,
  typologyById,
  VISUAL_LEVELS,
  type LotRole,
  type TypologyDefinition,
} from './config';
import { generateBuilding } from './generate';
import { selectTypology, type TypologyQuery } from './typology';
import { STAMP_EMPTY, type VoxelStamp } from './stamp';
import { SURFACE_KIND } from '../visualBlock';

/**
 * La crescita come identita': fasce che restano, soglie che cambiano volto e
 * linee evolutive che non tornano indietro.
 *
 * Le tre domande sono distinte e si verificano distinte:
 *
 * - **conservazione**: a parita' di tipologia, un livello in piu' non cambia un
 *   voxel dei piani bassi — cambiano i piani nuovi e la cima. E' l'invariante
 *   dei canali casuali indipendenti dal livello;
 * - **soglie**: la campata, la terrazza attrezzata e il coronamento compaiono
 *   solo oltre la soglia che li dichiara, e non un livello prima;
 * - **linee**: il catalogo dichiara da dove una tipologia puo' nascere per
 *   upgrade, e la selezione rispetta le linee — niente cicli, niente passi
 *   laterali o inversi, e chi non ha un successore resta se' stesso.
 */

/** Fasce di corpo dello stamp: per la cima `taper` sono le bandStarts meno tre voci. */
function bodyBands(stamp: VoxelStamp): number {
  return stamp.bandStarts.length - 3;
}

describe('la crescita conserva le fasce', () => {
  it('a parita di tipologia un livello in piu non tocca i piani bassi, rifa solo la cima', () => {
    // I livelli 8 e 9 hanno gli stessi tetti d'impronta (6..8): il riquadro non
    // cambia, e cio' che deve restare identico e' tutto il corpo — fascia per
    // fascia — fino a dove a 8 cominciava il coronamento.
    for (const cls of ALL_CLASSES) {
      const profile = CLASS_PROFILE[cls];
      const shape = DEFAULT_TYPOLOGY_SHAPE;
      for (const seed of [13, 55, 2024]) {
        const low = generateBuilding({ class: cls, level: 8, seed, profile, shape });
        const high = generateBuilding({ class: cls, level: 9, seed, profile, shape });

        expect(high.sizeX, `${cls}/${seed}`).toBe(low.sizeX);
        expect(high.sizeY, `${cls}/${seed}`).toBe(low.sizeY);
        expect(high.sizeZ, `${cls}/${seed}`).toBeGreaterThan(low.sizeZ);

        const bodyTop = low.bandStarts[bodyBands(low)];
        const plane = low.sizeX * low.sizeY;
        for (let z = 0; z < bodyTop; z++) {
          const from = z * plane;
          const to = from + plane;
          const layer = `${cls}/${seed} quota ${z}`;
          expect([...high.voxels.slice(from, to)], layer).toEqual([...low.voxels.slice(from, to)]);
          expect([...high.surfaces.slice(from, to)], layer).toEqual([...low.surfaces.slice(from, to)]);
        }
      }
    }
  });

  it('la cima cambia: il canale del tetto pesca dopo le fasce', () => {
    // Lo stesso seme a due livelli diversi: il corpo e' identico (test sopra),
    // ma il tiro del coronamento cade in un punto diverso della sequenza del
    // tetto perche' le fasce in mezzo sono cambiate di numero.
    const profile = CLASS_PROFILE[BUILDING_CLASS.residential];
    const a = generateBuilding({ class: BUILDING_CLASS.residential, level: 9, seed: 91, profile });
    const b = generateBuilding({ class: BUILDING_CLASS.residential, level: 10, seed: 91, profile });
    const bodyA = bodyBands(a);
    const crownA = a.voxels.slice(a.bandStarts[bodyA] * a.sizeX * a.sizeY);
    const bodyB = bodyBands(b);
    const crownB = b.voxels.slice(b.bandStarts[bodyB] * b.sizeX * b.sizeY);
    expect([...crownA]).not.toEqual([...crownB]);
  });
});

describe('le soglie visuali', () => {
  it('la campata compare solo dalla soglia consolidated', () => {
    const profile = {
      ...CLASS_PROFILE[BUILDING_CLASS.residential],
      shrinkOps: [BAND_OP.keep],
      growOps: [BAND_OP.keep],
    };
    const shape = { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat };
    const base = generateBuilding({
      class: BUILDING_CLASS.residential, level: 1, seed: 7, profile, shape,
    });
    const grown = generateBuilding({
      class: BUILDING_CLASS.residential, level: 2, seed: 7, profile, shape,
    });

    // Sotto la soglia la parete e' piena: nessuna apertura di campata. Sopra,
    // le colonne intermedie si aprono — e restano chiuse al piano terra, come
    // da contratto della campata.
    expect(bayOpenings(base, profile.bodyAlt)).toBe(0);
    expect(bayOpenings(grown, profile.bodyAlt)).toBeGreaterThan(0);
  });

  it('la terrazza diventa attrezzata solo dalla soglia tower', () => {
    const profile = {
      ...CLASS_PROFILE[BUILDING_CLASS.residential],
      shrinkBias: 1,
      shrinkOps: [BAND_OP.setback],
      growOps: [BAND_OP.setback],
    };
    const shape = { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat };
    const low = generateBuilding({
      class: BUILDING_CLASS.residential, level: 7, seed: 3, profile, shape,
    });
    const high = generateBuilding({
      class: BUILDING_CLASS.residential, level: 8, seed: 3, profile, shape,
    });

    // Le rientranze ci sono a entrambi i livelli (stessa grammatica), ma solo
    // oltre la soglia l'anello scoperto chiede il linguaggio del tetto tecnico,
    // che e' quello su cui il mesher aggancia parapetto, cassoni e fioriere.
    expect(terraceTech(low)).toBe(0);
    expect(terraceTech(high)).toBeGreaterThan(0);
  });

  it('il coronamento cresce alle soglie tower e skyline', () => {
    // Cima piatta: il suo spessore e' una costante della grammatica, quindi il
    // solo modo che ha di crescere e' il premio delle soglie — ed e' la forma
    // piu' pulita per misurarlo, perche' non c'e' un tiro a confonderlo.
    const shape = { ...DEFAULT_TYPOLOGY_SHAPE, crownKind: CROWN_KIND.flat };
    const at7 = generateBuilding({ class: BUILDING_CLASS.industrial, level: 7, seed: 11, shape });
    const at8 = generateBuilding({ class: BUILDING_CLASS.industrial, level: 8, seed: 11, shape });
    const at12 = generateBuilding({ class: BUILDING_CLASS.industrial, level: 12, seed: 11, shape });
    const at13 = generateBuilding({ class: BUILDING_CLASS.industrial, level: 13, seed: 11, shape });

    expect(crownHeightOf(at8)).toBe(crownHeightOf(at7) + 2);
    expect(crownHeightOf(at13)).toBe(crownHeightOf(at12) + 2);
    expect(crownHeightOf(at13)).toBe(crownHeightOf(at7) + 4);
  });

  it('alla soglia skyline il dettaglio di tetto e presente alla sua altezza piena', () => {
    // La cima `taper` porta il dettaglio verticale: sotto lo skyline la sua
    // altezza e' quella del profilo, sopra e' almeno quella minima dichiarata.
    const profile = CLASS_PROFILE[BUILDING_CLASS.residential];
    const at12 = generateBuilding({ class: BUILDING_CLASS.residential, level: 12, seed: 4, profile });
    const at13 = generateBuilding({ class: BUILDING_CLASS.residential, level: 13, seed: 4, profile });

    const propHeight = (stamp: VoxelStamp): number =>
      stamp.sizeZ - stamp.bandStarts[stamp.bandStarts.length - 2];
    expect(propHeight(at12)).toBe(profile.roofPropHeight);
    expect(propHeight(at13)).toBe(6);
    expect(propHeight(at13)).toBeGreaterThanOrEqual(profile.roofPropHeight);
  });

  it('alla soglia skyline anche le cime che negano il dettaglio lo portano', () => {
    // Le quattro cime che rispondono `roofProp: false` sono quelle del tessuto
    // piu' numeroso — `stepped` e' la cima del commercio, `flat` quella
    // dell'industria — e sotto la soglia devono continuare a negarlo: e' li'
    // che «tetto piano» vuol dire capannone. Sopra, e' il livello a decidere, e
    // senza questo la promessa di `SKYLINE_PROP_HEIGHT` restava lettera morta
    // proprio dove la citta' e' fatta di torri uguali.
    const propHeight = (stamp: VoxelStamp): number =>
      stamp.sizeZ - stamp.bandStarts[stamp.bandStarts.length - 2];

    for (const crownKind of [CROWN_KIND.stepped, CROWN_KIND.flat]) {
      const shape = { ...DEFAULT_TYPOLOGY_SHAPE, crownKind };
      const below = generateBuilding({
        class: BUILDING_CLASS.commercial,
        level: VISUAL_LEVELS.skyline - 1,
        seed: 7,
        shape,
      });
      const at = generateBuilding({
        class: BUILDING_CLASS.commercial,
        level: VISUAL_LEVELS.skyline,
        seed: 7,
        shape,
      });

      expect(propHeight(below), `${crownKind} sotto la soglia`).toBe(0);
      expect(propHeight(at), `${crownKind} alla soglia`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('le linee evolutive', () => {
  it('ogni provenienza dichiarata esiste, ha lo stesso uso e non e se stessa', () => {
    for (const definition of TYPOLOGIES) {
      for (const from of definition.evolvesFrom ?? []) {
        const source = typologyById(from);
        expect(source, `${definition.id} <- ${from}`).not.toBeNull();
        expect(source!.use, `${definition.id} <- ${from}`).toBe(definition.use);
        expect(from, definition.id).not.toBe(definition.id);
      }
    }
  });

  it('nessuna transizione inversa o laterale: la linea va solo in avanti', () => {
    // Inversa: se A ammette B, B non ammette A — una casa-bottega diventa
    // podio, mai il contrario. Laterale: due righe che si ammettono a vicenda
    // sarebbero un giro fra pari, che la crescita non racconta.
    for (const a of TYPOLOGIES) {
      for (const targetId of a.evolvesFrom ?? []) {
        const target = typologyById(targetId)!;
        expect(target.evolvesFrom ?? [], `${targetId} <- ${a.id}`).not.toContain(a.id);
      }
    }
  });

  it('non ci sono cicli: da ogni riga la catena termina', () => {
    for (const start of TYPOLOGIES) {
      const seen = new Set<string>();
      let current: TypologyDefinition | null = start;
      for (let steps = 0; steps <= TYPOLOGIES.length; steps++) {
        if (current === null || seen.has(current.id)) {
          expect(seen.has(current?.id ?? ''), start.id).toBe(false);
          break;
        }
        seen.add(current.id);
        const next: readonly TypologyDefinition[] = (current.evolvesFrom ?? []).map(
          (id) => typologyById(id)!,
        );
        // La catena prosegue su una sola voce: la linea di una riga e' un albero
        // di bersagli, ma qui basta mostrare che *nessuna* strada torna indietro.
        current = next.length > 0 ? next[0] : null;
      }
    }
  });

  it('i ripieghi non adottano nessuno e nessuno li adotta come esito', () => {
    for (const definition of TYPOLOGIES) {
      if (definition.priority !== 0) continue;
      // Un punto di partenza non e' mai l'esito di una linea: se qualcosa
      // dichiarasse di diventarlo, la selezione lo scarterebbe comunque — ma
      // dichiararlo sarebbe una riga che promette cio' che non puo' succedere.
      expect(definition.evolvesFrom, definition.id).toBeUndefined();
    }
  });

  it('un upgrade adotta solo cio che la linea dichiara, altrimenti resta se stesso', () => {
    // Casa-bottega a livello 3, densa: il podio commerciale qualifica e la
    // linea lo dichiara.
    const podium = selectTypology(query(0, 3, { mixed: 1, density: 0.6, from: 'shophouse' }));
    expect(podium.id).toBe('commercialPodium');

    // La stessa colonna senza densita': il podio non qualifica, e la risposta
    // resta la casa-bottega — non il ripiego, che per un upgrade non esiste.
    const kept = selectTypology(query(0, 3, { mixed: 1, density: 0.1, from: 'shophouse' }));
    expect(kept.id).toBe('shophouse');

    // Una torre a blocco chiede densita' e basta: dove non arriva altro resta
    // se' stessa, per quanto in alto salga.
    const tower = selectTypology(query(0, 7, { density: 0.8, from: 'towerBlock' }));
    expect(tower.id).toBe('towerBlock');

    // La linea industriale culmina nella torre idroponica: lo scalo la raggiunge
    // solo oltre il livello che la merita, e solo dove il distretto coltiva.
    const yard = selectTypology(query(2, 4, { industry: 0.7, from: 'industrialYard' }));
    expect(yard.id).toBe('stackedWorks');
    const greenhouse = selectTypology(query(2, 5, {
      industry: 0.7,
      specialization: 'farming',
      from: 'productionLoft',
    }));
    expect(greenhouse.id).toBe('hydroponicTower');

    // La guglia diventa lanterna: il solo passo interno alla linea civica.
    const lantern = selectTypology(query(3, 5, { from: 'civicSpire' }));
    expect(lantern.id).toBe('civicLantern');
  });

  it('le cime sono una scala: si sale se il luogo chiede di piu, mai si torna indietro', () => {
    // Le tre verticali residenziali in fila. Ogni scalino chiede *piu'* del
    // precedente — la ricchezza, poi il fronte strada e un livello ancora — ed e'
    // questo a fare del passaggio un progresso invece di uno scambio fra pari.
    // Densita' sopra la torre liscia e sotto la casa impilata, che a densita'
    // piena vincerebbe per priorita': la scala che si vuole misurare qui e'
    // quella delle tre verticali, non la scelta fra i due tessuti densi.
    const dense = { density: 0.58, lotRole: 0 as LotRole };
    const rich = { ...dense, wealth: 0.9 };
    expect(selectTypology(query(0, 4, { ...dense, from: 'terracedHousing' })).id).toBe('towerBlock');
    expect(selectTypology(query(0, 5, { ...rich, from: 'towerBlock' })).id).toBe('skyTerraces');
    expect(selectTypology(query(0, 6, { ...rich, from: 'skyTerraces' })).id).toBe('roundTower');

    // Nel cuore dell'isolato il tamburo non qualifica, e il gradone resta: e' la
    // ragione per cui la stessa strada porta forme diverse allo stesso livello.
    const inner = selectTypology(query(0, 6, {
      density: 0.8, wealth: 0.9, lotRole: 2, from: 'skyTerraces',
    }));
    expect(inner.id).toBe('skyTerraces');

    // All'indietro non si torna: un tamburo in un luogo che accetterebbe la torre
    // liscia resta un tamburo, perche' nessuna linea dichiara quella provenienza.
    expect(selectTypology(query(0, 8, { ...rich, from: 'roundTower' })).id).toBe('roundTower');

    // E il commercio senza specializzazione ha di nuovo un seguito: il portico
    // denso diventa il fronte terrazzato dove la gente sta bene.
    const arcade = selectTypology(query(1, 4, {
      density: 0.6, satisfaction: 0.7, from: 'arcadeRow',
    }));
    expect(arcade.id).toBe('terraceArcade');
  });

  it('alla nascita la linea non conta: ogni riga che il luogo accetta resta raggiungibile', () => {
    // Un angolo denso e ricco nasce gia' torre d'angolo: la linea evolutiva
    // vale per gli upgrade, non per chi ancora non esiste.
    const corner = selectTypology(query(0, 6, { density: 0.8, wealth: 0.9, lotRole: 1 }));
    expect(corner.id).toBe('cornerTower');
    // Il tamburo vuole il fronte strada: e' cio' che lo tiene distinto dalle
    // altre due verticali, che negli stessi luoghi qualificherebbero uguale.
    const round = selectTypology(query(0, 7, { density: 0.4, wealth: 0.9, lotRole: 0 }));
    expect(round.id).toBe('roundTower');
  });
});

// --- Aiuti di lettura degli stamp -------------------------------------------

/** Aperture di campata: voxel del tono finestra sulle righe che la campata buca. */
function bayOpenings(stamp: VoxelStamp, bayTone: number): number {
  const bands = bodyBands(stamp);
  let count = 0;
  for (let b = 0; b < bands; b++) {
    const from = Math.max(stamp.bandStarts[b] + GRAMMAR.spandrelHeight, GRAMMAR.portalHeight);
    const to = stamp.bandStarts[b + 1] - 1;
    for (let z = from; z < to; z++) {
      for (let sy = 0; sy < stamp.sizeY; sy++) {
        for (let sx = 0; sx < stamp.sizeX; sx++) {
          if (stamp.voxels[sx + stamp.sizeX * (sy + stamp.sizeY * z)] === bayTone) count++;
        }
      }
    }
  }
  return count;
}

/** Voxel di corpo con il linguaggio del tetto tecnico: l'anello attrezzato. */
function terraceTech(stamp: VoxelStamp): number {
  const bands = bodyBands(stamp);
  const top = stamp.bandStarts[bands];
  let count = 0;
  for (let i = 0; i < stamp.sizeX * stamp.sizeY * top; i++) {
    if (stamp.voxels[i] !== STAMP_EMPTY && stamp.surfaces[i] === SURFACE_KIND.roofTech) count++;
  }
  return count;
}

/** Spessore della cima piatta: l'unica fascia del coronamento per `flat`. */
function crownHeightOf(stamp: VoxelStamp): number {
  const bands = bodyBands(stamp);
  return stamp.bandStarts[bands + 1] - stamp.bandStarts[bands];
}

function query(use: BuildingClass, level: number, options: {
  readonly mixed?: BuildingClass;
  readonly density?: number;
  readonly wealth?: number;
  readonly satisfaction?: number;
  readonly industry?: number;
  readonly lotRole?: LotRole;
  readonly specialization?: Specialization;
  readonly from?: string;
} = {}): TypologyQuery {
  return {
    use,
    mixed: options.mixed,
    level,
    lotRole: options.lotRole,
    coastal: false,
    from: options.from,
    profile: {
      specialization: options.specialization ?? null,
      roles: [],
      charters: [],
      district: 'outskirts' as DistrictId,
      density: options.density ?? 0,
      wealth: options.wealth ?? 0,
      accessibility: 0,
      satisfaction: options.satisfaction ?? 0,
      industry: options.industry ?? 0,
      uses: [0, 0, 0, 0],
    },
  };
}

void VISUAL_LEVELS;
