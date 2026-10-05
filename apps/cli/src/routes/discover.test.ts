import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: execFileMock,
}));

import { createApp } from "../server.js";
import { resetGitHubClientState } from "../discover/github.js";
import { listEntries, recordEntry } from "../discover/manifest.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../discover/__fixtures__/${name}`, import.meta.url), "utf8"));
const treeFixture = fixture("github-tree.json");
const metaFixture = fixture("github-repo-meta.json");
const SHA = metaFixture.commitSha as string;

const TOKEN = "test-token";
const rl = { "x-ratelimit-remaining": "42", "x-ratelimit-reset": "1800000000" };
const SKILL_DIRS: string[] = treeFixture.tree
  .filter((e: { path: string }) => /^skills\/[^/]+\/SKILL\.md$/.test(e.path))
  .map((e: { path: string }) => e.path.replace("/SKILL.md", ""));
const MARKETPLACE = {
  name: "anthropic-agent-skills",
  plugins: [
    {
      name: "pair-one",
      description: "First pair",
      source: "./",
      skills: SKILL_DIRS.slice(0, 2).map((d) => `./${d}`),
    },
    { name: "pair-two", source: "./", skills: SKILL_DIRS.slice(2, 3).map((d) => `./${d}`) },
  ],
};

const fetchMock = vi.fn();
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: rl, ...init });

/** Routes the GitHub REST + raw endpoints the scan touches to recorded fixtures. */
function githubFetch(url: string): Response {
  if (url.startsWith("https://skills.sh/")) return json({ skills: [] });
  if (url.includes("/git/trees/")) return json(treeFixture);
  if (url.includes("/commits/")) return new Response(SHA, { status: 200, headers: rl });
  if (url.startsWith("https://api.github.com/repos/")) return json(metaFixture);
  const path = decodeURIComponent(url.split(`/${SHA}/`)[1] ?? "");
  if (path === ".claude-plugin/marketplace.json") return new Response(JSON.stringify(MARKETPLACE));
  const name = path.split("/").slice(-2, -1)[0];
  return new Response(`---\nname: ${name}\ndescription: about ${name}\n---\nbody`);
}

const app = createApp({ token: TOKEN });
const scan = (body: unknown, token: string | undefined = TOKEN) =>
  app.request("/api/discover/repo/scan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const apiCalls = () =>
  fetchMock.mock.calls
    .map((c) => c[0] as string)
    .filter((u) => u.startsWith("https://api.github.com"));

beforeEach(() => {
  resetGitHubClientState();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => githubFetch(url));
  vi.stubGlobal("fetch", fetchMock);
  execFileMock.mockReset();
  execFileMock.mockImplementation((_c, _a, _o, cb) => cb(new Error("gh: not found"), ""));
  vi.stubEnv("GITHUB_TOKEN", "x");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/discover/repo/scan", () => {
  it("returns { repo, items, warnings, rateLimit } for an anthropics/skills-shaped repo", async () => {
    const res = await scan({ input: "anthropics/skills" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repo).toMatchObject({
      owner: "anthropics",
      repo: "skills",
      ref: "main",
      sha: SHA,
      stars: 179619,
      truncated: false,
    });
    expect(body.rateLimit).toEqual({
      remaining: 42,
      resetAt: new Date(1800000000 * 1000).toISOString(),
      authenticated: true,
    });
    expect(body.warnings).toEqual([]);

    const plugins = body.items.filter((i: { kind: string }) => i.kind === "plugin");
    expect(plugins.map((p: { name: string }) => p.name)).toEqual(["pair-one", "pair-two"]);
    const skills = body.items.filter((i: { kind: string }) => i.kind === "skill");
    const claimed = SKILL_DIRS.slice(0, 3);
    const unclaimed = treeFixture.tree.filter(
      (e: { path: string }) =>
        /(^|\/)SKILL\.md$/.test(e.path) && !claimed.some((d) => e.path.startsWith(`${d}/`)),
    );
    expect(skills.length).toBe(unclaimed.length);
    expect(skills[0]).toMatchObject({
      kind: "skill",
      description: expect.stringContaining("about"),
    });
  });

  it("fetches files only by pinned SHA and only the files detectors need", async () => {
    await scan({ input: "https://github.com/anthropics/skills" });
    const raw = fetchMock.mock.calls
      .map((c) => c[0] as string)
      .filter((u) => u.includes("raw.githubusercontent"));
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.every((u) => u.includes(`/${SHA}/`))).toBe(true);
    expect(raw.some((u) => u.endsWith("/README.md"))).toBe(false);
  });

  it("scopes detection to a /tree/<ref>/<subpath> link", async () => {
    const res = await scan({ input: `anthropics/skills/tree/main/${SKILL_DIRS[0]}` });
    const body = await res.json();
    expect(body.repo.subpath).toBe(SKILL_DIRS[0]);
    expect(body.items.map((i: { path: string }) => i.path)).toEqual([SKILL_DIRS[0]]);
  });

  it.each([
    { input: "" },
    { input: "https://gitlab.com/a/b" },
    { input: "onlyowner" },
    {},
    { input: 3 },
  ])("returns 400 BAD_INPUT without calling GitHub for %j", async (body) => {
    const res = await scan(body);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_INPUT");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 BAD_INPUT for a non-JSON body", async () => {
    const res = await scan("not json");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 REPO_NOT_FOUND", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    const res = await scan({ input: "nobody/nothing" });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("REPO_NOT_FOUND");
  });

  it("returns 429 RATE_LIMITED with reset time and a token hint when unauthenticated", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    fetchMock.mockImplementation(
      async () =>
        new Response("{}", { status: 429, headers: { ...rl, "x-ratelimit-remaining": "0" } }),
    );
    const res = await scan({ input: "anthropics/skills" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({
      code: "RATE_LIMITED",
      resetAt: new Date(1800000000 * 1000).toISOString(),
    });
    expect(body.hint).toContain("GITHUB_TOKEN");
  });

  it("surfaces a truncated tree as a warning", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/git/trees/") ? json({ ...treeFixture, truncated: true }) : githubFetch(url),
    );
    const body = await (await scan({ input: "anthropics/skills" })).json();
    expect(body.repo.truncated).toBe(true);
    expect(body.warnings[0]).toContain("/tree/<ref>/<subpath>");
  });

  it("sits behind the bearer-token middleware", async () => {
    const res = await scan({ input: "anthropics/skills" }, "wrong");
    expect(res.status).toBe(401);
    expect(apiCalls()).toEqual([]);
  });
});

const get = (path: string, token: string | undefined = TOKEN) =>
  app.request(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
const resolve = (body: unknown, token: string | undefined = TOKEN) =>
  app.request("/api/discover/skills-sh/resolve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

describe("GET /api/discover/skills-sh/search", () => {
  const searchFixture = fixture("skills-sh-search.json");

  it("returns { results } and caps limit at 50", async () => {
    fetchMock.mockImplementation(async () => json(searchFixture));
    const res = await get("/api/discover/skills-sh/search?q=react&limit=500");
    expect(res.status).toBe(200);
    expect((await res.json()).results[0].skillId).toBe("vercel-react-best-practices");
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("limit")).toBe("50");
  });

  it("returns 400 SHORT_QUERY without fetching", async () => {
    const res = await get("/api/discover/skills-sh/search?q=a");
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("SHORT_QUERY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 SKILLS_SH_UNREACHABLE", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    const res = await get("/api/discover/skills-sh/search?q=react");
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("SKILLS_SH_UNREACHABLE");
  });

  it("returns 502 SKILLS_SH_SCHEMA", async () => {
    fetchMock.mockImplementation(async () => json({ skills: [{ id: 1 }] }));
    const res = await get("/api/discover/skills-sh/search?q=react");
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("SKILLS_SH_SCHEMA");
  });

  it("requires the bearer token", async () => {
    expect((await get("/api/discover/skills-sh/search?q=react", "wrong")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/discover/skills-sh/resolve", () => {
  it("resolves an id to { repo, item }", async () => {
    const dir = SKILL_DIRS[3];
    const res = await resolve({ id: `anthropics/skills/${dir.split("/").at(-1)}` });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repo).toMatchObject({ owner: "anthropics", repo: "skills", sha: SHA });
    expect(body.item).toMatchObject({ kind: "skill", path: dir });
  });

  it("returns 404 SKILL_NOT_FOUND when the repo lost the skill", async () => {
    const res = await resolve({ id: "anthropics/skills/does-not-exist" });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 400 BAD_INPUT for a missing or malformed id", async () => {
    expect((await resolve({})).status).toBe(400);
    expect((await resolve({ id: "a/b" })).status).toBe(400);
  });

  it("requires the bearer token", async () => {
    expect((await resolve({ id: "a/b/c" }, "wrong")).status).toBe(401);
  });
});

describe("GET /api/discover/repo/file", () => {
  const url = (path = "skills/x/SKILL.md", sha = SHA) =>
    `/api/discover/repo/file?owner=anthropics&repo=skills&sha=${sha}&path=${encodeURIComponent(path)}`;

  it("returns { content, size } fetched by the pinned sha", async () => {
    fetchMock.mockImplementation(async () => new Response("hello"));
    const res = await get(url());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "hello", size: 5 });
    expect(fetchMock.mock.calls[0][0]).toContain(`/anthropics/skills/${SHA}/skills/x/SKILL.md`);
  });

  it("returns 415 NOT_TEXT for binary content", async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array([1, 0, 2])));
    const res = await get(url("a.png"));
    expect(res.status).toBe(415);
    expect((await res.json()).code).toBe("NOT_TEXT");
  });

  it("returns 400 BAD_INPUT for missing params or a branch name instead of a sha", async () => {
    expect((await get("/api/discover/repo/file?owner=a&repo=b")).status).toBe(400);
    const res = await get(url("a.md", "main"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the bearer token", async () => {
    expect((await get(url(), "wrong")).status).toBe(401);
  });
});

describe("POST /api/discover/plan and /apply", () => {
  const DIR = "skills/algorithmic-art";
  const ITEM_ID = `skill:${DIR}`;
  let claudeRoot = "";
  let previousRoot: string | undefined;

  beforeEach(async () => {
    previousRoot = process.env.CLAUDE_ROOT;
    claudeRoot = await mkdtemp(join(tmpdir(), "claude-route-"));
    process.env.CLAUDE_ROOT = claudeRoot;
  });

  afterEach(async () => {
    process.env.CLAUDE_ROOT = previousRoot;
    await rm(claudeRoot, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown) =>
    app.request(`/api/discover/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });

  const request = (extra: object = {}) => ({
    repo: { owner: "anthropics", repo: "skills", sha: SHA },
    itemIds: [ITEM_ID],
    target: { scope: "user" },
    ...extra,
  });

  const skillMd = () => join(claudeRoot, "skills/algorithmic-art/SKILL.md");
  const exists = (path: string) =>
    stat(path).then(
      () => true,
      () => false,
    );

  /** Same recorded repo, but one file in the skill hides a bidi override. */
  function poisonLicense() {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith(`/${DIR}/LICENSE.txt`) ? new Response("fine \u202E hidden") : githubFetch(url),
    );
  }

  it("plans a skill install with new files inside the scope root", async () => {
    const res = await post("plan", request());
    expect(res.status).toBe(200);
    const plan = await res.json();
    expect(plan.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.fileWrites.length).toBeGreaterThan(1);
    expect(plan.fileWrites.every((w: { status: string }) => w.status === "new")).toBe(true);
    expect(plan.fileWrites.map((w: { targetPath: string }) => w.targetPath)).toContain(skillMd());
    expect(await exists(skillMd())).toBe(false);
  });

  it("applies a plan, writing the files and echoing results", async () => {
    const { planHash } = await (await post("plan", request())).json();
    const res = await post("apply", request({ planHash, acknowledgedDanger: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      results: [{ itemId: ITEM_ID, ok: true, manifestId: expect.any(String) }],
      backups: [],
    });
    expect(await readFile(skillMd(), "utf8")).toContain("about algorithmic-art");
  });

  it("returns 409 PLAN_CHANGED when disk state changed after the preview, and writes nothing", async () => {
    const { planHash } = await (await post("plan", request())).json();
    await mkdir(join(claudeRoot, "skills/algorithmic-art"), { recursive: true });
    await writeFile(skillMd(), "appeared meanwhile");

    const res = await post("apply", request({ planHash, acknowledgedDanger: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("PLAN_CHANGED");
    expect(await readFile(skillMd(), "utf8")).toBe("appeared meanwhile");
    expect(await exists(join(claudeRoot, "skills/algorithmic-art/LICENSE.txt"))).toBe(false);
  });

  it("returns 422 ACK_REQUIRED for danger findings without acknowledgment and writes nothing", async () => {
    poisonLicense();
    const plan = await (await post("plan", request())).json();
    expect(plan.findings.some((f: { rule: string }) => f.rule === "hidden-unicode")).toBe(true);

    const res = await post(
      "apply",
      request({ planHash: plan.planHash, acknowledgedDanger: false }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("ACK_REQUIRED");
    expect(await exists(skillMd())).toBe(false);

    const ok = await post("apply", request({ planHash: plan.planHash, acknowledgedDanger: true }));
    expect(ok.status).toBe(200);
    expect(await exists(skillMd())).toBe(true);
  });

  it("applies a conflict resolution and backs up the overwritten file", async () => {
    await mkdir(join(claudeRoot, "skills/algorithmic-art"), { recursive: true });
    await writeFile(skillMd(), "mine");
    const plan = await (await post("plan", request())).json();
    expect(
      plan.fileWrites.find((w: { targetPath: string }) => w.targetPath === skillMd()).status,
    ).toBe("conflict");

    const res = await post(
      "apply",
      request({
        planHash: plan.planHash,
        acknowledgedDanger: false,
        resolutions: { [skillMd()]: "overwrite" },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).backups).toEqual([skillMd()]);
    expect(await readFile(skillMd(), "utf8")).not.toBe("mine");
  });

  it.each([
    ["missing repo", { itemIds: [ITEM_ID], target: { scope: "user" } }],
    ["empty itemIds", request({ itemIds: [] })],
    ["unknown item", request({ itemIds: ["skill:nope"] })],
    ["bad target", request({ target: { scope: "galaxy" } })],
    ["relative projectDir", request({ target: { scope: "project", projectDir: "rel" } })],
    ["bad resolutions", request({ resolutions: { x: "explode" } })],
  ])("rejects %s with 400 BAD_INPUT", async (_label, body) => {
    const res = await post("plan", body);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_INPUT");
  });

  it("requires planHash on apply and the bearer token", async () => {
    expect((await post("apply", request())).status).toBe(400);
    const res = await app.request("/api/discover/plan", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

describe("installs: manifest, update and uninstall", () => {
  const DIR = "skills/algorithmic-art";
  const ITEM_ID = `skill:${DIR}`;
  const NEW_SHA = "b".repeat(40);
  let claudeRoot = "";
  let previousRoot: string | undefined;

  beforeEach(async () => {
    previousRoot = process.env.CLAUDE_ROOT;
    claudeRoot = await mkdtemp(join(tmpdir(), "claude-installs-"));
    process.env.CLAUDE_ROOT = claudeRoot;
  });

  afterEach(async () => {
    process.env.CLAUDE_ROOT = previousRoot;
    await rm(claudeRoot, { recursive: true, force: true });
  });

  const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  const post = (path: string, body: unknown) =>
    app.request(`/api/discover/${path}`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(body),
    });
  const get = (path: string) => app.request(`/api/discover/${path}`, { headers: auth });
  const del = (path: string) =>
    app.request(`/api/discover/${path}`, { method: "DELETE", headers: auth });

  const installRequest = {
    repo: { owner: "anthropics", repo: "skills", sha: SHA },
    itemIds: [ITEM_ID],
    target: { scope: "user" },
  };
  const skillMd = () => join(claudeRoot, DIR, "SKILL.md");
  const license = () => join(claudeRoot, DIR, "LICENSE.txt");
  const exists = (path: string) =>
    stat(path).then(
      () => true,
      () => false,
    );

  async function install(extra: object = {}) {
    const body = { ...installRequest, ...extra };
    const { planHash } = await (await post("plan", body)).json();
    const res = await post("apply", { ...body, planHash, acknowledgedDanger: false });
    expect(res.status).toBe(200);
    return res.json();
  }

  /** HEAD moves to NEW_SHA: the skill's files get new blob SHAs, SKILL.md new content, `drop` vanishes. */
  function upstreamMoves(drop?: string) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/commits/")) return new Response(NEW_SHA, { status: 200, headers: rl });
      if (url.includes("/git/trees/")) {
        const tree = treeFixture.tree
          .filter((e: { path: string }) => e.path !== drop)
          .map((e: { path: string; sha: string }) =>
            e.path.startsWith(DIR) ? { ...e, sha: `new-${e.sha}` } : e,
          );
        return json({ ...treeFixture, sha: NEW_SHA, tree });
      }
      const res = githubFetch(url.replace(NEW_SHA, SHA));
      const text = await res.text();
      return new Response(url.endsWith("/SKILL.md") ? `${text}\nversion two` : text);
    });
  }

  const installs = async (query = "") => (await (await get(`installs${query}`)).json()).entries;

  it("records one manifest entry per install, matching what was written", async () => {
    const { results } = await install();
    const [entry] = await installs();
    expect(results[0].manifestId).toBe(entry.id);
    expect(entry).toMatchObject({
      itemKind: "skill",
      itemName: "algorithmic-art",
      status: "up-to-date",
    });
    expect(entry.source).toMatchObject({
      owner: "anthropics",
      repo: "skills",
      sha: SHA,
      path: DIR,
    });
    expect(entry.files.map((f: { path: string }) => f.path)).toContain(skillMd());
    expect(Object.keys(entry.sourceBlobShas)).toContain(`${DIR}/SKILL.md`);
  });

  it("reinstalling the same item replaces its entry instead of adding a second", async () => {
    await install();
    await install();
    expect(await installs()).toHaveLength(1);
  });

  it("reports modified-locally and missing-on-disk from the files on disk", async () => {
    await install();
    await writeFile(skillMd(), "edited");
    expect((await installs())[0].status).toBe("modified-locally");
    await rm(skillMd());
    expect((await installs())[0].status).toBe("missing-on-disk");
  });

  it("check=1 stays up-to-date when upstream is unchanged and update-available when it moved", async () => {
    await install();
    expect((await installs("?check=1"))[0].status).toBe("up-to-date");
    upstreamMoves();
    expect((await installs("?check=1"))[0].status).toBe("update-available");
  });

  it("check=1 reports source-unavailable when the repo is gone", async () => {
    await install();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    expect((await installs("?check=1"))[0].status).toBe("source-unavailable");
  });

  it("check=1 makes exactly one GitHub call per distinct source repo", async () => {
    await install();
    const [first] = await listEntries();
    const { id: _id, installedAt: _at, ...draft } = first;
    await recordEntry({
      ...draft,
      itemName: "second",
      source: { ...draft.source, path: "skills/second" },
    });
    await recordEntry({ ...draft, source: { ...draft.source, owner: "other", repo: "kit" } });
    expect(await listEntries()).toHaveLength(3);

    fetchMock.mockClear();
    await installs("?check=1");
    const calls = apiCalls();
    expect(calls).toHaveLength(2);
    expect(calls.some((u) => u.includes("/repos/anthropics/skills/"))).toBe(true);
    expect(calls.some((u) => u.includes("/repos/other/kit/"))).toBe(true);
  });

  it("does not call GitHub at all without check=1", async () => {
    await install();
    fetchMock.mockClear();
    await installs();
    expect(apiCalls()).toHaveLength(0);
  });

  describe("update", () => {
    it("plans an unmodified install as overwrite rows only and keeps a single entry with the new sha", async () => {
      await install();
      const [before] = await installs();
      upstreamMoves();

      const body = { update: before.id };
      const plan = await (await post("plan", body)).json();
      const changed = plan.fileWrites.filter((w: { status: string }) => w.status !== "identical");
      expect(changed.length).toBeGreaterThan(0);
      expect(changed.every((w: { status: string }) => w.status === "overwrite")).toBe(true);
      expect(plan.fileRemovals).toEqual([]);

      const res = await post("apply", {
        ...body,
        planHash: plan.planHash,
        acknowledgedDanger: false,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).results[0]).toMatchObject({ ok: true, manifestId: before.id });

      const after = await installs();
      expect(after).toHaveLength(1);
      expect(after[0].source.sha).toBe(NEW_SHA);
      expect(after[0].status).toBe("up-to-date");
      expect(await readFile(skillMd(), "utf8")).toContain("version two");
    });

    it("plans a locally modified file as conflict and needs a resolution", async () => {
      await install();
      const [before] = await installs();
      await writeFile(skillMd(), "my edits");
      upstreamMoves();

      const body = { update: before.id };
      const plan = await (await post("plan", body)).json();
      const status = (path: string) =>
        plan.fileWrites.find((w: { targetPath: string }) => w.targetPath === path).status;
      expect(status(skillMd())).toBe("conflict");
      expect(status(license())).toBe("identical");

      const unresolved = await (
        await post("apply", { ...body, planHash: plan.planHash, acknowledgedDanger: false })
      ).json();
      expect(unresolved.results[0].ok).toBe(false);
      expect(unresolved.results[0].error).toContain("Unresolved conflict");
      expect(await readFile(skillMd(), "utf8")).toBe("my edits");

      const resolved = await post("apply", {
        ...body,
        planHash: plan.planHash,
        acknowledgedDanger: false,
        resolutions: { [skillMd()]: "overwrite" },
      });
      expect((await resolved.json()).results[0].ok).toBe(true);
      expect(await readFile(skillMd(), "utf8")).toContain("version two");
    });

    it("removes a file deleted upstream on apply and drops it from the entry", async () => {
      await install();
      const [before] = await installs();
      expect(await exists(license())).toBe(true);
      upstreamMoves(`${DIR}/LICENSE.txt`);

      const body = { update: before.id };
      const plan = await (await post("plan", body)).json();
      expect(plan.fileRemovals).toEqual([{ itemId: ITEM_ID, targetPath: license() }]);
      await post("apply", { ...body, planHash: plan.planHash, acknowledgedDanger: false });

      expect(await exists(license())).toBe(false);
      const [after] = await installs();
      expect(after.files.map((f: { path: string }) => f.path)).not.toContain(license());
      expect(after.status).toBe("up-to-date");
    });

    it("keeps an upstream-deleted file the user edited", async () => {
      await install();
      const [before] = await installs();
      await writeFile(license(), "mine");
      upstreamMoves(`${DIR}/LICENSE.txt`);
      const plan = await (await post("plan", { update: before.id })).json();
      expect(plan.fileRemovals).toEqual([]);
    });

    it("rejects an unknown manifest id with 404 INSTALL_NOT_FOUND", async () => {
      const res = await post("plan", { update: "nope" });
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("INSTALL_NOT_FOUND");
    });
  });

  describe("DELETE /installs/:id", () => {
    it("uninstalls an unmodified entry, removing its files and the entry", async () => {
      await install();
      const [entry] = await installs();
      const res = await del(`installs/${entry.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.removedFiles).toContain(skillMd());
      expect(await exists(join(claudeRoot, DIR))).toBe(false);
      expect(await installs()).toEqual([]);
    });

    it("returns 409 LOCALLY_MODIFIED listing the file, and deletes with force=1", async () => {
      await install();
      const [entry] = await installs();
      await writeFile(skillMd(), "edited");

      const blocked = await del(`installs/${entry.id}`);
      expect(blocked.status).toBe(409);
      const body = await blocked.json();
      expect(body.code).toBe("LOCALLY_MODIFIED");
      expect(body.files).toEqual([skillMd()]);
      expect(await exists(skillMd())).toBe(true);

      const forced = await del(`installs/${entry.id}?force=1`);
      expect(forced.status).toBe(200);
      expect(await exists(skillMd())).toBe(false);
      expect(await installs()).toEqual([]);
    });

    it("returns 404 INSTALL_NOT_FOUND for an unknown id", async () => {
      const res = await del("installs/missing");
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("INSTALL_NOT_FOUND");
    });

    it("removes recorded MCP servers through the claude CLI runner, falling back to files", async () => {
      execFileMock.mockImplementation((_c, _a, _o, cb) =>
        cb(Object.assign(new Error("not installed"), { code: "ENOENT" }), ""),
      );
      const mcpPath = join(claudeRoot, ".mcp.json");
      await writeFile(
        mcpPath,
        JSON.stringify({
          mcpServers: {
            demo: {
              name: "demo",
              disabled: false,
              transport: { type: "http", url: "http://localhost:1" },
            },
          },
        }),
      );
      await install();
      const [skillEntry] = await listEntries();
      const { id: _id, installedAt: _at, ...draft } = skillEntry;
      const mcp = await recordEntry({
        ...draft,
        itemKind: "mcp",
        itemName: "demo",
        files: [],
        settingsEntries: [],
        mcpServers: ["demo"],
        source: { ...draft.source, path: ".mcp.json" },
      });

      const res = await del(`installs/${mcp.id}`);
      expect(res.status).toBe(200);
      expect((await res.json()).revertedEntries).toContain("demo");
      expect(await exists(mcpPath)).toBe(false);
    });
  });
});
