import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";

/**
 * Read-only guard: proves a test run left the developer's real Claude config untouched.
 * The home comes from the OS user record, never the HOME env var, because tests redirect HOME.
 */

const CLAUDE_DIR = ".claude";
const CLAUDE_JSON = ".claude.json";
const CLAUDE_SIBLING_PREFIX = ".claude-";
const HASH_SIZE_LIMIT_BYTES = 1024 * 1024;
const PROJECTS_PREFIX = `${CLAUDE_DIR}/projects/`;
const TRANSCRIPT_SUFFIX = ".jsonl";

/**
 * Transient state the developer's own live Claude Code session writes while tests run.
 * Paths are relative to the home dir; a trailing slash means "everything beneath".
 * S1 (user-approved): the whole tree is compared except these entries. Empty the list to compare everything.
 */
export const EXCLUDED_HOME_PATHS: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: ".claude.json",
    reason: "the live session rewrites its global state and project stats continuously",
  },
  { path: ".claude/history.jsonl", reason: "prompt history is appended on every live prompt" },
  { path: ".claude/sessions/", reason: "live session registry is rewritten while a session runs" },
  { path: ".claude/todos/", reason: "the live session's todo lists are rewritten continuously" },
  { path: ".claude/statsig/", reason: "feature-flag cache refreshed in the background" },
  { path: ".claude/shell-snapshots/", reason: "a snapshot file is written per live shell" },
  { path: ".claude/debug/", reason: "the live session appends debug logs" },
  {
    path: ".claude/telemetry/",
    reason: "telemetry events are queued and flushed by the live session",
  },
  {
    path: ".claude/session-env/",
    reason: "a per-session env dir is created for each live session",
  },
  {
    path: ".claude/file-history/",
    reason: "file-edit checkpoints are written by the live session",
  },
  { path: ".claude/jobs/", reason: "background job state is written by the live session" },
  {
    path: ".claude/backups/",
    reason: "Claude Code rotates timestamped .claude.json backups while a session runs",
  },
  {
    path: ".claude/context-mode/",
    reason: "the context-mode plugin rewrites per-process stats files during a live session",
  },
  { path: ".claude/daemon/", reason: "the background daemon rewrites its state files" },
];

export type SnapshotEntry = { size: number; sha256?: string; mtimeMs?: number };
export type Snapshot = Record<string, SnapshotEntry>;
export type SnapshotDiff = { added: string[]; removed: string[]; changed: string[] };

function isExcluded(relative: string): boolean {
  return EXCLUDED_HOME_PATHS.some(({ path }) =>
    path.endsWith("/") ? relative.startsWith(path) : relative === path,
  );
}

function describeFile(path: string, size: number, mtimeMs: number): SnapshotEntry {
  if (size >= HASH_SIZE_LIMIT_BYTES) return { size, mtimeMs };
  try {
    return { size, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
  } catch {
    // Unreadable (permissions or a race with the live session): fall back to metadata.
    return { size, mtimeMs };
  }
}

function walk(absolute: string, relative: string, into: Snapshot): void {
  if (isExcluded(relative)) return;
  let stats;
  try {
    stats = lstatSync(absolute);
  } catch {
    return;
  }
  if (stats.isDirectory()) {
    let names: string[];
    try {
      names = readdirSync(absolute);
    } catch {
      return;
    }
    for (const name of names) walk(join(absolute, name), `${relative}/${name}`, into);
    return;
  }
  // Symlinks are recorded by their own metadata and never followed out of the tree.
  into[relative] = stats.isFile()
    ? describeFile(absolute, stats.size, stats.mtimeMs)
    : { size: stats.size, mtimeMs: stats.mtimeMs };
}

export function snapshotRealHome(options: { home?: string } = {}): Snapshot {
  const home = options.home ?? userInfo().homedir;
  const snapshot: Snapshot = {};
  let names: string[] = [];
  try {
    names = readdirSync(home);
  } catch {
    return snapshot;
  }
  for (const name of names) {
    const compared =
      name === CLAUDE_DIR || name === CLAUDE_JSON || name.startsWith(CLAUDE_SIBLING_PREFIX);
    if (compared) walk(join(home, name), name, snapshot);
  }
  return snapshot;
}

function sameContent(before: SnapshotEntry, after: SnapshotEntry): boolean {
  if (before.size !== after.size) return false;
  if (before.sha256 || after.sha256) return before.sha256 === after.sha256;
  return before.mtimeMs === after.mtimeMs;
}

function isLiveTranscript(path: string): boolean {
  return path.startsWith(PROJECTS_PREFIX) && path.endsWith(TRANSCRIPT_SUFFIX);
}

/**
 * Transcripts under projects/ are append-only and written by the live session:
 * new files and growth are tolerated; truncation, removal and any other change are not.
 */
function isTolerated(
  path: string,
  before: SnapshotEntry | undefined,
  after: SnapshotEntry | undefined,
) {
  if (!isLiveTranscript(path) || !after) return false;
  return before === undefined || after.size >= before.size;
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const diff: SnapshotDiff = { added: [], removed: [], changed: [] };
  for (const path of Object.keys(after)) {
    if (!(path in before)) {
      if (!isTolerated(path, undefined, after[path])) diff.added.push(path);
    } else if (
      !sameContent(before[path], after[path]) &&
      !isTolerated(path, before[path], after[path])
    ) {
      diff.changed.push(path);
    }
  }
  for (const path of Object.keys(before)) {
    if (!(path in after)) diff.removed.push(path);
  }
  return diff;
}

export function describeDiff(diff: SnapshotDiff): string {
  return (["added", "removed", "changed"] as const)
    .filter((kind) => diff[kind].length > 0)
    .map((kind) => `${kind}: ${diff[kind].join(", ")}`)
    .join("\n");
}
