import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  installTargetSchema,
  type DiscoveredItem,
  type InstallTarget,
  type ManifestEntry,
} from "schema";
import { applyPlan, type Resolution, type Resolutions } from "../discover/apply.js";
import { DiscoverError, type DiscoverErrorCode } from "../discover/errors.js";
import { fetchHeadBlobShas, fetchRawFile, scanRepo } from "../discover/github.js";
import {
  computeStatus,
  findEntry,
  listEntries,
  readDiskHashes,
  uninstall,
  type RemoteState,
} from "../discover/manifest.js";
import {
  assertInstallable,
  buildPlan,
  collectMerges,
  collectWrites,
  readDiskState,
  readMergeState,
  readSettingsDoc,
  withoutRecordedMcp,
  type FetchedItem,
  type UpdateBasis,
} from "../discover/plan.js";
import { resolveSkillsShItem, searchSkillsSh } from "../discover/skillsSh.js";

export const discoverRoute = new Hono();

const STATUS_BY_CODE: Record<DiscoverErrorCode, ContentfulStatusCode> = {
  BAD_INPUT: 400,
  SHORT_QUERY: 400,
  REPO_NOT_FOUND: 404,
  RATE_LIMITED: 429,
  GITHUB_UNREACHABLE: 502,
  NOT_TEXT: 415,
  SKILLS_SH_UNREACHABLE: 502,
  SKILLS_SH_SCHEMA: 502,
  SKILL_NOT_FOUND: 404,
  PLAN_CHANGED: 409,
  ACK_REQUIRED: 422,
  LOCALLY_MODIFIED: 409,
  INSTALL_NOT_FOUND: 404,
};

const TOKEN_HINT = "Set GITHUB_TOKEN (or run `gh auth login`) to raise the GitHub rate limit.";

function errorBody(error: DiscoverError) {
  const unauthenticated = error.code === "RATE_LIMITED" && error.details?.authenticated === false;
  return {
    error: error.message,
    code: error.code,
    ...error.details,
    ...(unauthenticated ? { hint: TOKEN_HINT } : {}),
  };
}

/** Maps typed Discover errors to HTTP responses; anything else is a real bug and propagates. */
discoverRoute.onError((error, c) => {
  if (!(error instanceof DiscoverError)) throw error;
  return c.json(errorBody(error), STATUS_BY_CODE[error.code]);
});

discoverRoute.post("/repo/scan", async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const input = (body as { input?: unknown } | undefined)?.input;
  if (typeof input !== "string") {
    throw new DiscoverError("BAD_INPUT", "Request body must be { input: string }");
  }
  return c.json(await scanRepo(input));
});

discoverRoute.get("/skills-sh/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const limit = c.req.query("limit");
  const outcome = await searchSkillsSh(q, limit === undefined ? undefined : Number(limit));
  if ("error" in outcome) {
    const message =
      outcome.error === "SHORT_QUERY"
        ? "Query must be at least 2 characters"
        : outcome.error === "SKILLS_SH_SCHEMA"
          ? "skills.sh returned an unexpected response"
          : "skills.sh could not be reached";
    throw new DiscoverError(outcome.error, message);
  }
  return c.json({ results: outcome.results });
});

discoverRoute.post("/skills-sh/resolve", async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const id = (body as { id?: unknown } | undefined)?.id;
  if (typeof id !== "string")
    throw new DiscoverError("BAD_INPUT", "Request body must be { id: string }");
  return c.json(await resolveSkillsShItem(id));
});

discoverRoute.get("/repo/file", async (c) => {
  const { owner, repo, sha, path } = c.req.query();
  if (!owner || !repo || !sha || !path) {
    throw new DiscoverError("BAD_INPUT", "owner, repo, sha and path are required");
  }
  const file = await fetchRawFile(owner, repo, sha, path);
  if ("tooLarge" in file) {
    return c.json({ error: "File is too large to preview", tooLarge: true }, 413);
  }
  return c.json(file);
});

// ---------- plan + apply ----------

const RESOLUTIONS: ReadonlySet<string> = new Set<Resolution>(["skip", "overwrite", "rename"]);

type PlanRequest = {
  repo: { owner: string; repo: string; sha: string; subpath?: string };
  itemIds: string[];
  target: InstallTarget;
  resolutions: Resolutions;
  /** Set for updates: the repo is re-scanned at its current HEAD and planned against this entry. */
  update?: ManifestEntry;
};

/** Placeholder `repo.sha` for updates; the real commit is whatever HEAD resolves to on scan. */
const HEAD_SHA = "HEAD";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string" && value !== "";

function badBody(message: string): never {
  throw new DiscoverError("BAD_INPUT", message);
}

function parseResolutions(raw: unknown): Resolutions {
  if (raw === undefined) return {};
  if (
    !isRecord(raw) ||
    !Object.values(raw).every((v) => typeof v === "string" && RESOLUTIONS.has(v))
  ) {
    return badBody("resolutions must map file paths to skip | overwrite | rename");
  }
  return raw as Resolutions;
}

function parsePlanRequest(body: unknown): PlanRequest {
  if (!isRecord(body) || !isRecord(body.repo))
    return badBody("repo, itemIds and target are required");
  const { owner, repo, sha, subpath } = body.repo;
  if (!isString(owner) || !isString(repo) || !isString(sha)) {
    return badBody("repo must include owner, repo and sha");
  }
  const { itemIds } = body;
  if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every(isString)) {
    return badBody("itemIds must be a non-empty array of strings");
  }
  const target = installTargetSchema.safeParse(body.target);
  if (!target.success) return badBody("target must be { scope, projectDir? }");
  return {
    repo: { owner, repo, sha, ...(isString(subpath) ? { subpath } : {}) },
    itemIds,
    target: target.data,
    resolutions: parseResolutions(body.resolutions),
  };
}

const flattenItems = (items: DiscoveredItem[]): DiscoveredItem[] =>
  items.flatMap((item) => {
    const children = (item.payload as { children?: unknown } | undefined)?.children;
    return [item, ...(Array.isArray(children) ? (children as DiscoveredItem[]) : [])];
  });

type LoadedItems = { items: FetchedItem[]; commit: string };

function scanInputFor({ repo, update }: PlanRequest): string {
  if (update) return `${repo.owner}/${repo.repo}`;
  const base = `${repo.owner}/${repo.repo}/tree/${repo.sha}`;
  return repo.subpath ? `${base}/${repo.subpath}` : base;
}

/** Re-scans the repo (pinned to the requested commit, or HEAD for updates) and fetches each selected item's files. */
async function loadSelectedItems(request: PlanRequest): Promise<LoadedItems> {
  const scan = await scanRepo(scanInputFor(request));
  const known = flattenItems(scan.items);
  const items = request.itemIds.map((id) => {
    const found = known.find((item) => item.id === id);
    if (found) return found;
    if (request.update) {
      throw new DiscoverError(
        "SKILL_NOT_FOUND",
        `${request.update.itemName} is no longer in ${request.repo.owner}/${request.repo.repo}`,
      );
    }
    return badBody(`Unknown item: ${id}`);
  });
  items.forEach(assertInstallable);
  return {
    items: await Promise.all(items.map((item) => fetchItemFiles(scan.repo, item))),
    commit: scan.repo.sha,
  };
}

async function fetchItemFiles(
  repo: { owner: string; repo: string; sha: string },
  item: DiscoveredItem,
): Promise<FetchedItem> {
  const files = new Map<string, string>();
  for (const file of item.files) {
    const raw = await fetchRawFile(repo.owner, repo.repo, repo.sha, file.path);
    if ("tooLarge" in raw) badBody(`${file.path} is too large to install`);
    files.set(file.path, raw.content);
  }
  return { item, files, source: { owner: repo.owner, repo: repo.repo } };
}

async function updateBasisFor(
  request: PlanRequest,
  items: FetchedItem[],
): Promise<UpdateBasis | undefined> {
  const { update } = request;
  if (!update) return undefined;
  const disk = await readDiskHashes(update.files.map((file) => file.path));
  return { itemId: items[0].item.id, entry: update, disk };
}

async function computePlan(request: PlanRequest) {
  const { items, commit } = await loadSelectedItems(request);
  const { target } = request;
  const basis = await updateBasisFor(request, items);
  const writes = collectWrites(items, target);
  const merges = withoutRecordedMcp(collectMerges(items, target), basis);
  const [diskState, mergeState] = await Promise.all([
    readDiskState(writes),
    readMergeState(target, merges),
  ]);
  const plan = buildPlan(items, target, diskState, mergeState, basis);
  return { plan, writes, merges, items, commit };
}

/** Resolves `update` to the manifest entry it names; the entry, not the client, decides repo and target. */
async function parseUpdateRequest(body: Record<string, unknown>): Promise<PlanRequest> {
  if (!isString(body.update)) return badBody("update must be a manifest id");
  const entry = await findEntry(body.update);
  if (!entry) throw new DiscoverError("INSTALL_NOT_FOUND", "That install is no longer tracked");
  const { owner, repo, path } = entry.source;
  return {
    repo: { owner, repo, sha: HEAD_SHA },
    itemIds: [`${entry.itemKind}:${path}`],
    target: entry.target,
    resolutions: parseResolutions(body.resolutions),
    update: entry,
  };
}

async function parseRequest(body: unknown): Promise<PlanRequest> {
  if (isRecord(body) && body.update !== undefined) return parseUpdateRequest(body);
  return parsePlanRequest(body);
}

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  return c.req.json().catch(() => undefined);
}

discoverRoute.post("/plan", async (c) => {
  const { plan } = await computePlan(await parseRequest(await readBody(c)));
  return c.json(plan);
});

discoverRoute.post("/apply", async (c) => {
  const body = await readBody(c);
  const request = await parseRequest(body);
  const { planHash, acknowledgedDanger, skillsShId } = body as {
    planHash?: unknown;
    acknowledgedDanger?: unknown;
    skillsShId?: unknown;
  };
  if (!isString(planHash)) badBody("planHash is required");

  // Recompute from current remote + disk state: never trust the preview the client saw.
  const { plan, writes, merges, items, commit } = await computePlan(request);
  if (plan.planHash !== planHash) {
    throw new DiscoverError(
      "PLAN_CHANGED",
      "The plan changed since it was previewed; review it again",
    );
  }
  const hasDanger = plan.findings.some((finding) => finding.severity === "danger");
  if (hasDanger && acknowledgedDanger !== true) {
    throw new DiscoverError("ACK_REQUIRED", "Danger findings must be acknowledged before applying");
  }
  const skillsSh = isString(skillsShId) ? skillsShId : undefined;
  const record = {
    items,
    source: {
      kind: skillsSh ? ("skills.sh" as const) : ("github" as const),
      commit,
      skillsShId: skillsSh,
    },
    update: request.update,
  };
  return c.json(
    await applyPlan({ plan, writes, merges, resolutions: request.resolutions, record }),
  );
});

// ---------- installs (manifest) ----------

const repoKey = (entry: ManifestEntry) => `${entry.source.owner}/${entry.source.repo}`;

/** One lookup per distinct repo, however many entries share it (spec §3.4). */
async function lookupRemotes(entries: ManifestEntry[]): Promise<Map<string, RemoteState>> {
  const repos = new Map(entries.map((entry) => [repoKey(entry), entry.source]));
  const remotes = new Map<string, RemoteState>();
  await Promise.all(
    [...repos].map(async ([key, { owner, repo }]) => {
      try {
        remotes.set(key, { available: true, blobShas: await fetchHeadBlobShas({ owner, repo }) });
      } catch (error) {
        // A rate limit says nothing about the repo, so it must not read as "source unavailable".
        if (!(error instanceof DiscoverError) || error.code === "RATE_LIMITED") throw error;
        remotes.set(key, { available: false });
      }
    }),
  );
  return remotes;
}

discoverRoute.get("/installs", async (c) => {
  const entries = await listEntries();
  const remotes = c.req.query("check") === "1" ? await lookupRemotes(entries) : undefined;
  const rows = await Promise.all(
    entries.map(async (entry) => {
      const disk = await readDiskHashes(entry.files.map((file) => file.path));
      const settings =
        entry.settingsEntries.length > 0 ? await readSettingsDoc(entry.target) : undefined;
      return {
        ...entry,
        status: computeStatus(entry, disk, remotes?.get(repoKey(entry)), settings),
      };
    }),
  );
  return c.json({ entries: rows });
});

discoverRoute.delete("/installs/:id", async (c) => {
  const result = await uninstall(c.req.param("id"), { force: c.req.query("force") === "1" });
  return c.json({ ok: true, ...result });
});
