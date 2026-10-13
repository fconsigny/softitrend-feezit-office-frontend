import { defineConfig } from '@playwright/test';
// Real servers are started/stopped by the isolated parent integration runner.
export default defineConfig({
  testDir: './tests/integration', workers: 1, reporter: 'list',
  use: {baseURL: 'http://127.0.0.1:3011', browserName: 'chromium', locale:'fr-FR'},
});
