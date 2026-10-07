import { readFileSync, rmSync } from "node:fs";
import type { TempHome } from "../apps/cli/src/testing/tempHome.js";
import {
  describeDiff,
  diffSnapshots,
  snapshotRealHome,
} from "../apps/cli/src/testing/realHomeGuard.js";
import type { startStubServer } from "./fixtures/github/server.js";
import { STATE_FILE, type E2EState } from "./fixtures/helpers.js";
import type { ChildProcess } from "node:child_process";

type Runtime = {
  child: ChildProcess;
  stub: Awaited<ReturnType<typeof startStubServer>>;
  tempHome: TempHome;
};

const KILL_TIMEOUT_MS = 5_000;

function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const force = setTimeout(() => child.kill("SIGKILL"), KILL_TIMEOUT_MS);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

export default async function globalTeardown(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as E2EState;
  const runtime = (globalThis as Record<string, unknown>).__E2E_RUNTIME__ as Runtime | undefined;

  if (runtime) {
    await stopChild(runtime.child);
    await runtime.stub.close();
    runtime.tempHome.restore();
  } else {
    // Setup ran in another process: fall back to the persisted PID.
    try {
      process.kill(state.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  rmSync(STATE_FILE, { force: true });

  const diff = diffSnapshots(state.snapshot, snapshotRealHome());
  if (diff.added.length + diff.removed.length + diff.changed.length > 0) {
    throw new Error(`real home was modified during e2e:\n${describeDiff(diff)}`);
  }
}
