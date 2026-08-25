import { describe, expect, it } from 'vitest';
import {
  CHUNK,
  FACE_NEIGHBOUR_OFFSETS,
  PADDED_VOL,
  paddedIdx,
} from '../../world/chunkCoords';
import { packVisualBlock, SURFACE_KIND } from '../../world/visualBlock';
import { PALETTE_SLOTS } from '../paletteSlots';
import { appendCarveDetail } from './carveGeometry';
import { MAX_CARVE_QUADS_PER_CHUNK, planCarves } from './carvePlan';
import { greedyMesh, SHADE_AO_MASK } from './greedyMesher';
import {
  collectSurfaceCells,
  MAX_DETAIL_QUADS_PER_CHUNK,
  type MicroGeometryWriter,
} from './microGeometry';

/**
 * La microgeometria riduttiva.
 *
 * **Il contratto qui e' piu' stretto che per il dettaglio additivo, e la ragione
 * e' una sola**: un prisma additivo sbagliato e' un prisma sbagliato, mentre un
 * vano sbagliato e' un **muro bucato**. La faccia piatta e' gia' stata soppressa
 * dal greedy pass quando questo modulo scrive, quindi le cose da tenere ferme
 * non sono la forma dei vani — quella si guarda a schermo — ma tre proprieta'
 * che non si vedono guardando: che ogni faccia soppressa sia pagata, che ogni
 * quad guardi davvero dove dichiara, e che il costo segua il perimetro invece
 * dell'area.
 */

function volume(): Uint8Array {
  return new Uint8Array(PADDED_VOL);
}

function setLocal(padded: Uint8Array, x: number, y: number, z: number, block: number): void {
  padded[paddedIdx(x + 1, y + 1, z + 1)] = block;
}

const GLOW = packVisualBlock(PALETTE_SLOTS.glassPale, SURFACE_KIND.luminous);
const ROOF = packVisualBlock(PALETTE_SLOTS.roofWhite, SURFACE_KIND.roofTech);

/** Un writer che conta e trattiene, per misurare il gruppo da solo. */
function countingWriter(): { writer: MicroGeometryWriter; quads: () => number } {
  let quads = 0;
  const writer: MicroGeometryWriter = {
    get remainingQuads() {
      return MAX_DETAIL_QUADS_PER_CHUNK - quads;
    },
    emitBox: (_box, _palette, hiddenFaces) => {
      let visible = 6;
      for (let face = 0; face < 6; face++) if ((hiddenFaces & (1 << face)) !== 0) visible--;
      quads += visible;
      return true;
    },
  };
  return { writer, quads: () => quads };
}

/** I quad del solo gruppo di scavo, misurati fuori da `greedyMesh`. */
function carveQuads(padded: Uint8Array, origin: readonly [number, number, number]): {
  planned: number;
  drawn: number;
} {
  const marks = new Uint8Array(PADDED_VOL);
  const plan = planCarves(padded, marks, origin, collectSurfaceCells(padded));
  const { writer, quads } = countingWriter();
  appendCarveDetail(padded, marks, writer, plan);
  return { planned: plan.quads, drawn: quads() };
}

/**
 * Una fascia d'accento nuda: `width` celle per `levels`, e nient'altro.
 *
 * **Isolata apposta.** Su una torre vera il conto degli scavi cresce con
 * l'altezza per una ragione legittima — nicchie e vani scala tirano un dado per
 * cella e per colonna — e quella crescita coprirebbe proprio la proprieta' che
 * si vuole misurare. `luminous` non e' una facciata d'uso per `facadeAt`, quindi
 * su un volume di sola fascia scatta la vetrata e nessun'altra ricetta.
 */
function accentBand(width: number, levels: number): Uint8Array {
  const padded = volume();
  for (let z = 4; z < 4 + levels; z++) {
    for (let y = 10; y < 10 + width; y++) setLocal(padded, 10, y, z, GLOW);
  }
  return padded;
}

describe('microgeometria riduttiva', () => {
  it('toglie la faccia piatta e la paga con il vano', () => {
    // Il caso minimo, e il piu' informativo: un voxel solo. `plain` non si scava
    // e mostra sei facce; `luminous` ne perde una — la +X, prima di
    // `LATERAL_FACES` — e al suo posto arrivano le cinque superfici del vano:
    // fondo, davanzale, architrave e i due stipiti.
    const flat = volume();
    setLocal(flat, 10, 10, 10, packVisualBlock(PALETTE_SLOTS.concrete, SURFACE_KIND.plain));
    const plain = greedyMesh(flat);
    expect(plain.quadCount - plain.detailQuadCount).toBe(6);
    expect(plain.detailQuadCount).toBe(0);

    const lit = volume();
    setLocal(lit, 10, 10, 10, GLOW);
    const carved = greedyMesh(lit);
    expect(carved.quadCount - carved.detailQuadCount).toBe(5);
    expect(carved.detailQuadCount).toBeGreaterThanOrEqual(5);
  });

  it('ogni quad di dettaglio guarda dove dichiara di guardare', () => {
    // **E' il test che tiene in piedi tutto il resto.** Il materiale e'
    // `FrontSide`, e la normale il fragment la legge da `uFaceNormal[aFace]`:
    // un quad con il winding girato al contrario rispetto alla faccia che
    // dichiara non e' storto, e' **invisibile**. Un vano disegnato cosi'
    // lascerebbe passare lo sguardo dentro l'edificio, e nessun conto di prismi
    // se ne accorgerebbe perche' ci sono tutti.
    //
    // Si verifica sul prodotto vettoriale del primo triangolo, che e' l'unica
    // cosa che la GPU guarda davvero.
    const mesh = greedyMesh(everyRecipe());
    const first = mesh.quadCount - mesh.detailQuadCount;
    expect(mesh.detailQuadCount).toBeGreaterThan(0);

    for (let quad = first; quad < mesh.quadCount; quad++) {
      const base = quad * 4;
      const [ax, ay, az] = corner(mesh, base);
      const [bx, by, bz] = corner(mesh, base + 1);
      const [cx, cy, cz] = corner(mesh, base + 2);
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const declared = FACE_NEIGHBOUR_OFFSETS[mesh.faces[base]];
      const dot = normal[0] * declared[0] + normal[1] * declared[1] + normal[2] * declared[2];
      if (dot <= 0) {
        expect({ quad, face: mesh.faces[base], normal, declared }).toEqual({
          quad,
          face: mesh.faces[base],
          normal: declared,
          declared,
        });
      }
    }
  });

  it('il fondo del vano e piu scuro degli stipiti, e nessuno dei due e libero', () => {
    // L'AO e' meta' del disegno: con il corner libero — che e' cio' che
    // `writeDetailBox` da' a ogni prisma additivo — una nicchia legge come un
    // adesivo. Non si verifica il valore esatto, che e' una scelta di gusto, ma
    // il **gradiente**: dentro un incavo deve esserci meno luce che fuori, e sul
    // fondo meno che sulle spalle.
    const mesh = greedyMesh(accentBand(4, 8));
    const first = mesh.quadCount - mesh.detailQuadCount;
    const ao = new Set<number>();
    for (let v = first * 4; v < mesh.quadCount * 4; v++) ao.add(mesh.shade[v] & SHADE_AO_MASK);

    expect(ao.has(1), 'nessun fondo di vano').toBe(true);
    expect(ao.has(2), 'nessuno stipite di vano').toBe(true);
  });

  it('un vano largo il doppio non costa un quad in piu', () => {
    // **La proprieta' che rende sostenibile l'intero gruppo.** Il fondo corre
    // lungo l'orizzontale e le corse si fondono, quindi allargare una fascia non
    // aggiunge niente: ne' fondo, ne' davanzale, ne' architrave, ne' stipiti. Se
    // questo numero cominciasse a muoversi vorrebbe dire che il vano e' tornato
    // a essere per cella, che e' la regressione che costa dieci volte.
    const narrow = carveQuads(accentBand(4, 8), [0, 0, 0]).drawn;
    for (const width of [6, 10, 14]) {
      expect(carveQuads(accentBand(width, 8), [0, 0, 0]).drawn).toBe(narrow);
    }
  });

  it('in altezza cresce di un quad per riga, non di cinque', () => {
    // L'altra meta', e il limite dichiarato del modello: il fondo e' l'unica
    // delle cinque superfici che dipenda dall'area, perche' una corsa e'
    // monodimensionale e la fascia e' un rettangolo. Costa **una** riga per
    // riga; le altre quattro restano dove sono. Un vano per cella ne costerebbe
    // cinque per cella, ed e' la distanza fra i due modelli che questo numero
    // sorveglia.
    const base = carveQuads(accentBand(4, 8), [0, 0, 0]).drawn;
    for (const levels of [12, 20, 26]) {
      expect(carveQuads(accentBand(4, levels), [0, 0, 0]).drawn).toBe(base + (levels - 8));
    }
  });

  it('la riserva e un limite superiore di cio che viene disegnato', () => {
    // **E' l'invariante piu' forte del gruppo, e non si vede a schermo.** Il
    // mask loop ha gia' soppresso le facce quando questo modulo scrive: se il
    // disegno costasse piu' di quanto il piano ha prenotato, il tetto dei quad
    // potrebbe troncarlo a meta' e lascerebbe un muro bucato. Vale su ogni
    // fixture, e la piu' fitta e' quella che conta.
    for (const padded of [accentBand(14, 26), everyRecipe()]) {
      const { planned, drawn } = carveQuads(padded, [0, 0, 0]);
      expect(planned).toBeLessThanOrEqual(MAX_CARVE_QUADS_PER_CHUNK);
      expect(drawn).toBeLessThanOrEqual(planned);
    }
    expect(MAX_CARVE_QUADS_PER_CHUNK).toBeLessThan(MAX_DETAIL_QUADS_PER_CHUNK);
  });

  it('non consuma il volume che riceve', () => {
    // Scavare non toglie niente al volume — e' la differenza con le coperture,
    // ed e' quello che lascia intatti cielo, bagliore e AO dei vicini. Chi
    // chiama `greedyMesh` riusa il buffer, quindi la proprieta' vale due volte.
    const padded = everyRecipe();
    const before = padded.slice();
    const marks = new Uint8Array(PADDED_VOL);
    planCarves(padded, marks, [0, 0, 0], collectSurfaceCells(padded));
    for (let i = 0; i < PADDED_VOL; i++) {
      if (padded[i] !== before[i]) expect({ i, got: padded[i] }).toEqual({ i, got: before[i] });
    }
  });

  it('al confine di chunk non mette un setto in mezzo al vano', () => {
    // La cucitura. Una fascia che prosegue oltre il confine deve **non** vedere
    // il proprio stipite: la maschera li' appartiene al chunk accanto, e senza
    // la risposta di `carveMarkFor` sull'anello ogni trentadue celle comparirebbe
    // una lama verticale dentro il vano. Si misura sul conto: una fascia che
    // arriva al bordo e prosegue costa uno stipite in meno di una che finisce.
    const stops = volume();
    const runs = volume();
    for (let y = 20; y < CHUNK; y++) {
      for (let z = 4; z < 10; z++) {
        setLocal(stops, 10, y, z, GLOW);
        setLocal(runs, 10, y, z, GLOW);
      }
    }
    // Il chunk accanto prosegue la fascia: entra nell'anello di padding.
    for (let z = 4; z < 10; z++) setLocal(runs, 10, CHUNK, z, GLOW);

    expect(carveQuads(runs, [0, 0, 0]).drawn).toBe(carveQuads(stops, [0, 0, 0]).drawn - 1);
  });

  it('e deterministico e segue le coordinate di mondo', () => {
    const here = carveQuads(everyRecipe(), [0, 0, 0]).drawn;
    expect(carveQuads(everyRecipe(), [0, 0, 0]).drawn).toBe(here);
    // Le ricette con un tiro — nicchia e vano scala — cambiano cella con
    // l'origine, quindi il conto si muove; quelle strutturali no, quindi resta
    // dello stesso ordine. Se **non** si muovesse affatto, il tiro leggerebbe
    // coordinate locali e due chunk adiacenti scaverebbero nello stesso punto.
    const far = carveQuads(everyRecipe(), [512, -256, 0]).drawn;
    expect(far).toBeGreaterThan(here / 2);
    expect(far).toBeLessThan(here * 2);
  });

  it('misura il gruppo su un chunk fitto', () => {
    const { planned, drawn } = carveQuads(everyRecipe(), [0, 0, 0]);
    console.info(`[misura] scavo su chunk fitto: ${drawn} quad disegnati, ${planned} prenotati`);
    expect(drawn).toBeGreaterThan(0);
  });
});

function corner(
  mesh: { positions: Int16Array },
  vertex: number,
): [number, number, number] {
  return [
    mesh.positions[vertex * 3],
    mesh.positions[vertex * 3 + 1],
    mesh.positions[vertex * 3 + 2],
  ];
}

/**
 * Un volume che fa scattare tutte le ricette insieme.
 *
 * Quattro corpi con la grammatica che il generatore produce davvero — ingresso a
 * terra, fascia luminosa, tetto tecnico in cima, sbalzo che copre il piano sotto
 * — piu' la superficie di retro su cui nicchie e vani scala tirano il dado.
 * Serve al test del winding, che ha senso solo se ogni forma di vano ci passa
 * dentro almeno una volta.
 */
function everyRecipe(): Uint8Array {
  const padded = volume();
  for (const [ox, oy] of [[1, 1], [17, 1], [1, 17], [17, 17]]) {
    for (let z = 0; z < CHUNK - 1; z++) {
      const band = z === CHUNK - 2
        ? SURFACE_KIND.roofTech
        : z % 6 === 0
          ? SURFACE_KIND.luminous
          : SURFACE_KIND.habitat;
      // Lo sbalzo: sopra la quota otto il corpo cresce di una cella in x, quindi
      // il piano sotto si ritrova coperto ed e' li' che nasce la loggia.
      const grown = z >= 8 ? 1 : 0;
      for (let y = oy; y < oy + 14; y++) {
        for (let x = ox - grown; x < ox + 14; x++) {
          if (x < 0) continue;
          const doorway = z < 4 && x === ox + 7 && (y === oy || y === oy + 13);
          setLocal(padded, x, y, z, packVisualBlock(
            doorway ? PALETTE_SLOTS.stone : PALETTE_SLOTS.concrete,
            doorway ? SURFACE_KIND.portal : band,
          ));
        }
      }
    }
    // Un lastrone di tetto tecnico largo, che e' quello che il vassoio chiede:
    // un calpestio, non un filo.
    for (let y = oy + 2; y < oy + 12; y++) {
      for (let x = ox + 2; x < ox + 12; x++) setLocal(padded, x, y, CHUNK - 1, ROOF);
    }
  }
  return padded;
}
