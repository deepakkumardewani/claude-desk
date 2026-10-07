import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT, ENV_E2E_BASE_URL } from "./e2e/constants.js";

const isCI = !!process.env.CI;

/**
 * Specs that edit the shared temp HOME (R4). They run in their own single-worker project
 * that starts only after the read-only project finishes, so a spec mutating the seed can
 * never race a reader, and `--repeat-each` repeats of a spec run one after another.
 */
const MUTATING_SPECS = [
  "**/files.spec.ts",
  "**/settings-backups.spec.ts",
  "**/mcp.spec.ts",
  "**/discover.spec.ts",
];

/**
 * Playwright configuration for E2E testing against the isolated server (P3.1).
 *
 * The server is spawned and owned by globalSetup (P3.5), not webServer.
 * The temp HOME is created there; real home is never touched after snapshot.
 */
export default defineConfig({
  testDir: "./e2e",
  // Only `*.spec.ts`: vitest unit tests (`*.test.ts`) also live under e2e/.
  testMatch: "**/*.spec.ts",
  testIgnore: "**/_*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 2,
  reporter: "html",
  use: {
    baseURL: process.env[ENV_E2E_BASE_URL] || `http://127.0.0.1:${E2E_PORT}`,
    trace: "retain-on-failure",
    timezoneId: "UTC",
    locale: "en-US",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/_*.spec.ts", ...MUTATING_SPECS],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mutating",
      testMatch: MUTATING_SPECS,
      dependencies: ["chromium"],
      fullyParallel: false,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
});
