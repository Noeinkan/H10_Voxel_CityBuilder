import { describe, expect, it } from 'vitest';
import { formatPassTable } from '../world/buildings/passProfile';
import { growProfileCity } from './profileCity';

/**
 * Il metro della fase 6: quanto lavora e quanto costa ogni passata del ciclo.
 *
 * **Un solo comando**, `npx vitest run src/game/tickProfile.slow.test.ts`, fa
 * crescere la citta' di `profileCity.ts` e stampa la tabella. Sta fra i test
 * lenti e non in `npm run bench` perche' e' una misura sola, di un minuto: il
 * bench la ripeterebbe per farne una media, e allungherebbe di minuti un
 * comando che oggi ne costa pochi secondi.
 *
 * **Quello che il test difende sono i contatori, non i millisecondi.** Su questa
 * macchina il tempo oscilla di due volte e mezza con altri processi accesi; il
 * lavoro contato a parita' di seme no, ed e' la proprieta' senza cui nessuna
 * soglia futura potrebbe dire di no. Le soglie arrivano con le fasi 6.3 e 6.4,
 * che le abbassano: oggi la tabella dice quanto si e' sopra.
 */

const SHORT = 400;
const LONG = 1500;

describe('profilo del ciclo di crescita', () => {
  it('due citta dello stesso seme fanno lo stesso lavoro, passata per passata', () => {
    const first = growProfileCity({ ticks: SHORT }).scene;
    const second = growProfileCity({ ticks: SHORT }).scene;

    expect(second.stats.buildings).toBe(first.stats.buildings);
    const work = (readings: ReturnType<typeof first.profile.readings>) =>
      readings.map((reading) => ({ name: reading.name, calls: reading.calls, work: reading.work }));
    expect(work(second.profile.readings())).toEqual(work(first.profile.readings()));
  }, 300_000);

  it('stampa la tabella di una citta matura', () => {
    const { scene, placed, skipped } = growProfileCity({
      ticks: LONG,
      onProgress: (grown, tick) => {
        console.log(`tick ${tick}: ${grown.stats.buildings} buildings`);
      },
    });

    console.log(`\n${scene.stats.buildings} buildings, ${placed} catalysts placed` +
      (skipped.length === 0 ? '' : `, skipped: ${skipped.join('; ')}`));
    console.log(formatPassTable(scene.profile.readings(), scene.profile.counters));

    // Una citta' che non arriva a riempire il nucleo non fa fallire nessuna
    // ricerca di lotto, e la tabella misurerebbe il caso facile.
    expect(scene.stats.buildings).toBeGreaterThan(200);
    const build = scene.profile.readings().find((reading) => reading.name === 'build');
    expect(build?.work.lotSearches ?? 0).toBeGreaterThan(0);
  }, 600_000);
});
