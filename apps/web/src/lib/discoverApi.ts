import type {
  DiscoveredItem,
  InstalledEntry,
  InstallPlan,
  InstallTarget,
  RepoRef,
  SkillsShResult,
} from "schema";
import { apiFetch } from "./sessionApi";

/** Every `code` the Discover endpoints implemented so far can return (spec §5). */
export type DiscoverErrorCode =
  | "BAD_INPUT"
  | "SHORT_QUERY"
  | "REPO_NOT_FOUND"
  | "RATE_LIMITED"
  | "GITHUB_UNREACHABLE"
  | "NOT_TEXT"
  | "SKILLS_SH_UNREACHABLE"
  | "SKILLS_SH_SCHEMA"
  | "SKILL_NOT_FOUND"
  | "PLAN_CHANGED"
  | "ACK_REQUIRED"
  | "LOCALLY_MODIFIED"
  | "INSTALL_NOT_FOUND";

const KNOWN_CODES: ReadonlySet<string> = new Set<DiscoverErrorCode>([
  "BAD_INPUT",
  "SHORT_QUERY",
  "REPO_NOT_FOUND",
  "RATE_LIMITED",
  "GITHUB_UNREACHABLE",
  "NOT_TEXT",
  "SKILLS_SH_UNREACHABLE",
  "SKILLS_SH_SCHEMA",
  "SKILL_NOT_FOUND",
  "PLAN_CHANGED",
  "ACK_REQUIRED",
  "LOCALLY_MODIFIED",
  "INSTALL_NOT_FOUND",
]);

export type DiscoverApiError =
  | {
      ok: false;
      code: DiscoverErrorCode;
      message: string;
      /** RATE_LIMITED only: ISO reset time and the token hint when unauthenticated. */
      resetAt?: string;
      hint?: string;
      /** LOCALLY_MODIFIED only: the edited files an uninstall would delete. */
      files?: string[];
    }
  | { ok: false; code: "TOO_LARGE"; message: string }
  | { ok: false; code: "NETWORK" | "UNKNOWN"; message: string };

export type DiscoverResult<T> = ({ ok: true } & T) | DiscoverApiError;

export type ScanRateLimit = { authenticated: boolean; remaining?: number; resetAt?: string };

export type ScannedRepo = RepoRef & {
  description: string | null;
  stars: number;
  defaultBranch: string;
  htmlUrl: string;
  truncated: boolean;
};

export type ScanResponse = {
  repo: ScannedRepo;
  items: DiscoveredItem[];
  warnings: string[];
  rateLimit: ScanRateLimit;
};

export type RepoFileQuery = { owner: string; repo: string; sha: string; path: string };

type ErrorBody = {
  error?: unknown;
  code?: unknown;
  resetAt?: unknown;
  hint?: unknown;
  files?: unknown;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : undefined;
}

async function toError(response: Response): Promise<DiscoverApiError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  const message = str(body.error) ?? `Request failed (${response.status})`;
  const code = str(body.code);
  if (response.status === 413) return { ok: false, code: "TOO_LARGE", message };
  if (code !== undefined && KNOWN_CODES.has(code)) {
    return {
      ok: false,
      code: code as DiscoverErrorCode,
      message,
      resetAt: str(body.resetAt),
      hint: str(body.hint),
      files: strings(body.files),
    };
  }
  return { ok: false, code: "UNKNOWN", message };
}

/** Runs a request and narrows the outcome to a typed success or a typed error. */
async function request<T>(
  call: () => Promise<Response>,
  pick: (body: never) => T,
): Promise<DiscoverResult<T>> {
  let response: Response;
  try {
    response = await call();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Network error";
    return { ok: false, code: "NETWORK", message };
  }
  if (!response.ok) return toError(response);
  const body = (await response.json()) as never;
  return { ok: true, ...pick(body) };
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function scanRepo(input: string): Promise<DiscoverResult<ScanResponse>> {
  return request(
    () => apiFetch("/api/discover/repo/scan", jsonPost({ input })),
    (body: ScanResponse) => body,
  );
}

export function searchSkillsSh(
  q: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<DiscoverResult<{ results: SkillsShResult[] }>> {
  const params = new URLSearchParams({ q });
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  return request(
    () => apiFetch(`/api/discover/skills-sh/search?${params}`, { signal: options.signal }),
    (body: { results: SkillsShResult[] }) => ({ results: body.results }),
  );
}

export function resolveSkillsShItem(
  id: string,
): Promise<DiscoverResult<{ repo: ScannedRepo; item: DiscoveredItem }>> {
  return request(
    () => apiFetch("/api/discover/skills-sh/resolve", jsonPost({ id })),
    (body: { repo: ScannedRepo; item: DiscoveredItem }) => ({
      repo: body.repo,
      item: body.item,
    }),
  );
}

export function fetchRepoFile(
  query: RepoFileQuery,
): Promise<DiscoverResult<{ content: string; size: number }>> {
  const params = new URLSearchParams(query);
  return request(
    () => apiFetch(`/api/discover/repo/file?${params}`),
    (body: { content: string; size: number }) => ({ content: body.content, size: body.size }),
  );
}

export type ConflictResolution = "skip" | "overwrite" | "rename";

/** Identifies which items to install, where, and how conflicts were resolved (spec §5). */
type PlanResolutions = {
  /** Keyed by the conflicting file's absolute target path. */
  resolutions?: Record<string, ConflictResolution>;
};

export type FreshInstallRequest = PlanResolutions & {
  repo: Pick<RepoRef, "owner" | "repo" | "sha" | "subpath">;
  itemIds: string[];
  target: InstallTarget;
};

/** Re-plans an existing install at the repo's HEAD; the server derives repo, item and target. */
export type UpdateInstallRequest = PlanResolutions & { update: string };

export type PlanRequest = FreshInstallRequest | UpdateInstallRequest;

export type ApplyRequest = PlanRequest & {
  planHash: string;
  acknowledgedDanger: boolean;
  /** Recorded on the manifest entry so skills.sh cards can recognise the install. */
  skillsShId?: string;
};

export type ApplyItemResult = { itemId: string; ok: boolean; error?: string; manifestId?: string };

export type ApplyResponse = { results: ApplyItemResult[]; backups: string[] };

export function fetchPlan(body: PlanRequest): Promise<DiscoverResult<{ plan: InstallPlan }>> {
  return request(
    () => apiFetch("/api/discover/plan", jsonPost(body)),
    (plan: InstallPlan) => ({ plan }),
  );
}

export function applyPlan(body: ApplyRequest): Promise<DiscoverResult<ApplyResponse>> {
  return request(
    () => apiFetch("/api/discover/apply", jsonPost(body)),
    (response: ApplyResponse) => response,
  );
}

export type UninstallResponse = { removedFiles: string[]; revertedEntries: string[] };

/** `check` asks the server to compare every recorded repo with GitHub (one call per repo). */
export function listInstalls(
  options: { check?: boolean } = {},
): Promise<DiscoverResult<{ entries: InstalledEntry[] }>> {
  const query = options.check ? "?check=1" : "";
  return request(
    () => apiFetch(`/api/discover/installs${query}`),
    (body: { entries: InstalledEntry[] }) => ({ entries: body.entries }),
  );
}

/** Without `force`, an install with hand-edited files fails with `LOCALLY_MODIFIED` listing them. */
export function uninstall(
  id: string,
  options: { force?: boolean } = {},
): Promise<DiscoverResult<UninstallResponse>> {
  const query = options.force ? "?force=1" : "";
  return request(
    () =>
      apiFetch(`/api/discover/installs/${encodeURIComponent(id)}${query}`, { method: "DELETE" }),
    (body: UninstallResponse) => ({
      removedFiles: body.removedFiles,
      revertedEntries: body.revertedEntries,
    }),
  );
}
