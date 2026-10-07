#!/usr/bin/env node
// Fails when scenario titles in e2e/scenarios/*.feature.md and test("...") titles in
// e2e/*.spec.ts drift apart: every scenario needs a test and every test a scenario.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const E2E_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCENARIOS_DIR = join(E2E_DIR, "scenarios");
// Infrastructure check of the harness itself, not a user-facing scenario.
const UNSCENARIOED_SPECS = new Set(["smoke.spec.ts"]);
const SCENARIO_HEADING = /^## Scenario: (.+?)\s*$/gm;
const TEST_CALL = /\btest\(\s*"((?:[^"\\]|\\.)*)"/g;

function collect(files, pattern, dir) {
  const found = new Map();
  for (const file of files) {
    for (const match of readFileSync(join(dir, file), "utf8").matchAll(pattern)) {
      const title = match[1];
      found.set(title, [...(found.get(title) ?? []), file]);
    }
  }
  return found;
}

const scenarioFiles = readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".feature.md"));
const specFiles = readdirSync(E2E_DIR).filter(
  (f) => f.endsWith(".spec.ts") && !f.startsWith("_") && !UNSCENARIOED_SPECS.has(f),
);
const scenarios = collect(scenarioFiles, SCENARIO_HEADING, SCENARIOS_DIR);
const tests = collect(specFiles, TEST_CALL, E2E_DIR);

const problems = [];
for (const [title, files] of [...scenarios, ...tests]) {
  if (files.length > 1) problems.push(`duplicate title "${title}" in ${files.join(", ")}`);
}
for (const [title, files] of scenarios) {
  if (!tests.has(title)) problems.push(`scenario without a test: "${title}" (${files[0]})`);
}
for (const [title, files] of tests) {
  if (!scenarios.has(title)) problems.push(`test without a scenario: "${title}" (${files[0]})`);
}

if (problems.length > 0) {
  console.error(problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
console.log(`ok: ${scenarios.size} scenarios match ${tests.size} tests`);
