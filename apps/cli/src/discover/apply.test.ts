import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiscoveredItem } from "schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getBackups } from "../fs/backups.js";
import { readFileSync } from "node:fs";
import { readMcpConfig } from "../fs/mcp.js";
import { detectItems } from "./detect.js";
import { applyPlan, withSuffix } from "./apply.js";
import { listEntries } from "./manifest.js";
import {
  buildPlan,
  collectMerges,
  collectWrites,
  mcpResolutionKey,
  readDiskState,
  readMergeState,
  sha256,
  type FetchedItem,
} from "./plan.js";

let root = "";
let previousRoot: string | undefined;

beforeEach(async () => {
  previousRoot = process.env.CLAUDE_ROOT;
  root = await mkdtemp(join(tmpdir(), "claude-apply-"));
  process.env.CLAUDE_ROOT = root;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.env.CLAUDE_ROOT = previousRoot;
  await rm(root, { recursive: true, force: true });
});

const USER = { scope: "user" } as const;

function skill(name: string, files: Record<string, string>): FetchedItem {
  const item: DiscoveredItem = {
    id: `skill:skills/${name}`,
    kind: "skill",
    name,
    path: `skills/${name}`,
    files: Object.entries(files).map(([rel, content]) => ({
      path: `skills/${name}/${rel}`,
      size: content.length,
      blobSha: "x",
    })),
  };
  return {
    item,
    files: new Map(Object.entries(files).map(([rel, c]) => [`skills/${name}/${rel}`, c])),
  };
}

async function planFor(items: FetchedItem[]) {
  const writes = collectWrites(items, USER);
  const plan = buildPlan(items, USER, await readDiskState(writes));
  return { plan, writes };
}

describe("applyPlan", () => {
  it("writes new files and creates no backups", async () => {
    const { plan, writes } = await planFor([skill("pdf", { "SKILL.md": "# a", "x/y.txt": "y" })]);
    const out = await applyPlan({ plan, writes });
    expect(out).toEqual({ results: [{ itemId: "skill:skills/pdf", ok: true }], backups: [] });
    expect(await readFile(join(root, "skills/pdf/SKILL.md"), "utf8")).toBe("# a");
    expect(await readFile(join(root, "skills/pdf/x/y.txt"), "utf8")).toBe("y");
  });

  it("backs up before overwriting and lists the backup in the result", async () => {
    const target = join(root, "skills/pdf/SKILL.md");
    await mkdir(join(root, "skills/pdf"), { recursive: true });
    await writeFile(target, "old");

    const { plan, writes } = await planFor([skill("pdf", { "SKILL.md": "new" })]);
    expect(plan.fileWrites[0].status).toBe("conflict");
    const out = await applyPlan({ plan, writes, resolutions: { [target]: "overwrite" } });

    expect(out.backups).toEqual([target]);
    expect(await readFile(target, "utf8")).toBe("new");
    const backups = await getBackups(target);
    expect(backups).toHaveLength(1);
    expect(await readFile(backups[0].path, "utf8")).toBe("old");
  });

  it("skips a conflict resolved as skip and leaves identical files alone", async () => {
    const skillMd = join(root, "skills/pdf/SKILL.md");
    const same = join(root, "skills/pdf/same.txt");
    await mkdir(join(root, "skills/pdf"), { recursive: true });
    await writeFile(skillMd, "old");
    await writeFile(same, "same");

    const { plan, writes } = await planFor([
      skill("pdf", { "SKILL.md": "new", "same.txt": "same" }),
    ]);
    const out = await applyPlan({ plan, writes, resolutions: { [skillMd]: "skip" } });
    expect(out.results[0].ok).toBe(true);
    expect(out.backups).toEqual([]);
    expect(await readFile(skillMd, "utf8")).toBe("old");
  });

  it("rename writes to the alternate name and keeps the original untouched", async () => {
    const target = join(root, "skills/pdf/SKILL.md");
    await mkdir(join(root, "skills/pdf"), { recursive: true });
    await writeFile(target, "old");
    await writeFile(join(root, "skills/pdf/SKILL-2.md"), "taken");

    const { plan, writes } = await planFor([skill("pdf", { "SKILL.md": "new" })]);
    const out = await applyPlan({ plan, writes, resolutions: { [target]: "rename" } });

    expect(out.results[0].ok).toBe(true);
    expect(await readFile(target, "utf8")).toBe("old");
    expect(await readFile(join(root, "skills/pdf/SKILL-3.md"), "utf8")).toBe("new");
    expect(out.backups).toEqual([]);
  });

  it("fails an item with an unresolved conflict and writes nothing for it", async () => {
    const target = join(root, "skills/pdf/SKILL.md");
    await mkdir(join(root, "skills/pdf"), { recursive: true });
    await writeFile(target, "old");

    const { plan, writes } = await planFor([skill("pdf", { "A.md": "a", "SKILL.md": "new" })]);
    const out = await applyPlan({ plan, writes });
    expect(out.results[0]).toMatchObject({
      ok: false,
      error: expect.stringContaining("Unresolved"),
    });
    await expect(stat(join(root, "skills/pdf/A.md"))).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("old");
  });

  it("rolls back a failing item completely while a sibling item's writes remain", async () => {
    // `bad/sub` is a regular file, so writing bad/sub/B.md fails after bad/A.md succeeded.
    await mkdir(join(root, "skills/bad"), { recursive: true });
    await writeFile(join(root, "skills/bad/sub"), "i am a file");
    await writeFile(join(root, "skills/bad/SKILL.md"), "keep me");

    const items = [
      skill("bad", { "A.md": "a", "SKILL.md": "overwrite attempt", "sub/B.md": "b" }),
      skill("good", { "SKILL.md": "good" }),
    ];
    const writes = collectWrites(items, USER);
    const plan = buildPlan(items, USER, new Map());
    const out = await applyPlan({
      plan,
      writes,
      resolutions: {},
    });

    expect(out.results.map((r) => r.ok)).toEqual([false, true]);
    expect(await readdir(join(root, "skills/bad"))).toEqual(["SKILL.md", "sub"]);
    expect(await readFile(join(root, "skills/bad/SKILL.md"), "utf8")).toBe("keep me");
    expect(await readFile(join(root, "skills/good/SKILL.md"), "utf8")).toBe("good");
  });

  it("removes directories it created when rolling back", async () => {
    await mkdir(join(root, "skills/fresh"), { recursive: true });
    await writeFile(join(root, "skills/fresh/blocker"), "file");
    const items = [skill("fresh", { "deep/er/A.md": "a", "blocker/B.md": "b" })];
    const writes = collectWrites(items, USER);
    const out = await applyPlan({ plan: buildPlan(items, USER, new Map()), writes });
    expect(out.results[0].ok).toBe(false);
    expect(await readdir(join(root, "skills/fresh"))).toEqual(["blocker"]);
  });
});

describe("withSuffix", () => {
  it("inserts the suffix before the extension", () => {
    expect(withSuffix("a/SKILL.md", 2)).toBe("a/SKILL-2.md");
    expect(withSuffix("a/LICENSE", 3)).toBe("a/LICENSE-3");
  });
});

// ---------- merge kinds ----------

const SOURCE = { owner: "acme", repo: "tools" };
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));

function settingItem(key: string, value: unknown): FetchedItem {
  return {
    item: {
      id: `setting:.claude/settings.json#${key}`,
      kind: "setting",
      name: key,
      path: `.claude/settings.json#${key}`,
      files: [],
      payload: { key, value },
    },
    files: new Map(),
  };
}

function hookItem(): FetchedItem {
  const paths = [".claude/hooks/guard.sh", ".claude/hooks/lint.js"];
  return {
    source: SOURCE,
    item: {
      id: "hook:.claude/settings.json#hooks.PreToolUse[0]",
      kind: "hook",
      name: "PreToolUse",
      path: ".claude/settings.json#hooks.PreToolUse[0]",
      files: paths.map((path) => ({ path, size: 4, blobSha: "h" })),
      payload: {
        event: "PreToolUse",
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command:
              'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh && node .claude/hooks/lint.js',
          },
        ],
        missingScripts: [],
      },
    },
    files: new Map([
      [paths[0], "#!/bin/sh\necho guard"],
      [paths[1], "console.log(1)"],
    ]),
  };
}

function mcpItem(name: string, payload: Record<string, unknown>): FetchedItem {
  return {
    item: {
      id: `mcp:.mcp.json#${name}`,
      kind: "mcp",
      name,
      path: `.mcp.json#${name}`,
      files: [],
      payload,
    },
    files: new Map(),
  };
}

function pluginItem(): FetchedItem {
  return {
    source: { owner: "acme", repo: "market" },
    item: {
      id: "plugin:.claude-plugin/marketplace.json#toolkit",
      kind: "plugin",
      name: "toolkit",
      path: ".claude-plugin/marketplace.json#toolkit",
      files: [],
      payload: {
        plugin: "toolkit",
        marketplace: "acme-market",
        children: [{ id: "skill:skills/x", kind: "skill", name: "x", path: "skills/x", files: [] }],
      },
    },
    files: new Map(),
  };
}

const ENOENT = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });

describe("applyPlan merge kinds", () => {
  let configDir = "";
  let previousConfigDir: string | undefined;

  beforeEach(async () => {
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
    configDir = await mkdtemp(join(tmpdir(), "claude-config-"));
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(async () => {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
    await rm(configDir, { recursive: true, force: true });
  });

  async function install(
    items: FetchedItem[],
    extra: Partial<Parameters<typeof applyPlan>[0]> = {},
  ) {
    const writes = collectWrites(items, USER);
    const merges = collectMerges(items, USER);
    const state = await readMergeState(USER, merges);
    const plan = buildPlan(items, USER, await readDiskState(writes), state);
    return { plan, out: await applyPlan({ plan, writes, merges, ...extra }) };
  }

  describe("settings", () => {
    it("merges a permissions item, backs up the old file and reports exactly what was added", async () => {
      const settingsPath = join(root, "settings.json");
      await writeFile(
        settingsPath,
        JSON.stringify({ model: "opus", permissions: { allow: ["Read"] } }),
      );
      const { out } = await install([settingItem("permissions", { allow: ["Read", "Bash(ls)"] })]);

      expect(out.results).toEqual([
        {
          itemId: "setting:.claude/settings.json#permissions",
          ok: true,
          settingsEntries: [{ pointer: "/permissions/allow", value: ["Bash(ls)"] }],
        },
      ]);
      expect(await readJson(settingsPath)).toEqual({
        model: "opus",
        permissions: { allow: ["Read", "Bash(ls)"] },
      });
      expect(await getBackups(settingsPath)).toHaveLength(1);
    });

    it("is idempotent: applying twice does not duplicate and does not rewrite", async () => {
      const item = settingItem("permissions", { allow: ["Bash(ls)"] });
      await install([item]);
      const second = await install([item]);
      expect(second.plan.settingsChanges).toEqual([]);
      expect(second.out.results).toEqual([{ itemId: item.item.id, ok: true }]);
      expect((await readJson(join(root, "settings.json"))).permissions.allow).toEqual(["Bash(ls)"]);
      expect(await getBackups(join(root, "settings.json"))).toHaveLength(0);
    });

    it("rejects a merge that fails schema validation and leaves the file untouched", async () => {
      const settingsPath = join(root, "settings.json");
      await writeFile(settingsPath, JSON.stringify({ model: "opus" }));
      const { out } = await install([settingItem("permissions", { defaultMode: "bogus" })]);

      expect(out.results[0].ok).toBe(false);
      expect(out.results[0].error).toMatch(/invalid after merge/);
      expect(await readJson(settingsPath)).toEqual({ model: "opus" });
    });
  });

  describe("hooks", () => {
    it("copies scripts, merges the rewritten command and the command resolves to a real file", async () => {
      const { out } = await install([hookItem()]);
      expect(out.results[0].ok).toBe(true);

      const guard = join(root, "hooks/tools-guard.sh");
      expect(await readFile(guard, "utf8")).toBe("#!/bin/sh\necho guard");
      expect((await stat(guard)).mode & 0o111).not.toBe(0);

      const settings = await readJson(join(root, "settings.json"));
      const [group] = settings.hooks.PreToolUse;
      expect(group.matcher).toBe("Bash");
      const command: string = group.hooks[0].command;
      const referenced = [...command.matchAll(/([^\s"]*\/hooks\/[^\s"]+)/g)].map((m) => m[1]);
      expect(referenced).toHaveLength(2);
      for (const path of referenced) expect((await stat(path)).isFile()).toBe(true);
    });

    it("resolves project-scope commands against $CLAUDE_PROJECT_DIR", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "claude-project-"));
      try {
        const target = { scope: "project", projectDir } as const;
        const items = [hookItem()];
        const writes = collectWrites(items, target);
        const merges = collectMerges(items, target);
        const plan = buildPlan(items, target, new Map(), await readMergeState(target, merges));
        const out = await applyPlan({ plan, writes, merges });
        expect(out.results[0].ok).toBe(true);

        const settings = await readJson(join(projectDir, ".claude/settings.json"));
        const command: string = settings.hooks.PreToolUse[0].hooks[0].command;
        // Shell quote removal: "$DIR"/x concatenates into one word.
        const resolved = command.replaceAll("$CLAUDE_PROJECT_DIR", projectDir).replaceAll('"', "");
        const paths = [...resolved.matchAll(/([^\s"]*\/hooks\/[^\s"]+)/g)].map((m) => m[1]);
        expect(paths).toHaveLength(2);
        for (const path of paths) expect((await stat(path)).isFile()).toBe(true);
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("removes the copied scripts when the settings merge is rejected", async () => {
      await writeFile(
        join(root, "settings.json"),
        JSON.stringify({ permissions: { defaultMode: "bogus" } }),
      );
      const { out } = await install([hookItem()]);
      expect(out.results[0].ok).toBe(false);
      await expect(stat(join(root, "hooks"))).rejects.toThrow();
    });

    it("refuses to rename a conflicting hook script", async () => {
      const guard = join(root, "hooks/tools-guard.sh");
      await mkdir(join(root, "hooks"), { recursive: true });
      await writeFile(guard, "different");
      const { out } = await install([hookItem()], { resolutions: { [guard]: "rename" } });
      expect(out.results[0]).toMatchObject({ ok: false });
      expect(out.results[0].error).toMatch(/cannot be renamed/);
    });
  });

  describe("mcp", () => {
    const server = () =>
      mcpItem("github", {
        command: "npx",
        args: ["-y", "gh-mcp"],
        env: { GITHUB_TOKEN: "ghp_literal_secret" },
      });

    it("writes ${VAR} placeholders and the result is readable by the MCP page", async () => {
      const mcpRunner = vi.fn().mockRejectedValue(ENOENT);
      const { out } = await install([server()], { mcpRunner });
      expect(out.results).toEqual([
        { itemId: "mcp:.mcp.json#github", ok: true, mcpServers: ["github"] },
      ]);

      const config = await readMcpConfig("user");
      expect(config.mcpServers.github.transport).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "gh-mcp"],
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
      });
      expect(await readFile(join(root, ".mcp.json"), "utf8")).not.toContain("ghp_literal_secret");
    });

    it("passes the placeholder payload to `claude mcp add-json` and never a literal secret", async () => {
      const mcpRunner = vi.fn().mockResolvedValue("");
      await install([server()], { mcpRunner });
      expect(mcpRunner).toHaveBeenCalledTimes(1);
      const [cmd, args] = mcpRunner.mock.calls[0];
      expect(cmd).toBe("claude");
      expect(args.slice(0, 3)).toEqual(["mcp", "add-json", "github"]);
      expect(JSON.parse(args[3]).env).toEqual({ GITHUB_TOKEN: "${GITHUB_TOKEN}" });
      expect(args.join(" ")).not.toContain("ghp_literal_secret");
    });

    describe("name collision", () => {
      const collide = async (resolutions?: Record<string, "skip" | "rename" | "overwrite">) => {
        await writeFile(
          join(configDir, ".claude.json"),
          JSON.stringify({ mcpServers: { github: { type: "stdio", command: "old" } } }),
        );
        const mcpRunner = vi.fn().mockRejectedValue(ENOENT);
        const result = await install([server()], { mcpRunner, resolutions });
        return { ...result, mcpRunner };
      };

      it("is reported as a conflict and fails until resolved", async () => {
        const { plan, out, mcpRunner } = await collide();
        expect(plan.mcpChanges[0].status).toBe("conflict");
        expect(out.results[0].ok).toBe(false);
        expect(mcpRunner).not.toHaveBeenCalled();
      });

      it("skip leaves the existing server and installs nothing", async () => {
        const { out, mcpRunner } = await collide({ [mcpResolutionKey("github")]: "skip" });
        expect(out.results[0]).toEqual({ itemId: "mcp:.mcp.json#github", ok: true });
        expect(mcpRunner).not.toHaveBeenCalled();
      });

      it("rename installs under a free alternate name", async () => {
        const { out } = await collide({ [mcpResolutionKey("github")]: "rename" });
        expect(out.results[0]).toMatchObject({ ok: true, mcpServers: ["github-2"] });
        expect(Object.keys((await readMcpConfig("user")).mcpServers)).toEqual(["github-2"]);
      });

      it("overwrite is refused", async () => {
        const { out } = await collide({ [mcpResolutionKey("github")]: "overwrite" });
        expect(out.results[0].error).toMatch(/choose skip or rename/);
      });
    });
  });

  describe("plugin", () => {
    it("writes exactly the two marketplace keys and no files", async () => {
      const { out } = await install([pluginItem()]);
      expect(out.results[0].ok).toBe(true);
      expect(await readJson(join(root, "settings.json"))).toEqual({
        extraKnownMarketplaces: {
          "acme-market": { source: { source: "github", repo: "acme/market" } },
        },
        enabledPlugins: { "toolkit@acme-market": true },
      });
      expect((await readdir(root)).sort()).toEqual(["settings.json"]);
    });

    it("reports both keys as added, and a repeat install adds nothing", async () => {
      const first = await install([pluginItem()]);
      expect(first.out.results[0].settingsEntries?.map((e) => e.pointer)).toEqual([
        "/extraKnownMarketplaces/acme-market",
        "/enabledPlugins/toolkit@acme-market",
      ]);
      const again = await install([pluginItem()]);
      expect(again.out.results[0].settingsEntries).toBeUndefined();
    });
  });

  it("keeps other items' results when one merge item fails", async () => {
    await writeFile(join(root, "settings.json"), "{}");
    const { out } = await install([
      settingItem("permissions", { defaultMode: "bogus" }),
      settingItem("model", "opus"),
    ]);
    expect(out.results.map((r) => r.ok)).toEqual([false, true]);
    expect((await readJson(join(root, "settings.json"))).model).toBe("opus");
  });
});

// ---------- Phase 7 checkpoint: spec §12.3-12.5 against recorded fixture repos ----------

describe("fixture repos end to end (detect -> plan -> apply)", () => {
  type Fixture = {
    tree: Array<{ path: string; sha: string; size?: number; type: string }>;
    files: Record<string, string>;
  };
  const load = (name: string): Fixture =>
    JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));

  const fetchedFrom = (fixture: Fixture, repo: string, pick: (item: DiscoveredItem) => boolean) => {
    const detected = detectItems(fixture.tree as never, (path) => fixture.files[path]);
    return detected.filter(pick).map(
      (item): FetchedItem => ({
        item,
        source: { owner: "acme", repo },
        // Recorded fixtures only keep config files; bundled scripts get stand-in bytes.
        files: new Map(
          item.files.map((f) => [f.path, fixture.files[f.path] ?? "#!/bin/sh\nexit 0\n"]),
        ),
      }),
    );
  };

  let configDir = "";
  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), "claude-config-"));
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(configDir, { recursive: true, force: true });
  });

  async function run(items: FetchedItem[], mcpRunner = vi.fn().mockRejectedValue(ENOENT)) {
    const writes = collectWrites(items, USER);
    const merges = collectMerges(items, USER);
    const plan = buildPlan(
      items,
      USER,
      await readDiskState(writes),
      await readMergeState(USER, merges),
    );
    return { plan, out: await applyPlan({ plan, writes, merges, mcpRunner }) };
  }

  it("12.3: a hook previews its diff, copies its script and merges a rewritten command", async () => {
    const fixture = load("tree-hooks-mcp-settings.json");
    const items = fetchedFrom(
      fixture,
      "guards",
      (i) => i.kind === "hook" && i.name === "PreToolUse (Bash)",
    );
    expect(items).toHaveLength(1);

    const { plan, out } = await run(items);
    expect(plan.settingsChanges.map((c) => c.pointer)).toEqual(["/hooks/PreToolUse"]);
    expect(plan.fileWrites.map((w) => w.targetPath)).toEqual([join(root, "hooks/guards-guard.sh")]);
    expect(out.results.every((r) => r.ok)).toBe(true);

    const settings = await readJson(join(root, "settings.json"));
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(
      `"${join(root, "hooks/guards-guard.sh")}"`,
    );
    expect((await stat(join(root, "hooks/guards-guard.sh"))).isFile()).toBe(true);
  });

  it("12.3: a hook whose script is missing from the repo is refused rather than half-installed", () => {
    const fixture = load("tree-hooks-mcp-settings.json");
    const items = fetchedFrom(
      fixture,
      "guards",
      (i) => i.kind === "hook" && i.name.startsWith("PostToolUse"),
    );
    expect(() => collectMerges(items, USER)).toThrow(/missing from the repo/);
  });

  it("12.4: .mcp.json servers install with ${VAR} placeholders and show on the MCP page", async () => {
    const fixture = load("tree-hooks-mcp-settings.json");
    const items = fetchedFrom(
      fixture,
      "guards",
      (i) => i.kind === "mcp" && i.path.startsWith(".mcp.json"),
    );
    expect(items.map((i) => i.item.name).sort()).toEqual(["docs", "github"]);

    const { out } = await run(items);
    expect(out.results.every((r) => r.ok)).toBe(true);
    const { mcpServers } = await readMcpConfig("user");
    expect(mcpServers.github.transport).toMatchObject({
      type: "stdio",
      env: { TOKEN: "${GH_TOKEN}" },
    });
    expect(mcpServers.docs.transport).toEqual({
      type: "http",
      url: "https://docs.example.com/mcp",
    });
  });

  it("12.5: installing a marketplace plugin writes exactly the two keys and no files", async () => {
    const fixture = load("tree-plugin-marketplace.json");
    const items = fetchedFrom(fixture, "market", (i) => i.kind === "plugin" && i.name === "alpha");
    expect(items).toHaveLength(1);
    expect((items[0].item.payload as { children: unknown[] }).children.length).toBeGreaterThan(0);

    const { plan, out } = await run(items);
    expect(plan.fileWrites).toEqual([]);
    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(await readJson(join(root, "settings.json"))).toEqual({
      extraKnownMarketplaces: {
        "demo-market": { source: { source: "github", repo: "acme/market" } },
      },
      enabledPlugins: { "alpha@demo-market": true },
    });
    expect((await readdir(root)).sort()).toEqual(["settings.json"]);
  });
});

// ---------- Phase 9: manifest recording and updates ----------

describe("applyPlan manifest recording", () => {
  let configDir = "";
  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), "claude-config-"));
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(configDir, { recursive: true, force: true });
  });

  const withSource = (entry: FetchedItem): FetchedItem => ({
    ...entry,
    source: { owner: "acme", repo: "kit" },
  });
  const record = (items: FetchedItem[], update?: Parameters<typeof applyPlan>[0]["record"]) => ({
    items,
    source: { kind: "github" as const, commit: "c1" },
    ...update,
  });

  async function install(
    items: FetchedItem[],
    extra: Partial<Parameters<typeof applyPlan>[0]> = {},
  ) {
    const writes = collectWrites(items, USER);
    const merges = collectMerges(items, USER);
    const plan = buildPlan(
      items,
      USER,
      await readDiskState(writes),
      await readMergeState(USER, merges),
    );
    return applyPlan({
      plan,
      writes,
      merges,
      mcpRunner: vi.fn().mockRejectedValue(ENOENT),
      record: record(items),
      ...extra,
    });
  }

  it("T9.2: a skill install records one entry whose files match what was written", async () => {
    const items = [withSource(skill("pdf", { "SKILL.md": "# a", "x/y.txt": "y" }))];
    const out = await install(items);
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(out.results[0].manifestId).toBe(entries[0].id);
    expect(entries[0].files).toEqual(
      expect.arrayContaining([
        { path: join(root, "skills/pdf/SKILL.md"), sha256: sha256("# a") },
        { path: join(root, "skills/pdf/x/y.txt"), sha256: sha256("y") },
      ]),
    );
    expect(entries[0].files).toHaveLength(2);
  });

  it("T9.2: a setting install records exactly the keys it added", async () => {
    const item = withSource(settingItem("model", "opus"));
    const out = await install([item]);
    const [entry] = await listEntries();
    expect(entry.settingsEntries).toEqual(out.results[0].settingsEntries);
    expect(entry.settingsEntries.map((e) => e.pointer)).toEqual(["/model"]);
    expect(entry.files).toEqual([]);
  });

  it("T9.2: a rolled-back item writes no entry while its sibling does", async () => {
    await mkdir(join(root, "skills/bad"), { recursive: true });
    await writeFile(join(root, "skills/bad/sub"), "i am a file");
    const items = [
      withSource(skill("bad", { "A.md": "a", "sub/B.md": "b" })),
      withSource(skill("good", { "SKILL.md": "good" })),
    ];
    const out = await install(items);
    expect(out.results.map((r) => r.ok)).toEqual([false, true]);
    expect(out.results[0].manifestId).toBeUndefined();
    const entries = await listEntries();
    expect(entries.map((e) => e.itemName)).toEqual(["good"]);
  });

  it("writes no manifest at all when no record option is given", async () => {
    const items = [skill("pdf", { "SKILL.md": "# a" })];
    await install(items, { record: undefined });
    expect(await listEntries()).toEqual([]);
  });

  it("T9.3: an update replaces the entry, removes upstream-deleted files and drops them", async () => {
    const v1 = [withSource(skill("pdf", { "SKILL.md": "v1", "old.md": "old" }))];
    await install(v1);
    const [first] = await listEntries();

    const v2 = [withSource(skill("pdf", { "SKILL.md": "v2" }))];
    const writes = collectWrites(v2, USER);
    const disk = await readDiskState(writes);
    const hashes = new Map(
      await Promise.all(
        first.files.map(async (f) => {
          const text = await readFile(f.path, "utf8").catch(() => undefined);
          return [f.path, text === undefined ? "" : sha256(text)] as const;
        }),
      ),
    );
    const plan = buildPlan(v2, USER, disk, await readMergeState(USER, collectMerges(v2, USER)), {
      itemId: "skill:skills/pdf",
      entry: first,
      disk: hashes,
    });
    expect(plan.fileWrites.map((w) => w.status)).toEqual(["overwrite"]);
    expect(plan.fileRemovals).toEqual([
      { itemId: "skill:skills/pdf", targetPath: join(root, "skills/pdf/old.md") },
    ]);

    const out = await applyPlan({
      plan,
      writes,
      record: { items: v2, source: { kind: "github", commit: "c2" }, update: first },
    });
    expect(out.results[0].ok).toBe(true);
    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(first.id);
    expect(entries[0].source).toMatchObject({ sha: "c2" });
    expect(entries[0].files).toEqual([
      { path: join(root, "skills/pdf/SKILL.md"), sha256: sha256("v2") },
    ]);
    await expect(stat(join(root, "skills/pdf/old.md"))).rejects.toThrow();
    expect(await readFile(join(root, "skills/pdf/SKILL.md"), "utf8")).toBe("v2");
  });
});
