// Single source of truth for coverage policy (spec section 4). Each package's
// vite.config.ts spreads `coverageBase` into `test.coverage`; thresholds are
// exported separately and applied once the suites are written (P2.19/P2.20).
export const COVERAGE_FLOOR = 80;

// Patterns are relative to each package root. `include` makes never-imported
// source files show up at 0% in the reports.
export const COVERAGE_EXCLUDE = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/__fixtures__/**",
  "src/usage/fixtures.ts",
  "src/testing/**",
  "**/*.d.ts",
  "src/main.tsx",
  "src/bin.ts",
  "src/main.ts",
  "scripts/**",
  "**/*.config.ts",
  "dist/**",
  "node_modules/**",
  "coverage/**",
];

export const coverageBase = {
  provider: "v8" as const,
  reporter: ["text-summary", "json-summary", "html", "lcov"],
  reportsDirectory: "coverage",
  include: ["src/**/*.{ts,tsx}"],
  exclude: COVERAGE_EXCLUDE,
};

export const coverageThresholds = {
  lines: COVERAGE_FLOOR,
  branches: COVERAGE_FLOOR,
  functions: COVERAGE_FLOOR,
  statements: COVERAGE_FLOOR,
};
