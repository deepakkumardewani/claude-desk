import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseTranscriptContent, type UsageRecord } from "./parser.js";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface AggregatedUsage {
  overview: {
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    sessionCount: number;
  };
  byModel: Record<
    string,
    {
      model: string;
      cost: number;
      inputTokens: number;
      outputTokens: number;
      sessionCount: number;
    }
  >;
  byProject: Record<
    string,
    {
      project: string;
      cost: number;
      inputTokens: number;
      outputTokens: number;
      sessionCount: number;
    }
  >;
  byDay: Record<
    string,
    {
      date: string;
      cost: number;
      inputTokens: number;
      outputTokens: number;
      sessionCount: number;
    }
  >;
}

interface CacheEntry {
  data: AggregatedUsage;
  mtime: number;
}

/**
 * Cache of aggregated usage data.
 * Invalidated when any transcript file is modified.
 */
let cache: CacheEntry | null = null;

/**
 * Get the latest modification time of any transcript file.
 */
/**
 * List all transcript files. Transcripts live one level deep:
 * ~/.claude/projects/<project-dir>/<session>.jsonl
 */
async function listTranscriptFiles(): Promise<Array<{ path: string; project: string }>> {
  const files: Array<{ path: string; project: string }> = [];

  try {
    const projectDirs = await readdir(PROJECTS_DIR, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) {
        continue;
      }

      try {
        const entries = await readdir(join(PROJECTS_DIR, dir.name), { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            files.push({ path: join(PROJECTS_DIR, dir.name, entry.name), project: dir.name });
          }
        }
      } catch {
        // Skip project directories that can't be read
      }
    }
  } catch {
    // Projects directory doesn't exist or can't be read
  }

  return files;
}

async function getLatestMtime(): Promise<number> {
  let latest = 0;

  for (const file of await listTranscriptFiles()) {
    try {
      const stats = await stat(file.path);
      if (stats.mtimeMs > latest) {
        latest = stats.mtimeMs;
      }
    } catch {
      // Skip files that can't be stat'd
    }
  }

  return latest;
}

/**
 * Read all transcript files and aggregate usage data.
 * Expensive operation — use with cache.
 */
async function computeAggregation(): Promise<AggregatedUsage> {
  const records: UsageRecord[] = [];

  for (const file of await listTranscriptFiles()) {
    try {
      const content = await readFile(file.path, "utf-8");
      records.push(...parseTranscriptContent(content));
    } catch {
      // Skip files that can't be read
    }
  }

  // Aggregate
  const byModel: Record<string, any> = {};
  const byProject: Record<string, any> = {};
  const byDay: Record<string, any> = {};

  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const record of records) {
    totalCost += record.cost;
    totalInputTokens += record.inputTokens;
    totalOutputTokens += record.outputTokens;

    // By model
    if (!byModel[record.model]) {
      byModel[record.model] = {
        model: record.model,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        sessionCount: 0,
      };
    }
    byModel[record.model].cost += record.cost;
    byModel[record.model].inputTokens += record.inputTokens;
    byModel[record.model].outputTokens += record.outputTokens;
    byModel[record.model].sessionCount += 1;

    // By project
    if (!byProject[record.project]) {
      byProject[record.project] = {
        project: record.project,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        sessionCount: 0,
      };
    }
    byProject[record.project].cost += record.cost;
    byProject[record.project].inputTokens += record.inputTokens;
    byProject[record.project].outputTokens += record.outputTokens;
    byProject[record.project].sessionCount += 1;

    // By day
    if (!byDay[record.date]) {
      byDay[record.date] = {
        date: record.date,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        sessionCount: 0,
      };
    }
    byDay[record.date].cost += record.cost;
    byDay[record.date].inputTokens += record.inputTokens;
    byDay[record.date].outputTokens += record.outputTokens;
    byDay[record.date].sessionCount += 1;
  }

  return {
    overview: {
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      sessionCount: records.length,
    },
    byModel,
    byProject,
    byDay,
  };
}

/**
 * Get aggregated usage data, using cache if available.
 * Invalidates cache if any transcript file has been modified since last computation.
 */
export async function getAggregatedUsage(): Promise<AggregatedUsage> {
  const mtime = await getLatestMtime();

  // Cache hit: same mtime
  if (cache && cache.mtime === mtime) {
    return cache.data;
  }

  // Cache miss or invalidated
  const data = await computeAggregation();
  cache = { data, mtime };
  return data;
}

/**
 * Clear the cache (for testing).
 */
export function clearCache(): void {
  cache = null;
}
