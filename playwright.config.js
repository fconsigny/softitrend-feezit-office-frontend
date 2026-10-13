import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3011",
    browserName: "chromium",
    locale: "fr-FR",
  },
  webServer: {
    command: "bun --bun run dev",
    url: "http://127.0.0.1:3011",
    reuseExistingServer: true,
  },
});
