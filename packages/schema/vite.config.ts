import { defineConfig } from "vite-plus";
import { coverageBase, coverageThresholds } from "../../vitest.shared.ts";

export default defineConfig({
  pack: {
    dts: true,
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  test: {
    coverage: { ...coverageBase, thresholds: coverageThresholds },
    globalSetup: ["../../apps/cli/src/testing/globalSetupGuard.ts"],
  },
});
