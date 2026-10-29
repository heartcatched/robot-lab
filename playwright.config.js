import { defineConfig } from '@playwright/test';
const baseURL=(process.env.BASE_URL||'http://127.0.0.1:4173/robot-lab/').replace(/\/?$/,'/');
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 6000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, headless: true, reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects:[{name:'chromium',use:{browserName:'chromium'},testIgnore:'**/compat.spec.js'},{name:'webkit',use:{browserName:'webkit'},testMatch:'**/compat.spec.js'}],
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run dev', env:{BASE_PATH:'/robot-lab/'},url:baseURL, reuseExistingServer: true },
});
