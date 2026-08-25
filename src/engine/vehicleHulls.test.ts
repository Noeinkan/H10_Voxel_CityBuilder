import { describe, expect, it } from 'vitest';
import {
  FLOATING_KINDS,
  funnelOf,
  TRAFFIC,
  VEHICLE,
  VEHICLE_KINDS,
} from '../world/traffic/config';
import { hullBlocks, type HullBlock } from './vehicleHulls';

/**
 * Le sagome si verificano in node, ed e' la ragione per cui stanno fuori da
 * `TrafficView`: qui non c'e' un renderer da avviare, ci sono delle scatole.
 *
 * Il test che conta e' quello della ciminiera. Fumaiolo e pennacchio leggono la
 * stessa voce di `TRAFFIC.funnel` ma la usano in due modi diversi — uno ci
 * disegna un prisma, l'altro ci fa nascere gli sbuffi — e l'unico modo di
 * accorgersi che le due letture hanno smesso di combaciare, senza questo test,
 * sarebbe uno screenshot con il fumo sospeso sopra il cappello.
 */

function top(block: HullBlock): number {
  return block.z + block.sizeZ / 2;
}

describe('hullBlocks', () => {
  it('ogni mezzo ha una sagoma articolata, non una scatola sola', () => {
    for (const kind of VEHICLE_KINDS) {
      const blocks = hullBlocks(kind);
      expect(blocks.length).toBeGreaterThan(5);
      for (const block of blocks) {
        expect(block.sizeX).toBeGreaterThan(0);
        expect(block.sizeY).toBeGreaterThan(0);
        expect(block.sizeZ).toBeGreaterThan(0);
        expect(block.palette).toBeGreaterThan(0);
        expect(block.palette).toBeLessThan(32);
      }
    }
  });

  it('resta simmetrica rispetto alla propria asse', () => {
    // Le tinte no — due container affiancati sono di colore diverso apposta — ma
    // la geometria si': una prua storta di un decimo di voxel si vede subito, e
    // dall'alto e' l'unico difetto di sagoma che non si puo' nascondere.
    for (const kind of VEHICLE_KINDS) {
      const shape = (block: HullBlock, side: number): string =>
        [block.x, side * block.y, block.z, block.sizeX, block.sizeY, block.sizeZ].join(':');
      const blocks = hullBlocks(kind);
      const present = new Map<string, number>();
      for (const block of blocks) {
        present.set(shape(block, 1), (present.get(shape(block, 1)) ?? 0) + 1);
      }
      for (const block of blocks) {
        expect(present.get(shape(block, -1)) ?? 0).toBe(present.get(shape(block, 1)));
      }
    }
  });

  it('sta nell ingombro dichiarato in lunghezza', () => {
    // In larghezza no, e non e' una svista: parabordi, parapetti e alette di
    // plancia sporgono dal fianco perche' e' cio' che li rende visibili. Il
    // limite serve a escludere un'ala montata al posto sbagliato, non a
    // contenere la ferramenta.
    for (const kind of VEHICLE_KINDS) {
      const size = TRAFFIC.hull[kind];
      for (const block of hullBlocks(kind)) {
        expect(Math.abs(block.x) + block.sizeX / 2).toBeLessThanOrEqual(size.length / 2 + 1e-9);
        expect(Math.abs(block.y) + block.sizeY / 2).toBeLessThanOrEqual(size.width);
      }
    }
  });

  it('chi galleggia porta la fascia di galleggiamento sul pelo dell acqua', () => {
    for (const kind of FLOATING_KINDS) {
      const band = hullBlocks(kind).filter((block) => block.palette === TRAFFIC.bandPalette);
      expect(band.length).toBeGreaterThan(0);
      for (const block of band) {
        expect(block.z - block.sizeZ / 2).toBeLessThan(0);
        expect(top(block)).toBeGreaterThan(0);
      }
    }
  });

  it('ogni mezzo ha qualcosa che si veda di notte, e nessuna luce e dedotta dalla tinta', () => {
    // Il materiale dei mezzi accende due cose e due sole: le scatole marcate
    // `lamp` e le fasce vetrate. Un mezzo che non ha ne' le une ne' le altre si
    // spegne del tutto quando cala la sera — la cabina di funivia sta in piedi
    // sulla sola fascia vetrata, ed e' voluto: e' piccola e appesa, e un fanale
    // in cima le costerebbe la silhouette.
    for (const kind of VEHICLE_KINDS) {
      const blocks = hullBlocks(kind);
      const lamps = blocks.filter((block) => block.lamp);
      const glazed = blocks.filter((block) => block.palette === TRAFFIC.cabinPalette);
      expect(lamps.length + glazed.length, `${kind} si spegne di notte`).toBeGreaterThan(0);
      // `lamp` e' un campo della scatola e non una lettura dello slot di palette,
      // ma il verso stretto vale: un fanale e' sempre in tinta di fanale.
      for (const lamp of lamps) expect(lamp.palette).toBe(TRAFFIC.lightPalette);
    }

    // E la sagoma su cui l'errore sarebbe invisibile in un conto: le pinne del
    // dirigibile restano spente pur essendo in tinta di fanale.
    const airship = hullBlocks(VEHICLE.airship);
    const tinted = airship.filter((block) => block.palette === TRAFFIC.lightPalette);
    expect(tinted.filter((block) => !block.lamp).length).toBeGreaterThan(0);
  });

  it('il fumaiolo disegnato chiude esattamente sulla bocca da cui esce il fumo', () => {
    for (const kind of VEHICLE_KINDS) {
      const funnel = funnelOf(kind);
      if (funnel === undefined) continue;

      const stack = hullBlocks(kind).filter((block) => Math.abs(block.x - funnel.along) < 1e-6);
      expect(stack.length).toBeGreaterThan(0);
      expect(Math.max(...stack.map(top))).toBeCloseTo(funnel.mouth, 6);
      // E la bocca sta sopra il ponte: un fumaiolo che finisse dentro lo scafo
      // farebbe uscire il fumo dalla stiva.
      expect(funnel.mouth).toBeGreaterThan(TRAFFIC.hull[kind].height);
    }
  });
});
