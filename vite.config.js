import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3011,
    strictPort: true,
    proxy: { "/office-api": "http://127.0.0.1:8091" },
  },
  preview: { host: "127.0.0.1", port: 3011, strictPort: true },
  test: {
    include: ["tests/**/*.test.{js,jsx}"],
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    pool: "threads",
    maxWorkers: 1,
    minWorkers: 1,
  },
});
