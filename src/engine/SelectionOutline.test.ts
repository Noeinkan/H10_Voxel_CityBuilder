import { describe, expect, it } from 'vitest';
import { Mesh, type BufferAttribute, type ShaderMaterial } from 'three';
import { SelectionOutline } from './SelectionOutline';

/** Terrazzamento di prova: una rampa a gradini lungo x, cosi' il pendio esiste. */
const ramp = (x: number): number => Math.floor(x / 4);

const meshes = (outline: SelectionOutline): Mesh[] =>
  outline.group.children.filter((child): child is Mesh => child instanceof Mesh);

const ribbons = (outline: SelectionOutline): Mesh[] =>
  meshes(outline).filter((mesh) => mesh.geometry.getAttribute('aRibbon') !== undefined);

const materials = (outline: SelectionOutline): ShaderMaterial[] => {
  const seen = new Set<ShaderMaterial>();
  for (const mesh of ribbons(outline)) seen.add(mesh.material as ShaderMaterial);
  return [...seen];
};

describe('SelectionOutline', () => {
  it('parte spento e accende fascia e squadre su cio’ che si sceglie', () => {
    const outline = new SelectionOutline(() => 0);
    expect(meshes(outline).every((mesh) => !mesh.visible)).toBe(true);

    outline.show({ x0: 2, y0: 3, x1: 9, y1: 12, z0: 0, z: 0 });
    // Una sagoma piatta: niente coperchio ne' montanti, ma la fascia e le
    // squadre ci sono sempre — sono il solo ancoraggio che resta.
    expect(ribbons(outline).filter((mesh) => mesh.visible).length).toBe(2);

    outline.hide();
    expect(meshes(outline).every((mesh) => !mesh.visible)).toBe(true);
  });

  it('aggiunge coperchio e montanti solo quando la cosa scelta ha un’altezza', () => {
    const outline = new SelectionOutline(() => 0);

    outline.show({ x0: 0, y0: 0, x1: 7, y1: 7, z0: 0, z: 24 });
    const standing = ribbons(outline).filter((mesh) => mesh.visible).length;

    outline.show({ x0: 0, y0: 0, x1: 7, y1: 7, z0: 0, z: 0 });
    const flat = ribbons(outline).filter((mesh) => mesh.visible).length;

    expect(standing).toBe(4);
    expect(flat).toBe(2);
  });

  it('posa la fascia sopra il gradino piu’ alto che attraversa', () => {
    const outline = new SelectionOutline((x) => ramp(x));
    outline.show({ x0: 0, y0: 0, x1: 15, y1: 15, z0: 0, z: 0 });

    const band = ribbons(outline)[0];
    const position = band.geometry.getAttribute('position') as BufferAttribute;
    // Nessun vertice della fascia finisce dentro la collina: la quota di ogni
    // sezione e' quella del punto piu' alto che la sezione tocca.
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      expect(position.getZ(i)).toBeGreaterThanOrEqual(ramp(x));
    }
  });

  it('non riscrive niente quando il riquadro non cambia', () => {
    const outline = new SelectionOutline(() => 0);
    const box = { x0: 1, y0: 1, x1: 6, y1: 6, z0: 0, z: 10 };
    const version = (): number =>
      (ribbons(outline)[0].geometry.getAttribute('position') as BufferAttribute).version;

    outline.show(box);
    const drawn = version();

    // Lo stesso riquadro, oggetto diverso: `show` esce prima di toccare i
    // buffer, ed e' cio' che rende gratuito chiamarlo a ogni refresh dell'HUD.
    outline.show({ ...box });
    expect(version()).toBe(drawn);

    outline.show({ ...box, x1: 7 });
    expect(version()).toBeGreaterThan(drawn);
  });

  it('anima solo a selezione accesa, e il tempo non cresce senza fine', () => {
    const outline = new SelectionOutline(() => 0);
    const clock = (): number => materials(outline)[0].uniforms['uTime'].value as number;

    outline.update(1);
    expect(clock()).toBe(0);

    outline.show({ x0: 0, y0: 0, x1: 4, y1: 4, z0: 0, z: 0 });
    outline.update(1);
    expect(clock()).toBeGreaterThan(0);

    // Il tempo rientra: uno `uTime` cresciuto per ore perderebbe i decimali in
    // un float, e la cometa comincerebbe a scattare.
    for (let step = 0; step < 200; step++) outline.update(1);
    expect(clock()).toBeLessThan(60);
  });

  it('resta fuori dalla profondita’, cosi’ nessun rilievo lo nasconde', () => {
    const outline = new SelectionOutline(() => 0);

    for (const material of materials(outline)) {
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
      expect(material.transparent).toBe(true);
    }
  });
});
