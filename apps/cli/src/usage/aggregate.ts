import { readFile, stat } from "node:fs/promises";
import {
  localDateString,
  parseTranscriptContent,
  resolveSessionProjectName,
  type UsageRecord,
} from "./parser.js";
import { loadPromptEntries, type PromptEntry } from "./prompts.js";
import { listTranscriptFiles, type TranscriptFile } from "./transcriptFiles.js";

const BLOCK_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HEATMAP_DAYS = 84;
const MS_PER_HOUR = 60 * 60 * 1000;

export interface Aggregate {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

function emptyAggregate(): Aggregate {
  return { cost: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

function addRecord(agg: Aggregate, record: UsageRecord): void {
  agg.cost += record.cost;
  agg.inputTokens += record.inputTokens;
  agg.outputTokens += record.outputTokens;
  agg.cacheReadTokens += record.cacheReadTokens;
  agg.cacheWriteTokens += record.cacheWriteTokens;
}

// --- Per-file record cache ---------------------------------------------------

interface FileCacheEntry {
  mtimeMs: number;
  records: UsageRecord[];
}

/** Cache raw parsed records per transcript file; only re-read files whose mtime changed. */
const fileCache = new Map<string, FileCacheEntry>();

async function readRecordsForFile(file: TranscriptFile): Promise<UsageRecord[]> {
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(file.path)).mtimeMs;
  } catch {
    return [];
  }

  const cached = fileCache.get(file.path);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.records;
  }

  try {
    const content = await readFile(file.path, "utf-8");
    const records = parseTranscriptContent(content, {
      sessionId: file.sessionId,
      projectOverride: resolveSessionProjectName(content, file.project),
    });
    fileCache.set(file.path, { mtimeMs, records });
    return records;
  } catch {
    return [];
  }
}

/** Load every usage record across all transcripts, reading only files that changed since last call. */
export async function loadAllRecords(): Promise<UsageRecord[]> {
  const files = await listTranscriptFiles();
  const perFile = await Promise.all(files.map((file) => readRecordsForFile(file)));
  return perFile.flat();
}

/** Alias for `loadAllRecords` — reads as "get the current record set". */
export const getRecords = loadAllRecords;

/** Clear the per-file record cache (for testing). */
export function clearCache(): void {
  fileCache.clear();
}

// --- Period filtering --------------------------------------------------------

export type Period = "today" | "7d" | "30d" | "90d" | "all";

export interface PeriodFilter {
  since?: string;
  until?: string;
  period?: string;
}

/** Filter records by an explicit since/until date range, or a named period alias. */
export function filterByPeriod(
  records: UsageRecord[],
  { since, until, period }: PeriodFilter = {},
): UsageRecord[] {
  if (since || until) {
    const lo = since ?? "0000-00-00";
    const hi = until ?? "9999-99-99";
    return records.filter((r) => r.date >= lo && r.date <= hi);
  }

  const now = Date.now();
  switch (period) {
    case "today":
      return records.filter((r) => r.date === localDateString(now));
    case "7d":
      return records.filter((r) => r.date >= localDateString(now - 6 * DAY_MS));
    case "30d":
      return records.filter((r) => r.date >= localDateString(now - 29 * DAY_MS));
    case "90d":
      return records.filter((r) => r.date >= localDateString(now - 89 * DAY_MS));
    default:
      return records;
  }
}

// --- Overview -----------------------------------------------------------------

export interface OverviewTotals extends Aggregate {
  sessionCount: number;
  projectCount: number;
}

export function computeOverview(records: UsageRecord[]): OverviewTotals {
  const agg = emptyAggregate();
  const sessionIds = new Set<string>();
  const projects = new Set<string>();

  for (const record of records) {
    addRecord(agg, record);
    sessionIds.add(record.sessionId);
    projects.add(record.project);
  }

  return { ...agg, sessionCount: sessionIds.size, projectCount: projects.size };
}

// --- Today ----------------------------------------------------------------

export interface TodaySummary extends Aggregate {
  date: string;
  turns: number;
  byModel: Record<string, Aggregate & { turns: number }>;
}

export function computeToday(records: UsageRecord[], now: number = Date.now()): TodaySummary {
  const date = localDateString(now);
  const agg = emptyAggregate();
  const byModel: Record<string, Aggregate & { turns: number }> = {};
  let turns = 0;

  for (const record of records) {
    if (record.date !== date) continue;
    addRecord(agg, record);
    turns += 1;

    byModel[record.model] ??= { ...emptyAggregate(), turns: 0 };
    addRecord(byModel[record.model], record);
    byModel[record.model].turns += 1;
  }

  return { ...agg, date, turns, byModel };
}

// --- Billing windows (5h blocks) --------------------------------------------

export interface UsageBlock extends Aggregate {
  startMs: number;
  endMs: number;
  active: boolean;
  turns: number;
  models: string[];
  burnPerHour: number;
  projectedCost: number;
  elapsedMs: number;
  remainingMs: number;
  progressPct: number;
}

interface BuildingBlock extends Aggregate {
  startMs: number;
  endMs: number;
  turns: number;
  models: Set<string>;
}

function groupIntoBlocks(records: UsageRecord[]): BuildingBlock[] {
  const sorted = [...records]
    .filter((r) => r.timestampMs > 0)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const blocks: BuildingBlock[] = [];
  let current: BuildingBlock | null = null;

  for (const record of sorted) {
    if (!current || record.timestampMs >= current.startMs + BLOCK_MS) {
      current = {
        ...emptyAggregate(),
        startMs: record.timestampMs,
        endMs: record.timestampMs + BLOCK_MS,
        turns: 0,
        models: new Set(),
      };
      blocks.push(current);
    }
    addRecord(current, record);
    current.turns += 1;
    current.models.add(record.model);
  }

  return blocks;
}

function finalizeBlock(block: BuildingBlock, now: number): UsageBlock {
  const active = now < block.endMs;
  const elapsedMs = Math.min(now, block.endMs) - block.startMs;
  const remainingMs = active ? block.endMs - now : 0;
  const elapsedHours = elapsedMs / MS_PER_HOUR;
  const burnPerHour = elapsedHours > 0 ? block.cost / elapsedHours : 0;
  const remainingHours = remainingMs / MS_PER_HOUR;

  return {
    cost: block.cost,
    inputTokens: block.inputTokens,
    outputTokens: block.outputTokens,
    cacheReadTokens: block.cacheReadTokens,
    cacheWriteTokens: block.cacheWriteTokens,
    startMs: block.startMs,
    endMs: block.endMs,
    active,
    turns: block.turns,
    models: [...block.models],
    burnPerHour,
    projectedCost: active ? block.cost + burnPerHour * remainingHours : block.cost,
    elapsedMs,
    remainingMs,
    progressPct: Math.min(100, (elapsedMs / BLOCK_MS) * 100),
  };
}

/**
 * Group records into rolling 5-hour billing windows (gap-based, not clock-aligned).
 * Returns the most recent `limit` windows, newest first.
 */
export function computeBlocks(
  records: UsageRecord[],
  { limit = 20, now = Date.now() }: { limit?: number; now?: number } = {},
): UsageBlock[] {
  return groupIntoBlocks(records)
    .slice(-limit)
    .reverse()
    .map((block) => finalizeBlock(block, now));
}

// --- Sessions -----------------------------------------------------------------

export interface SessionSummary extends Aggregate {
  sessionId: string;
  project: string;
  turns: number;
  firstTimestampMs: number;
  lastTimestampMs: number;
  models: string[];
}

interface SessionAccumulator extends Aggregate {
  project: string;
  turns: number;
  firstTimestampMs: number;
  lastTimestampMs: number;
  models: Set<string>;
}

export function computeSessions(
  records: UsageRecord[],
  { sort = "cost", limit = 50 }: { sort?: "cost" | "recent"; limit?: number } = {},
): SessionSummary[] {
  const bySession = new Map<string, SessionAccumulator>();

  for (const record of records) {
    let entry = bySession.get(record.sessionId);
    if (!entry) {
      entry = {
        ...emptyAggregate(),
        project: record.project,
        turns: 0,
        firstTimestampMs: record.timestampMs,
        lastTimestampMs: record.timestampMs,
        models: new Set(),
      };
      bySession.set(record.sessionId, entry);
    }
    addRecord(entry, record);
    entry.turns += 1;
    entry.models.add(record.model);
    if (record.timestampMs < entry.firstTimestampMs) entry.firstTimestampMs = record.timestampMs;
    if (record.timestampMs > entry.lastTimestampMs) entry.lastTimestampMs = record.timestampMs;
  }

  const rows: SessionSummary[] = [...bySession.entries()].map(([sessionId, entry]) => ({
    sessionId,
    project: entry.project,
    turns: entry.turns,
    firstTimestampMs: entry.firstTimestampMs,
    lastTimestampMs: entry.lastTimestampMs,
    models: [...entry.models],
    cost: entry.cost,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheReadTokens: entry.cacheReadTokens,
    cacheWriteTokens: entry.cacheWriteTokens,
  }));

  rows.sort((a, b) =>
    sort === "recent" ? b.lastTimestampMs - a.lastTimestampMs : b.cost - a.cost,
  );
  return rows.slice(0, limit);
}

// --- Models / Projects / Timeline -------------------------------------------

export interface ModelSummary extends Aggregate {
  model: string;
  sessionCount: number;
  share: number;
}

export function computeModels(records: UsageRecord[]): ModelSummary[] {
  const byModel = new Map<string, Aggregate & { sessions: Set<string> }>();

  for (const record of records) {
    let entry = byModel.get(record.model);
    if (!entry) {
      entry = { ...emptyAggregate(), sessions: new Set() };
      byModel.set(record.model, entry);
    }
    addRecord(entry, record);
    entry.sessions.add(record.sessionId);
  }

  const totalCost = [...byModel.values()].reduce((sum, v) => sum + v.cost, 0);

  return [...byModel.entries()]
    .map(([model, v]) => ({
      model,
      cost: v.cost,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      cacheReadTokens: v.cacheReadTokens,
      cacheWriteTokens: v.cacheWriteTokens,
      sessionCount: v.sessions.size,
      share: totalCost ? v.cost / totalCost : 0,
    }))
    .sort((a, b) => b.cost - a.cost);
}

export interface ProjectSummary extends Aggregate {
  project: string;
  sessionCount: number;
}

export function computeProjects(records: UsageRecord[]): ProjectSummary[] {
  const byProject = new Map<string, Aggregate & { sessions: Set<string> }>();

  for (const record of records) {
    let entry = byProject.get(record.project);
    if (!entry) {
      entry = { ...emptyAggregate(), sessions: new Set() };
      byProject.set(record.project, entry);
    }
    addRecord(entry, record);
    entry.sessions.add(record.sessionId);
  }

  return [...byProject.entries()]
    .map(([project, v]) => ({
      project,
      cost: v.cost,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      cacheReadTokens: v.cacheReadTokens,
      cacheWriteTokens: v.cacheWriteTokens,
      sessionCount: v.sessions.size,
    }))
    .sort((a, b) => b.cost - a.cost);
}

export interface TimelineEntry extends Aggregate {
  period: string; // YYYY-MM-DD for daily, YYYY-MM for monthly
  sessionCount: number;
}

export type TimelineGranularity = "daily" | "monthly";

export function computeTimeline(
  records: UsageRecord[],
  granularity: TimelineGranularity = "daily",
): TimelineEntry[] {
  const byPeriod = new Map<string, Aggregate & { sessions: Set<string> }>();

  for (const record of records) {
    const key = granularity === "monthly" ? record.date.slice(0, 7) : record.date;
    let entry = byPeriod.get(key);
    if (!entry) {
      entry = { ...emptyAggregate(), sessions: new Set() };
      byPeriod.set(key, entry);
    }
    addRecord(entry, record);
    entry.sessions.add(record.sessionId);
  }

  return [...byPeriod.entries()]
    .map(([period, v]) => ({
      period,
      cost: v.cost,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      cacheReadTokens: v.cacheReadTokens,
      cacheWriteTokens: v.cacheWriteTokens,
      sessionCount: v.sessions.size,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// --- Heatmap ------------------------------------------------------------------

export interface HeatmapCell {
  date: string;
  cost: number;
  turns: number;
}

/** Per-day spend for the last `days` days, zero-filled for days with no activity. */
export function computeHeatmap(
  records: UsageRecord[],
  days: number = DEFAULT_HEATMAP_DAYS,
  now: number = Date.now(),
): HeatmapCell[] {
  const hi = localDateString(now);
  const lo = localDateString(now - (days - 1) * DAY_MS);

  const byDay = new Map<string, HeatmapCell>();
  for (const record of records) {
    if (record.date < lo || record.date > hi) continue;
    let cell = byDay.get(record.date);
    if (!cell) {
      cell = { date: record.date, cost: 0, turns: 0 };
      byDay.set(record.date, cell);
    }
    cell.cost += record.cost;
    cell.turns += 1;
  }

  const result: HeatmapCell[] = [];
  const loMs = Date.parse(`${lo}T00:00:00Z`);
  const hiMs = Date.parse(`${hi}T00:00:00Z`);
  for (let t = loMs; t <= hiMs; t += DAY_MS) {
    const date = localDateString(t);
    result.push(byDay.get(date) ?? { date, cost: 0, turns: 0 });
  }
  return result;
}

// --- Prompts --------------------------------------------------------------

export interface PromptSummary {
  timestampMs: number;
  date: string;
  project: string;
  sessionId: string;
  prompt: string | null;
  cost: number | null;
}

export interface PromptFilter {
  since?: string;
  until?: string;
  project?: string;
}

function matchesPromptFilter(
  prompt: { date: string; project: string },
  filter?: PromptFilter,
): boolean {
  if (!filter) return true;
  const since = filter.since?.trim();
  const until = filter.until?.trim();
  const project = filter.project?.trim();
  if (since && prompt.date < since) return false;
  if (until && prompt.date > until) return false;
  if (project && prompt.project !== project) return false;
  return true;
}

/**
 * Resolve the human prompt "owning" a given uuid by walking up the
 * parentUuid chain until a real user prompt is found. Necessary because
 * Claude Code interleaves non-prompt entries (tool results, attachments,
 * intermediate assistant turns) between a prompt and the assistant turns
 * that actually answer it — a direct `assistant.parentUuid === prompt.uuid`
 * check only catches the *first* reply, undercounting attributed cost for
 * any prompt that triggers tool use.
 */
function resolveOwningPrompt(
  uuid: string,
  parentOf: Map<string, string | null>,
  isPrompt: Set<string>,
  cache: Map<string, string | null>,
  seen: Set<string> = new Set(),
): string | null {
  if (isPrompt.has(uuid)) return uuid;
  if (cache.has(uuid)) return cache.get(uuid) ?? null;
  if (seen.has(uuid)) return null; // defend against malformed cyclic parentUuid chains

  seen.add(uuid);
  const parent = parentOf.get(uuid);
  const resolved = parent ? resolveOwningPrompt(parent, parentOf, isPrompt, cache, seen) : null;
  cache.set(uuid, resolved);
  return resolved;
}

/**
 * Recent user prompts with their attributed assistant cost, matched by
 * walking each assistant turn's parentUuid chain back to the human prompt
 * that started it. Reads transcripts fresh (not the cached record set)
 * since it needs full user message content, not just assistant usage turns.
 */
export async function computePrompts(limit = 50, filter?: PromptFilter): Promise<PromptSummary[]> {
  const entries: PromptEntry[] = await loadPromptEntries();

  const parentOf = new Map<string, string | null>();
  const isPrompt = new Set<string>();
  for (const entry of entries) {
    if (!entry.uuid) continue;
    parentOf.set(entry.uuid, entry.parentUuid);
    if (entry.type === "user" && entry.text !== null) {
      isPrompt.add(entry.uuid);
    }
  }

  const resolveCache = new Map<string, string | null>();
  const costByParent = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== "assistant" || !entry.parentUuid) continue;
    const owner = resolveOwningPrompt(entry.parentUuid, parentOf, isPrompt, resolveCache);
    if (!owner) continue;
    costByParent.set(owner, (costByParent.get(owner) ?? 0) + entry.cost);
  }

  const prompts = entries.filter(
    (entry): entry is Extract<PromptEntry, { type: "user" }> =>
      entry.type === "user" && entry.text !== null,
  );
  prompts.sort((a, b) => b.timestampMs - a.timestampMs);

  return prompts
    .filter((p) => matchesPromptFilter(p, filter))
    .slice(0, limit)
    .map((p) => ({
      timestampMs: p.timestampMs,
      date: p.date,
      project: p.project,
      sessionId: p.sessionId,
      prompt: p.text,
      cost: p.uuid ? (costByParent.get(p.uuid) ?? null) : null,
    }));
}

// --- Backward-compat shape ---------------------------------------------------

export interface AggregatedUsage {
  overview: {
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    sessionCount: number;
  };
  byModel: Record<
    string,
    { model: string; cost: number; inputTokens: number; outputTokens: number; sessionCount: number }
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
    { date: string; cost: number; inputTokens: number; outputTokens: number; sessionCount: number }
  >;
}

/**
 * Thin compat wrapper over the new compute* functions, preserving the shape
 * older call sites/tests expect. Prefer `loadAllRecords` + `compute*` directly.
 */
export async function getAggregatedUsage(): Promise<AggregatedUsage> {
  const records = await loadAllRecords();
  const overview = computeOverview(records);

  const byModel: AggregatedUsage["byModel"] = {};
  for (const m of computeModels(records)) {
    byModel[m.model] = {
      model: m.model,
      cost: m.cost,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      sessionCount: m.sessionCount,
    };
  }

  const byProject: AggregatedUsage["byProject"] = {};
  for (const p of computeProjects(records)) {
    byProject[p.project] = {
      project: p.project,
      cost: p.cost,
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      sessionCount: p.sessionCount,
    };
  }

  const byDay: AggregatedUsage["byDay"] = {};
  for (const t of computeTimeline(records, "daily")) {
    byDay[t.period] = {
      date: t.period,
      cost: t.cost,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      sessionCount: t.sessionCount,
    };
  }

  return {
    overview: {
      totalCost: overview.cost,
      totalInputTokens: overview.inputTokens,
      totalOutputTokens: overview.outputTokens,
      sessionCount: overview.sessionCount,
    },
    byModel,
    byProject,
    byDay,
  };
}
