import { rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { devSessionPath, resolveDevSession } from "./devSession.js";

const TEST_PORT = 59_871;
const WATCHER_PID = 4242;
const OTHER_WATCHER_PID = 4343;

afterEach(() => {
  rmSync(devSessionPath(TEST_PORT), { force: true });
});

describe("resolveDevSession", () => {
  it("treats the first boot under a watcher as first boot with a fresh token", () => {
    const session = resolveDevSession({ port: TEST_PORT, watcherPid: WATCHER_PID });
    expect(session.isFirstBoot).toBe(true);
    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reuses the token and skips reopening on a watch restart", () => {
    const first = resolveDevSession({ port: TEST_PORT, watcherPid: WATCHER_PID });
    const restart = resolveDevSession({ port: TEST_PORT, watcherPid: WATCHER_PID });
    expect(restart).toEqual({ token: first.token, isFirstBoot: false });
  });

  it("starts a new session when a new dev watcher launches", () => {
    const first = resolveDevSession({ port: TEST_PORT, watcherPid: WATCHER_PID });
    const next = resolveDevSession({ port: TEST_PORT, watcherPid: OTHER_WATCHER_PID });
    expect(next.isFirstBoot).toBe(true);
    expect(next.token).not.toBe(first.token);
  });

  it("starts fresh when the stored session is corrupt", () => {
    writeFileSync(devSessionPath(TEST_PORT), "not json");
    const session = resolveDevSession({ port: TEST_PORT, watcherPid: WATCHER_PID });
    expect(session.isFirstBoot).toBe(true);
  });
});
