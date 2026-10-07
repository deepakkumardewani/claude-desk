import { spawn } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotRealHome } from "../apps/cli/src/testing/realHomeGuard.js";
import { createTempHome } from "../apps/cli/src/testing/tempHome.js";
import {
  E2E_PORT,
  E2E_STUB_PORT,
  ENV_E2E_BASE_URL,
  ENV_E2E_TOKEN,
  STUB_HOST,
} from "./constants.js";
import { stubEnv } from "./fixtures/github/payloads.js";
import { startStubServer } from "./fixtures/github/server.js";
import {
  materializeSeed,
  newestSourceMtimeMs,
  REPO_ROOT,
  SEED_DIR,
  STATE_FILE,
  type E2EState,
} from "./fixtures/helpers.js";

const BIN_PATH = join(REPO_ROOT, "apps/cli/dist/bin.mjs");
const TOKEN_PATTERN = /#token=([0-9a-zA-Z]+)/;
const STARTUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;
/** Stub `claude` first, then system dirs only: no real binary can be reached (F6). */
const STUB_BIN_DIR = join(SEED_DIR, "..", "bin");
const MINIMAL_PATH = `${STUB_BIN_DIR}:/usr/bin:/bin`;

function assertDistIsFresh(): void {
  const distMtime = statSync(BIN_PATH).mtimeMs; // throws ENOENT when never built
  if (distMtime < newestSourceMtimeMs()) {
    throw new Error("apps/cli/dist is older than its sources. Run `vp run -r build` first.");
  }
}

function waitForToken(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`server printed no token within ${STARTUP_TIMEOUT_MS}ms:\n${output}`)),
      STARTUP_TIMEOUT_MS,
    );
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = TOKEN_PATTERN.exec(output);
      if (!match) return;
      clearTimeout(timer);
      resolve(match[1]);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code ${code}):\n${output}`));
    });
  });
}

async function waitForHealth(baseUrl: string, token: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) return;
    } catch {
      // server not accepting connections yet
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("server did not become healthy in time");
}

export default async function globalSetup(): Promise<void> {
  assertDistIsFresh();

  // Snapshot first: nothing below may touch the real home.
  const snapshot = snapshotRealHome();
  const runnerHome = process.env.HOME;
  const tempHome = createTempHome({ seed: SEED_DIR });
  // createTempHome repoints this process's HOME; workers inherit it and Playwright
  // resolves its browser cache from HOME. Only the server child needs the temp HOME.
  if (runnerHome === undefined) delete process.env.HOME;
  else process.env.HOME = runnerHome;
  materializeSeed(tempHome.home);
  mkdirSync(join(tempHome.home, "workspace"), { recursive: true });

  const stub = await startStubServer({ port: E2E_STUB_PORT });
  const baseUrl = `http://${STUB_HOST}:${E2E_PORT}`;

  const child = spawn(process.execPath, [BIN_PATH, "--port", String(E2E_PORT)], {
    env: {
      HOME: tempHome.home,
      PATH: MINIMAL_PATH,
      CC_STUDIO_NO_OPEN: "1",
      GITHUB_TOKEN: "test-token",
      E2E_NODE: process.execPath,
      // Usage buckets by local date; pin it so seeded totals never depend on the host zone.
      TZ: "UTC",
      ...stubEnv(E2E_STUB_PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const token = await waitForToken(child);
    await waitForHealth(baseUrl, token);
    process.env[ENV_E2E_TOKEN] = token;
    process.env[ENV_E2E_BASE_URL] = baseUrl;
  } catch (error) {
    child.kill("SIGTERM");
    await stub.close();
    tempHome.restore();
    throw error;
  }

  const state: E2EState = { home: tempHome.home, pid: child.pid!, snapshot };
  writeFileSync(STATE_FILE, JSON.stringify(state));
  (globalThis as Record<string, unknown>).__E2E_RUNTIME__ = { child, stub, tempHome };
}
