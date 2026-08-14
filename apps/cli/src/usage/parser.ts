/**
 * Pricing in USD per 1M tokens, keyed by model family (matched via substring).
 * Specific model ids can override their family's default rate below.
 *
 * Rates reflect this workspace's current published Claude pricing as of
 * PRICING_AS_OF. Family defaults apply to the *current* generation of each
 * family (e.g. "opus" covers opus-4-7/4-8/5 at today's rate); MODEL_OVERRIDES
 * pins specific historical model ids that launched at different rates before
 * a later price change (e.g. the original opus-4-1 launch pricing). Models
 * that don't match any known family price at $0 rather than guessing — see
 * `getModelRate`.
 */
export const PRICING_AS_OF = "2026-07-17";

export interface ModelRate {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

type ModelFamily = "fable" | "opus" | "sonnet" | "haiku";

const FAMILY_PRICING: Record<ModelFamily, ModelRate> = {
  fable: { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1.0 },
  opus: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

/**
 * Model ids priced differently than their family default — currently just
 * the original claude-opus-4-1 launch rate (superseded by the cheaper
 * FAMILY_PRICING.opus rate for later opus releases).
 */
const MODEL_OVERRIDES: Record<string, ModelRate> = {
  "claude-opus-4-1-20250805": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-opus-4-1": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
};

/**
 * Resolve the pricing rate for a model id. Checks specific overrides first,
 * then falls back to a substring match against known model families.
 * Returns null for unrecognized models (callers should treat cost as 0).
 */
function getModelRate(model: string): ModelRate | null {
  if (MODEL_OVERRIDES[model]) {
    return MODEL_OVERRIDES[model];
  }

  const normalized = model.toLowerCase();
  if (normalized.includes("fable")) return FAMILY_PRICING.fable;
  if (normalized.includes("opus")) return FAMILY_PRICING.opus;
  if (normalized.includes("sonnet")) return FAMILY_PRICING.sonnet;
  if (normalized.includes("haiku")) return FAMILY_PRICING.haiku;
  return null;
}

export interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  cwd?: string;
  requestId?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

export interface UsageRecord {
  model: string;
  project: string;
  date: string; // YYYY-MM-DD
  timestampMs: number;
  sessionId: string;
  dedupeKey?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number; // USD
}

export interface ParseOptions {
  /** Session id to attach to every record parsed from this content (basename of the .jsonl file). */
  sessionId?: string;
  /** Project name to attach to every record, overriding the cwd-derived guess. */
  projectOverride?: string;
}

/**
 * Extract project name from an absolute cwd path, e.g. "react/cc-studio".
 * Returns null when there's no usable cwd, so callers can fall back.
 */
function extractProjectName(cwd: string | undefined): string | null {
  if (!cwd) return null;
  const normalized = cwd.replace(/^~/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || null;
}

/**
 * Best-effort recovery of a display name from a sanitized `~/.claude/projects`
 * directory name (Claude Code builds it by replacing "/" with "-" in the cwd).
 * This is lossy when a path segment itself contains a hyphen, so it's only
 * used as a last-resort fallback when no transcript line carries a real cwd.
 */
function prettifyProjectDir(dirName: string): string {
  const parts = dirName.split("-").filter(Boolean);
  return parts.slice(-2).join("/") || dirName;
}

/**
 * Resolve the display project name for an entire session transcript.
 *
 * A session's `cwd` can drift within the same file as the agent moves into
 * subdirectories (e.g. a monorepo's `apps/cli`), so per-line cwd is not a
 * safe grouping key — it would fragment one project into many. Instead this
 * scans every line for a `cwd` and picks the *shortest* one: subdirectory
 * paths are always longer superstrings of the session's root working
 * directory, so the shortest cwd reliably recovers the real project root.
 * Falls back to prettifying the sanitized project directory name when no
 * line in the transcript carries a cwd at all.
 */
export function resolveSessionProjectName(content: string, fallbackDirName: string): string {
  let shortestCwd: string | undefined;

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const cwd = (entry as { cwd?: unknown } | null)?.cwd;
    if (typeof cwd !== "string" || !cwd) continue;
    if (!shortestCwd || cwd.length < shortestCwd.length) {
      shortestCwd = cwd;
    }
  }

  return extractProjectName(shortestCwd) ?? prettifyProjectDir(fallbackDirName);
}

/**
 * Format an epoch timestamp as a YYYY-MM-DD string in the server's local
 * timezone. Used consistently for "today"/date-bucket math so a turn made
 * late at night doesn't get attributed to the wrong day just because its
 * UTC calendar date differs from the user's local calendar date.
 */
export function localDateString(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Extract a local-timezone YYYY-MM-DD date from an ISO timestamp.
 * Deliberately NOT `timestamp.split("T")[0]` (that's the UTC date) — see
 * `localDateString`.
 */
function extractDate(timestamp: string | undefined): string {
  if (!timestamp) return "unknown";
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? "unknown" : localDateString(ms);
}

/**
 * Parse an ISO timestamp into epoch milliseconds. Returns 0 when missing or invalid,
 * so records without a timestamp sort first rather than throwing off block/heatmap math.
 */
export function extractTimestampMs(timestamp: string | undefined): number {
  if (!timestamp) return 0;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Calculate cost in USD for a model's usage, including cache read/write tokens.
 * Unknown models resolve to a rate of 0 rather than being dropped.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  const rate = getModelRate(model);
  if (!rate) {
    return 0;
  }

  return (
    (inputTokens * rate.input +
      outputTokens * rate.output +
      cacheWriteTokens * rate.cacheWrite +
      cacheReadTokens * rate.cacheRead) /
    1_000_000
  );
}

/**
 * Parse a single JSONL line from a transcript file.
 * Returns a UsageRecord if the line is valid, null otherwise.
 * Silently skips malformed entries.
 */
export function parseTranscriptLine(line: string, options: ParseOptions = {}): UsageRecord | null {
  if (!line.trim()) {
    return null;
  }

  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    // Malformed JSON — skip
    return null;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const e = entry as TranscriptEntry;

  // Real Claude Code transcripts mark assistant turns with top-level type "assistant"
  if (e.type !== "assistant") {
    return null;
  }

  if (!e.message?.model || !e.message.usage) {
    return null;
  }

  if (typeof e.message.model !== "string" || !e.message.model.startsWith("claude-")) {
    return null;
  }

  const inputTokens = e.message.usage.input_tokens ?? 0;
  const outputTokens = e.message.usage.output_tokens ?? 0;
  const cacheReadTokens = e.message.usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = e.message.usage.cache_creation_input_tokens ?? 0;

  if (inputTokens === 0 && outputTokens === 0 && cacheReadTokens === 0 && cacheWriteTokens === 0) {
    return null;
  }

  return {
    model: e.message.model,
    project: options.projectOverride ?? extractProjectName(e.cwd) ?? "unknown",
    date: extractDate(e.timestamp),
    timestampMs: extractTimestampMs(e.timestamp),
    sessionId: options.sessionId ?? "unknown",
    dedupeKey: e.requestId ?? e.message.id,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cost: calculateCost(
      e.message.model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
    ),
  };
}

/**
 * Parse a JSONL transcript content string.
 * Dedupes retried requests by `requestId ?? message.id` (last write wins);
 * records without either id pass through untouched.
 */
export function parseTranscriptContent(content: string, options: ParseOptions = {}): UsageRecord[] {
  const lines = content.split("\n");
  const records: UsageRecord[] = [];
  const deduped = new Map<string, UsageRecord>();

  for (const line of lines) {
    const record = parseTranscriptLine(line, options);
    if (!record) continue;

    if (record.dedupeKey) {
      deduped.set(record.dedupeKey, record);
    } else {
      records.push(record);
    }
  }

  records.push(...deduped.values());
  return records;
}
