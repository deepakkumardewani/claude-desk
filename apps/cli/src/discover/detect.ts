import { MAX_FILE_BYTES, MAX_ITEM_BYTES, type DiscoveredItem, type ItemKind } from "schema";
import type { TreeEntry } from "./github.js";

/** Pure detection: given a repo tree and a way to read already-fetched files, find installable items. */
export type ReadFile = (path: string) => string | undefined;

export type DetectResult = { items: DiscoveredItem[]; warnings: string[] };

const EXCLUDED_DIRS = new Set(["node_modules", "vendor", "dist", "build", ".git"]);
const SYMLINK_MODE = "120000";
const SUBMODULE_MODE = "160000";

const SETTINGS_SUFFIX = ".claude/settings.json";
const SETTINGS_RE = /(?:^|\/)\.claude\/settings\.json$/;
const MCP_RE = /(?:^|\/)\.mcp\.json$/;
const MARKETPLACE_RE = /(?:^|\/)\.claude-plugin\/marketplace\.json$/;
const PLUGIN_RE = /(?:^|\/)\.claude-plugin\/plugin\.json$/;
const SKILL_MD_RE = /(?:^|\/)SKILL\.md$/;
const AGENT_RE = /(?:^|\/)agents\/.+\.md$/;
const COMMAND_RE = /(?:^|\/)commands\/(.+)\.md$/;
const GITHUB_DIR_RE = /(?:^|\/)\.github\//;

type ConvertsTo = NonNullable<DiscoveredItem["convertsTo"]>;
/** Spec §4.2/§4.3: foreign-tool instruction files and the Claude Code kind each converts to. */
const CONVERTIBLE_RULES: ReadonlyArray<{ re: RegExp; suffix: RegExp; convertsTo: ConvertsTo }> = [
  { re: /(?:^|\/)\.cursor\/rules\/.+\.mdc$/, suffix: /\.mdc$/, convertsTo: "skill" },
  { re: /(?:^|\/)\.cursorrules$/, suffix: /^\./, convertsTo: "skill" },
  { re: /(?:^|\/)\.github\/copilot-instructions\.md$/, suffix: /\.md$/, convertsTo: "skill" },
  {
    re: /(?:^|\/)\.github\/instructions\/[^/]+\.instructions\.md$/,
    suffix: /\.instructions\.md$/,
    convertsTo: "skill",
  },
  {
    re: /(?:^|\/)\.github\/prompts\/[^/]+\.prompt\.md$/,
    suffix: /\.prompt\.md$/,
    convertsTo: "command",
  },
  {
    re: /(?:^|\/)\.github\/chatmodes\/[^/]+\.chatmode\.md$/,
    suffix: /\.chatmode\.md$/,
    convertsTo: "agent",
  },
  {
    re: /(?:^|\/)\.github\/agents\/[^/]+\.agent\.md$/,
    suffix: /\.agent\.md$/,
    convertsTo: "agent",
  },
];
const DEFAULT_PLUGIN_DIRS = ["skills", "commands", "agents"];

const PROJECT_DIR_SCRIPT_RE = /\$\{?CLAUDE_PROJECT_DIR\}?["']?\/([^\s"'`;|&)]+)/g;
const RELATIVE_SCRIPT_RE = /(?:^|[\s"'])(?:\.\/)?(\.claude\/hooks\/[^\s"'`;|&)]+)/g;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function joinPath(base: string, rel: string): string {
  const cleaned = rel.replace(/^\.\//, "").replace(/\/+$/, "");
  if (cleaned === "" || cleaned === ".") return base;
  return base ? `${base}/${cleaned}` : cleaned;
}

// ---------- tree filtering ----------

/** Real, in-scope files: no symlinks, submodules, directories or excluded vendor/build dirs. */
function eligibleFiles(tree: TreeEntry[]): TreeEntry[] {
  return tree
    .filter((entry) => {
      if (entry.type !== "blob") return false;
      if (entry.mode === SYMLINK_MODE || entry.mode === SUBMODULE_MODE) return false;
      return !entry.path
        .split("/")
        .slice(0, -1)
        .some((dir) => EXCLUDED_DIRS.has(dir));
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const convertibleRule = (path: string) => CONVERTIBLE_RULES.find((rule) => rule.re.test(path));

/** Files whose content the detectors read; the scan orchestrator fetches exactly these. */
export function neededFilePaths(tree: TreeEntry[]): string[] {
  return eligibleFiles(tree)
    .map((entry) => entry.path)
    .filter((path) => {
      if (convertibleRule(path)) return true;
      if (GITHUB_DIR_RE.test(path)) return false;
      return [
        SETTINGS_RE,
        MCP_RE,
        MARKETPLACE_RE,
        PLUGIN_RE,
        SKILL_MD_RE,
        AGENT_RE,
        COMMAND_RE,
      ].some((re) => re.test(path));
    });
}

// ---------- frontmatter ----------

const BLOCK_SCALAR = /^[>|][+-]?$/;

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, "$2");

/** Minimal `key: value` frontmatter reader (scalars and folded `>` blocks); enough for name/description. */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const result: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let value = kv[2].trim();
    if (BLOCK_SCALAR.test(value)) {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(" ");
    }
    result[kv[1]] = unquote(value);
  }
  return result;
}

// ---------- item construction ----------

type Context = {
  files: Map<string, TreeEntry>;
  readFile: ReadFile;
  warnings: string[];
};

function toFileRef(entry: TreeEntry): DiscoveredItem["files"][number] {
  const size = entry.size ?? 0;
  return {
    path: entry.path,
    size,
    blobSha: entry.sha,
    ...(size > MAX_FILE_BYTES ? { tooLarge: true } : {}),
  };
}

function makeItem(
  kind: ItemKind,
  path: string,
  name: string,
  files: TreeEntry[],
  extra: Partial<DiscoveredItem> = {},
): DiscoveredItem {
  const refs = files.map(toFileRef);
  const total = refs.reduce((sum, file) => sum + file.size, 0);
  return {
    id: `${kind}:${path}`,
    kind,
    name,
    path,
    files: refs,
    installable: total <= MAX_ITEM_BYTES,
    ...extra,
  };
}

function readJson(ctx: Context, path: string): unknown {
  const content = ctx.readFile(path);
  if (content === undefined) {
    ctx.warnings.push(`${path} could not be read (missing or too large); skipped`);
    return undefined;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    ctx.warnings.push(`${path} is not valid JSON; skipped`);
    return undefined;
  }
}

const matchingFiles = (ctx: Context, re: RegExp) =>
  [...ctx.files.values()].filter((entry) => re.test(entry.path) && !GITHUB_DIR_RE.test(entry.path));

// ---------- skill / agent / command ----------

function detectSkills(ctx: Context): DiscoveredItem[] {
  return matchingFiles(ctx, SKILL_MD_RE).map((skillMd) => {
    const dir = skillMd.path === "SKILL.md" ? "" : skillMd.path.slice(0, -"/SKILL.md".length);
    const prefix = dir ? `${dir}/` : "";
    const members = [...ctx.files.values()].filter((entry) => entry.path.startsWith(prefix));
    const meta = parseFrontmatter(ctx.readFile(skillMd.path) ?? "");
    return makeItem("skill", dir || ".", meta.name || basename(dir) || "skill", members, {
      description: meta.description || undefined,
    });
  });
}

function detectAgents(ctx: Context): DiscoveredItem[] {
  const items: DiscoveredItem[] = [];
  for (const entry of matchingFiles(ctx, AGENT_RE)) {
    const content = ctx.readFile(entry.path);
    if (content === undefined) {
      ctx.warnings.push(`${entry.path} could not be read; agent check skipped`);
      continue;
    }
    const meta = parseFrontmatter(content);
    if (!meta.name && !meta.description) continue;
    const fallbackName = basename(entry.path).replace(/\.md$/, "");
    items.push(
      makeItem("agent", entry.path, meta.name || fallbackName, [entry], {
        description: meta.description || undefined,
      }),
    );
  }
  return items;
}

function detectCommands(ctx: Context): DiscoveredItem[] {
  return matchingFiles(ctx, COMMAND_RE).map((entry) => {
    const name = COMMAND_RE.exec(entry.path)?.[1] ?? basename(entry.path);
    const meta = parseFrontmatter(ctx.readFile(entry.path) ?? "");
    return makeItem("command", entry.path, name, [entry], {
      description: meta.description || undefined,
    });
  });
}

// ---------- convertible (Cursor / Copilot) ----------

function detectConvertibles(ctx: Context): DiscoveredItem[] {
  const items: DiscoveredItem[] = [];
  for (const entry of ctx.files.values()) {
    const rule = convertibleRule(entry.path);
    if (!rule) continue;
    const name = basename(entry.path).replace(rule.suffix, "") || basename(entry.path);
    const description = parseFrontmatter(ctx.readFile(entry.path) ?? "").description;
    items.push(
      makeItem("convertible", entry.path, name, [entry], {
        convertsTo: rule.convertsTo,
        description: description || undefined,
      }),
    );
  }
  return items;
}

// ---------- hook / setting ----------

function referencedScripts(command: string, base: string): string[] {
  const found = new Set<string>();
  for (const match of command.matchAll(PROJECT_DIR_SCRIPT_RE)) found.add(joinPath(base, match[1]));
  for (const match of command.matchAll(RELATIVE_SCRIPT_RE)) found.add(joinPath(base, match[1]));
  return [...found];
}

function hookGroupName(event: string, matcher: string | undefined): string {
  return matcher ? `${event} (${matcher})` : event;
}

function detectHookGroups(ctx: Context, settingsPath: string, hooks: Json): DiscoveredItem[] {
  const base = settingsPath.slice(0, -SETTINGS_SUFFIX.length).replace(/\/$/, "");
  const items: DiscoveredItem[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group: unknown, index) => {
      if (!isRecord(group)) return;
      const matcher = asString(group.matcher);
      const commands = (Array.isArray(group.hooks) ? group.hooks : [])
        .map((hook: unknown) => (isRecord(hook) ? asString(hook.command) : undefined))
        .filter((command): command is string => command !== undefined);
      const referenced = [...new Set(commands.flatMap((c) => referencedScripts(c, base)))];
      const present = referenced.filter((path) => ctx.files.has(path));
      const missing = referenced.filter((path) => !ctx.files.has(path));
      if (missing.length) {
        ctx.warnings.push(`${event} hook references missing script(s): ${missing.join(", ")}`);
      }
      items.push(
        makeItem(
          "hook",
          `${settingsPath}#hooks.${event}[${index}]`,
          hookGroupName(event, matcher),
          present.map((path) => ctx.files.get(path) as TreeEntry),
          { payload: { event, matcher, hooks: group.hooks, missingScripts: missing } },
        ),
      );
    });
  }
  return items;
}

function detectSettings(ctx: Context): DiscoveredItem[] {
  const items: DiscoveredItem[] = [];
  for (const file of matchingFiles(ctx, SETTINGS_RE)) {
    const settings = readJson(ctx, file.path);
    if (!isRecord(settings)) continue;
    for (const [key, value] of Object.entries(settings)) {
      if (key === "hooks") {
        if (isRecord(value)) items.push(...detectHookGroups(ctx, file.path, value));
        continue;
      }
      items.push(makeItem("setting", `${file.path}#${key}`, key, [], { payload: { key, value } }));
    }
  }
  return items;
}

// ---------- mcp ----------

function detectMcp(ctx: Context): DiscoveredItem[] {
  const items: DiscoveredItem[] = [];
  for (const file of matchingFiles(ctx, MCP_RE)) {
    const config = readJson(ctx, file.path);
    if (!isRecord(config) || !isRecord(config.mcpServers)) continue;
    for (const [name, server] of Object.entries(config.mcpServers)) {
      items.push(makeItem("mcp", `${file.path}#${name}`, name, [], { payload: server }));
    }
  }
  return items;
}

// ---------- plugin ----------

const toList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string");

const isUnder = (path: string, dir: string) =>
  dir === "" || path === dir || path.startsWith(`${dir}/`);

/**
 * Local (path) sources own everything under their directory plus any explicit
 * skills/commands/agents lists; a root plugin with neither falls back to the default dirs.
 */
function childrenOf(
  manifest: Json,
  sourceDir: string,
  candidates: DiscoveredItem[],
): DiscoveredItem[] {
  const listed = ["skills", "commands", "agents"].flatMap((key) => toList(manifest[key]));
  const roots = listed.map((rel) => joinPath(sourceDir, rel));
  if (sourceDir !== "") roots.push(sourceDir);
  if (roots.length === 0) roots.push(...DEFAULT_PLUGIN_DIRS);
  return candidates.filter((item) => roots.some((root) => isUnder(item.path, root)));
}

function makePlugin(
  path: string,
  manifest: Json,
  children: DiscoveredItem[],
  marketplace?: string,
): DiscoveredItem {
  const name = asString(manifest.name) ?? basename(path);
  return makeItem("plugin", path, name, [], {
    description: asString(manifest.description),
    payload: { plugin: name, marketplace, source: manifest.source, children },
  });
}

/** Directory that contains `.claude-plugin/<name>` ("" at the repo root). */
function manifestBase(path: string, name: string): string {
  return path.slice(0, -`.claude-plugin/${name}`.length).replace(/\/$/, "");
}

type PluginScan = { plugins: DiscoveredItem[]; claimed: Set<string> };

function detectMarketplaces(ctx: Context, candidates: DiscoveredItem[]): PluginScan {
  const scan: PluginScan = { plugins: [], claimed: new Set() };
  for (const file of matchingFiles(ctx, MARKETPLACE_RE)) {
    const marketplace = readJson(ctx, file.path);
    if (!isRecord(marketplace) || !Array.isArray(marketplace.plugins)) continue;
    const marketplaceName = asString(marketplace.name) ?? basename(file.path);
    const rootBase = manifestBase(file.path, "marketplace.json");
    for (const entry of marketplace.plugins) {
      if (!isRecord(entry)) continue;
      const local = typeof entry.source === "string";
      const sourceDir = local ? joinPath(rootBase, entry.source as string) : "";
      const children = local ? childrenOf(entry, sourceDir, candidates) : [];
      const plugin = makePlugin(
        `${file.path}#${asString(entry.name) ?? "plugin"}`,
        entry,
        children,
        marketplaceName,
      );
      adoptChildren(plugin, children);
      children.forEach((child) => scan.claimed.add(child.id));
      scan.plugins.push(plugin);
    }
  }
  return scan;
}

function detectStandalonePlugins(ctx: Context, candidates: DiscoveredItem[]): DiscoveredItem[] {
  const marketplaceBases = new Set(
    matchingFiles(ctx, MARKETPLACE_RE).map((f) => f.path.slice(0, -"marketplace.json".length)),
  );
  const plugins: DiscoveredItem[] = [];
  for (const file of matchingFiles(ctx, PLUGIN_RE)) {
    if (marketplaceBases.has(file.path.slice(0, -"plugin.json".length))) continue;
    const manifest = readJson(ctx, file.path);
    if (!isRecord(manifest)) continue;
    const sourceDir = manifestBase(file.path, "plugin.json");
    const children = childrenOf(manifest, sourceDir, candidates);
    const plugin = makePlugin(file.path, manifest, children);
    adoptChildren(plugin, children);
    plugins.push(plugin);
  }
  return plugins;
}

/** First plugin to claim a child wins; the child keeps pointing at it. */
function adoptChildren(plugin: DiscoveredItem, children: DiscoveredItem[]): void {
  for (const child of children) child.pluginId ??= plugin.id;
}

// ---------- entry points ----------

export function detectWithWarnings(tree: TreeEntry[], readFile: ReadFile): DetectResult {
  const ctx: Context = {
    files: new Map(eligibleFiles(tree).map((entry) => [entry.path, entry])),
    readFile,
    warnings: [],
  };
  const basics = [
    ...detectSkills(ctx),
    ...detectAgents(ctx),
    ...detectCommands(ctx),
    ...detectSettings(ctx),
    ...detectMcp(ctx),
  ];
  const convertibles = detectConvertibles(ctx);
  const marketplaces = detectMarketplaces(ctx, basics);
  const standalone = detectStandalonePlugins(ctx, basics);
  const topLevel = basics.filter((item) => !marketplaces.claimed.has(item.id));
  return {
    items: [...topLevel, ...convertibles, ...marketplaces.plugins, ...standalone],
    warnings: ctx.warnings,
  };
}

export function detectItems(tree: TreeEntry[], readFile: ReadFile): DiscoveredItem[] {
  return detectWithWarnings(tree, readFile).items;
}
