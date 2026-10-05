import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  manifestEntrySchema,
  type DiscoveredItem,
  type InstallStatus,
  type InstallTarget,
  type ManifestEntry,
} from "schema";
import { backupFile } from "../fs/backups.js";
import { getMcpPath, removeMcpServer, type ClaudeCliRunner } from "../fs/mcp.js";
import { resolveRoots, settingsFilePath, userClaudeRoot } from "../fs/scoped.js";
import { writeSettings } from "../fs/writeSettings.js";
import { DiscoverError } from "./errors.js";
import {
  deepEqual,
  getAtPointer,
  isRecord,
  revertSettingsEntries,
  type AddedEntry,
  type Json,
} from "./merge.js";
import { readMcpNames, readSettingsDoc, sha256 } from "./plan.js";

const MANIFEST_VERSION = 1;
const MANIFEST_DIR = "claude-desk";
const MANIFEST_FILE = "installs.json";
const MARKETPLACE_POINTER_PREFIX = "/extraKnownMarketplaces/";

/** On-disk shape: entries grouped by scope + projectDir so projects stay independent (D7). */
type ManifestFile = { version: typeof MANIFEST_VERSION; targets: Record<string, ManifestEntry[]> };

export const manifestPath = (): string => join(userClaudeRoot(), MANIFEST_DIR, MANIFEST_FILE);

export const targetKey = (target: InstallTarget): string =>
  target.scope === "user" ? "user" : `project:${resolve(target.projectDir ?? "")}`;

const isMissing = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
};

// ---------- read / write ----------

async function readManifestFile(): Promise<ManifestFile> {
  let raw: string;
  try {
    raw = await readFile(manifestPath(), "utf8");
  } catch (error) {
    if (isMissing(error)) return { version: MANIFEST_VERSION, targets: {} };
    throw error;
  }
  try {
    const parsed = JSON.parse(raw) as { targets?: Record<string, unknown> };
    const targets: Record<string, ManifestEntry[]> = {};
    for (const [key, entries] of Object.entries(parsed.targets ?? {})) {
      targets[key] = manifestEntrySchema.array().parse(entries);
    }
    return { version: MANIFEST_VERSION, targets };
  } catch (cause) {
    throw new Error(`${manifestPath()} is corrupt; fix or delete it`, { cause });
  }
}

/** Backs up, then writes via temp file + rename, like `writeSettings`. */
async function writeManifestFile(file: ManifestFile): Promise<void> {
  const path = manifestPath();
  const tempPath = `${path}.tmp.${process.pid}`;
  await mkdir(dirname(path), { recursive: true });
  await backupFile(path);
  await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

/** Serializes read-modify-write cycles so concurrent requests never lose each other's entries. */
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export async function listEntries(): Promise<ManifestEntry[]> {
  const file = await readManifestFile();
  return Object.values(file.targets).flat();
}

export async function findEntry(id: string): Promise<ManifestEntry | undefined> {
  return (await listEntries()).find((entry) => entry.id === id);
}

/** Same item from the same source in the same scope: reinstalling replaces rather than duplicates. */
export function findExisting(
  entries: readonly ManifestEntry[],
  candidate: Pick<ManifestEntry, "source" | "itemKind" | "target">,
): ManifestEntry | undefined {
  const { owner, repo, path } = candidate.source;
  return entries.find(
    (entry) =>
      targetKey(entry.target) === targetKey(candidate.target) &&
      entry.itemKind === candidate.itemKind &&
      entry.source.owner === owner &&
      entry.source.repo === repo &&
      entry.source.path === path,
  );
}

export type EntryDraft = Omit<ManifestEntry, "id" | "installedAt">;

/** Inserts a new entry, or replaces the one with `replaceId`, keeping its id. */
export function recordEntry(draft: EntryDraft, replaceId?: string): Promise<ManifestEntry> {
  return locked(async () => {
    const file = await readManifestFile();
    const key = targetKey(draft.target);
    const siblings = file.targets[key] ?? [];
    const previous = siblings.find((entry) => entry.id === replaceId);
    const entry: ManifestEntry = {
      ...draft,
      id: previous?.id ?? randomUUID(),
      installedAt: new Date().toISOString(),
    };
    file.targets[key] = [...siblings.filter((existing) => existing !== previous), entry];
    await writeManifestFile(file);
    return entry;
  });
}

function dropEntry(id: string): Promise<void> {
  return locked(async () => {
    const file = await readManifestFile();
    for (const [key, entries] of Object.entries(file.targets)) {
      const kept = entries.filter((entry) => entry.id !== id);
      if (kept.length !== entries.length) file.targets[key] = kept;
    }
    await writeManifestFile(file);
  });
}

// ---------- composing an entry from an install ----------

export type FileRecord = { path: string; sha256: string };

/** What one successful install (or update) of an item changed, as gathered by `applyPlan`. */
export type InstallOutcome = {
  item: DiscoveredItem;
  source: ManifestEntry["source"];
  target: InstallTarget;
  /** Files written this run, with the hash of what was written. */
  written: FileRecord[];
  /** Existing files that already matched the new content and were left alone. */
  unchanged: FileRecord[];
  /** Files an update deleted because the new version no longer ships them. */
  removed: string[];
  /** Overwritten path -> backup of the content it held before this run. */
  restorePoints: Record<string, string>;
  settingsEntries: AddedEntry[];
  mcpServers: string[];
  marketplace?: ManifestEntry["marketplace"];
};

function mergeFiles(outcome: InstallOutcome, previous?: ManifestEntry): FileRecord[] {
  const files = new Map((previous?.files ?? []).map((file) => [file.path, file.sha256]));
  outcome.removed.forEach((path) => files.delete(path));
  // An identical file is only ours if an earlier install already tracked it.
  outcome.unchanged.forEach(({ path, sha256: hash }) => files.has(path) && files.set(path, hash));
  outcome.written.forEach(({ path, sha256: hash }) => files.set(path, hash));
  return [...files].map(([path, hash]) => ({ path, sha256: hash }));
}

const appendMissing = (base: unknown[], extra: unknown[]): unknown[] => [
  ...base,
  ...extra.filter((el) => !base.some((known) => deepEqual(known, el))),
];

/** Keeps the original `previous`/`root` of a pointer an earlier install already owned. */
function mergeSettingsEntries(
  fresh: readonly AddedEntry[],
  previous: readonly AddedEntry[] = [],
): AddedEntry[] {
  const merged = [...previous];
  for (const entry of fresh) {
    const index = merged.findIndex((known) => known.pointer === entry.pointer);
    if (index < 0) {
      merged.push(entry);
      continue;
    }
    const known = merged[index];
    const value =
      Array.isArray(known.value) && Array.isArray(entry.value)
        ? appendMissing(known.value, entry.value)
        : entry.value;
    merged[index] = { ...known, value };
  }
  return merged;
}

const union = (a: readonly string[] = [], b: readonly string[] = []): string[] => [
  ...new Set([...a, ...b]),
];

/**
 * Pure: the manifest entry for an install, folded over the entry it replaces so an update
 * never forgets what an earlier run merged or backed up (those must still be reverted).
 */
export function composeDraft(outcome: InstallOutcome, previous?: ManifestEntry): EntryDraft {
  const marketplace = outcome.marketplace ?? previous?.marketplace;
  // A backup of a file we already tracked holds an older install, not what the user had.
  const tracked = new Set(previous?.files.map((file) => file.path));
  const fresh = Object.entries(outcome.restorePoints).filter(([path]) => !tracked.has(path));
  const backups = { ...Object.fromEntries(fresh), ...previous?.backups };
  return {
    source: outcome.source,
    itemKind: outcome.item.kind,
    itemName: outcome.item.name,
    target: outcome.target,
    files: mergeFiles(outcome, previous),
    settingsEntries: mergeSettingsEntries(outcome.settingsEntries, previous?.settingsEntries),
    mcpServers: union(previous?.mcpServers, outcome.mcpServers),
    ...(marketplace && {
      marketplace: {
        name: marketplace.name,
        plugins: union(previous?.marketplace?.plugins, outcome.marketplace?.plugins),
      },
    }),
    sourceBlobShas: Object.fromEntries(outcome.item.files.map((f) => [f.path, f.blobSha])),
    ...(Object.keys(backups).length > 0 && { backups }),
  };
}

// ---------- status ----------

/** path -> sha256 of the file's current content; paths that do not exist are absent. */
export type DiskHashes = ReadonlyMap<string, string>;

/** What a remote lookup of the entry's repo returned; `undefined` means "not checked". */
export type RemoteState =
  | { available: false }
  | { available: true; blobShas: Readonly<Record<string, string>> };

export async function readDiskHashes(paths: readonly string[]): Promise<DiskHashes> {
  const hashes = new Map<string, string>();
  await Promise.all(
    paths.map(async (path) => {
      try {
        hashes.set(path, sha256(await readFile(path, "utf8")));
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }),
  );
  return hashes;
}

function remoteStatus(
  entry: ManifestEntry,
  remote: RemoteState,
): "up-to-date" | "update-available" | "source-unavailable" {
  if (!remote.available) return "source-unavailable";
  const recorded = Object.entries(entry.sourceBlobShas);
  if (recorded.length === 0) return "up-to-date";
  const present = recorded.filter(([path]) => path in remote.blobShas);
  // Every source file gone means the repo or path was removed/renamed, not updated.
  if (present.length === 0) return "source-unavailable";
  const changed = present.some(([path, sha]) => remote.blobShas[path] !== sha);
  return changed || present.length < recorded.length ? "update-available" : "up-to-date";
}

/**
 * Array merges record only the elements the install added, so those must still be present;
 * every other recorded value must still be exactly what the install wrote.
 */
function settingsEntryIntact(settings: Json, { pointer, value }: AddedEntry): boolean {
  const current = getAtPointer(settings, pointer);
  if (Array.isArray(value) && Array.isArray(current)) {
    return value.every((added) => current.some((existing) => deepEqual(existing, added)));
  }
  return deepEqual(current, value);
}

/** Recorded settings.json entries that were edited or removed since the install. */
export function modifiedSettingsEntries(entry: ManifestEntry, settings: Json): AddedEntry[] {
  return entry.settingsEntries.filter((added) => !settingsEntryIntact(settings, added));
}

/**
 * Local problems outrank remote ones: an edited or deleted file needs attention first.
 * `settings` is the current settings.json of the entry's target; omit it to skip that check.
 */
export function computeStatus(
  entry: ManifestEntry,
  disk: DiskHashes,
  remote?: RemoteState,
  settings?: Json,
): InstallStatus {
  if (entry.files.some((file) => !disk.has(file.path))) return "missing-on-disk";
  if (entry.files.some((file) => disk.get(file.path) !== file.sha256)) return "modified-locally";
  if (settings && modifiedSettingsEntries(entry, settings).length > 0) return "modified-locally";
  return remote ? remoteStatus(entry, remote) : "up-to-date";
}

// ---------- uninstall ----------

export type UninstallOptions = {
  /** Delete files even when they differ from what was installed. */
  force?: boolean;
  /** Test seam for `claude mcp remove`; defaults to the real CLI. */
  mcpRunner?: ClaudeCliRunner;
};

export type UninstallResult = { removedFiles: string[]; revertedEntries: string[] };

function assertInsideScope(entry: ManifestEntry): void {
  const { claudeRoot } = resolveRoots(entry.target);
  const escaped = entry.files.find((file) => !resolve(file.path).startsWith(claudeRoot + sep));
  if (escaped) {
    throw new DiscoverError("BAD_INPUT", `${escaped.path} is outside ${claudeRoot}; refusing`);
  }
}

async function modifiedFiles(entry: ManifestEntry): Promise<string[]> {
  const disk = await readDiskHashes(entry.files.map((file) => file.path));
  return entry.files
    .filter((file) => disk.has(file.path) && disk.get(file.path) !== file.sha256)
    .map((file) => file.path);
}

/** Labelled `<settings path>#<pointer>` so the uninstall dialog can list them beside edited files. */
async function modifiedSettingLabels(entry: ManifestEntry): Promise<string[]> {
  if (entry.settingsEntries.length === 0) return [];
  const { target } = entry;
  const path = settingsFilePath(target.scope === "user" ? "user" : "project", target.projectDir);
  const edited = modifiedSettingsEntries(entry, await readSettingsDoc(target));
  return edited.map(({ pointer }) => `${path}#${pointer}`);
}

/** Removes directories the install created, stopping at the first one still in use. */
export async function pruneEmptyDirs(start: string, stopAt: string): Promise<void> {
  for (let dir = start; dir.startsWith(stopAt + sep); dir = dirname(dir)) {
    try {
      await rmdir(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOTEMPTY" || code === "EEXIST" || isMissing(error)) return;
      throw error;
    }
  }
}

async function restoreBackup(backupPath: string, path: string): Promise<boolean> {
  try {
    await copyFile(backupPath, path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function removeFiles(entry: ManifestEntry, modified: readonly string[]): Promise<string[]> {
  const { claudeRoot } = resolveRoots(entry.target);
  const removed: string[] = [];
  for (const { path } of entry.files) {
    // A forced delete would destroy local edits, so keep a copy first.
    if (modified.includes(path)) await backupFile(path);
    const backup = entry.backups?.[path];
    if (backup === undefined || !(await restoreBackup(backup, path))) {
      await rm(path, { force: true });
      await pruneEmptyDirs(dirname(path), claudeRoot);
    }
    removed.push(path);
  }
  return removed;
}

/** Marketplaces may be shared by several plugins; only the last one out removes the key. */
function ownedEntries(entry: ManifestEntry, others: readonly ManifestEntry[]): AddedEntry[] {
  const sharedMarketplaces = new Set(
    others
      .filter((other) => targetKey(other.target) === targetKey(entry.target))
      .flatMap((other) => (other.marketplace ? [other.marketplace.name] : [])),
  );
  return entry.settingsEntries.filter(
    ({ pointer }) =>
      !pointer.startsWith(MARKETPLACE_POINTER_PREFIX) ||
      !sharedMarketplaces.has(pointer.slice(MARKETPLACE_POINTER_PREFIX.length).split("/")[0]),
  );
}

async function revertSettings(entry: ManifestEntry, owned: AddedEntry[]): Promise<void> {
  if (owned.length === 0) return;
  const { target } = entry;
  const layer = target.scope === "user" ? "user" : "project";
  const reverted = revertSettingsEntries(await readSettingsDoc(target), owned);
  if (Object.keys(reverted).length === 0) {
    // The install may have created this file; an empty document is the same as none.
    const path = settingsFilePath(layer, target.projectDir);
    await backupFile(path);
    await rm(path, { force: true });
    return;
  }
  const result = await writeSettings(reverted, layer, target.projectDir);
  if (!result.success) {
    const reasons = result.issues.map((issue) => issue.message).join("; ");
    throw new Error(`settings.json would be invalid after revert: ${reasons}`);
  }
}

/** A file-backed `.mcp.json` left as `{ "mcpServers": {} }` was created by the install. */
async function removeEmptyMcpFile(target: InstallTarget): Promise<void> {
  const path = getMcpPath(target.scope, target.projectDir);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  const empty =
    isRecord(parsed) &&
    Object.keys(parsed).length === 1 &&
    isRecord(parsed.mcpServers) &&
    Object.keys(parsed.mcpServers).length === 0;
  if (!empty) return;
  await backupFile(path);
  await rm(path, { force: true });
}

async function removeMcpServers(entry: ManifestEntry, runner?: ClaudeCliRunner): Promise<string[]> {
  if (entry.mcpServers.length === 0) return [];
  const { target } = entry;
  const present = await readMcpNames(target);
  const removed: string[] = [];
  for (const name of entry.mcpServers) {
    if (!present.has(name)) continue;
    await removeMcpServer(name, target.scope, runner, target.projectDir);
    removed.push(name);
  }
  await removeEmptyMcpFile(target);
  return removed;
}

/**
 * Reverses one install exactly as recorded (spec §4.4): files, merged settings keys and MCP
 * servers. Safe to retry after a partial failure because every step skips what is already gone.
 */
export async function uninstall(
  id: string,
  options: UninstallOptions = {},
): Promise<UninstallResult> {
  const entries = await listEntries();
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new DiscoverError("INSTALL_NOT_FOUND", "That install is no longer tracked");
  assertInsideScope(entry);

  const modified = await modifiedFiles(entry);
  const blockers = [...modified, ...(await modifiedSettingLabels(entry))];
  if (blockers.length > 0 && !options.force) {
    throw new DiscoverError("LOCALLY_MODIFIED", "Some installed files were edited locally", {
      files: blockers,
    });
  }

  const removedFiles = await removeFiles(entry, modified);
  const owned = ownedEntries(
    entry,
    entries.filter((other) => other.id !== id),
  );
  await revertSettings(entry, owned);
  const servers = await removeMcpServers(entry, options.mcpRunner);
  await dropEntry(id);
  return { removedFiles, revertedEntries: [...owned.map((e) => e.pointer), ...servers] };
}
