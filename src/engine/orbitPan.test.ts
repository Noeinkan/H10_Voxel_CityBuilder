import { describe, expect, it } from 'vitest';
import { panOrbitPivot, readPanAxes, scaleOrbitBounds, type OrbitBounds } from './orbitPan';

const YAW = Math.PI / 4;

/** Un isolato di venti colonne con sopra una torre alta duecento. */
const BLOCK: OrbitBounds = { x0: 40, y0: 40, z0: 0, x1: 60, y1: 60, z1: 200 };

describe('readPanAxes', () => {
  it('legge WASD e le frecce come lo stesso comando', () => {
    const wasd = { x: 0, y: 0 };
    const arrows = { x: 0, y: 0 };

    expect(readPanAxes(new Set(['KeyW', 'KeyD']), wasd)).toBe(true);
    expect(readPanAxes(new Set(['ArrowUp', 'ArrowRight']), arrows)).toBe(true);
    expect(wasd).toEqual(arrows);
    expect(wasd).toEqual({ x: 1, y: 1 });
  });

  it('annulla i versi opposti invece di sommarli', () => {
    const axes = { x: 0, y: 0 };
    // Tenere premuti A e D e' cio' che fa una mano che cambia idea: la camera
    // deve stare ferma, non partire in una delle due direzioni.
    expect(readPanAxes(new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS']), axes)).toBe(false);
    expect(axes).toEqual({ x: 0, y: 0 });
  });

  it('dice che non c’e’ niente da muovere quando nessun tasto e’ giu’', () => {
    const axes = { x: 3, y: -2 };
    expect(readPanAxes(new Set(['KeyQ']), axes)).toBe(false);
    // Azzera comunque: un residuo del frame prima farebbe scivolare la camera
    // dopo che il tasto e' stato mollato.
    expect(axes).toEqual({ x: 0, y: 0 });
  });
});

describe('panOrbitPivot', () => {
  it('scorre di traverso all’azimut, senza cambiare quota', () => {
    const pivot = { x: 50, y: 50, z: 100 };
    panOrbitPivot(pivot, YAW, 4, 0, scaleOrbitBounds(BLOCK, 1));

    // La destra di schermo e' perpendicolare all'azimut: e' la stessa base del
    // trascinamento, ed e' cio' che fa concordare i due gesti a ogni rotazione.
    const dx = pivot.x - 50;
    const dy = pivot.y - 50;
    expect(dx * Math.cos(YAW) + dy * Math.sin(YAW)).toBeCloseTo(0, 9);
    expect(Math.hypot(dx, dy)).toBeCloseTo(4, 9);
    expect(pivot.z).toBeCloseTo(100, 9);
  });

  it('sale in quota invece di correre sul terreno', () => {
    const pivot = { x: 50, y: 50, z: 100 };
    panOrbitPivot(pivot, YAW, 0, 30, scaleOrbitBounds(BLOCK, 1));

    // E' la differenza con il pan della citta': su un isolato l'asse con
    // qualcosa da percorrere e' l'altezza, non il piano di terra.
    expect(pivot.z).toBeCloseTo(130, 9);
    expect(pivot.x).toBeCloseTo(50, 9);
    expect(pivot.y).toBeCloseTo(50, 9);
  });

  it('non lascia uscire il perno dal soggetto, per quanto si insista', () => {
    const bounds = scaleOrbitBounds(BLOCK, 1);
    const pivot = { x: 50, y: 50, z: 100 };
    for (let i = 0; i < 400; i++) panOrbitPivot(pivot, YAW, 9, 9, bounds);

    // E' l'intera ragione per cui questi tasti sono di nuovo accesi: senza il
    // vincolo, tenere premuto W allontanerebbe l'inquadratura dall'isolato
    // finche' non resta niente da guardare.
    expect(pivot.z).toBeCloseTo(bounds.z1, 9);
    expect(pivot.x).toBeGreaterThanOrEqual(bounds.x0);
    expect(pivot.x).toBeLessThanOrEqual(bounds.x1);
    expect(pivot.y).toBeGreaterThanOrEqual(bounds.y0);
    expect(pivot.y).toBeLessThanOrEqual(bounds.y1);
  });

  it('lascia scendere fino alla base e non oltre', () => {
    const bounds = scaleOrbitBounds(BLOCK, 1);
    const pivot = { x: 50, y: 50, z: 100 };
    for (let i = 0; i < 400; i++) panOrbitPivot(pivot, YAW, 0, -9, bounds);
    expect(pivot.z).toBeCloseTo(bounds.z0, 9);
  });
});

describe('scaleOrbitBounds', () => {
  it('porta la scatola in unita’ di mondo con il suo respiro', () => {
    const scaled = scaleOrbitBounds(BLOCK, 2);
    const margin = scaled.z1 - BLOCK.z1 * 2;

    // Il respiro esiste perche' il perno e' il **centro** dell'inquadratura:
    // fermandolo esatto sulla cima, il tetto resterebbe a meta' schermo.
    expect(margin).toBeGreaterThan(0);
    // Lo stesso su tutti e sei i lati, e in unita' di mondo: un respiro in voxel
    // si stringerebbe da solo su una scena con il voxel piu' grande.
    expect(scaled.x0).toBeCloseTo(BLOCK.x0 * 2 - margin, 9);
    expect(scaled.x1).toBeCloseTo(BLOCK.x1 * 2 + margin, 9);
    expect(scaled.y0).toBeCloseTo(BLOCK.y0 * 2 - margin, 9);
    expect(scaled.y1).toBeCloseTo(BLOCK.y1 * 2 + margin, 9);
    expect(scaled.z0).toBeCloseTo(BLOCK.z0 * 2 - margin, 9);
  });
});
