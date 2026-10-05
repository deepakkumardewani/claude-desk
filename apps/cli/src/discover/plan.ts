import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import type {
  DiscoveredItem,
  InstallPlan,
  InstallTarget,
  ItemKind,
  ManifestEntry,
  Scope,
  TrustFinding,
} from "schema";
import { PathEscapeError } from "../errors.js";
import { readClaudeJson, readMcpConfig } from "../fs/mcp.js";
import {
  InvalidProjectDirError,
  safePath,
  settingsFilePath,
  userClaudeRoot,
} from "../fs/scoped.js";
import { convertItem, type ConvertedItem } from "./convert.js";
import { DiscoverError } from "./errors.js";
import {
  applySettingsOp,
  deepEqual,
  getAtPointer,
  isRecord,
  toPointer,
  type Json,
  type SettingsOp,
} from "./merge.js";
import { analyzeTrust } from "./trust.js";

/** Scope-root categories the file-copy kinds install into (spec §4.6). */
export type WriteCategory = "skills" | "agents" | "commands" | "hooks";

const CATEGORY_BY_KIND: Partial<Record<ItemKind, WriteCategory>> = {
  skill: "skills",
  agent: "agents",
  command: "commands",
  hook: "hooks",
};

/** Where a converted Cursor/Copilot item installs (spec §4.3 target, §4.6 location). */
const CATEGORY_BY_CONVERSION: Record<ConvertedItem["convertsTo"], WriteCategory> = {
  skill: "skills",
  command: "commands",
  agent: "agents",
};

/** Kinds that change settings.json / MCP config instead of (or besides) copying files. */
const MERGE_KINDS: ReadonlySet<ItemKind> = new Set(["hook", "setting", "mcp", "plugin"]);

const HOOKS_DIR = "hooks";
const PROJECT_DIR_VAR = "$CLAUDE_PROJECT_DIR";
const PROJECT_HOOKS_PATH = `${PROJECT_DIR_VAR}/.claude/${HOOKS_DIR}`;
// Mirrors detect.ts's script-reference patterns, but captures the pieces needed to rewrite them.
const PROJECT_DIR_REF_RE = /(\$\{?CLAUDE_PROJECT_DIR\}?)(["']?)\/([^\s"'`;|&)]+)/g;
const RELATIVE_HOOK_REF_RE = /(^|[\s"'])(?:\.\/)?(\.claude\/hooks\/[^\s"'`;|&)]+)/g;
const MCP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SECRET_HEADER_RE = /auth|token|key|secret|cookie/i;
const ENV_PLACEHOLDER_ONLY_RE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

const NAME_INVALID_CHARS = /[^a-z0-9._-]+/g;
const LEADING_DOTS_OR_DASHES = /^[.-]+|-+$/g;
const TOKEN_ESTIMATE_RE = /~(\d+) tokens/;

export type FetchedItem = {
  item: DiscoveredItem;
  /** The scanned repo; required by hook and plugin items. */
  source?: { owner: string; repo: string };
  /** File contents keyed by repo-relative path (the item's own files). */
  files: ReadonlyMap<string, string>;
};

/** Absolute target path -> current UTF-8 content; absent keys do not exist on disk. */
export type DiskState = ReadonlyMap<string, string>;

export type PlannedWrite = {
  itemId: string;
  category: WriteCategory;
  /** Path relative to the category directory; always re-resolved through `safePath`. */
  relative: string;
  targetPath: string;
  content: string;
};

const unsafe = (message: string) => new DiscoverError("BAD_INPUT", message);

/** Rejects `..`, absolute paths, backslashes and NUL (spec §4.6, §11 Always). */
function assertSafeRelative(path: string, what: string): void {
  const segments = path.split("/");
  const bad =
    path === "" ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    segments.some((segment) => segment === ".." || segment === "");
  const shown = path.split("\u0000").join("\\0");
  if (bad) throw unsafe(`${what} "${shown}" is not a safe relative path`);
}

/** Sanitizes one path segment to `[a-z0-9._-]`; throws when nothing usable is left. */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(NAME_INVALID_CHARS, "-")
    .replace(LEADING_DOTS_OR_DASHES, "");
  if (!cleaned) throw unsafe(`Name "${raw}" has no installable characters`);
  return cleaned;
}

function sanitizePath(raw: string, what: string): string {
  assertSafeRelative(raw, what);
  return raw.split("/").map(sanitizeName).join("/");
}

/** Throws for kinds that cannot install (convertibles without a target), or non-installable items. */
export function assertInstallable(item: DiscoveredItem): void {
  const isConvertible = item.kind === "convertible" && item.convertsTo !== undefined;
  if (!isConvertible && !CATEGORY_BY_KIND[item.kind] && !MERGE_KINDS.has(item.kind)) {
    throw unsafe(`"${item.name}" is a ${item.kind}, which cannot be installed yet`);
  }
  if (item.installable === false) {
    throw unsafe(`"${item.name}" is too large to install`);
  }
  const oversized = item.files.find((file) => file.tooLarge);
  if (oversized) throw unsafe(`${oversized.path} is too large to install`);
}

/** `<scope root>/hooks`: not a browsable category, so derived from the settings.json location. */
function hooksDir(target: InstallTarget): string {
  return join(dirname(settingsFilePath(target.scope, target.projectDir)), HOOKS_DIR);
}

function resolveInside(dir: string, relative: string): string {
  const resolved = resolve(dir, relative);
  if (!resolved.startsWith(dir + sep)) throw new PathEscapeError("path escapes hooks directory");
  return resolved;
}

/** The one place write destinations are computed; apply re-resolves through it too. */
export function resolveWriteTarget(
  category: WriteCategory,
  relative: string,
  target: InstallTarget,
): string {
  try {
    if (category === "hooks") return resolveInside(hooksDir(target), relative);
    return safePath(category, relative, target.scope, target.projectDir);
  } catch (error) {
    if (error instanceof PathEscapeError || error instanceof InvalidProjectDirError) {
      throw unsafe(error.message);
    }
    throw error;
  }
}

function contentOf({ item, files }: FetchedItem, path: string): string {
  const content = files.get(path);
  if (content === undefined) throw unsafe(`Missing content for ${path} in "${item.name}"`);
  return content;
}

/** Skill: every file under the skill directory, keeping its inner layout. */
function skillRelatives(entry: FetchedItem): Array<{ relative: string; content: string }> {
  const { item } = entry;
  const dirName = sanitizeName(item.name);
  const prefix = item.path === "." ? "" : `${item.path}/`;
  return item.files.map((file) => {
    if (!file.path.startsWith(prefix)) throw unsafe(`${file.path} is outside "${item.name}"`);
    const inner = file.path.slice(prefix.length);
    assertSafeRelative(inner, "Skill file");
    return { relative: `${dirName}/${inner}`, content: contentOf(entry, file.path) };
  });
}

function singleFileRelative(entry: FetchedItem): Array<{ relative: string; content: string }> {
  const [file] = entry.item.files;
  if (!file) throw unsafe(`"${entry.item.name}" has no file to install`);
  const name = sanitizePath(entry.item.name, `${entry.item.kind} name`);
  return [{ relative: `${name}.md`, content: contentOf(entry, file.path) }];
}

// ---------- convertible (Cursor / Copilot) ----------

/** Converts the item's single source file; `null` for every other kind. */
function convertedOf(entry: FetchedItem): ConvertedItem | null {
  if (entry.item.kind !== "convertible") return null;
  const [file] = entry.item.files;
  if (!file) throw unsafe(`"${entry.item.name}" has no file to convert`);
  const converted = convertItem(entry.item, contentOf(entry, file.path), {
    repo: entry.source?.repo,
  });
  assertSafeRelative(converted.relativePath, "Converted path");
  return converted;
}

// ---------- hooks ----------

type HookContext = {
  target: InstallTarget;
  /** Repo directory the settings file lived in ("" at the repo root). */
  base: string;
  /** Repo-relative script path -> installed file name under `hooks/`. */
  names: ReadonlyMap<string, string>;
};

const joinRepoPath = (base: string, path: string) => (base ? `${base}/${path}` : path);

function hookNameFor(entry: FetchedItem, scriptPath: string): string {
  const repo = entry.source?.repo;
  if (!repo) throw unsafe(`"${entry.item.name}" needs its source repo to install hook scripts`);
  return `${sanitizeName(repo)}-${sanitizeName(basename(scriptPath))}`;
}

function hookScriptFiles(entry: FetchedItem): Array<{ relative: string; content: string }> {
  return entry.item.files.map((file) => ({
    relative: hookNameFor(entry, file.path),
    content: contentOf(entry, file.path),
  }));
}

/** How a rewritten command refers to an installed script, per scope. */
function installedScriptRef(target: InstallTarget, name: string): string {
  return target.scope === "user"
    ? join(userClaudeRoot(), HOOKS_DIR, name)
    : `${PROJECT_HOOKS_PATH}/${name}`;
}

/** Points every reference to a bundled script at its installed location; others are untouched. */
function rewriteCommand(command: string, { target, base, names }: HookContext): string {
  const lookup = (path: string) => names.get(joinRepoPath(base, path));
  const withProjectRefs = command.replace(
    PROJECT_DIR_REF_RE,
    (match, variable: string, quote: string, path: string) => {
      const name = lookup(path);
      if (!name) return match;
      return target.scope === "user"
        ? `${installedScriptRef(target, name)}${quote}`
        : `${variable}${quote}/.claude/${HOOKS_DIR}/${name}`;
    },
  );
  return withProjectRefs.replace(RELATIVE_HOOK_REF_RE, (match, lead: string, path: string) => {
    const name = lookup(path);
    return name ? `${lead}${installedScriptRef(target, name)}` : match;
  });
}

function hookOp(entry: FetchedItem, target: InstallTarget): SettingsOp {
  const { item } = entry;
  const payload = isRecord(item.payload) ? item.payload : {};
  const { event, matcher, hooks, missingScripts } = payload;
  if (typeof event !== "string" || !Array.isArray(hooks)) {
    throw unsafe(`"${item.name}" has no readable hook definition`);
  }
  if (Array.isArray(missingScripts) && missingScripts.length > 0) {
    throw unsafe(
      `"${item.name}" references scripts missing from the repo: ${missingScripts.join(", ")}`,
    );
  }
  const settingsPath = item.path.split("#")[0];
  const base = settingsPath.slice(0, -".claude/settings.json".length).replace(/\/$/, "");
  const names = new Map(item.files.map((file) => [file.path, hookNameFor(entry, file.path)]));
  const context: HookContext = { target, base, names };
  const rewritten = hooks.map((hook: unknown) =>
    isRecord(hook) && typeof hook.command === "string"
      ? { ...hook, command: rewriteCommand(hook.command, context) }
      : hook,
  );
  const group = { ...(typeof matcher === "string" ? { matcher } : {}), hooks: rewritten };
  return { itemId: item.id, pointer: toPointer("hooks", event), incoming: [group] };
}

// ---------- settings / plugin / mcp ----------

function settingOp({ item }: FetchedItem): SettingsOp {
  const payload = isRecord(item.payload) ? item.payload : {};
  if (typeof payload.key !== "string" || payload.key === "" || !("value" in payload)) {
    throw unsafe(`"${item.name}" has no readable settings value`);
  }
  return { itemId: item.id, pointer: toPointer(payload.key), incoming: payload.value };
}

/** Spec §4.6 / D4: exactly two keys; Claude Code fetches the plugin itself. */
function pluginOps(entry: FetchedItem): SettingsOp[] {
  const { item, source } = entry;
  const payload = isRecord(item.payload) ? item.payload : {};
  const { plugin, marketplace } = payload;
  if (typeof plugin !== "string" || typeof marketplace !== "string") {
    throw unsafe(`"${item.name}" is not listed in a marketplace, so it cannot be enabled natively`);
  }
  if (!source) throw unsafe(`"${item.name}" needs its source repo to register the marketplace`);
  const change = { marketplace, plugin };
  return [
    {
      itemId: item.id,
      pointer: toPointer("extraKnownMarketplaces", marketplace),
      incoming: { source: { source: "github", repo: `${source.owner}/${source.repo}` } },
      marketplace: change,
    },
    {
      itemId: item.id,
      pointer: toPointer("enabledPlugins", `${plugin}@${marketplace}`),
      incoming: true,
      marketplace: change,
    },
  ];
}

/** D10: never persist literal env values; each becomes `${KEY}` for the user to export. */
function placeholderEnv(env: unknown): Record<string, string> | undefined {
  if (!isRecord(env)) return undefined;
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      typeof value === "string" && ENV_PLACEHOLDER_ONLY_RE.test(value) ? value : `\${${key}}`,
    ]),
  );
}

function placeholderHeaders(headers: unknown): Record<string, string> | undefined {
  if (!isRecord(headers)) return undefined;
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SECRET_HEADER_RE.test(name) &&
      !(typeof value === "string" && ENV_PLACEHOLDER_ONLY_RE.test(value))
        ? `\${${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}}`
        : value,
    ]),
  ) as Record<string, string>;
}

export type PlannedMcp = { itemId: string; name: string; server: { transport: Json } };

function mcpEntry({ item }: FetchedItem): PlannedMcp {
  const raw = isRecord(item.payload) ? item.payload : {};
  if (!MCP_NAME_RE.test(item.name)) throw unsafe(`"${item.name}" is not a valid MCP server name`);
  const env = placeholderEnv(raw.env);
  const headers = placeholderHeaders(raw.headers);
  if (typeof raw.command === "string") {
    const args = Array.isArray(raw.args) ? raw.args : undefined;
    const transport = {
      type: "stdio",
      command: raw.command,
      ...(args && { args }),
      ...(env && { env }),
    };
    return { itemId: item.id, name: item.name, server: { transport } };
  }
  if (typeof raw.url === "string") {
    const type = raw.type === "sse" ? "sse" : "http";
    const transport = { type, url: raw.url, ...(headers && { headers }) };
    return { itemId: item.id, name: item.name, server: { transport } };
  }
  throw unsafe(`"${item.name}" has neither a command nor a url`);
}

/** Non-file changes (settings.json merges and MCP servers) for the selection. */
export type PlannedMerges = { settingsOps: SettingsOp[]; mcp: PlannedMcp[] };

export function collectMerges(items: FetchedItem[], target: InstallTarget): PlannedMerges {
  const merges: PlannedMerges = { settingsOps: [], mcp: [] };
  for (const entry of items) {
    assertInstallable(entry.item);
    switch (entry.item.kind) {
      case "hook":
        merges.settingsOps.push(hookOp(entry, target));
        break;
      case "setting":
        merges.settingsOps.push(settingOp(entry));
        break;
      case "plugin":
        merges.settingsOps.push(...pluginOps(entry));
        break;
      case "mcp":
        merges.mcp.push(mcpEntry(entry));
        break;
    }
  }
  return merges;
}

/** Key for an MCP name collision in the per-file `resolutions` map. */
export const mcpResolutionKey = (name: string): string => `mcp:${name}`;

/** Existing config the merge kinds are planned against. */
export type MergeState = { settings: Json; mcpNames: ReadonlySet<string> };
export const EMPTY_MERGE_STATE: MergeState = { settings: {}, mcpNames: new Set() };

const settingsLayerOf = (scope: Scope) => (scope === "user" ? "user" : "project");

/** Current settings.json for the target scope; a missing file is an empty document. */
export async function readSettingsDoc(target: InstallTarget): Promise<Json> {
  let raw: string;
  try {
    raw = await readFile(
      settingsFilePath(settingsLayerOf(target.scope), target.projectDir),
      "utf8",
    );
  } catch (error) {
    if (error instanceof InvalidProjectDirError) throw unsafe(error.message);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const parsed = parseJson(raw);
  if (!isRecord(parsed)) throw unsafe("settings.json must contain a JSON object");
  return parsed;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw unsafe(`settings.json is not valid JSON: ${(error as Error).message}`);
  }
}

/** Names of MCP servers already configured where this install would add one. */
export async function readMcpNames(target: InstallTarget): Promise<Set<string>> {
  const names = new Set<string>();
  const configured = await readMcpConfig(target.scope, target.projectDir);
  Object.keys(configured.mcpServers).forEach((name) => names.add(name));
  if (target.scope === "user")
    Object.keys((await readClaudeJson()).user).forEach((n) => names.add(n));
  return names;
}

/** Reads only what the selection will touch, so unrelated broken config never blocks a plan. */
export async function readMergeState(
  target: InstallTarget,
  merges: PlannedMerges,
): Promise<MergeState> {
  const [settings, mcpNames] = await Promise.all([
    merges.settingsOps.length > 0 ? readSettingsDoc(target) : EMPTY_MERGE_STATE.settings,
    merges.mcp.length > 0 ? readMcpNames(target) : EMPTY_MERGE_STATE.mcpNames,
  ]);
  return { settings, mcpNames };
}

type SettingsPlan = Pick<InstallPlan, "settingsChanges" | "marketplaceChanges">;

function assertMarketplaceFree(doc: Json, op: SettingsOp): void {
  if (!op.marketplace || !op.pointer.startsWith("/extraKnownMarketplaces/")) return;
  const existing = getAtPointer(doc, op.pointer);
  const incoming = op.incoming as { source: unknown };
  if (existing !== undefined && !deepEqual((existing as Json).source, incoming.source)) {
    throw unsafe(
      `Marketplace "${op.marketplace.marketplace}" is already registered from another source`,
    );
  }
}

/** Folds the ops over the current document so each change's `before` reflects earlier ops. */
function planSettings(ops: SettingsOp[], current: Json): SettingsPlan {
  const plan: SettingsPlan = { settingsChanges: [], marketplaceChanges: [] };
  const listed = new Set<string>();
  let doc = current;
  for (const op of ops) {
    assertMarketplaceFree(doc, op);
    const next = applySettingsOp(doc, op);
    if (next.added.length > 0) recordChange(plan, listed, op, doc, next.doc);
    doc = next.doc;
  }
  return plan;
}

function recordChange(
  plan: SettingsPlan,
  listed: Set<string>,
  op: SettingsOp,
  before: Json,
  after: Json,
) {
  if (!op.marketplace) {
    const previous = getAtPointer(before, op.pointer);
    plan.settingsChanges.push({
      itemId: op.itemId,
      pointer: op.pointer,
      ...(previous !== undefined && { before: previous }),
      after: getAtPointer(after, op.pointer),
    });
    return;
  }
  if (listed.has(op.itemId)) return;
  listed.add(op.itemId);
  plan.marketplaceChanges.push({ itemId: op.itemId, ...op.marketplace });
}

function itemWrites(entry: FetchedItem, target: InstallTarget): PlannedWrite[] {
  assertInstallable(entry.item);
  const { kind } = entry.item;
  const converted = convertedOf(entry);
  if (converted) {
    const category = CATEGORY_BY_CONVERSION[converted.convertsTo];
    return [
      {
        itemId: entry.item.id,
        category,
        relative: converted.relativePath,
        targetPath: resolveWriteTarget(category, converted.relativePath, target),
        content: converted.content,
      },
    ];
  }
  const category = CATEGORY_BY_KIND[kind];
  if (!category) return [];
  const planned =
    kind === "skill"
      ? skillRelatives(entry)
      : kind === "hook"
        ? hookScriptFiles(entry)
        : singleFileRelative(entry);
  return planned.map(({ relative, content }) => ({
    itemId: entry.item.id,
    category,
    relative,
    targetPath: resolveWriteTarget(category, relative, target),
    content,
  }));
}

/** Every file this selection would write, with sanitized, scope-contained target paths. */
export function collectWrites(items: FetchedItem[], target: InstallTarget): PlannedWrite[] {
  const writes: PlannedWrite[] = [];
  const seen = new Map<string, PlannedWrite>();
  for (const write of items.flatMap((entry) => itemWrites(entry, target))) {
    const earlier = seen.get(write.targetPath);
    // Two hook groups commonly share one script; identical bytes are written once.
    if (earlier?.category === "hooks" && earlier.content === write.content) continue;
    if (earlier) {
      throw unsafe(`Two selected items would write the same file: ${write.targetPath}`);
    }
    seen.set(write.targetPath, write);
    writes.push(write);
  }
  return writes;
}

/** Reads current content of every target; missing files (or a file in the way of a directory) are absent. */
export async function readDiskState(writes: PlannedWrite[]): Promise<DiskState> {
  const state = new Map<string, string>();
  await Promise.all(
    writes.map(async ({ targetPath }) => {
      try {
        state.set(targetPath, await readFile(targetPath, "utf8"));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") return;
        throw error;
      }
    }),
  );
  return state;
}

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** An existing install being updated; its recorded hashes tell edits apart from our own files. */
export type UpdateBasis = {
  /** The discovered item being updated, as planned. */
  itemId: string;
  entry: ManifestEntry;
  /** Current sha256 of each recorded file; missing files are absent. */
  disk: ReadonlyMap<string, string>;
};

function statusOf(
  write: PlannedWrite,
  disk: DiskState,
  update?: UpdateBasis,
): InstallPlan["fileWrites"][number]["status"] {
  const existing = disk.get(write.targetPath);
  if (existing === undefined) return "new";
  if (existing === write.content) return "identical";
  const recorded = update?.entry.files.find((file) => file.path === write.targetPath);
  // Untouched since we wrote it, so replacing it loses nothing.
  return recorded?.sha256 === sha256(existing) ? "overwrite" : "conflict";
}

/** Recorded files the new version dropped; only unedited ones are safe to delete. */
function removalsOf(
  update: UpdateBasis | undefined,
  writes: PlannedWrite[],
): NonNullable<InstallPlan["fileRemovals"]> {
  if (!update) return [];
  const kept = new Set(writes.map((write) => write.targetPath));
  return update.entry.files
    .filter((file) => !kept.has(file.path) && update.disk.get(file.path) === file.sha256)
    .map((file) => ({ itemId: update.itemId, targetPath: file.path }));
}

/** Servers the entry already installed stay as they are; only new ones are planned. */
export function withoutRecordedMcp(merges: PlannedMerges, update?: UpdateBasis): PlannedMerges {
  if (!update) return merges;
  const recorded = new Set(update.entry.mcpServers);
  return { ...merges, mcp: merges.mcp.filter((entry) => !recorded.has(entry.name)) };
}

function tokenEstimatesOf(findings: TrustFinding[]): Record<string, number> {
  const estimates: Record<string, number> = {};
  for (const finding of findings) {
    if (finding.rule !== "token-cost") continue;
    const tokens = TOKEN_ESTIMATE_RE.exec(finding.message)?.[1];
    if (tokens !== undefined) estimates[finding.itemId] = Number(tokens);
  }
  return estimates;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonicalize(v)]),
  );
}

/**
 * Hash over everything that decides what apply would do, including content and
 * existing-file digests so a changed disk or changed bytes can never reuse an old hash.
 */
function hashPlan(
  plan: Omit<InstallPlan, "planHash">,
  writes: PlannedWrite[],
  disk: DiskState,
  merges: PlannedMerges,
) {
  const digests = writes
    .map((w) => ({
      path: w.targetPath,
      content: sha256(w.content),
      existing: disk.has(w.targetPath) ? sha256(disk.get(w.targetPath)!) : null,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  return sha256(JSON.stringify(canonicalize({ plan, digests, merges })));
}

/** Pure: fetched files + disk/config state in, `InstallPlan` out (spec §3.3, §4.4). */
export function buildPlan(
  items: FetchedItem[],
  target: InstallTarget,
  diskState: DiskState,
  mergeState: MergeState = EMPTY_MERGE_STATE,
  update?: UpdateBasis,
): InstallPlan {
  const writes = collectWrites(items, target);
  const merges = withoutRecordedMcp(collectMerges(items, target), update);
  const fileRemovals = removalsOf(update, writes);
  const findings = items.flatMap((entry) => [
    ...analyzeTrust(entry.item, entry.files),
    ...(convertedOf(entry)?.findings ?? []),
  ]);
  const body: Omit<InstallPlan, "planHash"> = {
    target,
    fileWrites: writes.map((write) => ({
      itemId: write.itemId,
      targetPath: write.targetPath,
      status: statusOf(write, diskState, update),
      bytes: Buffer.byteLength(write.content),
    })),
    ...(update && { fileRemovals }),
    ...planSettings(merges.settingsOps, mergeState.settings),
    mcpChanges: merges.mcp.map(({ itemId, name }) => ({
      itemId,
      name,
      status: mergeState.mcpNames.has(name) ? "conflict" : "new",
    })),
    findings,
    tokenEstimates: tokenEstimatesOf(findings),
  };
  return { planHash: hashPlan(body, writes, diskState, merges), ...body };
}
