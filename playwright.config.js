import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 6000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.BASE_URL || 'http://127.0.0.1:4173', headless: true, reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run dev', port: 4173, reuseExistingServer: true },
});
