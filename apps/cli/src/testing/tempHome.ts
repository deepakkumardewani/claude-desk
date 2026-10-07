import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR_OVERRIDE_VAR, HOME_VAR, ROOT_OVERRIDE_VAR } from "../fs/claudePaths.js";

const { env } = process;

// No vitest imports on purpose: Playwright global setup imports this file directly.

const HOME_PREFIX = "claude-desk-home-";
const OVERRIDE_VARS = [ROOT_OVERRIDE_VAR, CONFIG_DIR_OVERRIDE_VAR] as const;

export type TempHome = {
  home: string;
  claudeDir: string;
  restore: () => void;
};

export type TempHomeOptions = {
  /** Directory whose contents are copied into the new home (e.g. a `.claude` tree). */
  seed?: string;
};

function restoreVar(name: string, previous: string | undefined): void {
  // Assigning undefined to process.env stores the string "undefined", so delete instead.
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

export function createTempHome(options: TempHomeOptions = {}): TempHome {
  const home = mkdtempSync(join(tmpdir(), HOME_PREFIX));
  if (options.seed) cpSync(options.seed, home, { recursive: true });

  const previousHome = env[HOME_VAR];
  const previousOverrides = OVERRIDE_VARS.map((name) => process.env[name]);
  env[HOME_VAR] = home;
  for (const name of OVERRIDE_VARS) delete process.env[name];

  let restored = false;
  return {
    home,
    claudeDir: join(home, ".claude"),
    restore() {
      if (restored) return;
      restored = true;
      restoreVar(HOME_VAR, previousHome);
      OVERRIDE_VARS.forEach((name, index) => restoreVar(name, previousOverrides[index]));
      rmSync(home, { recursive: true, force: true });
    },
  };
}
