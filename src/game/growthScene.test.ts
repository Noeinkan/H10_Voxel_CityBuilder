import { describe, expect, it } from 'vitest';
import { testTerrain } from '../sim/testTerrain';
import { BUILDING_CLASS } from '../sim';
import { VoxelWorld } from '../world/VoxelWorld';
import { GrowthScene } from './growthScene';

describe('GrowthScene', () => {
  it('impone l’ordine del tutorial e registra una sola volta i settori', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);

    expect(scene.placeCatalyst(32, 16, BUILDING_CLASS.industrial)).toEqual({
      success: false,
      reason: 'onboarding-order',
    });
    expect(scene.placeCatalyst(16, 16, BUILDING_CLASS.residential).success).toBe(true);
    expect(scene.stats.onboarding.step).toBe('factory');
  });

  it('chiude il ciclo tick, costruzione e registrazione voxel', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);
    expect(scene.placeCatalyst(16, 16, BUILDING_CLASS.residential).success).toBe(true);
    expect(scene.placeCatalyst(32, 16, BUILDING_CLASS.industrial).success).toBe(true);
    for (let i = 0; i < 20; i++) scene.advance(0.1);
    expect(scene.stats.tick).toBe(20);
    expect(scene.stats.buildings).toBeGreaterThan(0);
    expect(scene.registry.count).toBe(scene.stats.buildings);
    expect(world.solidVoxelCount).toBeGreaterThan(0);
  });

  it('fa emergere usi misti e tipologie diverse da catalizzatori sovrapposti', () => {
    // E' la prova di fase 3 sul percorso vero: nessuno sceglie una zona, nessuno
    // sceglie una forma. Si piazzano tre catalizzatori sovrapposti e si guarda
    // cosa la citta' ne fa.
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 3, chunksY: 3, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 96, sizeY: 96 }, 4242);

    expect(scene.placeCatalyst(40, 40, 'market').success).toBe(true);
    expect(scene.placeCatalyst(52, 44, 'factory').success).toBe(true);
    expect(scene.placeCatalyst(44, 56, 'park').success).toBe(true);

    for (let i = 0; i < 600; i++) scene.advance(0.1);

    const stats = scene.stats;
    // Quattro usi vivi, non tre: il commerciale nasce da solo dove il mercato
    // arriva, senza che nessuno l'abbia chiesto.
    expect(stats.countsByClass[BUILDING_CLASS.commercial]).toBeGreaterThan(0);
    expect(stats.countsByClass[BUILDING_CLASS.residential]).toBeGreaterThan(0);

    // Isolati a uso misto dalla sovrapposizione dei campi.
    expect(stats.mixedByClass.reduce((sum, n) => sum + n, 0)).toBeGreaterThan(0);

    // E almeno due tipologie riconoscibili, scelte dal luogo e non dal seme.
    expect(stats.typologies.length).toBeGreaterThanOrEqual(2);
    for (const [, count] of stats.typologies) expect(count).toBeGreaterThan(0);
  });

  it('promuove gli edifici e produce crescita verticale osservabile', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 2, chunksY: 2, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 64, sizeY: 64 }, 1337);
    expect(scene.placeCatalyst(16, 16, BUILDING_CLASS.residential).success).toBe(true);
    expect(scene.placeCatalyst(32, 16, BUILDING_CLASS.industrial).success).toBe(true);

    for (let i = 0; i < 240; i++) scene.advance(0.1);

    expect(scene.stats.builder.upgraded).toBeGreaterThan(0);
    expect(scene.stats.levels.slice(1).some((count) => count > 0)).toBe(true);
  });

  it('fa crescere anche un catalizzatore piantato lontano dal nucleo', () => {
    // **La classifica dei candidati e' globale e il punteggio e' assoluto**, e
    // le due cose insieme affamavano ogni polo che non fosse il piu' forte della
    // mappa: un mercato appena piazzato vale la propria intensita', mentre nel
    // nucleo maturo due campi sovrapposti tengono migliaia di celle libere piu'
    // in alto. I posti in lista finivano tutti li' e attorno al catalizzatore
    // nuovo non nasceva niente — non poco, **niente**, per sempre. E' lo stesso
    // difetto per cui su un'isola staccata non cresceva nulla nemmeno con il suo
    // monumento sopra, perche' un'isola e' un polo che non tocca il nucleo.
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 8, chunksY: 8, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 256, sizeY: 256 }, 1337);

    expect(scene.placeCatalyst(48, 48, 'market').success).toBe(true);
    expect(scene.placeCatalyst(84, 48, 'factory').success).toBe(true);
    expect(scene.placeCatalyst(48, 84, 'park').success).toBe(true);
    for (let i = 0; i < 800; i++) scene.advance(0.1);

    const near = (): number => {
      let count = 0;
      for (const record of scene.registry.all) {
        if (record.landmark !== undefined) continue;
        if (Math.abs(record.x - 200) <= 40 && Math.abs(record.y - 200) <= 40) count++;
      }
      return count;
    };

    // Lontano da tutto: nessun campo lo tocca, quindi prima non c'e' niente.
    expect(near()).toBe(0);
    expect(scene.placeCatalyst(200, 200, 'market').success).toBe(true);
    for (let i = 0; i < 800; i++) scene.advance(0.1);

    expect(near()).toBeGreaterThan(0);
  });

  it('un settore comprato arriva con il nucleo che lo fa crescere', () => {
    // **Terra e crescita non sono la stessa cosa.** La citta' nasce dove il
    // campo di desiderabilita' esiste, e il campo esiste solo dove un
    // catalizzatore l'ha acceso: senza il nucleo, un settore comprato restava un
    // pezzo d'isola vuoto per sempre mentre il messaggio prometteva il
    // contrario.
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 6, chunksY: 6, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 192, sizeY: 192 }, 1337);
    expect(scene.placeCatalyst(48, 48, 'market').success).toBe(true);
    expect(scene.placeCatalyst(72, 48, 'factory').success).toBe(true);
    // Si cresce finche' il settore diventa comprabile invece di contare i tick:
    // popolazione e fondi sono bilanciamento, e un numero fisso qui renderebbe
    // questo test un guardiano di `BALANCE` invece che della regola.
    for (let i = 0; i < 400 && scene.expansionFailure('east-0') !== null; i++) scene.advance(1);
    expect(scene.expansionFailure('east-0')).toBeNull();

    const region = { minX: 128, minY: 128, sizeX: 64, sizeY: 64 };
    const before = scene.simState.catalysts.length;
    expect(scene.buyExpansion('east-0', region).success).toBe(true);
    // Il nucleo non si pianta all'acquisto: il terreno non c'e' ancora, ed e'
    // `markSectorReady` a dire che e' arrivato.
    expect(scene.simState.catalysts).toHaveLength(before);

    scene.markSectorReady();
    const planted = scene.simState.catalysts;
    expect(planted).toHaveLength(before + 1);

    const seed = planted[planted.length - 1];
    expect(seed.kind).toBe('market');
    expect(seed.x).toBeGreaterThanOrEqual(region.minX);
    expect(seed.x).toBeLessThan(region.minX + region.sizeX);
    expect(seed.y).toBeGreaterThanOrEqual(region.minY);
    expect(seed.y).toBeLessThan(region.minY + region.sizeY);

    // E la terra nuova costruisce: e' la promessa del messaggio, verificata.
    const grownBefore = scene.registry.count;
    for (let i = 0; i < 200; i++) scene.advance(1);
    expect(scene.registry.count).toBeGreaterThan(grownBefore);

    let onNewLand = 0;
    for (const record of scene.registry.all) {
      if (record.x >= region.minX && record.y >= region.minY) onNewLand++;
    }
    expect(onNewLand).toBeGreaterThan(0);
  });

  it('l aeroporto puntato su un edificio chiede al tetto, non al terreno', () => {
    // Lo stesso strumento produce due strutture, e a scegliere e' il luogo: la
    // colonna di un edificio chiede uno scalo in quota, quella del prato accanto
    // un campo di volo. Il rifiuto deve venire dalla regola del tetto — e' cio'
    // che dice al giocatore di cercare una torre invece di un pianoro.
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 3, chunksY: 3, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 96, sizeY: 96 }, 4242);
    // I tre passi del tutorial per primi: l'aeroporto e' bloccato finche' non
    // sono stati fatti, e il rifiuto che ne uscirebbe non e' quello in prova.
    expect(scene.placeCatalyst(40, 40, 'market').success).toBe(true);
    expect(scene.placeCatalyst(60, 40, 'factory').success).toBe(true);
    expect(scene.placeCatalyst(40, 60, 'park').success).toBe(true);
    for (let i = 0; i < 300; i++) scene.advance(0.1);

    expect(scene.catalystUsesRooftop('airport')).toBe(true);
    expect(scene.catalystUsesRooftop('port')).toBe(false);

    const building = [...scene.registry.all].find((record) => record.landmark === undefined);
    expect(building).toBeDefined();

    const failure = scene.catalystFailure(building!.x, building!.y, 'airport');
    expect(['needs-building', 'building-too-short', 'no-room-aloft']).toContain(failure);
  });

  it('rispetta pausa e velocita del ciclo di gioco', () => {
    const world = new VoxelWorld();
    const map = testTerrain({ chunksX: 1, chunksY: 1, height: 12 });
    const scene = new GrowthScene(world, map, { minX: 0, minY: 0, sizeX: 32, sizeY: 32 }, 9);
    scene.setPaused(true);
    scene.advance(1);
    expect(scene.stats.tick).toBe(0);
    scene.setPaused(false);
    scene.setSpeed(2);
    scene.advance(0.1);
    expect(scene.stats.tick).toBe(2);
  });
});
