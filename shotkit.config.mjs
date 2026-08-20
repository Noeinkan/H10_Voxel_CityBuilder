export default {
  baseUrl: 'http://localhost:8020',
  server: { command: 'npm run dev', readyUrl: 'http://localhost:8020/', timeoutMs: 120000 },
  outDir: '.shots',
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  settleMs: 2000,
  mask: [],
  shots: [
    {
      name: '00-probe',
      path: '/',
      waitFor: '.game-hud',
      settleMs: 20000,
      shows: 'probe'
    }
  ]
};
