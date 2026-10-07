import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Snapshot } from "../../apps/cli/src/testing/realHomeGuard.js";
import { E2E_STUB_PORT, ENV_E2E_BASE_URL, ENV_E2E_TOKEN, STUB_HOST } from "../constants.js";
import { LOG_PATH } from "./github/server.js";

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, "../..");
export const SEED_DIR = join(here, "claude-home");

/** Seed files contain this token wherever an absolute temp-HOME path is needed. */
export const HOME_PLACEHOLDER = "__E2E_HOME__";

const TEMPLATED_EXTENSIONS = [".json", ".jsonl"];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Replace the home placeholder in every JSON/JSONL file under `home`. */
export function materializeSeed(home: string): void {
  for (const file of walk(home)) {
    if (!TEMPLATED_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
    const content = readFileSync(file, "utf8");
    if (!content.includes(HOME_PLACEHOLDER)) continue;
    writeFileSync(file, content.replaceAll(HOME_PLACEHOLDER, home));
  }
}

const SOURCE_ROOTS = ["apps/cli/src", "apps/web/src", "packages/schema/src"];
const NON_PRODUCT = /(\.test\.[tj]sx?$|[\\/]testing[\\/]|[\\/]__fixtures__[\\/])/;

/** Newest mtime (ms) among product source files that feed the built CLI. */
export function newestSourceMtimeMs(): number {
  let newest = 0;
  for (const root of SOURCE_ROOTS) {
    for (const file of walk(join(REPO_ROOT, root))) {
      if (NON_PRODUCT.test(file)) continue;
      newest = Math.max(newest, statSync(file).mtimeMs);
    }
  }
  return newest;
}

/** Where global-setup persists what teardown (and `resetHome`) need. */
export const STATE_FILE = join(tmpdir(), "claude-desk-e2e-state.json");

export type E2EState = { home: string; pid: number; snapshot: Snapshot };

export function readState(): E2EState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as E2EState;
}

/** Temp HOME the isolated server runs on. */
export function e2eHome(): string {
  return readState().home;
}

/** Re-copy the pristine seed into the temp HOME for specs that mutate it. */
export function resetHome(): void {
  const home = e2eHome();
  for (const entry of readdirSync(home))
    rmSync(join(home, entry), { recursive: true, force: true });
  cpSync(SEED_DIR, home, { recursive: true });
  materializeSeed(home);
}

export function e2eToken(): string {
  const token = process.env[ENV_E2E_TOKEN];
  if (!token) throw new Error(`${ENV_E2E_TOKEN} is not set; did global-setup run?`);
  return token;
}

export function e2eBaseUrl(): string {
  const base = process.env[ENV_E2E_BASE_URL];
  if (!base) throw new Error(`${ENV_E2E_BASE_URL} is not set; did global-setup run?`);
  return base;
}

/** Authenticated fetch against the isolated server's API. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${e2eToken()}`);
  return fetch(`${e2eBaseUrl()}${path}`, { ...init, headers });
}

export type StubLogEntry = { method: string; path: string; status: number; matched: boolean };

/** Requests the GitHub/skills.sh stub has seen so far. */
export async function stubLog(): Promise<StubLogEntry[]> {
  const res = await fetch(`http://${STUB_HOST}:${E2E_STUB_PORT}${LOG_PATH}`);
  return (await res.json()) as StubLogEntry[];
}
