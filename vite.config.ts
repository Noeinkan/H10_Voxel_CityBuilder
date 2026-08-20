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
    // I test di determinismo del mesher e del terreno generano mondi interi:
    // da soli costano ~3 s e ~9 s, e con i file in parallelo sforavano il
    // default di 5 s. Erano timeout da contesa di CPU, non fallimenti, e
    // scendevano e salivano a seconda di cos'altro girava sulla macchina.
    testTimeout: 30_000,
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
  },
});
