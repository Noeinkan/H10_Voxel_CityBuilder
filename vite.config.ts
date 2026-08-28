import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // Porta fissa invece del default 5173: `strictPort` fa fallire l'avvio
  // se è occupata, così l'URL negli script e nella documentazione resta valido
  // (Vite altrimenti scivola in silenzio sulla porta libera successiva).
  server: {
    port: 8020,
    strictPort: true,
  },
  preview: {
    port: 8011,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Thread invece del default a processi. I test qui sono puri — ambiente
    // `node`, niente DOM, niente GPU, nessun modulo nativo — quindi l'isolamento
    // per processo non protegge da niente che i thread non proteggano gia', e su
    // Windows avviare un processo per file di test costa piu' del file stesso.
    pool: 'threads',
    // I test di determinismo del mesher e del terreno generano mondi interi:
    // da soli costano ~3 s e ~9 s, e con i file in parallelo sforavano il
    // default di 5 s. Erano timeout da contesa di CPU, non fallimenti, e
    // scendevano e salivano a seconda di cos'altro girava sulla macchina.
    testTimeout: 30_000,
    // Un secondo separa le integrazioni deliberate dai test che stanno
    // diventando scenari: il reporter le rende visibili prima che finiscano
    // per rallentare in silenzio il percorso rapido.
    slowTestThreshold: 1_000,
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
  },
});
