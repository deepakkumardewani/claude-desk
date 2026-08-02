import type { McpListResponse } from "schema";

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

export async function fetchTree(scope: string = "user"): Promise<TreeResponse> {
  return parseJson<TreeResponse>(await fetch(`/api/tree?scope=${encodeURIComponent(scope)}`));
}

export async function fetchFile(
  category: ApiCategory,
  name: string,
  scope: string = "user",
): Promise<FileResponse> {
  const params = new URLSearchParams({ category, name, scope });
  return parseJson<FileResponse>(await fetch(`/api/file?${params.toString()}`));
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
): Promise<SaveFileResponse> {
  const params = new URLSearchParams({ category, name, scope });
  const response = await fetch(`/api/file?${params.toString()}`, {
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
  return parseJson<SettingsSchemaResponse>(await fetch("/api/settings/schema"));
}

export async function fetchSettings(scope: string = "user"): Promise<SettingsResponse> {
  return parseJson<SettingsResponse>(
    await fetch(`/api/settings?scope=${encodeURIComponent(scope)}`),
  );
}

export async function fetchSkills(): Promise<SkillsResponse> {
  return parseJson<SkillsResponse>(await fetch("/api/skills"));
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
  return parseJson<ContextResponse>(await fetch("/api/context"));
}

export async function updateSettings(
  settings: Record<string, unknown>,
  scope: string = "user",
): Promise<SettingsResponse> {
  const response = await fetch(`/api/settings?scope=${encodeURIComponent(scope)}`, {
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
  return parseJson<BackupsListResponse>(await fetch("/api/backups"));
}

export async function restoreBackup(backupId: string, originalPath: string): Promise<void> {
  const response = await fetch("/api/backups/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backupId, originalPath }),
  });

  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
}

export async function fetchMcpServers(): Promise<McpListResponse> {
  return parseJson<McpListResponse>(await fetch("/api/mcp"));
}

// Usage Analytics types and API functions
export type UsageOverview = {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionCount: number;
};

export type UsageModel = {
  model: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  sessionCount: number;
};

export type UsageModelsResponse = {
  models: UsageModel[];
};

export type UsageProject = {
  project: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  sessionCount: number;
};

export type UsageProjectsResponse = {
  projects: UsageProject[];
};

export type UsageTimelineEntry = {
  date: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  sessionCount: number;
};

export type UsageTimelineResponse = {
  timeline: UsageTimelineEntry[];
};

export async function fetchUsageOverview(): Promise<UsageOverview> {
  return parseJson<UsageOverview>(await fetch("/api/usage/overview"));
}

export async function fetchUsageModels(): Promise<UsageModelsResponse> {
  return parseJson<UsageModelsResponse>(await fetch("/api/usage/models"));
}

export async function fetchUsageProjects(): Promise<UsageProjectsResponse> {
  return parseJson<UsageProjectsResponse>(await fetch("/api/usage/projects"));
}

export async function fetchUsageTimeline(): Promise<UsageTimelineResponse> {
  return parseJson<UsageTimelineResponse>(await fetch("/api/usage/timeline"));
}
