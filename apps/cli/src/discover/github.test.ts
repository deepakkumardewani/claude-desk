import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { MAX_FILE_BYTES } from "schema";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import {
  fetchRawFile,
  fetchRepoMeta,
  fetchTree,
  isGitHubAuthenticated,
  parseRateLimit,
  resetGitHubClientState,
  scanRepo,
} from "./github.js";
import { DiscoverError } from "./errors.js";
import { EndpointOverrideError, GITHUB_API_BASE_VAR } from "./endpoints.js";
import { createFetchStub } from "../testing/fetchStub.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
const treeFixture = fixture("github-tree.json");
const metaFixture = fixture("github-repo-meta.json");
const rawFixture = fixture("raw-skill-md.json");
const SHA = metaFixture.commitSha as string;

const rl = { "x-ratelimit-remaining": "42", "x-ratelimit-reset": "1800000000" };
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...rl }, ...init });

const fetchMock = vi.fn();
// Shared stub as a network guard: only GitHub (or loopback override) hosts are routable, so a
// stray call to anything else throws instead of leaving the machine. `fetchMock` keeps the
// per-test responses and the request init (headers) these assertions inspect.
const ALLOWED_HOSTS =
  /^(https:\/\/(api\.github\.com|raw\.githubusercontent\.com)|http:\/\/127\.0\.0\.1)[:/]/;
const networkGuard = createFetchStub([
  { match: (url) => ALLOWED_HOSTS.test(url.href), respond: () => new Response("{}") },
]);
const guardedFetch = async (input: string | URL | Request, init?: RequestInit) => {
  await networkGuard(input);
  return fetchMock(input, init);
};
const lastHeaders = () => fetchMock.mock.calls.at(-1)?.[1]?.headers as Record<string, string>;

async function expectCode(p: Promise<unknown>, code: string) {
  const error = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DiscoverError);
  expect((error as DiscoverError).code).toBe(code);
  return error as DiscoverError;
}

beforeEach(() => {
  resetGitHubClientState();
  fetchMock.mockReset();
  execFileMock.mockReset();
  vi.stubGlobal("fetch", guardedFetch);
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("GH_TOKEN", "");
  execFileMock.mockImplementation((_c, _a, _o, cb) => cb(new Error("gh: not found"), ""));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("token resolution", () => {
  it("prefers GITHUB_TOKEN over GH_TOKEN and never shells out", async () => {
    vi.stubEnv("GITHUB_TOKEN", "env-token");
    vi.stubEnv("GH_TOKEN", "other");
    fetchMock.mockResolvedValue(json(treeFixture));
    await fetchTree({ owner: "a", repo: "b" }, SHA);
    expect(lastHeaders().authorization).toBe("Bearer env-token");
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("falls back to GH_TOKEN", async () => {
    vi.stubEnv("GH_TOKEN", "gh-env");
    fetchMock.mockResolvedValue(json(treeFixture));
    await fetchTree({ owner: "a", repo: "b" }, SHA);
    expect(lastHeaders().authorization).toBe("Bearer gh-env");
  });

  it("uses `gh auth token` when no env var is set", async () => {
    execFileMock.mockImplementation((_c, _a, _o, cb) => cb(null, "cli-token\n"));
    fetchMock.mockResolvedValue(json(treeFixture));
    await fetchTree({ owner: "a", repo: "b" }, SHA);
    expect(execFileMock.mock.calls[0]?.slice(0, 2)).toEqual(["gh", ["auth", "token"]]);
    expect(lastHeaders().authorization).toBe("Bearer cli-token");
  });

  it("goes unauthenticated, without throwing, when gh is unavailable", async () => {
    fetchMock.mockResolvedValue(json(treeFixture));
    await fetchTree({ owner: "a", repo: "b" }, SHA);
    expect(lastHeaders().authorization).toBeUndefined();
    expect(await isGitHubAuthenticated()).toBe(false);
  });

  it("treats empty gh output as no token and memoises the lookup", async () => {
    execFileMock.mockImplementation((_c, _a, _o, cb) => cb(null, "  \n"));
    expect(await isGitHubAuthenticated()).toBe(false);
    await isGitHubAuthenticated();
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });
});

describe("endpoint overrides", () => {
  it("uses the production API host by default", async () => {
    vi.stubEnv(GITHUB_API_BASE_VAR, "");
    fetchMock.mockResolvedValue(json(treeFixture));
    await fetchTree({ owner: "a", repo: "b" }, SHA);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/^https:\/\/api\.github\.com\//);
  });

  it("sends requests to a loopback override", async () => {
    vi.stubEnv(GITHUB_API_BASE_VAR, "http://127.0.0.1:4010");
    fetchMock.mockResolvedValue(json(treeFixture));
    await fetchTree({ owner: "a", repo: "b" }, SHA);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/^http:\/\/127\.0\.0\.1:4010\//);
  });

  it("rejects a non-loopback override before any request, so no token can leak", async () => {
    vi.stubEnv(GITHUB_API_BASE_VAR, "https://evil.example");
    vi.stubEnv("GITHUB_TOKEN", "secret");
    await expect(fetchTree({ owner: "a", repo: "b" }, SHA)).rejects.toBeInstanceOf(
      EndpointOverrideError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("parseRateLimit", () => {
  it("parses remaining and reset into ISO", () => {
    expect(parseRateLimit(new Headers(rl))).toEqual({
      remaining: 42,
      resetAt: new Date(1800000000 * 1000).toISOString(),
    });
  });

  it("returns undefined when headers are absent or malformed", () => {
    expect(parseRateLimit(new Headers())).toBeUndefined();
    expect(
      parseRateLimit(new Headers({ "x-ratelimit-remaining": "x", "x-ratelimit-reset": "1" })),
    ).toBeUndefined();
    expect(parseRateLimit(new Headers({ "x-ratelimit-remaining": "1" }))).toBeUndefined();
  });
});

describe("fetchRepoMeta", () => {
  it("resolves default branch to a commit SHA", async () => {
    fetchMock
      .mockResolvedValueOnce(json(metaFixture))
      .mockResolvedValueOnce(new Response(`${SHA}\n`, { status: 200, headers: rl }));
    const meta = await fetchRepoMeta({ owner: "anthropics", repo: "skills" });
    expect(meta).toMatchObject({
      ref: "main",
      sha: SHA,
      stars: metaFixture.stargazers_count,
      defaultBranch: "main",
      rateLimit: { remaining: 42 },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.github.com/repos/anthropics/skills/commits/main",
    );
  });

  it("uses an explicit ref, encoding each segment but keeping slashes", async () => {
    fetchMock
      .mockResolvedValueOnce(json(metaFixture))
      .mockResolvedValueOnce(new Response(SHA, { status: 200 }));
    const meta = await fetchRepoMeta({ owner: "o", repo: "r", ref: "feat/a b" });
    expect(meta.ref).toBe("feat/a b");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/commits/feat/a%20b");
  });

  it("maps a 404 repo to REPO_NOT_FOUND", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    await expectCode(fetchRepoMeta({ owner: "o", repo: "nope" }), "REPO_NOT_FOUND");
  });

  it("maps a 404 ref to REPO_NOT_FOUND", async () => {
    fetchMock
      .mockResolvedValueOnce(json(metaFixture))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    await expectCode(fetchRepoMeta({ owner: "o", repo: "r", ref: "ghost" }), "REPO_NOT_FOUND");
  });

  it("maps 429 to RATE_LIMITED with reset time and auth hint", async () => {
    fetchMock.mockResolvedValue(
      new Response("{}", { status: 429, headers: { ...rl, "x-ratelimit-remaining": "0" } }),
    );
    const error = await expectCode(fetchRepoMeta({ owner: "o", repo: "r" }), "RATE_LIMITED");
    expect(error.details).toEqual({
      resetAt: new Date(1800000000 * 1000).toISOString(),
      authenticated: false,
    });
  });

  it("maps 403 with remaining=0 to RATE_LIMITED but other 403s to GITHUB_UNREACHABLE", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("{}", { status: 403, headers: { ...rl, "x-ratelimit-remaining": "0" } }),
    );
    await expectCode(fetchRepoMeta({ owner: "o", repo: "r" }), "RATE_LIMITED");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 403, headers: rl }));
    await expectCode(fetchRepoMeta({ owner: "o", repo: "r" }), "GITHUB_UNREACHABLE");
  });

  it("maps network failure to GITHUB_UNREACHABLE", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expectCode(fetchRepoMeta({ owner: "o", repo: "r" }), "GITHUB_UNREACHABLE");
  });
});

describe("fetchTree", () => {
  it("returns recorded entries and rate limit", async () => {
    fetchMock.mockResolvedValue(json(treeFixture));
    const tree = await fetchTree({ owner: "anthropics", repo: "skills" }, SHA);
    expect(tree.entries.length).toBe(treeFixture.tree.length);
    expect(tree.entries.some((e) => e.path.endsWith("SKILL.md"))).toBe(true);
    expect(tree.truncated).toBe(false);
    expect(tree.rateLimit?.remaining).toBe(42);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/git/trees/${SHA}?recursive=1`);
  });

  it("surfaces truncated: true", async () => {
    fetchMock.mockResolvedValue(json({ ...treeFixture, truncated: true }));
    expect((await fetchTree({ owner: "o", repo: "r" }, "t1")).truncated).toBe(true);
  });

  it("returns the same object and does not refetch for the same SHA", async () => {
    fetchMock.mockResolvedValue(json(treeFixture));
    const a = await fetchTree({ owner: "o", repo: "r" }, SHA);
    const b = await fetchTree({ owner: "o", repo: "r" }, SHA);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not share cache across repos or SHAs", async () => {
    fetchMock.mockImplementation(async () => json(treeFixture));
    await fetchTree({ owner: "o", repo: "r" }, SHA);
    await fetchTree({ owner: "o", repo: "other" }, SHA);
    await fetchTree({ owner: "o", repo: "r" }, "different");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not cache failures", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(json(treeFixture));
    await expectCode(fetchTree({ owner: "o", repo: "r" }, SHA), "REPO_NOT_FOUND");
    await expect(fetchTree({ owner: "o", repo: "r" }, SHA)).resolves.toBeDefined();
  });
});

describe("fetchRawFile", () => {
  const text = (body: string | Uint8Array, headers: Record<string, string> = {}) =>
    new Response(body as BodyInit, { status: 200, headers });

  it("fetches by pinned SHA and returns content + byte size", async () => {
    fetchMock.mockResolvedValue(text(rawFixture.content));
    const out = await fetchRawFile("anthropics", "skills", SHA, "skills/skill-creator/SKILL.md");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://raw.githubusercontent.com/anthropics/skills/${SHA}/skills/skill-creator/SKILL.md`,
    );
    expect(out).toEqual({
      content: rawFixture.content,
      size: Buffer.byteLength(rawFixture.content),
    });
  });

  it("rejects branch names and short SHAs before any request", async () => {
    await expectCode(fetchRawFile("o", "r", "main", "a.md"), "BAD_INPUT");
    await expectCode(fetchRawFile("o", "r", "abc1234", "a.md"), "BAD_INPUT");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("percent-encodes path segments", async () => {
    fetchMock.mockResolvedValue(text("x"));
    await fetchRawFile("o", "r", SHA, "a b/c#d.md");
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/a%20b\/c%23d\.md$/);
  });

  it("returns tooLarge from Content-Length without reading the body", async () => {
    const res = text("x", { "content-length": String(MAX_FILE_BYTES + 1) });
    const cancel = vi.spyOn(res.body!, "cancel");
    fetchMock.mockResolvedValue(res);
    expect(await fetchRawFile("o", "r", SHA, "big.md")).toEqual({ tooLarge: true });
    expect(cancel).toHaveBeenCalled();
  });

  it("truncates and marks tooLarge when there is no Content-Length", async () => {
    fetchMock.mockResolvedValue(text("a".repeat(MAX_FILE_BYTES + 1)));
    expect(await fetchRawFile("o", "r", SHA, "big.md")).toEqual({ tooLarge: true });
  });

  it("accepts a file exactly at the cap", async () => {
    fetchMock.mockResolvedValue(text("a".repeat(MAX_FILE_BYTES)));
    expect(await fetchRawFile("o", "r", SHA, "ok.md")).toMatchObject({ size: MAX_FILE_BYTES });
  });

  it("rejects NUL-containing binary as NOT_TEXT", async () => {
    fetchMock.mockResolvedValue(text(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2])));
    await expectCode(fetchRawFile("o", "r", SHA, "i.png"), "NOT_TEXT");
  });

  it("rejects invalid UTF-8 as NOT_TEXT", async () => {
    fetchMock.mockResolvedValue(text(new Uint8Array([0xff, 0xfe, 0xfd])));
    await expectCode(fetchRawFile("o", "r", SHA, "b.bin"), "NOT_TEXT");
  });

  it("maps 404 and network errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("404", { status: 404 }));
    await expectCode(fetchRawFile("o", "r", SHA, "x.md"), "REPO_NOT_FOUND");
    fetchMock.mockRejectedValueOnce(new Error("down"));
    await expectCode(fetchRawFile("o", "r", SHA, "x.md"), "GITHUB_UNREACHABLE");
  });
});

describe("scanRepo raw-file retry", () => {
  const MCP_PATH = ".mcp.json";
  const tree = {
    sha: SHA,
    truncated: false,
    tree: [{ path: MCP_PATH, type: "blob", sha: "b1", size: 20 }],
  };
  const MCP_BODY = JSON.stringify({ mcpServers: { s: { command: "node" } } });

  /** Routes by URL so call order across meta/tree/raw does not matter. */
  function mockGithub(raw: () => Response | Promise<Response>) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("raw.githubusercontent.com")) return raw();
      if (url.includes("/git/trees/")) return json(tree);
      if (url.includes("/commits/")) return new Response(`${SHA}\n`, { headers: rl });
      return json(metaFixture);
    });
  }
  const rawCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes("raw.githubusercontent.com"));

  it("retries a transient failure once and the scan succeeds", async () => {
    let calls = 0;
    mockGithub(() => {
      calls += 1;
      if (calls === 1) throw new Error("socket hang up");
      return new Response(MCP_BODY, { status: 200 });
    });
    const scan = await scanRepo("anthropics/skills");
    expect(rawCalls()).toHaveLength(2);
    expect(scan.items.some((item) => item.kind === "mcp")).toBe(true);
  });

  it("fails after a second transient failure, naming the file and reason", async () => {
    mockGithub(() => {
      throw new Error("socket hang up");
    });
    const error = await expectCode(scanRepo("anthropics/skills"), "GITHUB_UNREACHABLE");
    expect(rawCalls()).toHaveLength(2);
    expect(error.details).toMatchObject({
      reason: "socket hang up",
      path: MCP_PATH,
      attempts: 2,
    });
  });

  it("retries a 5xx response", async () => {
    const responses = [new Response("oops", { status: 503 }), new Response(MCP_BODY)];
    mockGithub(() => responses.shift()!);
    await scanRepo("anthropics/skills");
    expect(rawCalls()).toHaveLength(2);
  });

  it("does not retry a 404 (skipped with a warning)", async () => {
    mockGithub(() => new Response("nope", { status: 404 }));
    const scan = await scanRepo("anthropics/skills");
    expect(rawCalls()).toHaveLength(1);
    expect(scan.warnings.join(" ")).toContain(MCP_PATH);
  });

  it("does not retry a rate limit", async () => {
    mockGithub(() => new Response("limited", { status: 429 }));
    await expectCode(scanRepo("anthropics/skills"), "RATE_LIMITED");
    expect(rawCalls()).toHaveLength(1);
  });
});
