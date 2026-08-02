/**
 * Pricing in USD per 1M tokens
 * Updated 2026-07-17
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-1-20250805": { input: 15, output: 75 },
  "claude-opus-4-1": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  cwd?: string;
  message?: {
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
  inputTokens: number;
  outputTokens: number;
  cost: number; // USD
}

/**
 * Extract project name from absolute path.
 * Removes leading tilde and uses basename of the path.
 */
function extractProjectName(cwd: string | undefined): string {
  if (!cwd) return "unknown";
  const normalized = cwd.replace(/^~/, "");
  const parts = normalized.split("/").filter(Boolean);
  // Return last two parts (e.g., "react/cc-studio") or last one if only one
  return parts.slice(-2).join("/") || "default";
}

/**
 * Extract date from ISO timestamp in YYYY-MM-DD format
 */
function extractDate(timestamp: string | undefined): string {
  if (!timestamp) return "unknown";
  return timestamp.split("T")[0] || "unknown";
}

/**
 * Calculate cost in USD for a model's usage.
 * Assumes model is in MODEL_PRICING (should be pre-validated).
 */
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return 0; // Should not reach here if pre-validated
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Parse a single JSONL line from a transcript file.
 * Returns a UsageRecord if the line is valid, null otherwise.
 * Silently skips malformed entries.
 */
export function parseTranscriptLine(line: string): UsageRecord | null {
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

  // Skip models not in pricing table
  if (!MODEL_PRICING[e.message.model]) {
    console.warn(`Unknown model in usage analytics: ${e.message.model}`);
    return null;
  }

  const inputTokens = e.message.usage.input_tokens ?? 0;
  const outputTokens = e.message.usage.output_tokens ?? 0;

  if (inputTokens === 0 && outputTokens === 0) {
    return null;
  }

  return {
    model: e.message.model,
    project: extractProjectName(e.cwd),
    date: extractDate(e.timestamp),
    inputTokens,
    outputTokens,
    cost: calculateCost(e.message.model, inputTokens, outputTokens),
  };
}

/**
 * Parse a JSONL transcript content string.
 * Returns all valid UsageRecords found in the content.
 */
export function parseTranscriptContent(content: string): UsageRecord[] {
  const lines = content.split("\n");
  const records: UsageRecord[] = [];

  for (const line of lines) {
    const record = parseTranscriptLine(line);
    if (record) {
      records.push(record);
    }
  }

  return records;
}
