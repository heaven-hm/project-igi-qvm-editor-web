import {defineConfig, devices} from '@playwright/test';
const deployed = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: './tests/e2e', timeout: 60000, expect: {timeout: 20000},
  fullyParallel: true, workers: 3, retries: process.env.CI ? 1 : 0,
  outputDir:'test-results/artifacts',
  reporter: [['list'], ['html', {outputFolder: 'test-results/report', open: 'never'}], ['json', {outputFile:'test-results/results.json'}]],
  use: {baseURL: deployed || 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot:'only-on-failure', acceptDownloads:true},
  projects: [{name:'chromium', use:{...devices['Desktop Chrome']}}, {name:'webkit', use:{...devices['Desktop Safari']}}, {name:'mobile', use:{...devices['Pixel 7'], defaultBrowserType:'chromium'}}, {name:'iphone',use:{...devices['iPhone 13']}}],
  webServer: deployed ? undefined : {command:'npm --prefix web run dev -- --port 4173 --strictPort', url:'http://127.0.0.1:4173', reuseExistingServer:!process.env.CI, timeout:60000},
});
