import { execFile } from "node:child_process";
import { MAX_FILE_BYTES, type DiscoveredItem, type RepoRef } from "schema";
import { detectWithWarnings, neededFilePaths } from "./detect.js";
import { DiscoverError } from "./errors.js";
import { parseRepoInput } from "./repoInput.js";

const API_BASE = "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";
const USER_AGENT = "claude-desk";
const GH_TOKEN_TIMEOUT_MS = 3_000;
const FULL_SHA = /^[0-9a-f]{40}$/i;

export type RateLimitInfo = {
  remaining: number;
  /** ISO timestamp when the window resets. */
  resetAt: string;
};

export type RepoCoords = { owner: string; repo: string };

export type RepoMeta = RepoCoords & {
  description: string | null;
  stars: number;
  defaultBranch: string;
  htmlUrl: string;
  /** The ref actually resolved (requested ref, or the default branch). */
  ref: string;
  /** Commit SHA the ref pointed at when scanned; every later fetch is pinned to it. */
  sha: string;
  rateLimit?: RateLimitInfo;
};

export type TreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
};

export type RepoTree = {
  sha: string;
  entries: TreeEntry[];
  /** GitHub dropped entries because the repo is too large; callers must warn the user. */
  truncated: boolean;
  rateLimit?: RateLimitInfo;
};

export type RawFileResult = { content: string; size: number } | { tooLarge: true };

// ---------- token (module-private: never returned or logged) ----------

let tokenPromise: Promise<string | undefined> | undefined;

function readGhCliToken(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile("gh", ["auth", "token"], { timeout: GH_TOKEN_TIMEOUT_MS }, (error, stdout) => {
      // gh missing / not logged in is an expected state: fall back to unauthenticated.
      resolve(error ? undefined : String(stdout).trim() || undefined);
    });
  });
}

async function resolveGitHubToken(): Promise<string | undefined> {
  const fromEnv = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  return fromEnv || readGhCliToken();
}

function getToken(): Promise<string | undefined> {
  tokenPromise ??= resolveGitHubToken();
  return tokenPromise;
}

async function authHeaders(accept: string): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    accept,
    "user-agent": USER_AGENT,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/** True when a token resolved; lets routes show a hint without ever seeing the token. */
export async function isGitHubAuthenticated(): Promise<boolean> {
  return (await getToken()) !== undefined;
}

// ---------- shared request plumbing ----------

export function parseRateLimit(headers: Headers): RateLimitInfo | undefined {
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (!headers.has("x-ratelimit-remaining") || !Number.isFinite(remaining)) return undefined;
  if (!headers.has("x-ratelimit-reset") || !Number.isFinite(reset)) return undefined;
  return { remaining, resetAt: new Date(reset * 1000).toISOString() };
}

async function request(url: string, accept: string): Promise<Response> {
  try {
    return await fetch(url, { headers: await authHeaders(accept) });
  } catch (cause) {
    throw new DiscoverError("GITHUB_UNREACHABLE", "Can't reach GitHub", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

async function throwForStatus(res: Response, what: string): Promise<never> {
  const rateLimit = parseRateLimit(res.headers);
  const exhausted = res.status === 429 || (res.status === 403 && rateLimit?.remaining === 0);
  if (exhausted) {
    throw new DiscoverError("RATE_LIMITED", "GitHub API rate limit reached", {
      resetAt: rateLimit?.resetAt,
      authenticated: await isGitHubAuthenticated(),
    });
  }
  if (res.status === 404) throw new DiscoverError("REPO_NOT_FOUND", `${what} not found`);
  throw new DiscoverError("GITHUB_UNREACHABLE", `GitHub returned ${res.status} for ${what}`, {
    status: res.status,
  });
}

async function getJson<T>(
  path: string,
  what: string,
): Promise<{ data: T; rateLimit?: RateLimitInfo }> {
  const res = await request(`${API_BASE}${path}`, "application/vnd.github+json");
  if (!res.ok) await throwForStatus(res, what);
  return { data: (await res.json()) as T, rateLimit: parseRateLimit(res.headers) };
}

// ---------- repo meta + tree ----------

type ApiRepo = {
  description: string | null;
  stargazers_count: number;
  default_branch: string;
  html_url: string;
};

const encodeRef = (ref: string) => ref.split("/").map(encodeURIComponent).join("/");

export async function fetchRepoMeta(input: RepoCoords & { ref?: string }): Promise<RepoMeta> {
  const base = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  const { data: repo } = await getJson<ApiRepo>(base, `${input.owner}/${input.repo}`);
  const ref = input.ref ?? repo.default_branch;

  const shaRes = await request(
    `${API_BASE}${base}/commits/${encodeRef(ref)}`,
    "application/vnd.github.sha",
  );
  if (!shaRes.ok) await throwForStatus(shaRes, `ref "${ref}" in ${input.owner}/${input.repo}`);

  return {
    owner: input.owner,
    repo: input.repo,
    description: repo.description,
    stars: repo.stargazers_count,
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
    ref,
    sha: (await shaRes.text()).trim(),
    rateLimit: parseRateLimit(shaRes.headers),
  };
}

type ApiTree = { sha: string; tree: TreeEntry[]; truncated: boolean };

// Trees are immutable for a given SHA, so the cache never needs invalidation.
const treeCache = new Map<string, RepoTree>();

export async function fetchTree(coords: RepoCoords, sha: string): Promise<RepoTree> {
  const key = `${coords.owner}/${coords.repo}@${sha}`;
  const cached = treeCache.get(key);
  if (cached) return cached;

  const path = `/repos/${encodeURIComponent(coords.owner)}/${encodeURIComponent(coords.repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`;
  const { data, rateLimit } = await getJson<ApiTree>(path, `tree ${sha}`);
  const tree: RepoTree = {
    sha: data.sha,
    entries: data.tree,
    truncated: data.truncated,
    rateLimit,
  };
  treeCache.set(key, tree);
  return tree;
}

/**
 * Blob SHAs of every file at the repo's default-branch HEAD, in a single REST call
 * (the trees endpoint resolves `HEAD`). Deliberately uncached: HEAD moves, which is
 * exactly what update checks need to see (spec §3.4).
 */
export async function fetchHeadBlobShas(coords: RepoCoords): Promise<Record<string, string>> {
  const path = `/repos/${encodeURIComponent(coords.owner)}/${encodeURIComponent(coords.repo)}/git/trees/HEAD?recursive=1`;
  const { data } = await getJson<ApiTree>(path, `${coords.owner}/${coords.repo}`);
  return Object.fromEntries(
    data.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]),
  );
}

// ---------- raw file ----------

const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true });

/** Reads at most `limit + 1` bytes; returns undefined once the cap is exceeded. */
async function readCapped(res: Response, limit: number): Promise<Uint8Array | undefined> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function decodeText(bytes: Uint8Array, path: string): string {
  const notText = () => new DiscoverError("NOT_TEXT", `${path} is not a UTF-8 text file`);
  if (bytes.includes(0)) throw notText();
  try {
    return UTF8_STRICT.decode(bytes);
  } catch {
    throw notText();
  }
}

/**
 * Fetches a file pinned to a commit SHA (never a branch name), so what the user
 * previews is what gets installed. raw.githubusercontent.com is not counted
 * against the REST rate limit.
 */
export async function fetchRawFile(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): Promise<RawFileResult> {
  if (!FULL_SHA.test(sha)) {
    throw new DiscoverError("BAD_INPUT", "Raw files must be fetched by full commit SHA");
  }
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${sha}/${encodedPath}`;
  const res = await request(url, "text/plain");
  if (!res.ok) await throwForStatus(res, `${path} in ${owner}/${repo}`);

  // Content-Length may be the compressed size, so it is only an early-out; the capped read is authoritative.
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
    await res.body?.cancel();
    return { tooLarge: true };
  }
  const bytes = await readCapped(res, MAX_FILE_BYTES);
  if (!bytes) return { tooLarge: true };
  return { content: decodeText(bytes, path), size: bytes.byteLength };
}

// ---------- scan orchestration ----------

const SCAN_FETCH_CONCURRENCY = 8;

export type ScanRateLimit = Partial<RateLimitInfo> & { authenticated: boolean };

export type ScanResult = {
  repo: RepoRef & {
    description: string | null;
    stars: number;
    defaultBranch: string;
    htmlUrl: string;
    truncated: boolean;
  };
  items: DiscoveredItem[];
  warnings: string[];
  rateLimit: ScanRateLimit;
};

const inSubpath = (path: string, subpath: string | undefined) =>
  !subpath || path === subpath || path.startsWith(`${subpath}/`);

/** Runs `task` over `inputs` with a bounded number in flight. */
async function mapPool<T, R>(inputs: T[], limit: number, task: (input: T) => Promise<R>) {
  const results = Array.from<R>({ length: inputs.length });
  let next = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const index = next++;
      results[index] = await task(inputs[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
  return results;
}

const isSkippable = (error: unknown): boolean =>
  error instanceof DiscoverError && (error.code === "NOT_TEXT" || error.code === "REPO_NOT_FOUND");

/** A 404 is definitive and a rate limit will not clear in milliseconds; anything else may be a blip. */
const isTransient = (error: unknown): boolean =>
  error instanceof DiscoverError && error.code === "GITHUB_UNREACHABLE";

/**
 * One failed raw fetch aborts the whole scan, so a transient failure gets a single retry.
 * The final error names the file and attempts so the UI is not left with a bare "Can't reach GitHub".
 */
async function fetchRawFileWithRetry(
  coords: RepoCoords & { sha: string },
  path: string,
): Promise<RawFileResult> {
  const attempt = () => fetchRawFile(coords.owner, coords.repo, coords.sha, path);
  try {
    return await attempt();
  } catch (first) {
    if (!isTransient(first)) throw first;
    try {
      return await attempt();
    } catch (second) {
      if (!(second instanceof DiscoverError)) throw second;
      throw new DiscoverError(second.code, second.message, {
        ...second.details,
        path,
        attempts: 2,
      });
    }
  }
}

/** Fetches only the files the detectors read; per-file problems become warnings, not failures. */
async function fetchDetectorFiles(
  coords: RepoCoords & { sha: string },
  paths: string[],
  warnings: string[],
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  await mapPool(paths, SCAN_FETCH_CONCURRENCY, async (path) => {
    try {
      const file = await fetchRawFileWithRetry(coords, path);
      if ("tooLarge" in file) warnings.push(`${path} is too large to inspect; skipped`);
      else contents.set(path, file.content);
    } catch (error) {
      if (!isSkippable(error)) throw error;
      warnings.push(`${path} could not be read (${(error as DiscoverError).message}); skipped`);
    }
  });
  return contents;
}

/** Parse input -> repo meta -> tree -> lazily fetch detector files -> detect items. */
export async function scanRepo(input: string): Promise<ScanResult> {
  const parsed = parseRepoInput(input);
  if (!parsed.ok) throw parsed.error;
  const { subpath, ...coords } = parsed.value;

  const meta = await fetchRepoMeta(coords);
  const tree = await fetchTree(meta, meta.sha);
  const warnings: string[] = [];
  if (tree.truncated) {
    warnings.push(
      "Repo is very large; some files may be missing — try a /tree/<ref>/<subpath> link",
    );
  }

  const entries = tree.entries.filter((entry) => inSubpath(entry.path, subpath));
  const contents = await fetchDetectorFiles(meta, neededFilePaths(entries), warnings);
  const detected = detectWithWarnings(entries, (path) => contents.get(path));

  return {
    repo: {
      owner: meta.owner,
      repo: meta.repo,
      ref: meta.ref,
      sha: meta.sha,
      ...(subpath ? { subpath } : {}),
      description: meta.description,
      stars: meta.stars,
      defaultBranch: meta.defaultBranch,
      htmlUrl: meta.htmlUrl,
      truncated: tree.truncated,
    },
    items: detected.items,
    warnings: [...warnings, ...detected.warnings],
    rateLimit: {
      ...(tree.rateLimit ?? meta.rateLimit),
      authenticated: await isGitHubAuthenticated(),
    },
  };
}

/** Test seam: clears the SHA cache and the memoised token. */
export function resetGitHubClientState(): void {
  treeCache.clear();
  tokenPromise = undefined;
}
