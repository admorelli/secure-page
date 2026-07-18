import { defineConfig, devices } from "@playwright/test";

// E2E config for the Secure Page PWA.
// - The app is served under the GitHub Pages subpath /secure-page/, so
//   baseURL includes it (verified: / -> 302, /secure-page/ -> 200).
// - webServer builds + runs `vite preview`; Playwright waits for readiness,
//   then shuts it down after the run.
// - Each test gets an isolated context (fresh IndexedDB) via storageState:
//   undefined + a beforeEach that clears IndexedDB.

const PORT = 4399;
const BASE_URL = `http://localhost:${PORT}/secure-page/`;

export default defineConfig({
  testDir: "./e2e",
  tsconfig: "./tsconfig.e2e.json",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Isolate origins so IndexedDB from one test never leaks into another.
    contextOptions: { baseURL: BASE_URL },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
