import { getAggregatedUsage } from "../usage/aggregate.js";

export interface UsageOverviewResponse {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionCount: number;
}

export interface UsageModelsResponse {
  models: Array<{
    model: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    sessionCount: number;
  }>;
}

export interface UsageProjectsResponse {
  projects: Array<{
    project: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    sessionCount: number;
  }>;
}

export interface UsageTimelineEntry {
  date: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  sessionCount: number;
}

export interface UsageTimelineResponse {
  timeline: UsageTimelineEntry[];
}

/**
 * GET /api/usage/overview
 * Returns summary statistics for all usage
 */
export async function getUsageOverviewResponse(): Promise<{
  status: 200 | 500;
  body: UsageOverviewResponse | { error: string };
}> {
  try {
    const aggregated = await getAggregatedUsage();
    return {
      status: 200,
      body: aggregated.overview,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to fetch usage overview";
    return {
      status: 500,
      body: { error: message },
    };
  }
}

/**
 * GET /api/usage/models
 * Returns usage aggregated by model
 */
export async function getUsageModelsResponse(): Promise<{
  status: 200 | 500;
  body: UsageModelsResponse | { error: string };
}> {
  try {
    const aggregated = await getAggregatedUsage();
    const models = Object.values(aggregated.byModel).sort((a, b) => b.cost - a.cost);
    return {
      status: 200,
      body: { models },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to fetch usage by model";
    return {
      status: 500,
      body: { error: message },
    };
  }
}

/**
 * GET /api/usage/projects
 * Returns usage aggregated by project
 */
export async function getUsageProjectsResponse(): Promise<{
  status: 200 | 500;
  body: UsageProjectsResponse | { error: string };
}> {
  try {
    const aggregated = await getAggregatedUsage();
    const projects = Object.values(aggregated.byProject).sort((a, b) => b.cost - a.cost);
    return {
      status: 200,
      body: { projects },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to fetch usage by project";
    return {
      status: 500,
      body: { error: message },
    };
  }
}

/**
 * GET /api/usage/timeline
 * Returns usage aggregated by day, sorted chronologically
 */
export async function getUsageTimelineResponse(): Promise<{
  status: 200 | 500;
  body: UsageTimelineResponse | { error: string };
}> {
  try {
    const aggregated = await getAggregatedUsage();
    const timeline = Object.values(aggregated.byDay).sort((a, b) => a.date.localeCompare(b.date));
    return {
      status: 200,
      body: { timeline },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to fetch usage timeline";
    return {
      status: 500,
      body: { error: message },
    };
  }
}
