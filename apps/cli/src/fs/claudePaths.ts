import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The single place that reads HOME, CLAUDE_ROOT and CLAUDE_CONFIG_DIR.
 * Every function evaluates per call (never at import) so tests can redirect
 * the home dir after modules load.
 */

/** Env var names, exported so test helpers can redirect them without spelling them out. */
export const HOME_VAR = "HOME";
export const ROOT_OVERRIDE_VAR = "CLAUDE_ROOT";
export const CONFIG_DIR_OVERRIDE_VAR = "CLAUDE_CONFIG_DIR";

export function claudeHome(): string {
  return homedir();
}

/** The `.claude` dir; `CLAUDE_ROOT` overrides it. */
export function claudeRoot(): string {
  return resolve(process.env.CLAUDE_ROOT ?? join(claudeHome(), ".claude"));
}

/** `.claude.json`; `CLAUDE_CONFIG_DIR` overrides the dir that holds it. */
export function claudeJsonPath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  return join(configDir || claudeHome(), ".claude.json");
}

export function projectsDir(): string {
  return join(claudeRoot(), "projects");
}

/** Home prefix used to label paths in the UI (e.g. grouping skills as "User"). */
export function homeForDisplay(): string {
  return claudeHome();
}
