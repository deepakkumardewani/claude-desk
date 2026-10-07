import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vite-plus/test";
import { CONFIG_DIR_OVERRIDE_VAR, HOME_VAR, ROOT_OVERRIDE_VAR } from "../fs/claudePaths.js";

const { env } = process;

// Safety net: a test that forgets useTempHome writes into this throwaway dir, not the real home.
const workerHome = mkdtempSync(join(tmpdir(), "claude-desk-worker-home-"));
env[HOME_VAR] = workerHome;
delete process.env[ROOT_OVERRIDE_VAR];
delete process.env[CONFIG_DIR_OVERRIDE_VAR];

afterAll(() => {
  rmSync(workerHome, { recursive: true, force: true });
});
