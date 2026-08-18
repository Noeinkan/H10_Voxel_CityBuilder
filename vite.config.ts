import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // Porta fissa invece del default 5173: `strictPort` fa fallire l'avvio
  // se è occupata, così l'URL negli script e nella documentazione resta valido
  // (Vite altrimenti scivola in silenzio sulla porta libera successiva).
  server: {
    port: 8010,
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
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
  },
});
