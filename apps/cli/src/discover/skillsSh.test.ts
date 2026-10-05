import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { searchSkillsSh, resolveSkillsShItem } from "./skillsSh.js";
import { scanRepo } from "./github.js";

vi.mock("./github.js", () => ({ scanRepo: vi.fn() }));
const scanMock = vi.mocked(scanRepo);

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/skills-sh-search.json", import.meta.url), "utf8"),
);
const fetchMock = vi.fn();
const calledUrl = () => new URL(fetchMock.mock.calls.at(-1)?.[0] as string);
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("searchSkillsSh", () => {
  it("parses the recorded fixture into typed results", async () => {
    fetchMock.mockResolvedValue(ok(fixture));
    const out = await searchSkillsSh("react", 50);
    if ("error" in out) throw new Error(out.error);
    expect(out.results[0]).toEqual({
      id: "vercel-labs/agent-skills/vercel-react-best-practices",
      source: "vercel-labs/agent-skills",
      skillId: "vercel-react-best-practices",
      name: "vercel-react-best-practices",
      installs: 768842,
    });
    expect(calledUrl().origin + calledUrl().pathname).toBe("https://skills.sh/api/search");
    expect(calledUrl().searchParams.get("q")).toBe("react");
  });

  it("rejects queries shorter than 2 chars before fetching", async () => {
    expect(await searchSkillsSh("a")).toEqual({ error: "SHORT_QUERY" });
    expect(await searchSkillsSh("  b ")).toEqual({ error: "SHORT_QUERY" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps limit at 50 in the request and the returned list", async () => {
    fetchMock.mockResolvedValue(ok(fixture));
    const out = await searchSkillsSh("react", 5000);
    expect(calledUrl().searchParams.get("limit")).toBe("50");
    if ("error" in out) throw new Error(out.error);
    expect(out.results.length).toBe(50);
  });

  it("applies the requested limit when under the cap, and defaults on garbage", async () => {
    fetchMock.mockResolvedValue(ok(fixture));
    const small = await searchSkillsSh("react", 3);
    expect("results" in small && small.results.length).toBe(3);
    await searchSkillsSh("react", Number.NaN);
    expect(calledUrl().searchParams.get("limit")).toBe("20");
    await searchSkillsSh("react", -4);
    expect(calledUrl().searchParams.get("limit")).toBe("1");
  });

  it("returns SKILLS_SH_SCHEMA when expected fields are missing", async () => {
    const broken = { skills: [{ id: "a/b/c", name: "c" }] };
    fetchMock.mockResolvedValue(ok(broken));
    expect(await searchSkillsSh("react")).toEqual({ error: "SKILLS_SH_SCHEMA" });
    fetchMock.mockResolvedValue(ok({ results: [] }));
    expect(await searchSkillsSh("react")).toEqual({ error: "SKILLS_SH_SCHEMA" });
  });

  it("returns SKILLS_SH_SCHEMA for a non-JSON 200 body", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    expect(await searchSkillsSh("react")).toEqual({ error: "SKILLS_SH_SCHEMA" });
  });

  it("returns SKILLS_SH_UNREACHABLE when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await searchSkillsSh("react")).toEqual({ error: "SKILLS_SH_UNREACHABLE" });
  });

  it("returns SKILLS_SH_UNREACHABLE on non-2xx", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    expect(await searchSkillsSh("react")).toEqual({ error: "SKILLS_SH_UNREACHABLE" });
  });
});

describe("resolveSkillsShItem", () => {
  const repo = { owner: "o", repo: "r", ref: "main", sha: "a".repeat(40) };
  const skill = (path: string, name = path.split("/").at(-1)!) => ({
    id: `skill:${path}`,
    kind: "skill" as const,
    name,
    path,
    files: [],
  });
  const scanned = (items: unknown[]) =>
    scanMock.mockResolvedValue({
      repo,
      items,
      warnings: [],
      rateLimit: { authenticated: true },
    } as never);

  it("resolves to the skill item matching the folder name", async () => {
    scanned([skill("skills/other"), skill("skills/pdf")]);
    const out = await resolveSkillsShItem("o/r/pdf");
    expect(scanMock).toHaveBeenCalledWith("o/r");
    expect(out.item).toMatchObject({ kind: "skill", path: "skills/pdf" });
    expect(out.repo).toEqual(repo);
  });

  it("falls back to the frontmatter name and finds skills nested in plugins", async () => {
    const plugin = {
      id: "plugin:p",
      kind: "plugin",
      name: "p",
      path: "p",
      files: [],
      payload: { children: [skill("x/dir", "pretty")] },
    };
    scanned([plugin]);
    expect((await resolveSkillsShItem("o/r/pretty")).item.path).toBe("x/dir");
  });

  it("throws SKILL_NOT_FOUND when the repo no longer has the skill (non-skill items ignored)", async () => {
    scanned([{ ...skill("agents/pdf"), kind: "agent" }]);
    await expect(resolveSkillsShItem("o/r/pdf")).rejects.toMatchObject({ code: "SKILL_NOT_FOUND" });
  });

  it("rejects malformed ids without scanning", async () => {
    scanMock.mockClear();
    await expect(resolveSkillsShItem("o/r")).rejects.toMatchObject({ code: "BAD_INPUT" });
    expect(scanMock).not.toHaveBeenCalled();
  });
});
