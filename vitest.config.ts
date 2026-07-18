import { defineConfig } from "vitest/config";

// Scope unit tests to src/ so the Playwright E2E specs (e2e/*.spec.ts) are
// not collected by vitest (they require the @playwright/test runner).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
