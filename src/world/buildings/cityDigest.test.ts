import { describe, expect, it } from 'vitest';
import { BUILDING_CLASS, addCatalyst, createSimState, tick } from '../../sim';
import { testTerrain } from '../../sim/testTerrain';
import { VoxelWorld } from '../VoxelWorld';
import { Builder } from './Builder';
import type { BuildingRecord } from './BuildingRegistry';
import { BUILDER } from './config';

/**
 * L'impronta digitale di una citta' intera, fissata su codice funzionante.
 *
 * E' la sorella di `generateDigest.test.ts` un piano piu' su: quella fissa la
 * **sagoma** di un edificio a parita' di seme, questa fissa **quali edifici**
 * nascono, dove, di che livello e in che ordine. Sono due domande diverse, e
 * nessuna delle due copre l'altra — la grammatica puo' restare identica mentre
 * la ricerca del lotto elegge un'altra colonna, ed e' esattamente il modo in cui
 * un'ottimizzazione della ricerca cambia la citta' senza rompere nessun test.
 *
 * **Serve a dire di no a se stessi.** Ogni intervento sul percorso caldo di
 * `findLot` — un memo, un salto di isolato, un raggio piu' stretto — nasce con
 * la promessa «non cambia la citta' generata». Finche' quella promessa non e' un
 * numero, e' un'opinione.
 *
 * Calcolata su questo codice. Se cade dopo un cambiamento che si dichiarava
 * neutro, ha torto il cambiamento; se cade dopo uno dichiarato — il raggio di
 * ricerca che si stringe, per dirne uno — si rigenera e si dice nel CHANGELOG
 * che le partite salvate non tornano piu' uguali.
 *
 * **Rigenerata con l'arretramento del tessuto.** Il valore di prima
 * (`e99c7ba7`) reggeva una citta' che si saldava su tutti e quattro i lati e
 * costruiva sopra la carreggiata; da `BUILDER.backSetback` e dal divieto di
 * prendere suolo pubblico, `findLot` elegge altre colonne — che e' proprio il
 * caso che questa impronta esiste per rendere visibile. Nello stesso intervallo
 * si e' mosso anche il repertorio delle tipologie, e la firma porta
 * `record.typology`: l'impronta nuova tiene dentro tutte e due le cause.
 */

/**
 * Hash FNV-1a a 32 bit dei campi che identificano un edificio.
 *
 * Gli stessi criteri di `stampDigest`: un hash e non un elenco, perche' qui si
 * confronta lo stesso ingresso con se stesso nel tempo. Entra tutto cio' che una
 * ricerca di lotto diversa sposterebbe — la colonna, la quota, l'impronta, il
 * fronte, la fila — e nient'altro.
 */
function cityDigest(records: readonly BuildingRecord[]): string {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  const mixInt = (value: number): void => {
    mix(value);
    mix(value >>> 8);
    mix(value >>> 16);
  };
  const mixText = (value: string | undefined): void => {
    if (value === undefined) {
      mix(0xff);
      return;
    }
    for (let i = 0; i < value.length; i++) mix(value.charCodeAt(i));
  };

  // L'ordine dei record e' quello di inserimento, ed e' parte dell'impronta:
  // due citta' con gli stessi edifici costruiti in un altro ordine sono due
  // partite diverse, e il registry le distingue gia' negli id.
  for (const record of records) {
    mixInt(record.x);
    mixInt(record.y);
    mixInt(record.baseZ);
    mixInt(record.footprint);
    mixInt(record.height);
    mixInt(record.class);
    mixInt(record.level);
    mixInt(record.facing ?? -1);
    mixInt(record.cluster ?? -1);
    mixInt(record.overhang ?? 0);
    mixInt(record.baseBand ?? 0);
    mixText(record.typology);
    mixText(record.style);
  }
  return hash.toString(16).padStart(8, '0');
}

/** Isola, catalizzatore e numero di infornate: cambiarli cambia l'impronta. */
const SEED = 1337;
const BUILDS = 80;

function matureCity(): { readonly records: readonly BuildingRecord[]; readonly placed: number } {
  const world = new VoxelWorld();
  const terrain = testTerrain({ chunksX: 4, chunksY: 4, height: 24 });
  const builder = new Builder(world, terrain, SEED);

  let state = createSimState();
  state = addCatalyst(state, {
    x: 64,
    y: 64,
    class: BUILDING_CLASS.residential,
    strength: 255,
    radius: 48,
  });

  for (let i = 0; i < BUILDS * BUILDER.ticksPerBuild; i++) {
    state = tick(state, terrain);
    state = builder.onTick(state);
    while (builder.stats.growing > 0) builder.step();
  }

  return { records: [...builder.registry.all], placed: builder.stats.placed };
}

describe('impronta digitale della citta', () => {
  it('la citta di questo seme e quella fissata', () => {
    const { records, placed } = matureCity();

    // Se il nucleo non si satura la ricerca del lotto non fallisce mai, e
    // l'impronta smette di coprire proprio il caso che deve difendere.
    expect(placed).toBeGreaterThan(100);
    expect(cityDigest(records)).toBe('15ab8462');
  }, 120_000);

  it('l hash distingue due citta diverse', () => {
    // Una rete che risponde sempre lo stesso non e' una rete: basta spostare un
    // edificio di una colonna perche' l'impronta cambi.
    const { records } = matureCity();
    const moved = records.map((record, i) =>
      i === 0 ? { ...record, x: record.x + 1 } : record);
    expect(cityDigest(moved)).not.toBe(cityDigest(records));
  }, 120_000);
});
