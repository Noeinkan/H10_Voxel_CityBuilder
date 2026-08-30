import { describe, expect, it } from 'vitest';
import { SUNKEN, SUNKEN_ARCOLOGY_RECIPES } from '../arcology/config';
import { surveySunkenSite } from '../arcology/depth';
import { generateIsland } from '../terrain/IslandGenerator';
import { VoxelWorld } from '../VoxelWorld';

/**
 * L'isola offre davvero la roccia e il sedime che le ricette interrate chiedono?
 *
 * **E' il test che ha riscritto il catalogo due volte, e serve che resti.** Il
 * piano originale era tarato su `TERRAIN.maxHeight`, che vale 80: le tre
 * profondita' previste erano 44, 36 e 24, e due ricette su tre non sarebbero
 * **mai** nate. Non sarebbero state scartate con un errore: semplicemente non
 * sarebbero comparse, con tutta la suite pura verde.
 *
 * **La seconda volta l'errore era qui dentro.** La misura che corresse il piano
 * girava su una region da **256**, com'era scritto in questo file; ma
 * `TERRAIN_SIZE` in `main.ts` vale **512**, e il rilievo non e' indipendente dal
 * lato — `TERRAIN.maxReliefSlope` lo limita a `0,3 * raggio`. La fixture aveva
 * percio' meta' del rilievo del mondo vero (picco 32-36 contro 52-60), e il
 * catalogo che ne uscì era una famiglia grande la meta' di quanto il terreno
 * permettesse: pozzi da venti voxel di lato accanto a torri da trecentoventi.
 * **La region di questo file e' quella del gioco, e non va rimpicciolita per
 * farlo girare piu' in fretta**: sarebbe di nuovo la stessa misura sbagliata.
 *
 * Gira su tre seed perche' uno solo non basta: le isole differiscono di dieci
 * quote di picco fra loro, e tarare sulla piu' alta produrrebbe una famiglia che
 * compare su due isole su tre.
 */

const SEEDS = [1337, 4242, 9001] as const;
/** La region del gioco: `TERRAIN_SIZE` in `main.ts`. Vedi sopra. */
const REGION = { minX: 0, minY: 0, sizeX: 512, sizeY: 512 };
/** Passo del campionamento: le finestre si sovrappongono, non serve ogni colonna. */
const STRIDE = 8;

/**
 * Quante finestre grandi come l'ingombro della ricetta ne reggono lo scavo.
 *
 * Si chiede a `surveySunkenSite`, cioe' alla stessa funzione del driver, invece
 * di rifare il conto: il contorno asciutto si legge sul **bioma** e non sul
 * confronto fra quota e specchio — un pozzo scende sotto il livello del mare per
 * costruzione, quindi «piu' bassa dell'acqua» e' vero per meta' isola e non dice
 * niente.
 */
function sitesFor(
  map: Parameters<typeof surveySunkenSite>[0],
  sizeX: number,
  sizeY: number,
  depth: number,
): number {
  let count = 0;
  for (let y = 0; y + sizeY <= REGION.sizeY; y += STRIDE) {
    for (let x = 0; x + sizeX <= REGION.sizeX; x += STRIDE) {
      const site = surveySunkenSite(map, x, y, sizeX, sizeY);
      if (site.dryRim && site.depth >= depth) count++;
    }
  }
  return count;
}

describe('la roccia che le ricette interrate chiedono', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: ogni forma interrata ha dove nascere`, () => {
      const world = new VoxelWorld();
      const { map } = generateIsland(world, seed, REGION);

      for (const recipe of SUNKEN_ARCOLOGY_RECIPES) {
        const [sizeX, sizeY] = recipe.span;
        const depth = recipe.sunken!.depth;
        const sites = sitesFor(map, sizeX, sizeY, depth);
        // Non «almeno uno»: un solo sito su tutta l'isola verrebbe scartato dalla
        // prima collisione o dal primo cluster non sgomberabile, e la ricetta
        // resterebbe teorica. Cento e' un margine, non una soglia fine — misurato,
        // la piu' esigente delle tre ne ha fra 159 e 243.
        expect(sites, `${recipe.kind} (${sizeX}x${sizeY}, ${depth} quote) sul seed ${seed}`)
          .toBeGreaterThan(100);
      }
    }, 120000);
  }

  it('la forma meno esigente entra molto piu spesso delle altre', () => {
    // **E' il mestiere che il catalogo le affida.** `arcologyForBlock` scorre in
    // avanti quando la forma sorteggiata non entra: senza una ricetta molto piu'
    // facile delle altre quello scorrimento non avrebbe dove finire, e un isolato
    // buono si perderebbe per il solo sorteggio.
    const world = new VoxelWorld();
    const { map } = generateIsland(world, SEEDS[0], REGION);

    const counts = SUNKEN_ARCOLOGY_RECIPES.map((recipe) => sitesFor(
      map, recipe.span[0], recipe.span[1], recipe.sunken!.depth,
    ));
    const easiest = Math.max(...counts);
    const hardest = Math.min(...counts);
    expect(easiest).toBeGreaterThan(hardest * 2);
  }, 120000);

  it('il tetto del catalogo resta sotto quello misurato', () => {
    const deepest = Math.max(...SUNKEN_ARCOLOGY_RECIPES.map((r) => r.sunken!.depth));
    expect(deepest).toBeLessThanOrEqual(SUNKEN.maxDepth);
  });
});

describe('surveySunkenSite', () => {
  it('legge il massimo dell impronta, e il minimo per il rimo a valle', () => {
    // Il piano finito e' il **massimo**: una piazza alla media lascerebbe il
    // terreno a monte a coprire il proprio parapetto.
    const probe = {
      heightAt: (x: number, y: number) => (x === 0 && y === 0 ? 40 : 30),
      biomeAt: () => 1,
    };
    const site = surveySunkenSite(probe, 0, 0, 4, 4);
    expect(site.padZ).toBe(40);
    expect(site.footZ).toBe(30);
    expect(site.depth).toBe(40 - SUNKEN.floorZ);
    expect(site.dryRim).toBe(true);
  });

  it('vede l acqua che arriva vicino al bordo, non solo dentro l impronta', () => {
    // Il pozzo scende sotto il livello del mare: la roccia attorno e' tutto cio'
    // che lo tiene asciutto, e una colonna bagnata appena fuori dall'ingombro
    // conta quanto una dentro.
    const wetAt = (wx: number, wy: number) => ({
      heightAt: () => 30,
      biomeAt: (x: number, y: number) => (x === wx && y === wy ? 0 : 1),
    });
    expect(surveySunkenSite(wetAt(2, 2), 0, 0, 4, 4).dryRim).toBe(false);
    expect(surveySunkenSite(wetAt(-1, 2), 0, 0, 4, 4).dryRim).toBe(false);
    expect(surveySunkenSite(wetAt(4 + SUNKEN.dryRim, 2), 0, 0, 4, 4).dryRim).toBe(true);
  });
});
