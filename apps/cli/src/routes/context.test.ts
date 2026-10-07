import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createSpawnStub, UnexpectedSpawnError, type SpawnScript } from "../testing/spawnStub.js";
import { useTempHome } from "../testing/tempHomeHooks.js";

// The route's only external process is `claude`; it is replaced here, never run for real.
const state = vi.hoisted(() => ({ script: {} as unknown, spawn: undefined as unknown }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { createSpawnStub: create } = await import("../testing/spawnStub.js");
  const stub = create(() => state.script as SpawnScript);
  state.spawn = stub;
  return { ...actual, spawn: stub.spawn };
});

import { createApp } from "../server.js";
import { enrichZeroItemTokens, getContextAllResponse, getContextResponse } from "./context.js";

const TOKEN = "c".repeat(64);
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const home = useTempHome();

const stub = () => state.spawn as ReturnType<typeof createSpawnStub>;
const script = (next: SpawnScript) => {
  state.script = next;
};

const CONTEXT_OUTPUT = `## Context Usage

**Tokens:** 26.3k / 200k (13%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 3.0k | 1.5% |
| Messages | 23.3k | 11.7% |
| Free space | 173.7k | 86.8% |
`;

function contextAllOutput(userHome: string): string {
  return `**Model:** claude-sonnet-4-6[1m]
**Tokens:** 24.9k / 200k (12%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 3.0k | 1.5% |
| Memory files | 0 | 0% |
| Skills | 2.0k | 1.0% |
| Free space | 170.0k | 85.0% |

### Memory Files

| Type | Path | Tokens |
|------|------|--------|
| User | ${userHome}/.claude/CLAUDE.md | 0 |

### Skills

| Skill | Path | Tokens |
|-------|------|--------|
| pdf | ${userHome}/.claude/skills/pdf/SKILL.md | 1.2k |
| local | /work/app/.claude/skills/local/SKILL.md | 800 |
| builtin | bundled | 100 |
`;
}

beforeEach(() => {
  script({ stdout: CONTEXT_OUTPUT });
  stub().calls.length = 0;
});

describe("getContextResponse", () => {
  it("parses the category breakdown and spawns claude in the temp HOME", async () => {
    const result = await getContextResponse();
    expect(result).toEqual({
      success: true,
      total: 26300,
      breakdown: [
        { category: "System prompt", tokens: 3000, percentage: 1.5 },
        { category: "Messages", tokens: 23300, percentage: 11.7 },
        { category: "Free space", tokens: 173700, percentage: 86.8 },
      ],
    });
    const [call] = stub().calls;
    expect(call.command).toBe("claude");
    expect(call.args).toEqual(["/context"]);
    expect(call.options).toMatchObject({ cwd: home().home });
  });

  it("sums categories when the header total is missing, excluding free space", async () => {
    script({ stdout: CONTEXT_OUTPUT.replace(/\*\*Tokens:.*\n/, "") });
    const result = await getContextResponse();
    expect(result).toMatchObject({ success: true, total: 26300 });
  });

  it("reports unparseable output", async () => {
    script({ stdout: "nothing useful" });
    expect(await getContextResponse()).toEqual({
      success: false,
      error: "unable to parse context output",
    });
  });

  it("reports stderr or the exit code on failure", async () => {
    script({ stderr: " boom \n", code: 2 });
    expect(await getContextResponse()).toEqual({ success: false, error: "boom" });
    script({ code: 3 });
    expect(await getContextResponse()).toEqual({
      success: false,
      error: "claude exited with code 3",
    });
  });

  it("maps ENOENT to a friendly message and other spawn errors to a generic one", async () => {
    script({ error: new Error("spawn claude ENOENT") });
    expect(await getContextResponse()).toEqual({
      success: false,
      error: "claude CLI not available",
    });
    script({ error: new Error("EACCES") });
    expect(await getContextResponse()).toEqual({
      success: false,
      error: "failed to run claude: EACCES",
    });
  });
});

describe("getContextAllResponse", () => {
  it("defaults cwd to the temp HOME and disables tool search", async () => {
    script({ stdout: contextAllOutput(home().home) });
    const result = await getContextAllResponse();
    expect(result.success).toBe(true);
    const [call] = stub().calls;
    expect(call.args).toEqual(["/context", "all"]);
    expect(call.options).toMatchObject({
      cwd: home().home,
      env: expect.objectContaining({ ENABLE_TOOL_SEARCH: "false" }),
    });
  });

  it("runs in the project directory when given", async () => {
    script({ stdout: contextAllOutput(home().home) });
    await getContextAllResponse("/work/app");
    expect(stub().calls[0].options).toMatchObject({ cwd: "/work/app" });
  });

  it("returns the global shape: model, totals, free space last, groups derived under temp HOME", async () => {
    await mkdir(join(home().claudeDir), { recursive: true });
    await writeFile(join(home().claudeDir, "CLAUDE.md"), "x".repeat(400));
    script({ stdout: contextAllOutput(home().home) });

    const result = await getContextAllResponse();
    if (!result.success) throw new Error(result.error);

    expect(result).toMatchObject({
      model: "Sonnet 4.6",
      model_id: "claude-sonnet-4-6",
      total_tokens: 24900,
      max_tokens: 200000,
      percentage: 12,
      is_estimated: true,
    });
    expect(result.categories.map((category) => category.name)).toEqual([
      "System prompt",
      "Memory files",
      "Skills",
      "Free space",
    ]);

    const memory = result.categories.find((category) => category.name === "Memory files");
    // 400 chars / 4 chars-per-token read from CLAUDE.md inside the temp HOME.
    expect(memory?.tokens).toBe(100);

    const skills = result.categories.find((category) => category.name === "Skills");
    const groups = Object.fromEntries((skills?.groups ?? []).map((g) => [g.name, g.items]));
    expect(groups.User).toEqual([{ name: "SKILL.md", tokens: 1200 }]);
    expect(groups.Project).toEqual([{ name: "SKILL.md", tokens: 800 }]);
  });

  it("reports failures and unparseable output", async () => {
    script({ code: 1, stderr: "bad" });
    expect(await getContextAllResponse()).toEqual({ success: false, error: "bad" });
    script({ stdout: "garbage" });
    expect(await getContextAllResponse()).toEqual({
      success: false,
      error: "unable to parse context all output",
    });
    script({ error: new Error("ENOENT") });
    expect(await getContextAllResponse()).toEqual({
      success: false,
      error: "claude CLI not available",
    });
  });
});

describe("enrichZeroItemTokens", () => {
  const parsed = (categories: unknown[]) =>
    ({
      success: true,
      model: "M",
      model_id: "m",
      total_tokens: 100,
      max_tokens: 1000,
      percentage: 10,
      is_estimated: false,
      categories,
    }) as never;

  it("estimates custom agents from the agents dir under the temp HOME", async () => {
    await mkdir(join(home().claudeDir, "agents"), { recursive: true });
    await writeFile(join(home().claudeDir, "agents", "helper.md"), "y".repeat(80));
    const result = await enrichZeroItemTokens(
      parsed([
        { name: "Custom agents", tokens: 0, percentage: 0, items: [{ name: "helper", tokens: 0 }] },
        { name: "Free space", tokens: 900, percentage: 90, items: [] },
      ]),
    );
    const agents = result.categories[0];
    expect(agents.tokens).toBe(20);
    expect(agents.items).toEqual([{ name: "helper", tokens: 20 }]);
    expect(result.categories[1].tokens).toBe(880);
    expect(result.is_estimated).toBe(true);
  });

  it("estimates MCP tools without touching disk and refuses unsafe or missing memory paths", async () => {
    const result = await enrichZeroItemTokens(
      parsed([
        { name: "MCP tools", tokens: 0, percentage: 0, items: [{ name: "t", tokens: 0 }] },
        {
          name: "Memory files",
          tokens: 0,
          percentage: 0,
          items: [
            { name: "rel", tokens: 0, sourcePath: "relative/CLAUDE.md" },
            { name: "esc", tokens: 0, sourcePath: "/tmp/../etc/passwd" },
            { name: "gone", tokens: 0, sourcePath: join(home().home, "nope.md") },
            { name: "nopath", tokens: 0 },
          ],
        },
      ]),
    );
    expect(result.categories[0].tokens).toBeGreaterThan(0);
    expect(result.categories[1].items.map((item) => item.tokens)).toEqual([0, 0, 0, 0]);
  });

  it("leaves items that already have tokens and unrelated categories alone", async () => {
    const result = await enrichZeroItemTokens(
      parsed([
        { name: "Messages", tokens: 5, percentage: 1, items: [{ name: "m", tokens: 0 }] },
        { name: "Memory files", tokens: 7, percentage: 1, items: [{ name: "a", tokens: 7 }] },
      ]),
    );
    expect(result.is_estimated).toBe(false);
    expect(result.categories[1].tokens).toBe(7);
  });
});

describe("spawn safety", () => {
  it("throws when anything other than claude is spawned", () => {
    expect(() => stub().spawn("rm", ["-rf", "/"])).toThrow(UnexpectedSpawnError);
  });
});

describe("/api/context routes", () => {
  it("serve the mocked output through the app, with the project dir as cwd", async () => {
    const app = createApp({ token: TOKEN });
    const global = await app.request("/api/context", { headers: AUTH });
    expect(await global.json()).toMatchObject({ success: true, total: 26300 });

    script({ stdout: contextAllOutput(home().home) });
    const project = await app.request("/api/context/all?scope=project&projectDir=/work/app", {
      headers: AUTH,
    });
    expect(await project.json()).toMatchObject({ success: true, model_id: "claude-sonnet-4-6" });
    expect(stub().calls.at(-1)?.options).toMatchObject({ cwd: "/work/app" });
  });

  it("rejects project scope without an absolute projectDir and never spawns", async () => {
    const app = createApp({ token: TOKEN });
    const res = await app.request("/api/context/all?scope=project", { headers: AUTH });
    expect(res.status).toBe(400);
    expect(stub().calls).toEqual([]);
  });
});
