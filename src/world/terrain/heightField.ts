import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { hashCoords, mulberry32 } from '../rng';
import { TERRAIN } from './config';
import {
  lakeLevelAt,
  liftSummit,
  moundRise,
  planBasins,
  planLobes,
  planMounds,
  shapeBasins,
  type Basin,
  type Lobe,
  type Mound,
} from './landform';
import { outlineRatio } from './outline';
import type { IslandShape } from './region';

/**
 * Campo di altezza continuo dell'isola.
 *
 * E' una funzione pura di `(seed, shape, x, y)`: nessuno stato accumulato,
 * nessuna dipendenza dalle colonne gia' generate. Due chiamate con lo stesso
 * seed e la stessa maschera restituiscono lo stesso float, in qualunque ordine
 * e da qualunque thread.
 *
 * Il valore e' `oceanFloor + relief * elevazione`, e l'elevazione si compone in
 * quattro passi dichiarati, ognuno con il proprio ruolo:
 *
 * 1. la **maschera** — l'unione dei lobi — dice dove c'e' isola e quanto in alto
 *    ogni pezzo puo' arrivare, e spegne il rilievo verso il bordo della region;
 * 2. il **rumore** riempie quel volume di grana, ed e' l'unica parte isotropa;
 * 3. i **rilievi** alzano qualche fianco verso il tetto, cosi' la vetta non e'
 *    per forza al centro;
 * 4. il **carattere** dell'isola espande la fascia alta, e decide quanto questo
 *    seed sia alpino invece che dolce;
 * 5. le **conche** livellano qualche sito verso un fondo sotto il pelo
 *    dell'acqua, ed e' li' che compaiono gli specchi interni.
 *
 * I primi due erano tutto quello che c'era, e da soli danno una cupola: il
 * rumore e' isotropo e la maschera e' radiale, quindi le fasce di bioma escono a
 * cerchi concentrici per costruzione. Gli altri due vivono in `landform.ts`, e
 * sono il motivo per cui due seed danno due isole diverse di *forma* e non solo
 * di dettaglio.
 */
export class HeightField {
  readonly seed: number;
  readonly shape: IslandShape;

  private readonly noises: NoiseFunction2D[] = [];
  private readonly frequencies: Float64Array;
  /** Ampiezze gia' normalizzate: sommano a 1, cosi' fbm resta in [-1, 1]. */
  private readonly weights: Float64Array;

  /** I due rumori che deformano il raggio della maschera. Indipendenti dalle ottave. */
  private readonly warp: NoiseFunction2D;
  private readonly warpDetail: NoiseFunction2D;

  /**
   * Il **carattere** di questa isola: quanto rumore a creste entra nella
   * miscela, e quanto si espande la fascia alta.
   *
   * Sono due numeri per isola, non due campi: dichiarano che *tipo* di isola e'
   * questa, non cosa succede in un punto. Escono da un flusso loro
   * (`TERRAIN.profileSalt`) perche' aggiungerne un terzo non debba rifare il
   * rumore di ogni seed.
   */
  private readonly crestMix: number;
  private readonly summitLift: number;

  /** La sagoma dichiarata, derivata una volta sola da `(seed, shape)`. */
  private readonly lobes: readonly Lobe[];
  private readonly mounds: readonly Mound[];
  private readonly basins: readonly Basin[];

  /**
   * Rilievo effettivo in voxel: il tetto assoluto, oppure quello che il raggio
   * dell'isola consente senza superare la pendenza di calibrazione.
   */
  private readonly relief: number;

  constructor(seed: number, shape: IslandShape) {
    this.seed = seed;
    this.shape = shape;
    this.relief = Math.min(
      TERRAIN.maxHeight - TERRAIN.oceanFloor,
      Math.min(shape.radiusX, shape.radiusY) * TERRAIN.maxReliefSlope,
    );

    const count = TERRAIN.octaves;
    this.frequencies = new Float64Array(count);
    this.weights = new Float64Array(count);

    let frequency = TERRAIN.baseFrequency;
    let amplitude = 1;
    let total = 0;
    for (let i = 0; i < count; i++) {
      // Ogni ottava ha il proprio generatore: il sale per indice le tiene
      // scorrelate, cosi' le creste non si sovrappongono tutte nello stesso punto.
      this.noises.push(createNoise2D(mulberry32(hashCoords(seed, i, TERRAIN.noiseSalt))));
      this.frequencies[i] = frequency;
      this.weights[i] = amplitude;
      total += amplitude;
      frequency *= TERRAIN.lacunarity;
      amplitude *= TERRAIN.persistence;
    }
    for (let i = 0; i < count; i++) this.weights[i] /= total;

    this.warp = createNoise2D(mulberry32(hashCoords(seed, TERRAIN.octaves, TERRAIN.warpSalt)));
    this.warpDetail = createNoise2D(
      mulberry32(hashCoords(seed, TERRAIN.octaves + 1, TERRAIN.warpDetailSalt)),
    );

    const profile = mulberry32(hashCoords(seed, TERRAIN.profileSalt, 0));
    this.crestMix = TERRAIN.crestMix[0] + profile() * TERRAIN.crestMix[1];
    this.summitLift = TERRAIN.summitLift[0] + profile() * TERRAIN.summitLift[1];

    // L'ordine e' una dipendenza, non una preferenza: i lobi definiscono la
    // maschera, i rilievi si appoggiano alla maschera, e le conche si cercano un
    // sito **guardando** il campo che i primi due hanno gia' prodotto. Le
    // `extensions` restano fuori da tutti e tre — un settore costiero comprato a
    // partita in corso non deve spostare una collina dall'altra parte
    // dell'isola, o le colonne gia' generate non tornerebbero piu'.
    this.lobes = planLobes(seed, shape, this.relief);
    this.mounds = planMounds(seed, shape, this.relief);
    this.basins = planBasins(seed, shape, this.relief, (x, y) => this.reliefHeightAt(x, y));
  }

  /** Somma delle ottave riportata in [0, 1]. */
  noiseAt(x: number, y: number): number {
    let sum = 0;
    for (let i = 0; i < this.noises.length; i++) {
      const f = this.frequencies[i];
      sum += this.weights[i] * this.crested(this.noises[i](x * f, y * f));
    }
    // fbm sta in [-1, 1] perche' i pesi sono normalizzati; il clamp copre solo
    // gli estremi teorici che il simplex non raggiunge mai davvero.
    return clamp01(0.5 + 0.5 * sum);
  }

  /**
   * Miscela un'ottava con la propria versione a creste.
   *
   * `-|n|` e' lo stesso rumore ripiegato sullo zero: dove il simplex attraversa
   * lo zero il ripiegamento lascia un massimo a spigolo, e quello spigolo e' una
   * **linea** e non un punto — un crinale, con i suoi contrafforti. E' l'unica
   * struttura allungata che il rumore sa produrre da solo: le colline tonde del
   * fbm sono isotrope per costruzione, e nessuna somma di ottave isotrope da' un
   * versante.
   *
   * **Il ripiegamento non e' riportato a piena ampiezza, ed e' quello che lo
   * rende gratis.** La forma canonica `1 - 2|n|` riempie di nuovo `[-1, 1]`, ma
   * quel fattore due raddoppia il gradiente: misurato, portava il dislivello
   * peggiore fra due colonne da 0,69 a 0,94, cioe' oltre il criterio di
   * continuita' che tiene in piedi il terreno a celle. Lasciato a mezza ampiezza,
   * il valore assoluto conserva il modulo del gradiente **esattamente**, quindi
   * la miscela costa zero comunque sia pesata: il crinale si paga in altezza — e
   * l'altezza la ridanno `domeBias` e `summitLift`, che si pagano dove il budget
   * c'e'.
   *
   * Il termine e' ricentrato su `crestBias`: il valore assoluto ha media
   * positiva, e senza sottrarla la miscela alzerebbe l'isola intera — costa
   * compresa — invece di cambiarne la forma.
   */
  private crested(n: number): number {
    if (this.crestMix <= 0) return n;
    const crest = 0.5 - Math.abs(n) - TERRAIN.crestBias;
    return n + this.crestMix * (crest - n);
  }

  /**
   * Maschera radiale in [0, 1]: 1 al centro dell'ellisse, 0 sul bordo.
   *
   * Coseno rialzato invece di uno smoothstep: e' C1 sia al centro sia al bordo,
   * quindi non lascia ne' una punta al centro ne' uno spigolo sulla costa, e ha
   * il gradiente massimo piu' basso a parita' di raggio.
   *
   * Il raggio viene prima deformato da due rumori lenti, altrimenti l'isola
   * resterebbe un'ellisse esatta e le fasce di bioma uscirebbero come cerchi
   * concentrici. La deformazione non puo' spingere il raggio sotto zero, quindi
   * il centro resta il centro.
   *
   * Non e' un'ellisse sola ma il **massimo** su tutte: l'isola base, i lobi che
   * ne allungano la costa e le estensioni comprate dal giocatore. Il massimo e
   * non la somma perche' due cadute che si sommano fanno una gobba sulla
   * giunzione, e perche' cosi' il gradiente dell'unione non supera mai quello
   * del pezzo piu' ripido — che e' l'unica cosa che il budget di pendenza
   * chiede.
   */
  maskAt(x: number, y: number): number {
    let mask = this.ellipseMaskAt(
      x,
      y,
      this.shape.centreX,
      this.shape.centreY,
      this.shape.radiusX,
      this.shape.radiusY,
    );
    for (const lobe of this.lobes) {
      const lobeMask = lobe.cap * this.ellipseMaskAt(
        x,
        y,
        lobe.centreX,
        lobe.centreY,
        lobe.radiusX,
        lobe.radiusY,
      );
      if (lobeMask > mask) mask = lobeMask;
    }
    for (const extension of this.shape.extensions ?? []) {
      const extensionRadius = Math.min(extension.sizeX, extension.sizeY) / 2;
      const baseRadius = Math.min(this.shape.radiusX, this.shape.radiusY);
      const reliefScale = Math.min(
        1,
        (extensionRadius / baseRadius) * TERRAIN.coastalExtensionRelief,
      );
      const extensionMask = reliefScale * this.ellipseMaskAt(
        x,
        y,
        extension.minX + extension.sizeX / 2,
        extension.minY + extension.sizeY / 2,
        extension.sizeX / 2,
        extension.sizeY / 2,
      );
      if (extensionMask > mask) mask = extensionMask;
    }
    return mask;
  }

  private ellipseMaskAt(
    x: number,
    y: number,
    centreX: number,
    centreY: number,
    radiusX: number,
    radiusY: number,
  ): number {
    const dx = (x - centreX) / radiusX;
    const dy = (y - centreY) / radiusY;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r <= 0) return 1;

    const warped =
      r *
      (1
        + TERRAIN.warpAmount * this.warp(x * TERRAIN.warpFrequency, y * TERRAIN.warpFrequency)
        + TERRAIN.warpDetail
          * this.warpDetail(x * TERRAIN.warpDetailFrequency, y * TERRAIN.warpDetailFrequency));
    if (warped >= 1) return 0;
    if (warped <= 0) return 1;
    return 0.5 * (1 + Math.cos(Math.PI * warped));
  }

  /**
   * Rilievo normalizzato in [0, 1], maschera e rilievi inclusi ma senza conche.
   *
   * Il rumore non moltiplica la maschera da solo: sotto c'e' una quota fissa
   * (`domeBias`) che la maschera porta comunque su. Senza quel termine l'isola
   * dipende troppo da dove capitano le creste del seed — un seed sfortunato da'
   * un banco piatto senza collina ne' roccia.
   *
   * I rilievi alzano **verso il tetto** invece di sommarsi: `rise` e' la
   * frazione del margine che resta fino a 1, quindi una cupola sul fianco fa una
   * collina intera e una che capita sulla vetta non sfonda `maxHeight`. Senza
   * questa composizione servirebbe un clamp, e un clamp appiattirebbe la vetta
   * proprio dove il terreno dovrebbe essere piu' mosso.
   */
  private baseElevationAt(x: number, y: number): number {
    const relief = TERRAIN.domeBias + (1 - TERRAIN.domeBias) * this.noiseAt(x, y);
    const base = relief * this.maskAt(x, y);
    const rise = moundRise(this.mounds, x, y);
    // L'espansione della vetta e' l'ultimo passo del rilievo e il primo che le
    // conche vedono: `planBasins` interroga questo campo, e un lago va cercato
    // sull'isola che ci sara' davvero, non su quella prima del carattere.
    return liftSummit(base + rise * (1 - base), this.summitLift);
  }

  /** Rilievo normalizzato in [0, 1], conche comprese. */
  elevationAt(x: number, y: number): number {
    const shaped = shapeBasins(this.baseElevationAt(x, y), this.basins, x, y);
    return shaped > 0 ? shaped : 0;
  }

  /** Altezza continua in voxel, gia' limitata a `[oceanFloor, maxHeight]`. */
  heightAt(x: number, y: number): number {
    return TERRAIN.oceanFloor + this.relief * this.elevationAt(x, y);
  }

  /**
   * Quota della superficie d'acqua sulla colonna: il livello del mare, oppure
   * quello del lago che la contiene.
   *
   * E' l'unica cosa che il generatore deve chiedere alla sagoma oltre alla
   * quota, ed e' un valore assoluto proprio perche' chi scrive l'acqua non
   * abbia bisogno di sapere che le conche esistono.
   */
  waterLevelAt(x: number, y: number): number {
    const lake = lakeLevelAt(this.basins, x, y);
    return lake > TERRAIN.seaLevel ? lake : TERRAIN.seaLevel;
  }

  /**
   * true se la colonna cade nell'influenza di una conca — specchio, sponda e
   * raccordo compresi.
   *
   * Serve a una cosa sola, ed e' il terrazzamento: una conca sta dentro sei
   * voxel fra il bordo e il fondo, e un'alzata da otto se li mangerebbe interi.
   * Terrazzata, la sponda scenderebbe sotto il proprio pelo e il lago colerebbe
   * a valle. Qui la scala resta quella fine, che e' anche il verso giusto —
   * una conca e' una vasca liscia, non una cava a gradoni.
   *
   * E' l'ellisse d'influenza e non il solo specchio: dentro `basinBank` c'e'
   * l'acqua, ma sono le colonne del **raccordo** quelle che devono restare sopra
   * il pelo, e stanno fuori da quel raggio.
   */
  inBasinAt(x: number, y: number): boolean {
    for (const basin of this.basins) {
      if (outlineRatio(basin, x, y) <= 1) return true;
    }
    return false;
  }

  /**
   * Altezza prima delle conche: e' cio' che `planBasins` interroga mentre le
   * conche non esistono ancora. Fuori dal costruttore non serve a nessuno.
   */
  private reliefHeightAt(x: number, y: number): number {
    return TERRAIN.oceanFloor + this.relief * this.baseElevationAt(x, y);
  }
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
