import type { McpListResponse } from "schema";
import { apiFetch } from "./sessionApi";

export { apiFetch, bootstrapToken, getSessionToken } from "./sessionApi";

export const ROUTE_TO_CATEGORY = {
  skills: "skills",
  plans: "plans",
  commands: "commands",
  "claude-md": "claudeMd",
  settings: "settings",
  agents: "agents",
  plugins: "plugins",
} as const;

export type RouteSegment = keyof typeof ROUTE_TO_CATEGORY;
export type ApiCategory = (typeof ROUTE_TO_CATEGORY)[RouteSegment];

export function isRouteSegment(value: string): value is RouteSegment {
  return value in ROUTE_TO_CATEGORY;
}

export function routeToCategory(segment: RouteSegment): ApiCategory {
  return ROUTE_TO_CATEGORY[segment];
}

export function categoryToRoute(category: ApiCategory): RouteSegment {
  const entry = Object.entries(ROUTE_TO_CATEGORY).find(
    ([, apiCategory]) => apiCategory === category,
  );
  if (!entry) {
    throw new Error(`unknown category: ${category}`);
  }
  return entry[0] as RouteSegment;
}

export function fileHref(category: ApiCategory, name: string): string {
  const segment = categoryToRoute(category);
  if (category === "claudeMd" || category === "settings") {
    return `/${segment}`;
  }
  return `/${segment}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

export type TreeFile = {
  name: string;
};

export type TreeCategory = {
  category: ApiCategory;
  label: string;
  files: TreeFile[];
};

export type TreeResponse = {
  categories: TreeCategory[];
};

export type FileResponse = {
  category: ApiCategory;
  name: string;
  content: string;
};

export type SettingsField = {
  key: string;
  label: string;
  description: string;
  control: "toggle" | "select" | "input" | "json";
  group: string;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export type SettingsSchemaResponse = {
  fields: SettingsField[];
};

export type SettingsResponse = {
  settings: Record<string, unknown>;
};

export type SkillEntry = {
  name: string;
  label: string;
  value: string;
};

export type SkillsResponse = {
  skills: SkillEntry[];
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function withProjectDir(params: URLSearchParams, projectDir?: string): URLSearchParams {
  if (projectDir) {
    params.set("projectDir", projectDir);
  }
  return params;
}

export async function fetchTree(
  scope: string = "user",
  projectDir?: string,
): Promise<TreeResponse> {
  const params = withProjectDir(new URLSearchParams({ scope }), projectDir);
  return parseJson<TreeResponse>(await apiFetch(`/api/tree?${params.toString()}`));
}

export async function fetchFile(
  category: ApiCategory,
  name: string,
  scope: string = "user",
  projectDir?: string,
): Promise<FileResponse> {
  const params = withProjectDir(new URLSearchParams({ category, name, scope }), projectDir);
  return parseJson<FileResponse>(await apiFetch(`/api/file?${params.toString()}`));
}

const EDITABLE_CATEGORIES = new Set<ApiCategory>([
  "skills",
  "plans",
  "commands",
  "agents",
  "claudeMd",
]);

export function isEditableCategory(category: ApiCategory): boolean {
  return EDITABLE_CATEGORIES.has(category);
}

export type SaveFileResponse = {
  category: ApiCategory;
  name: string;
  ok: true;
};

export async function saveFile(
  category: ApiCategory,
  name: string,
  content: string,
  scope: string = "user",
  projectDir?: string,
): Promise<SaveFileResponse> {
  const params = withProjectDir(new URLSearchParams({ category, name, scope }), projectDir);
  const response = await apiFetch(`/api/file?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }

  return response.json() as Promise<SaveFileResponse>;
}

export async function fetchSettingsSchema(): Promise<SettingsSchemaResponse> {
  return parseJson<SettingsSchemaResponse>(await apiFetch("/api/settings/schema"));
}

export async function fetchSettings(
  scope: string = "user",
  projectDir?: string,
): Promise<SettingsResponse> {
  const params = withProjectDir(new URLSearchParams({ scope }), projectDir);
  return parseJson<SettingsResponse>(await apiFetch(`/api/settings?${params.toString()}`));
}

export async function fetchSkills(): Promise<SkillsResponse> {
  return parseJson<SkillsResponse>(await apiFetch("/api/skills"));
}

export type ContextEntry = {
  category: string;
  tokens: number;
  percentage: number;
};

export type ContextResponse =
  | { success: true; breakdown: ContextEntry[]; total: number }
  | { success: false; error: string };

export async function fetchContext(): Promise<ContextResponse> {
  return parseJson<ContextResponse>(await apiFetch("/api/context"));
}

export async function updateSettings(
  settings: Record<string, unknown>,
  scope: string = "user",
  projectDir?: string,
): Promise<SettingsResponse> {
  const params = withProjectDir(new URLSearchParams({ scope }), projectDir);
  const response = await apiFetch(`/api/settings?${params.toString()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }

  return response.json() as Promise<SettingsResponse>;
}

// Backup types and API functions
export type Backup = {
  id: string;
  path: string;
  timestamp: string;
  size: number;
};

export type BackupsFile = {
  path: string;
  backups: Backup[];
};

export type BackupsListResponse = {
  files: BackupsFile[];
};

export async function fetchBackups(): Promise<BackupsListResponse> {
  return parseJson<BackupsListResponse>(await apiFetch("/api/backups"));
}

export async function restoreBackup(backupId: string, originalPath: string): Promise<void> {
  const response = await apiFetch("/api/backups/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backupId, originalPath }),
  });

  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
}

export async function fetchMcpServers(
  scope: string = "user",
  projectDir?: string,
): Promise<McpListResponse> {
  const params = withProjectDir(new URLSearchParams({ scope }), projectDir);
  return parseJson<McpListResponse>(await apiFetch(`/api/mcp?${params.toString()}`));
}

export type ProjectListResponse = {
  projects: Array<{ dir: string; name: string; exists: boolean }>;
};

export async function fetchProjects(extras: string[]): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  if (extras.length > 0) {
    params.set("extra", extras.join(","));
  }
  const query = params.toString();
  return parseJson<ProjectListResponse>(
    await apiFetch(query ? `/api/projects?${query}` : "/api/projects"),
  );
}

// Usage Analytics types and API functions.
// These types mirror the backend shapes in apps/cli/src/usage/aggregate.ts and
// apps/cli/src/routes/usage.ts exactly — keep them in sync when either side changes.

/** Base cost/token totals shared by every usage aggregate. */
export type UsageAggregate = {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

// A 5-hour billing window ("block") tracks in-progress spend against Anthropic's
// rate-limit window so users can see burn rate and a live cost projection.
export type UsageBlock = UsageAggregate & {
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
};

export type UsageModelToday = UsageAggregate & { turns: number };

export type UsageToday = UsageAggregate & {
  date: string;
  turns: number;
  byModel: Record<string, UsageModelToday>;
};

export type UsageHeatmapEntry = {
  date: string;
  cost: number;
  turns: number;
};

export type UsageTotals = UsageAggregate & {
  sessionCount: number;
  projectCount: number;
};

export type UsageOverview = {
  totals: UsageTotals;
  today: UsageToday;
  activeWindow: UsageBlock | null;
  heatmap: UsageHeatmapEntry[];
  pricingAsOf: string;
};

export type UsageModel = UsageAggregate & {
  model: string;
  sessionCount: number;
  share: number;
};

export type UsageModelsResponse = {
  models: UsageModel[];
};

export type UsageModelsQuery = {
  period?: string;
  since?: string;
  until?: string;
};

export type UsageProject = UsageAggregate & {
  project: string;
  sessionCount: number;
};

export type UsageProjectsResponse = {
  projects: UsageProject[];
};

export type UsageProjectsQuery = {
  period?: string;
  since?: string;
  until?: string;
};

export type UsageTimelineGranularity = "daily" | "monthly";

export type UsageTimelineEntry = UsageAggregate & {
  period: string;
  sessionCount: number;
};

export type UsageTimelineResponse = {
  timeline: UsageTimelineEntry[];
  granularity: UsageTimelineGranularity;
  /** Unique sessions across the filtered range (not a sum of per-bucket counts). */
  uniqueSessionCount: number;
};

export type UsageTimelineQuery = {
  granularity?: UsageTimelineGranularity;
  since?: string;
  until?: string;
};

export type UsageSession = UsageAggregate & {
  sessionId: string;
  project: string;
  turns: number;
  firstTimestampMs: number;
  lastTimestampMs: number;
  models: string[];
};

export type UsageSessionsResponse = {
  sessions: UsageSession[];
};

export type UsageSessionsQuery = {
  sort?: "cost" | "recent";
  limit?: number;
};

export type UsageWindowsResponse = {
  windows: UsageBlock[];
};

export type UsageWindowsQuery = {
  limit?: number;
};

export type UsagePrompt = {
  timestampMs: number;
  date: string;
  project: string;
  sessionId: string;
  prompt: string | null;
  cost: number | null;
};

export type UsagePromptsResponse = {
  prompts: UsagePrompt[];
};

export type UsagePromptsQuery = {
  limit?: number;
  since?: string;
  until?: string;
  project?: string;
};

function toSearchParams(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export async function fetchUsageOverview(): Promise<UsageOverview> {
  return parseJson<UsageOverview>(await apiFetch("/api/usage/overview"));
}

export async function fetchUsageModels(query: UsageModelsQuery = {}): Promise<UsageModelsResponse> {
  return parseJson<UsageModelsResponse>(
    await apiFetch(`/api/usage/models${toSearchParams(query)}`),
  );
}

export async function fetchUsageProjects(
  query: UsageProjectsQuery = {},
): Promise<UsageProjectsResponse> {
  return parseJson<UsageProjectsResponse>(
    await apiFetch(`/api/usage/projects${toSearchParams(query)}`),
  );
}

export async function fetchUsageTimeline(
  query: UsageTimelineQuery = {},
): Promise<UsageTimelineResponse> {
  return parseJson<UsageTimelineResponse>(
    await apiFetch(`/api/usage/timeline${toSearchParams(query)}`),
  );
}

export async function fetchUsageSessions(
  query: UsageSessionsQuery = {},
): Promise<UsageSessionsResponse> {
  return parseJson<UsageSessionsResponse>(
    await apiFetch(`/api/usage/sessions${toSearchParams(query)}`),
  );
}

export async function fetchUsageWindows(
  query: UsageWindowsQuery = {},
): Promise<UsageWindowsResponse> {
  return parseJson<UsageWindowsResponse>(
    await apiFetch(`/api/usage/windows${toSearchParams(query)}`),
  );
}

export async function fetchUsagePrompts(
  query: UsagePromptsQuery = {},
): Promise<UsagePromptsResponse> {
  return parseJson<UsagePromptsResponse>(
    await apiFetch(`/api/usage/prompts${toSearchParams(query)}`),
  );
}
