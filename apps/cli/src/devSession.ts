import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToken } from "./auth.js";

export type DevSession = {
  token: string;
  /** True only on the first boot under a given `tsx watch` process. */
  isFirstBoot: boolean;
};

type StoredSession = { watcherPid: number; token: string };

export function devSessionPath(port: number): string {
  return join(tmpdir(), `claude-desk-dev-${port}.json`);
}

function readStoredSession(path: string): StoredSession | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      "watcherPid" in parsed &&
      "token" in parsed &&
      typeof parsed.watcherPid === "number" &&
      typeof parsed.token === "string"
    ) {
      return { watcherPid: parsed.watcherPid, token: parsed.token };
    }
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.debug(`dev session unreadable at ${path}: ${(err as Error).message}`);
    }
    return null;
  }
}

/**
 * `tsx watch` restarts this process on every source edit, but the watcher
 * (our parent) lives for the whole dev session. Keying on its pid lets a
 * restart keep the token — so open tabs stay authorized — and skip reopening
 * the browser, which otherwise spawns a new tab per edit.
 */
export function resolveDevSession(options: { port: number; watcherPid: number }): DevSession {
  const path = devSessionPath(options.port);
  const stored = readStoredSession(path);
  if (stored && stored.watcherPid === options.watcherPid) {
    return { token: stored.token, isFirstBoot: false };
  }
  const session: StoredSession = { watcherPid: options.watcherPid, token: createToken() };
  writeFileSync(path, JSON.stringify(session), { mode: 0o600 });
  return { token: session.token, isFirstBoot: true };
}
