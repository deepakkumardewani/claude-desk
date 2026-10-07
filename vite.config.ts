import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
  // `vp test` at the workspace root runs every package's tests with this config,
  // so it needs the same real-home safety net the package configs carry.
  test: {
    setupFiles: ["./apps/cli/src/testing/setupHome.ts"],
    globalSetup: ["./apps/cli/src/testing/globalSetupGuard.ts"],
    // Playwright specs (`e2e/**/*.spec.ts`) match vitest's default include; keep them
    // out while still allowing vitest unit tests under e2e/ (`*.test.ts`).
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**/*.spec.ts"],
  },
  run: {
    cache: true,
  },
});
