import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { userClaudeRoot } from "../fs/scoped.js";

/** Claude's local estimator (`U_`) is characters / 4. */
const CHARS_PER_TOKEN = 4;

type ContextEntry = {
  category: string;
  tokens: number;
  percentage: number;
};

type ContextSuccess = {
  success: true;
  breakdown: ContextEntry[];
  total: number;
};

type ContextError = {
  success: false;
  error: string;
};

export type ContextResponse = ContextSuccess | ContextError;

type ContextItem = {
  name: string;
  tokens?: number;
  group?: string;
  sourcePath?: string;
  serverName?: string;
  toolId?: string;
};

type ContextGroup = {
  name: string;
  tokens: number;
  items: ContextItem[];
};

type ContextCategory = {
  name: string;
  tokens: number;
  percentage: number;
  items: ContextItem[];
  groups?: ContextGroup[];
};

type ContextAllSuccess = {
  success: true;
  model: string;
  model_id: string;
  total_tokens: number;
  max_tokens: number;
  percentage: number;
  is_estimated: boolean;
  categories: ContextCategory[];
};

type ContextAllError = {
  success: false;
  error: string;
};

export type ContextAllResponse = ContextAllSuccess | ContextAllError;

function stripAnsi(value: string): string {
  const esc = String.fromCharCode(27);
  const bel = String.fromCharCode(7);
  return value
    .replace(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, "g"), "")
    .replace(new RegExp(`${esc}\\][^${bel}]*${bel}`, "g"), "");
}

function normalizeTokenRaw(raw: string): string {
  return raw.trim().replace(/,/g, "").replace(/^~/, "").replace(/^<\s*/, "").replace(/%$/u, "");
}

function isTokenLike(raw: string): boolean {
  return /^-?\d+(\.\d+)?[kKmM]?$/u.test(normalizeTokenRaw(raw));
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.round(text.length / CHARS_PER_TOKEN);
}

// Parses a compact token string like "7.3k", "1m", "~30", "< 20", "516" into a number
function parseTokenCount(raw: string): number {
  const s = normalizeTokenRaw(raw);
  if (/m$/i.test(s)) {
    return Math.round(parseFloat(s) * 1_000_000);
  }
  if (/k$/i.test(s)) {
    return Math.round(parseFloat(s) * 1000);
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function headerIndex(headerCols: string[], pattern: RegExp): number {
  return headerCols.findIndex((col) => pattern.test(col));
}

function displayItemName(cols: string[], headerCols: string[]): string {
  const pathIdx = headerIndex(headerCols, /^path$/i);
  const typeIdx = headerIndex(headerCols, /^type$/i);
  const toolIdx = headerIndex(headerCols, /^tool$/i);
  const agentIdx = headerIndex(headerCols, /^agent type$/i);

  if (pathIdx >= 0 && cols[pathIdx]) {
    const fileName = basename(cols[pathIdx]);
    const type = typeIdx >= 0 ? cols[typeIdx] : "";
    return type ? `${type} · ${fileName}` : fileName;
  }
  if (toolIdx >= 0 && cols[toolIdx]) {
    const parts = cols[toolIdx].split("__");
    return parts.length >= 3 ? parts.slice(2).join("__") : cols[toolIdx];
  }
  if (agentIdx >= 0 && cols[agentIdx]) {
    return cols[agentIdx];
  }
  return cols[0] ?? "";
}

function tokenColumnIndex(headerCols: string[]): number {
  const named = headerCols.findIndex((col) => /token/i.test(col));
  if (named >= 0) {
    return named;
  }
  // Name | Tokens | %  — tokens are the middle column, not the last.
  if (headerCols.length >= 3) {
    return 1;
  }
  return headerCols.length - 1;
}

function tokensFromRow(cols: string[], tokenIndex: number): number {
  const preferred = cols[tokenIndex];
  if (preferred !== undefined && isTokenLike(preferred)) {
    return parseTokenCount(preferred);
  }
  for (let i = cols.length - 1; i >= 1; i -= 1) {
    if (isTokenLike(cols[i])) {
      return parseTokenCount(cols[i]);
    }
  }
  return 0;
}

// Strips qualifiers like "(deferred)" before comparing names, since the summary table and
// detail sections label the same category differently (e.g. "MCP tools (deferred)" vs "MCP Tools").
function normalizeCategoryKey(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const SKILL_GROUP_HEADER = /^(Plugin\s*\([^)]+\)|Built-in|Built in|Bundled|Managed|Project|User)$/i;

function isSkillGroupHeader(name: string): boolean {
  return SKILL_GROUP_HEADER.test(name.trim());
}

function stripTreePrefix(line: string): string {
  return line
    .replace(/[\u2500-\u257F]/g, " ")
    .replace(/^[|\sL`'-]+/u, "")
    .replace(/\*\*/g, "")
    .trim();
}

function parseNamedTokenLine(line: string): { name: string; tokens: number } | null {
  const match = stripTreePrefix(line).match(
    /^(.+?):\s*(?:~|<\s*)?([\d.,]+[kKmM]?)\s*(?:tokens?)?$/i,
  );
  if (!match) return null;
  return { name: match[1].trim(), tokens: parseTokenCount(match[2]) };
}

function inferSkillGroup(sourcePath: string | undefined): string | undefined {
  if (!sourcePath) return undefined;
  const path = sourcePath.replace(/\\/g, "/");
  const plugin = path.match(/\/plugins\/(?:cache\/)?([^/]+)/i);
  if (plugin) return `Plugin (${plugin[1]})`;
  const home = (process.env.HOME ?? "").replace(/\\/g, "/");
  if (
    home &&
    (path.startsWith(`${home}/.claude/skills/`) || path.startsWith(`${home}/.cursor/skills/`))
  ) {
    return "User";
  }
  if (/\/\.(claude|cursor)\/skills\//i.test(path)) return "Project";
  return undefined;
}

function groupSortRank(name: string): number {
  const lower = name.toLowerCase();
  if (lower.startsWith("plugin")) return 0;
  if (lower === "built-in" || lower === "built in" || lower === "bundled") return 1;
  if (lower === "managed") return 2;
  if (lower === "project") return 3;
  if (lower === "user") return 4;
  return 50;
}

function parseContextOutput(output: string): ContextSuccess | null {
  const lines = output.split("\n");
  const entries: ContextEntry[] = [];

  // Extract total from the "Tokens: 26.3k / 200k (13%)" header line
  let total = 0;
  for (const line of lines) {
    const totalMatch = line.match(/\*\*Tokens:\*\*\s*([\d.,k]+)\s*\/\s*[\d.,k]+/i);
    if (totalMatch) {
      total = parseTokenCount(totalMatch[1]);
      break;
    }
  }

  // Parse the markdown table rows: | Category | Tokens | Percentage |
  // Skip header and separator rows (contain "---")
  let inCategoryTable = false;
  for (const line of lines) {
    if (line.includes("Estimated usage by category")) {
      inCategoryTable = true;
      continue;
    }
    // Stop at next section heading after the category table
    if (inCategoryTable && line.startsWith("###") && !line.includes("Estimated")) {
      break;
    }
    if (!inCategoryTable) continue;

    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length < 3) continue;
    if (cols[0] === "Category" || cols[0].startsWith("-")) continue;

    const category = cols[0];
    const tokens = parseTokenCount(cols[1]);
    const pctStr = cols[2].replace("%", "").trim();
    const percentage = parseFloat(pctStr);

    if (!category || isNaN(tokens) || isNaN(percentage)) continue;
    entries.push({ category, tokens, percentage });
  }

  if (entries.length === 0) return null;

  // If total wasn't found in header, sum from entries (excluding "Free space")
  if (total === 0) {
    total = entries
      .filter((e) => e.category !== "Free space")
      .reduce((sum, e) => sum + e.tokens, 0);
  }

  return { success: true, breakdown: entries, total };
}

export async function getContextResponse(): Promise<ContextResponse> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    // cwd: process.env.HOME ensures we fetch global context (from ~/.claude)
    // not project-scoped context
    const child = spawn("claude", ["/context"], {
      cwd: process.env.HOME,
      env: process.env,
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        error: err.message.includes("ENOENT")
          ? "claude CLI not available"
          : `failed to run claude: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr.trim() || `claude exited with code ${code}`,
        });
        return;
      }

      const parsed = parseContextOutput(stdout);
      if (!parsed) {
        resolve({
          success: false,
          error: "unable to parse context output",
        });
        return;
      }

      resolve(parsed);
    });
  });
}

export function parseContextAllOutput(output: string): ContextAllSuccess | null {
  const lines = stripAnsi(output).split("\n");

  // Extract model from its own line: "**Model:** claude-opus-4-7[1m]"
  let modelId = "";
  let modelName = "";
  for (const line of lines) {
    const modelMatch = line.match(/^\*\*Model:\*\*\s*(.+)$/);
    if (modelMatch) {
      // Strip trailing context-window annotations like "[1m]"
      modelId = modelMatch[1].replace(/\[.*?\]\s*$/, "").trim();
      // Convert model ID to display name (e.g., "claude-sonnet-4-6" -> "Sonnet 4.6")
      modelName = modelId
        .replace(/^claude-/, "")
        // Join a trailing "-<major>-<minor>" version pair with a dot before splitting on
        // dashes, so "sonnet-4-6" reads as "Sonnet 4.6" instead of "Sonnet 4 6".
        .replace(/-(\d+)-(\d+)$/, " $1.$2")
        .replace(/-/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((word) => (/^\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join(" ");
      break;
    }
  }

  if (!modelId) return null;

  // Extract usage line: "**Tokens:** 24.9k / 200k (12%)" or with ~ for estimated
  let totalTokens = 0;
  let maxTokens = 0;
  let percentage = 0;
  let isEstimated = false;

  for (const line of lines) {
    if (line.includes("Tokens:") && line.includes("/")) {
      // Check for estimated indicator (~)
      isEstimated = line.includes("~");

      const tokensMatch = line.match(
        /Tokens:\**\s*~?\s*([\d.]+[kKmM]?)\s*\/\s*([\d.]+[kKmM]?)\s*\(([\d.]+)%\)/,
      );
      if (tokensMatch) {
        totalTokens = parseTokenCount(tokensMatch[1]);
        maxTokens = parseTokenCount(tokensMatch[2]);
        percentage = parseFloat(tokensMatch[3]);
      }
      break;
    }
  }

  if (totalTokens === 0 || maxTokens === 0) return null;

  // Parse the top-level "Estimated usage by category" table: | Category | Tokens | Percentage |
  const topCategories = new Map<string, { name: string; tokens: number; percentage: number }>();
  {
    let inCategoryTable = false;
    for (const line of lines) {
      if (line.includes("Estimated usage by category")) {
        inCategoryTable = true;
        continue;
      }
      if (inCategoryTable && line.startsWith("###")) break;
      if (!inCategoryTable) continue;

      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length < 3) continue;
      if (cols[0] === "Category" || cols[0].startsWith("-")) continue;

      const name = cols[0];

      const tokens = parseTokenCount(cols[1]);
      const pct = parseFloat(cols[2].replace("%", "").trim());
      if (!name || isNaN(tokens) || isNaN(pct)) continue;

      topCategories.set(normalizeCategoryKey(name), { name, tokens, percentage: pct });
    }
  }

  // Parse detail sections (### MCP Tools / Custom Agents / Memory Files / Skills).
  // Token counts live in a named Tokens column (or the middle column), not always the last.
  // Nested skill sources (#### Plugin (name) / tree headers / Source column) stay as groups.
  const sectionTitles = new Map<string, string>();
  const sectionItems = new Map<string, ContextItem[]>();
  {
    let currentKey: string | null = null;
    let currentGroup: string | undefined;
    let sectionTableStarted = false;
    let tokenIndex = -1;
    let headerCols: string[] = [];
    for (const line of lines) {
      const groupHeading = line.match(/^#{4,6}\s+(.+)$/);
      if (groupHeading && currentKey) {
        currentGroup = groupHeading[1].replace(/\(\d+[kKmM]?\)\s*$/u, "").trim();
        sectionTableStarted = false;
        tokenIndex = -1;
        headerCols = [];
        continue;
      }

      const sectionMatch = line.match(/^###\s+(?!#)(.+)$/);
      if (sectionMatch) {
        const title = sectionMatch[1].trim();
        if (title === "Estimated usage by category") {
          currentKey = null;
          currentGroup = undefined;
          continue;
        }
        currentKey = normalizeCategoryKey(title);
        currentGroup = undefined;
        sectionTitles.set(currentKey, title);
        if (!sectionItems.has(currentKey)) {
          sectionItems.set(currentKey, []);
        }
        sectionTableStarted = false;
        tokenIndex = -1;
        headerCols = [];
        continue;
      }

      if (!currentKey) continue;

      if (!line.includes("|")) {
        const stripped = stripTreePrefix(line);
        if (!stripped || stripped.startsWith("#")) continue;
        const headerName = stripped.replace(/:\s*$/u, "");
        if (isSkillGroupHeader(headerName)) {
          currentGroup = headerName;
          continue;
        }
        const named = parseNamedTokenLine(stripped);
        if (named) {
          sectionItems.get(currentKey)?.push({
            name: named.name,
            tokens: named.tokens,
            group: currentGroup,
          });
        }
        continue;
      }

      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length < 2) continue;

      if (cols[0].startsWith("-")) {
        sectionTableStarted = true;
        continue;
      }
      if (!sectionTableStarted) {
        headerCols = cols;
        tokenIndex = tokenColumnIndex(cols);
        continue;
      }

      const name = displayItemName(cols, headerCols);
      if (!name) continue;

      const tokens = tokensFromRow(
        cols,
        tokenIndex >= 0 ? tokenIndex : tokenColumnIndex(headerCols),
      );
      if (isSkillGroupHeader(name) && tokens === 0) {
        currentGroup = name;
        continue;
      }

      const pathIdx = headerIndex(headerCols, /^path$/i);
      const serverIdx = headerIndex(headerCols, /^server$/i);
      const toolIdx = headerIndex(headerCols, /^tool$/i);
      const sourceIdx = headerIndex(headerCols, /^(source|origin|from)$/i);
      const sourcePath = pathIdx >= 0 ? cols[pathIdx] : undefined;
      const sourceCol = sourceIdx >= 0 ? cols[sourceIdx] : undefined;

      sectionItems.get(currentKey)?.push({
        name,
        tokens,
        group: sourceCol || currentGroup || inferSkillGroup(sourcePath),
        sourcePath,
        serverName: serverIdx >= 0 ? cols[serverIdx] : undefined,
        toolId: toolIdx >= 0 ? cols[toolIdx] : undefined,
      });
    }
  }

  // Merge: every category is either a summary row, a detail section, or both.
  // A summary row of 0 (e.g. deferred MCP tools) must not wipe real per-item counts.
  const keys = new Set<string>([...topCategories.keys(), ...sectionItems.keys()]);
  const categories: ContextCategory[] = [];
  for (const key of keys) {
    const top = topCategories.get(key);
    const items = sectionItems.get(key) ?? [];
    const name = top?.name ?? sectionTitles.get(key) ?? key;
    const itemSum = items.reduce((sum, item) => sum + (item.tokens ?? 0), 0);
    const tokens = top && top.tokens > 0 ? top.tokens : itemSum;
    const pct =
      top && top.tokens > 0 ? top.percentage : maxTokens > 0 ? (tokens / maxTokens) * 100 : 0;
    categories.push({ name, tokens, percentage: pct, items });
  }

  if (categories.length === 0) return null;

  // "Free space" represents unused capacity, not actual usage — the CLI's own terminal
  // rendering always shows it last regardless of its position in the raw table, so match that.
  categories.sort((a, b) => {
    const aIsFree = normalizeCategoryKey(a.name) === "freespace";
    const bIsFree = normalizeCategoryKey(b.name) === "freespace";
    return aIsFree === bIsFree ? 0 : aIsFree ? 1 : -1;
  });

  return {
    success: true,
    model: modelName,
    model_id: modelId,
    total_tokens: totalTokens,
    max_tokens: maxTokens,
    percentage,
    is_estimated: isEstimated,
    categories,
  };
}

function isFreeSpace(name: string): boolean {
  return normalizeCategoryKey(name) === "freespace";
}

function categoryKind(name: string): "mcp" | "agents" | "memory" | "other" {
  const key = normalizeCategoryKey(name);
  if (key === "mcptools") return "mcp";
  if (key === "customagents" || key === "agents") return "agents";
  if (key === "memoryfiles" || key === "memory") return "memory";
  return "other";
}

async function readEstimatedTokens(filePath: string): Promise<number> {
  if (!isAbsolute(filePath) || filePath.includes("..")) return 0;
  try {
    return estimateTokens(await readFile(filePath, "utf8"));
  } catch {
    return 0;
  }
}

function estimateMcpToolTokens(item: ContextItem): number {
  return estimateTokens(
    JSON.stringify({
      name: item.toolId ?? item.name,
      description: item.name,
      input_schema: { type: "object", properties: {} },
    }),
  );
}

function stripInternalItemFields(item: ContextItem): ContextItem {
  return { name: item.name, tokens: item.tokens };
}

function clusterItems(items: ContextItem[]): { groups?: ContextGroup[]; items: ContextItem[] } {
  const keyFor = (item: ContextItem) => item.group ?? item.serverName;
  const keyed = items.filter((item) => keyFor(item));
  if (keyed.length === 0) {
    return { items: items.map(stripInternalItemFields) };
  }

  const buckets = new Map<string, ContextItem[]>();
  const ungrouped: ContextItem[] = [];
  for (const item of items) {
    const key = keyFor(item);
    const clean = stripInternalItemFields(item);
    if (!key) {
      ungrouped.push(clean);
      continue;
    }
    const bucket = buckets.get(key) ?? [];
    bucket.push(clean);
    buckets.set(key, bucket);
  }

  const groups = [...buckets.entries()]
    .map(([name, groupItems]) => ({
      name,
      tokens: groupItems.reduce((sum, item) => sum + (item.tokens ?? 0), 0),
      items: groupItems,
    }))
    .sort((a, b) => {
      const rank = groupSortRank(a.name) - groupSortRank(b.name);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    });

  return { groups, items: ungrouped };
}

function attachGroups(parsed: ContextAllSuccess): ContextAllSuccess {
  return {
    ...parsed,
    categories: parsed.categories.map((category) => {
      const clustered = clusterItems(category.items);
      const leftover = clustered.items;
      if (
        normalizeCategoryKey(category.name) === "skills" &&
        clustered.groups &&
        leftover.length > 0
      ) {
        clustered.groups = [
          ...clustered.groups,
          {
            name: "Built-in",
            tokens: leftover.reduce((sum, item) => sum + (item.tokens ?? 0), 0),
            items: leftover,
          },
        ].sort((a, b) => {
          const rank = groupSortRank(a.name) - groupSortRank(b.name);
          return rank !== 0 ? rank : a.name.localeCompare(b.name);
        });
        clustered.items = [];
      }
      return { ...category, ...clustered };
    }),
  };
}

async function fillZeroItem(kind: "mcp" | "agents" | "memory", item: ContextItem): Promise<number> {
  if ((item.tokens ?? 0) > 0) return item.tokens ?? 0;
  if (kind === "memory" && item.sourcePath) {
    item.tokens = await readEstimatedTokens(item.sourcePath);
  } else if (kind === "agents") {
    item.tokens = await readEstimatedTokens(join(userClaudeRoot(), "agents", `${item.name}.md`));
  } else if (kind === "mcp") {
    item.tokens = estimateMcpToolTokens(item);
  }
  return item.tokens ?? 0;
}

export async function enrichZeroItemTokens(parsed: ContextAllSuccess): Promise<ContextAllSuccess> {
  let estimated = parsed.is_estimated;
  let added = 0;

  for (const category of parsed.categories) {
    const kind = categoryKind(category.name);
    if (kind === "other") continue;
    const before = category.items.reduce((sum, item) => sum + (item.tokens ?? 0), 0);
    const after = (
      await Promise.all(category.items.map((item) => fillZeroItem(kind, item)))
    ).reduce((sum, tokens) => sum + tokens, 0);
    if (after > before) estimated = true;
    if (after > category.tokens) {
      added += after - category.tokens;
      category.tokens = after;
      category.percentage = parsed.max_tokens > 0 ? (after / parsed.max_tokens) * 100 : 0;
    }
  }

  const free = parsed.categories.find((category) => isFreeSpace(category.name));
  if (free && added > 0) {
    free.tokens = Math.max(0, free.tokens - added);
    free.percentage = parsed.max_tokens > 0 ? (free.tokens / parsed.max_tokens) * 100 : 0;
  }

  return attachGroups({ ...parsed, is_estimated: estimated });
}

export async function getContextAllResponse(cwd?: string): Promise<ContextAllResponse> {
  const spawnCwd = cwd ?? process.env.HOME ?? process.cwd();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const child = spawn("claude", ["/context", "all"], {
      cwd: spawnCwd,
      env: { ...process.env, ENABLE_TOOL_SEARCH: "false" },
      timeout: 20_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        error: err.message.includes("ENOENT")
          ? "claude CLI not available"
          : `failed to run claude: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr.trim() || `claude exited with code ${code}`,
        });
        return;
      }

      const parsed = parseContextAllOutput(stdout);
      if (!parsed) {
        resolve({
          success: false,
          error: "unable to parse context all output",
        });
        return;
      }

      void enrichZeroItemTokens(parsed).then(resolve);
    });
  });
}
