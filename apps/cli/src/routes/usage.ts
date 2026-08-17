import { PRICING_AS_OF } from "../usage/parser.js";
import {
  loadAllRecords,
  filterByPeriod,
  computeOverview,
  computeToday,
  computeBlocks,
  computeSessions,
  computeModels,
  computeProjects,
  computeTimeline,
  computeHeatmap,
  computePrompts,
  type PeriodFilter,
  type OverviewTotals,
  type TodaySummary,
  type UsageBlock,
  type HeatmapCell,
  type SessionSummary,
  type ModelSummary,
  type ProjectSummary,
  type TimelineEntry,
  type TimelineGranularity,
  type PromptSummary,
} from "../usage/aggregate.js";
import type { UsageRecord } from "../usage/parser.js";

// Constants for usage API configuration
const USAGE = {
  HEATMAP_DAYS: 84,
  DEFAULT_SESSION_LIMIT: 20,
  DEFAULT_WINDOW_LIMIT: 20,
  DEFAULT_PROMPT_LIMIT: 50,
  CACHE_TTL_MS: 5000, // 5 second TTL for record cache
} as const;

type ApiResult<T> = { status: 200; body: T } | { status: 500; body: { error: string } };

function failure(error: unknown): { status: 500; body: { error: string } } {
  const message = error instanceof Error ? error.message : "unable to fetch usage data";
  return { status: 500, body: { error: message } };
}

// --- Memoized records cache ---
interface CacheState {
  records: UsageRecord[] | null;
  promise: Promise<UsageRecord[]> | null;
  expiresAt: number;
}

const recordsCache: CacheState = {
  records: null,
  promise: null,
  expiresAt: 0,
};

/** Load records with short-TTL caching. Concurrent calls share one in-flight promise. */
async function loadRecordsWithCache(): Promise<UsageRecord[]> {
  const now = Date.now();

  // Return cached data if still valid
  if (recordsCache.records !== null && now < recordsCache.expiresAt) {
    return recordsCache.records;
  }

  // Return in-flight promise if one exists (concurrent caller support)
  if (recordsCache.promise !== null) {
    return recordsCache.promise;
  }

  // Create new fetch promise
  recordsCache.promise = loadAllRecords();

  try {
    const records = await recordsCache.promise;
    recordsCache.records = records;
    recordsCache.expiresAt = now + USAGE.CACHE_TTL_MS;
    return records;
  } finally {
    recordsCache.promise = null;
  }
}

/** Clear the records cache (for testing). */
export function clearRecordsCache(): void {
  recordsCache.records = null;
  recordsCache.promise = null;
  recordsCache.expiresAt = 0;
}

export interface UsageOverviewResponse {
  totals: OverviewTotals;
  today: TodaySummary;
  activeWindow: UsageBlock | null;
  heatmap: HeatmapCell[];
  pricingAsOf: string;
}

/**
 * GET /api/usage/overview
 * Totals, today's spend, the currently-active 5h billing window, and an 84-day heatmap.
 */
export async function getUsageOverviewResponse(): Promise<ApiResult<UsageOverviewResponse>> {
  try {
    const records = await loadRecordsWithCache();
    const activeWindow = computeBlocks(records, { limit: 1 }).find((block) => block.active) ?? null;

    return {
      status: 200,
      body: {
        totals: computeOverview(records),
        today: computeToday(records),
        activeWindow,
        heatmap: computeHeatmap(records, USAGE.HEATMAP_DAYS),
        pricingAsOf: PRICING_AS_OF,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export interface UsageModelsResponse {
  models: ModelSummary[];
}

/**
 * GET /api/usage/models?since&until&period
 * Usage aggregated by model family, optionally filtered by date range or period alias.
 */
export async function getUsageModelsResponse(
  filter: PeriodFilter,
): Promise<ApiResult<UsageModelsResponse>> {
  try {
    const records = await loadRecordsWithCache();
    return { status: 200, body: { models: computeModels(filterByPeriod(records, filter)) } };
  } catch (error) {
    return failure(error);
  }
}

export interface UsageProjectsResponse {
  projects: ProjectSummary[];
}

/**
 * GET /api/usage/projects?since&until&period
 * Usage aggregated by project, optionally filtered by date range or period alias.
 */
export async function getUsageProjectsResponse(
  filter: PeriodFilter,
): Promise<ApiResult<UsageProjectsResponse>> {
  try {
    const records = await loadRecordsWithCache();
    return { status: 200, body: { projects: computeProjects(filterByPeriod(records, filter)) } };
  } catch (error) {
    return failure(error);
  }
}

export interface UsageTimelineResponse {
  granularity: TimelineGranularity;
  timeline: TimelineEntry[];
  /** Unique sessions across the filtered range (not a sum of per-bucket counts). */
  uniqueSessionCount: number;
}

export interface TimelineParams {
  granularity?: string;
  since?: string;
  until?: string;
}

/**
 * GET /api/usage/timeline?granularity=daily|monthly&since&until
 * Usage aggregated by day or month, sorted chronologically.
 */
export async function getUsageTimelineResponse({
  granularity,
  since,
  until,
}: TimelineParams): Promise<ApiResult<UsageTimelineResponse>> {
  try {
    const resolvedGranularity: TimelineGranularity =
      granularity === "monthly" ? "monthly" : "daily";
    const records = await loadRecordsWithCache();
    const filtered = filterByPeriod(records, { since, until });
    const uniqueSessionCount = new Set(filtered.map((r) => r.sessionId)).size;
    return {
      status: 200,
      body: {
        granularity: resolvedGranularity,
        timeline: computeTimeline(filtered, resolvedGranularity),
        uniqueSessionCount,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export interface UsageSessionsResponse {
  sessions: SessionSummary[];
}

export interface SessionsParams {
  sort?: string;
  limit?: number;
}

/**
 * GET /api/usage/sessions?sort=cost|recent&limit=20|50|100
 * Per-session totals, sorted by cost (default) or recency.
 */
export async function getUsageSessionsResponse({
  sort,
  limit = USAGE.DEFAULT_SESSION_LIMIT,
}: SessionsParams): Promise<ApiResult<UsageSessionsResponse>> {
  try {
    const records = await loadRecordsWithCache();
    const resolvedSort = sort === "recent" ? "recent" : "cost";
    return {
      status: 200,
      body: { sessions: computeSessions(records, { sort: resolvedSort, limit }) },
    };
  } catch (error) {
    return failure(error);
  }
}

export interface UsageWindowsResponse {
  windows: UsageBlock[];
}

/**
 * GET /api/usage/windows?limit
 * The most recent 5h billing windows, newest first.
 */
export async function getUsageWindowsResponse(
  limit: number = USAGE.DEFAULT_WINDOW_LIMIT,
): Promise<ApiResult<UsageWindowsResponse>> {
  try {
    const records = await loadRecordsWithCache();
    return { status: 200, body: { windows: computeBlocks(records, { limit }) } };
  } catch (error) {
    return failure(error);
  }
}

export interface UsagePromptsResponse {
  prompts: PromptSummary[];
}

export interface PromptsParams {
  limit?: number;
  since?: string;
  until?: string;
  project?: string;
}

/**
 * GET /api/usage/prompts?limit&since&until&project
 * Recent user prompts with assistant cost attributed via parentUuid.
 */
export async function getUsagePromptsResponse({
  limit = USAGE.DEFAULT_PROMPT_LIMIT,
  since,
  until,
  project,
}: PromptsParams = {}): Promise<ApiResult<UsagePromptsResponse>> {
  try {
    return {
      status: 200,
      body: { prompts: await computePrompts(limit, { since, until, project }) },
    };
  } catch (error) {
    return failure(error);
  }
}
