import { defineConfig } from "vite-plus";
import { coverageBase, coverageThresholds } from "../../vitest.shared.ts";

export default defineConfig({
  pack: {
    entry: ["src/bin.ts"],
    dts: false,
    fixedExtension: true,
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
    setupFiles: ["./src/testing/setupHome.ts"],
    globalSetup: ["./src/testing/globalSetupGuard.ts"],
  },
});
