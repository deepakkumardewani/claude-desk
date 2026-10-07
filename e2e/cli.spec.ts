import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { createTempHome } from "../apps/cli/src/testing/tempHome.js";
import { materializeSeed, REPO_ROOT, SEED_DIR } from "./fixtures/helpers.js";
import { expect, test } from "./fixtures/index.js";

const BIN_PATH = join(REPO_ROOT, "apps/cli/dist/bin.mjs");
const STUB_BIN_DIR = join(SEED_DIR, "..", "bin");
const URL_PATTERN = /http:\/\/127\.0\.0\.1:(\d+)\/?#token=([0-9a-zA-Z]+)/;
const STARTUP_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;

type Instance = { child: ChildProcess; url: string; origin: string; port: number; token: string };

function waitForLaunchUrl(child: ChildProcess): Promise<RegExpExecArray> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`no launch URL within ${STARTUP_TIMEOUT_MS}ms:\n${output}`)),
      STARTUP_TIMEOUT_MS,
    );
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const match = URL_PATTERN.exec(output);
      if (!match) return;
      clearTimeout(timer);
      resolve(match);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`instance exited early (code ${code}):\n${output}`));
    });
  });
}

function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const killTimer = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
    child.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

let instance: Instance | undefined;
let restoreHome: (() => void) | undefined;

test.beforeAll(async () => {
  const runnerHome = process.env.HOME;
  const tempHome = createTempHome({ seed: SEED_DIR });
  // createTempHome repoints this worker's HOME; only the child may see the temp one.
  if (runnerHome === undefined) delete process.env.HOME;
  else process.env.HOME = runnerHome;
  materializeSeed(tempHome.home);
  restoreHome = tempHome.restore;

  const child = spawn(process.execPath, [BIN_PATH, "--port", "0"], {
    env: {
      HOME: tempHome.home,
      PATH: `${STUB_BIN_DIR}:/usr/bin:/bin`,
      CC_STUDIO_NO_OPEN: "1",
      E2E_NODE: process.execPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const [url, port, token] = await waitForLaunchUrl(child);
    instance = { child, url, port: Number(port), token, origin: `http://127.0.0.1:${port}` };
  } catch (error) {
    await stop(child);
    throw error;
  }
});

test.afterAll(async () => {
  if (instance) await stop(instance.child);
  restoreHome?.();
});

test.describe("CLI Server", () => {
  test("Instance prints a tokenized launch URL", () => {
    expect(instance?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?#token=[0-9a-zA-Z]+$/);
    expect(instance?.port).toBeGreaterThan(0);
  });

  test("Instance serves the static UI", async () => {
    const res = await fetch(`${instance!.origin}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toMatch(/<script[^>]+src=/);
  });

  test("Unauthenticated API requests are rejected", async () => {
    const res = await fetch(`${instance!.origin}/api/health`);
    expect(res.status).toBe(401);
  });

  test("Authenticated API requests succeed", async () => {
    const res = await fetch(`${instance!.origin}/api/health`, {
      headers: { authorization: `Bearer ${instance!.token}` },
    });
    expect(res.status).toBe(200);
  });
});
