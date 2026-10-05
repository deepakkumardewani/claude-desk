import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import type { InstallPlan, ManifestEntry } from "schema";
import { backupFile, getBackups } from "../fs/backups.js";
import { addMcpServer, type ClaudeCliRunner } from "../fs/mcp.js";
import { resolveRoots } from "../fs/scoped.js";
import { writeSettings } from "../fs/writeSettings.js";
import {
  composeDraft,
  findExisting,
  listEntries,
  pruneEmptyDirs,
  recordEntry,
  type FileRecord,
  type InstallOutcome,
} from "./manifest.js";
import { applySettingsOp, type AddedEntry, type Json } from "./merge.js";
import {
  mcpResolutionKey,
  readMcpNames,
  readSettingsDoc,
  resolveWriteTarget,
  sha256,
  type FetchedItem,
  type PlannedMcp,
  type PlannedMerges,
  type PlannedWrite,
} from "./plan.js";

export type Resolution = "skip" | "overwrite" | "rename";

/** Conflict choices keyed by the conflicting file's target path. */
export type Resolutions = Readonly<Record<string, Resolution>>;

/** What an item added beyond files, in manifest shape so uninstall can revert precisely (spec §4.4). */
export type ApplyItemResult = {
  itemId: string;
  ok: boolean;
  error?: string;
  settingsEntries?: AddedEntry[];
  mcpServers?: string[];
  /** Set when the install was recorded in the manifest (see `ApplyOptions.record`). */
  manifestId?: string;
};

export type ApplyResult = {
  results: ApplyItemResult[];
  /** Absolute paths of files that were backed up before being overwritten. */
  backups: string[];
};

/** Everything the manifest needs beyond what the plan carries (spec §4.4). */
export type InstallRecord = {
  /** The fetched items the plan was built from. */
  items: FetchedItem[];
  source: { kind: "github" | "skills.sh"; commit: string; skillsShId?: string };
  /** The manifest entry an update replaces (kept id, carried-over merges and backups). */
  update?: ManifestEntry;
};

export type ApplyOptions = {
  plan: InstallPlan;
  /** The same writes the plan was built from; carries file contents. */
  writes: PlannedWrite[];
  /** Settings merges and MCP servers the plan was built from. */
  merges?: PlannedMerges;
  resolutions?: Resolutions;
  /** Test seam for `claude mcp add-json`; defaults to the real CLI. */
  mcpRunner?: ClaudeCliRunner;
  /** When set, every successful item is recorded in the install manifest. */
  record?: InstallRecord;
};

const MAX_RENAME_ATTEMPTS = 100;
const EXECUTABLE_MODE = 0o755;

/** Reverses one completed write. */
type Undo = { path: string; previous?: Buffer; createdDir?: string };

const isMissing = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
};

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** `a/SKILL.md` -> `a/SKILL-2.md`; extension-less names just get the suffix. */
export function withSuffix(relative: string, attempt: number): string {
  const ext = extname(relative);
  return `${relative.slice(0, relative.length - ext.length)}-${attempt}${ext}`;
}

async function renamedTarget(write: PlannedWrite, plan: InstallPlan): Promise<string> {
  for (let attempt = 2; attempt < MAX_RENAME_ATTEMPTS; attempt += 1) {
    const candidate = resolveWriteTarget(
      write.category,
      withSuffix(write.relative, attempt),
      plan.target,
    );
    if ((await readIfExists(candidate)) === undefined) return candidate;
  }
  throw new Error(`No free alternate name for ${write.targetPath}`);
}

/** Which absolute path to write for this file, or undefined to leave it untouched. */
async function destinationFor(
  write: PlannedWrite,
  status: InstallPlan["fileWrites"][number]["status"],
  options: ApplyOptions,
): Promise<string | undefined> {
  const { plan, resolutions = {} } = options;
  // Re-resolve through safePath so a tampered write can never leave the scope root.
  const resolved = resolveWriteTarget(write.category, write.relative, plan.target);
  if (status === "identical") return undefined;
  if (status !== "conflict") return resolved;

  const choice = resolutions[write.targetPath];
  if (choice === undefined) throw new Error(`Unresolved conflict for ${write.targetPath}`);
  if (choice === "skip") return undefined;
  // Rewritten hook commands point at the original name, so a renamed script would be orphaned.
  if (choice === "rename" && write.category === "hooks") {
    throw new Error(`Hook scripts cannot be renamed (${write.targetPath}); skip or overwrite`);
  }
  return choice === "rename" ? renamedTarget(write, plan) : resolved;
}

/** What one item's run did, gathered for rollback and the manifest. */
type ItemRun = {
  journal: Undo[];
  /** Shared across items: every file backed up before being overwritten. */
  backups: string[];
  written: FileRecord[];
  unchanged: FileRecord[];
  restorePoints: Record<string, string>;
  removed: string[];
};

/** Backs up and writes one file, recording how to undo it. */
async function writeWithBackup(
  path: string,
  content: string,
  run: ItemRun,
  mode?: number,
): Promise<void> {
  const previous = await readIfExists(path);
  if (previous !== undefined) {
    await backupFile(path);
    run.backups.push(path);
    const [latest] = await getBackups(path);
    if (latest) run.restorePoints[path] = latest.path;
  }
  const createdDir = await mkdir(dirname(path), { recursive: true });
  run.journal.push({ path, previous, createdDir });
  await writeFile(path, content, "utf8");
  if (mode !== undefined) await chmod(path, mode);
  run.written.push({ path, sha256: sha256(content) });
}

async function rollback(journal: Undo[], itemId: string): Promise<void> {
  for (const undo of journal.reverse()) {
    try {
      if (undo.previous !== undefined) await writeFile(undo.path, undo.previous);
      else if (undo.createdDir) await rm(undo.createdDir, { recursive: true, force: true });
      else await rm(undo.path, { force: true });
    } catch (error) {
      console.error(`discover: rollback of ${undo.path} for ${itemId} failed`, error);
    }
  }
}

type ItemWork = {
  writes: PlannedWrite[];
  settingsOps: PlannedMerges["settingsOps"];
  mcp: PlannedMcp[];
};

/** Merges this item's ops into the live settings.json; a no-op when everything is present. */
async function applySettings(work: ItemWork, options: ApplyOptions): Promise<AddedEntry[]> {
  if (work.settingsOps.length === 0) return [];
  const { target } = options.plan;
  let doc: Json = await readSettingsDoc(target);
  const added: AddedEntry[] = [];
  for (const op of work.settingsOps) {
    const next = applySettingsOp(doc, op);
    doc = next.doc;
    added.push(...next.added);
  }
  if (added.length === 0) return [];
  const result = await writeSettings(
    doc,
    target.scope === "user" ? "user" : "project",
    target.projectDir,
  );
  if (!result.success) {
    const reasons = result.issues.map((issue) => issue.message).join("; ");
    throw new Error(`settings.json would be invalid after merge: ${reasons}`);
  }
  return added;
}

function freeMcpName(name: string, taken: ReadonlySet<string>): string {
  for (let attempt = 2; attempt < MAX_RENAME_ATTEMPTS; attempt += 1) {
    if (!taken.has(`${name}-${attempt}`)) return `${name}-${attempt}`;
  }
  throw new Error(`No free alternate name for MCP server ${name}`);
}

/** Name to install under, or undefined to leave the existing server alone. */
async function mcpInstallName(
  entry: PlannedMcp,
  options: ApplyOptions,
): Promise<string | undefined> {
  const planned = options.plan.mcpChanges.find(
    (c) => c.itemId === entry.itemId && c.name === entry.name,
  );
  if (planned?.status !== "conflict") return entry.name;
  const choice = options.resolutions?.[mcpResolutionKey(entry.name)];
  if (choice === undefined) throw new Error(`Unresolved conflict for MCP server ${entry.name}`);
  if (choice === "skip") return undefined;
  if (choice === "overwrite") {
    throw new Error(`MCP server ${entry.name} already exists; choose skip or rename`);
  }
  return freeMcpName(entry.name, await readMcpNames(options.plan.target));
}

async function applyMcp(work: ItemWork, options: ApplyOptions): Promise<string[]> {
  const { target } = options.plan;
  const installed: string[] = [];
  for (const entry of work.mcp) {
    const name = await mcpInstallName(entry, options);
    if (name === undefined) continue;
    await addMcpServer(name, entry.server, target.scope, options.mcpRunner, target.projectDir);
    installed.push(name);
  }
  return installed;
}

/** Deletes files an update no longer ships; only paths the manifest entry tracks are eligible. */
async function applyRemovals(itemId: string, options: ApplyOptions, run: ItemRun): Promise<void> {
  const tracked = new Set(options.record?.update?.files.map((file) => file.path));
  const { claudeRoot } = resolveRoots(options.plan.target);
  for (const { itemId: owner, targetPath } of options.plan.fileRemovals ?? []) {
    if (owner !== itemId || !tracked.has(targetPath)) continue;
    await backupFile(targetPath);
    await rm(targetPath, { force: true });
    await pruneEmptyDirs(dirname(targetPath), claudeRoot);
    run.removed.push(targetPath);
  }
}

type Merged = { settingsEntries: AddedEntry[]; mcpServers: string[] };

/** Records the item in the manifest, replacing the entry it supersedes (spec §11 Always). */
async function recordItem(
  itemId: string,
  work: ItemWork,
  run: ItemRun,
  merged: Merged,
  options: ApplyOptions,
): Promise<string | undefined> {
  const { record } = options;
  if (!record) return undefined;
  const fetched = record.items.find((entry) => entry.item.id === itemId);
  if (!fetched?.source) throw new Error(`Cannot record ${itemId}: its source repo is unknown`);
  const { item } = fetched;
  const { target } = options.plan;
  const source = {
    kind: record.source.kind,
    owner: fetched.source.owner,
    repo: fetched.source.repo,
    sha: record.source.commit,
    path: item.path,
    ...(record.source.skillsShId && { skillsShId: record.source.skillsShId }),
  };
  const marketplaceOp = work.settingsOps.find((op) => op.marketplace);
  const outcome: InstallOutcome = {
    item,
    source,
    target,
    ...run,
    ...merged,
    ...(marketplaceOp?.marketplace && {
      marketplace: {
        name: marketplaceOp.marketplace.marketplace,
        plugins: [marketplaceOp.marketplace.plugin],
      },
    }),
  };
  const previous =
    record.update ?? findExisting(await listEntries(), { source, itemKind: item.kind, target });
  const entry = await recordEntry(composeDraft(outcome, previous), previous?.id);
  return entry.id;
}

async function applyItem(
  itemId: string,
  work: ItemWork,
  options: ApplyOptions,
  backups: string[],
): Promise<ApplyItemResult> {
  const run: ItemRun = {
    journal: [],
    backups,
    written: [],
    unchanged: [],
    restorePoints: {},
    removed: [],
  };
  const statusByPath = new Map(options.plan.fileWrites.map((w) => [w.targetPath, w.status]));
  try {
    for (const write of work.writes) {
      const status = statusByPath.get(write.targetPath) ?? "new";
      const destination = await destinationFor(write, status, options);
      const mode = write.category === "hooks" ? EXECUTABLE_MODE : undefined;
      if (destination) await writeWithBackup(destination, write.content, run, mode);
      else if (status === "identical") {
        run.unchanged.push({ path: write.targetPath, sha256: sha256(write.content) });
      }
    }
    const settingsEntries = await applySettings(work, options);
    const mcpServers = await applyMcp(work, options);
    await applyRemovals(itemId, options, run);
    const manifestId = await recordItem(
      itemId,
      work,
      run,
      { settingsEntries, mcpServers },
      options,
    );
    return {
      itemId,
      ok: true,
      ...(settingsEntries.length > 0 && { settingsEntries }),
      ...(mcpServers.length > 0 && { mcpServers }),
      ...(manifestId && { manifestId }),
    };
  } catch (error) {
    console.error(`discover: install of ${itemId} failed; rolling back`, error);
    await rollback(run.journal, itemId);
    return { itemId, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function groupByItem({ writes, merges }: ApplyOptions): Map<string, ItemWork> {
  const byItem = new Map<string, ItemWork>();
  const work = (itemId: string) => {
    const existing = byItem.get(itemId) ?? { writes: [], settingsOps: [], mcp: [] };
    byItem.set(itemId, existing);
    return existing;
  };
  writes.forEach((write) => work(write.itemId).writes.push(write));
  merges?.settingsOps.forEach((op) => work(op.itemId).settingsOps.push(op));
  merges?.mcp.forEach((entry) => work(entry.itemId).mcp.push(entry));
  return byItem;
}

/**
 * Executes a plan. Each item is all-or-nothing: a failure undoes only that item's writes
 * while other items keep their results (spec §3.3 step 4). Existing files are always
 * backed up first (spec §11), and settings.json is only written after schema validation.
 */
export async function applyPlan(options: ApplyOptions): Promise<ApplyResult> {
  const backups: string[] = [];
  const results: ApplyItemResult[] = [];
  for (const [itemId, work] of groupByItem(options)) {
    results.push(await applyItem(itemId, work, options, backups));
  }
  return { results, backups };
}
