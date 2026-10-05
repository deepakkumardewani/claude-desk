import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  applyPlan,
  fetchPlan,
  fetchRepoFile,
  listInstalls,
  resolveSkillsShItem,
  scanRepo,
  searchSkillsSh,
  uninstall,
  type DiscoverErrorCode,
} from "./discoverApi";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async (..._args: unknown[]) => {
    if (response instanceof Error) throw response;
    // A body can be read once; hand each call its own copy.
    return response.clone();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("discoverApi", () => {
  it("scanRepo posts the input and returns the scan on success", async () => {
    const scan = {
      repo: { owner: "a" },
      items: [],
      warnings: [],
      rateLimit: { authenticated: true },
    };
    const fn = mockFetch(json(200, scan));
    const result = await scanRepo("a/b");
    expect(result).toMatchObject({ ok: true, items: [], warnings: [] });
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/discover/repo/scan");
    expect(init.body).toBe(JSON.stringify({ input: "a/b" }));
  });

  it.each<[number, DiscoverErrorCode]>([
    [400, "BAD_INPUT"],
    [400, "SHORT_QUERY"],
    [404, "REPO_NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [502, "GITHUB_UNREACHABLE"],
    [415, "NOT_TEXT"],
    [502, "SKILLS_SH_UNREACHABLE"],
    [502, "SKILLS_SH_SCHEMA"],
    [404, "SKILL_NOT_FOUND"],
    [409, "PLAN_CHANGED"],
    [422, "ACK_REQUIRED"],
    [404, "INSTALL_NOT_FOUND"],
  ])("narrows %i %s into a typed error", async (status, code) => {
    mockFetch(json(status, { error: "boom", code }));
    expect(await scanRepo("x")).toEqual({
      ok: false,
      code,
      message: "boom",
      resetAt: undefined,
      hint: undefined,
    });
  });

  it("carries rate-limit reset time and hint", async () => {
    mockFetch(json(429, { error: "limited", code: "RATE_LIMITED", resetAt: "t", hint: "token" }));
    expect(await scanRepo("x")).toMatchObject({
      code: "RATE_LIMITED",
      resetAt: "t",
      hint: "token",
    });
  });

  it("maps unknown codes and unparseable bodies to UNKNOWN", async () => {
    mockFetch(json(500, { error: "x", code: "WEIRD" }));
    expect(await scanRepo("x")).toMatchObject({ ok: false, code: "UNKNOWN" });
    mockFetch(new Response("nope", { status: 500 }));
    expect(await scanRepo("x")).toMatchObject({ ok: false, code: "UNKNOWN" });
  });

  it("maps fetch rejection to NETWORK", async () => {
    mockFetch(new Error("offline"));
    expect(await scanRepo("x")).toEqual({ ok: false, code: "NETWORK", message: "offline" });
  });

  it("searchSkillsSh passes q and limit", async () => {
    const fn = mockFetch(json(200, { results: [{ id: "a/b/c" }] }));
    const result = await searchSkillsSh("react", { limit: 5 });
    expect(result).toEqual({ ok: true, results: [{ id: "a/b/c" }] });
    expect((fn.mock.calls[0] as [string])[0]).toBe(
      "/api/discover/skills-sh/search?q=react&limit=5",
    );
  });

  it("resolveSkillsShItem returns repo and item", async () => {
    mockFetch(json(200, { repo: { owner: "a" }, item: { id: "i" } }));
    expect(await resolveSkillsShItem("a/b/c")).toEqual({
      ok: true,
      repo: { owner: "a" },
      item: { id: "i" },
    });
  });

  it("fetchRepoFile returns content, and maps 413 to TOO_LARGE", async () => {
    const query = { owner: "a", repo: "b", sha: "s", path: "p.md" };
    const fn = mockFetch(json(200, { content: "hi", size: 2 }));
    expect(await fetchRepoFile(query)).toEqual({ ok: true, content: "hi", size: 2 });
    expect((fn.mock.calls[0] as [string])[0]).toBe(
      "/api/discover/repo/file?owner=a&repo=b&sha=s&path=p.md",
    );
    mockFetch(json(413, { error: "too big", tooLarge: true }));
    expect(await fetchRepoFile(query)).toEqual({
      ok: false,
      code: "TOO_LARGE",
      message: "too big",
    });
  });

  const request = {
    repo: { owner: "a", repo: "b", sha: "c".repeat(40) },
    itemIds: ["skill:x"],
    target: { scope: "user" as const },
  };

  it("fetchPlan posts the request and returns the plan", async () => {
    const plan = { planHash: "h", fileWrites: [] };
    const fn = mockFetch(json(200, plan));
    const result = await fetchPlan(request);
    expect(result).toMatchObject({ ok: true, plan });
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/discover/plan");
    expect(init.body).toBe(JSON.stringify(request));
  });

  it("applyPlan posts hash + acknowledgement and returns results", async () => {
    const response = { results: [{ itemId: "skill:x", ok: true }], backups: [] };
    const fn = mockFetch(json(200, response));
    const body = { ...request, planHash: "h", acknowledgedDanger: true };
    expect(await applyPlan(body)).toMatchObject({ ok: true, ...response });
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/discover/apply");
    expect(init.body).toBe(JSON.stringify(body));
  });

  it("applyPlan surfaces PLAN_CHANGED and ACK_REQUIRED as typed errors", async () => {
    mockFetch(json(409, { error: "changed", code: "PLAN_CHANGED" }));
    expect(await applyPlan({ ...request, planHash: "h", acknowledgedDanger: false })).toMatchObject(
      {
        ok: false,
        code: "PLAN_CHANGED",
      },
    );
    mockFetch(json(422, { error: "ack", code: "ACK_REQUIRED" }));
    expect(await applyPlan({ ...request, planHash: "h", acknowledgedDanger: false })).toMatchObject(
      {
        ok: false,
        code: "ACK_REQUIRED",
      },
    );
  });

  it("listInstalls requests the plain list or the GitHub check", async () => {
    const fn = mockFetch(json(200, { entries: [{ id: "e1", status: "up-to-date" }] }));
    expect(await listInstalls()).toEqual({
      ok: true,
      entries: [{ id: "e1", status: "up-to-date" }],
    });
    await listInstalls({ check: true });
    expect(fn.mock.calls.map((c) => (c as [string])[0])).toEqual([
      "/api/discover/installs",
      "/api/discover/installs?check=1",
    ]);
  });

  it("uninstall sends DELETE, with force only when asked", async () => {
    const fn = mockFetch(
      json(200, { ok: true, removedFiles: ["/a"], revertedEntries: ["/model"] }),
    );
    expect(await uninstall("e 1")).toEqual({
      ok: true,
      removedFiles: ["/a"],
      revertedEntries: ["/model"],
    });
    await uninstall("e1", { force: true });
    const calls = fn.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("/api/discover/installs/e%201");
    expect(calls[1][0]).toBe("/api/discover/installs/e1?force=1");
    expect(calls.every(([, init]) => init.method === "DELETE")).toBe(true);
  });

  it("uninstall surfaces LOCALLY_MODIFIED with the edited files", async () => {
    mockFetch(json(409, { error: "edited", code: "LOCALLY_MODIFIED", files: ["/a", "/b"] }));
    expect(await uninstall("e1")).toMatchObject({
      ok: false,
      code: "LOCALLY_MODIFIED",
      files: ["/a", "/b"],
    });
  });
});
