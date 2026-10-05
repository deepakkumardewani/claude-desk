import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { MAX_FILE_BYTES } from "schema";
import type { TreeEntry } from "./github.js";
import { detectItems, detectWithWarnings, neededFilePaths, parseFrontmatter } from "./detect.js";

type Fixture = { tree: TreeEntry[]; files: Record<string, string> };

const load = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));

const reader = (fixture: Fixture) => (path: string) => fixture.files[path];

const ofKind = <T extends { kind: string }>(items: T[], kind: string) =>
  items.filter((item) => item.kind === kind);

describe("parseFrontmatter", () => {
  it("reads scalars, quoted values and folded blocks; ignores content without frontmatter", () => {
    expect(parseFrontmatter("---\nname: a\ndescription: 'b c'\n---\nbody")).toEqual({
      name: "a",
      description: "b c",
    });
    expect(parseFrontmatter("---\ndescription: >-\n  one\n  two\n---")).toEqual({
      description: "one two",
    });
    expect(parseFrontmatter("# no frontmatter")).toEqual({});
  });
});

describe("detectItems: skill, agent, command", () => {
  const fixture = load("tree-skills-agents-commands.json");
  const items = detectItems(fixture.tree, reader(fixture));

  it("produces exactly the expected skill/agent/command items", () => {
    expect(items.map((i) => [i.kind, i.path, i.name])).toEqual([
      ["skill", "skills/nested/deep", "deep"],
      ["skill", "skills/pdf", "pdf-tools"],
      ["agent", ".claude/agents/reviewer.md", "code-reviewer"],
      ["command", ".claude/commands/deploy.md", "deploy"],
      ["command", ".claude/commands/frontend/lint.md", "frontend/lint"],
      ["convertible", ".github/agents/triage.agent.md", "triage"],
    ]);
  });

  it("bundles every file beneath a skill directory and reads frontmatter metadata", () => {
    const pdf = items.find((i) => i.path === "skills/pdf");
    expect(pdf?.files.map((f) => f.path)).toEqual([
      "skills/pdf/SKILL.md",
      "skills/pdf/scripts/extract.py",
    ]);
    expect(pdf?.description).toBe("Work with PDFs");
    expect(items.find((i) => i.path === "skills/nested/deep")?.description).toBe(
      "Folded description",
    );
  });

  it("skips agents without name/description frontmatter; .github agent files are convertibles, not agents", () => {
    expect(items.some((i) => i.path.endsWith("notes.md"))).toBe(false);
    expect(items.filter((i) => i.path.includes("triage.agent.md")).map((i) => i.kind)).toEqual([
      "convertible",
    ]);
  });

  it("excludes node_modules, vendor, dist, build and .git", () => {
    const excluded = /^(node_modules|vendor|dist|build|\.git)\//;
    expect(items.filter((i) => excluded.test(i.path))).toEqual([]);
  });

  it("produces zero items from symlink and submodule entries", () => {
    const paths = items.flatMap((i) => [i.path, ...i.files.map((f) => f.path)]);
    expect(paths.some((p) => p.includes("skills/linked"))).toBe(false);
    expect(paths.some((p) => p.includes("alias.md"))).toBe(false);
    expect(paths.some((p) => p.includes("agents/external"))).toBe(false);
  });

  it("uses `${kind}:${path}` ids that are stable across calls", () => {
    expect(items.every((i) => i.id === `${i.kind}:${i.path}`)).toBe(true);
    expect(detectItems(fixture.tree, reader(fixture))).toEqual(items);
    expect(detectItems([...fixture.tree].reverse(), reader(fixture)).map((i) => i.id)).toEqual(
      items.map((i) => i.id),
    );
  });

  it("falls back to the folder name when SKILL.md cannot be read, and warns when an agent cannot", () => {
    const result = detectWithWarnings(fixture.tree, () => undefined);
    expect(result.items.map((i) => i.name)).toContain("pdf");
    expect(result.warnings.some((w) => w.includes("reviewer.md"))).toBe(true);
  });
});

describe("neededFilePaths", () => {
  it("lists only content-bearing files from eligible paths", () => {
    const fixture = load("tree-skills-agents-commands.json");
    const needed = neededFilePaths(fixture.tree);
    expect(needed).toContain("skills/pdf/SKILL.md");
    expect(needed).toContain(".claude/agents/reviewer.md");
    expect(needed).not.toContain("skills/linked/SKILL.md");
    expect(needed).not.toContain("node_modules/pkg/SKILL.md");
    expect(needed).not.toContain("skills/pdf/scripts/extract.py");
  });
});

describe("detectItems: hook, setting, mcp", () => {
  const fixture = load("tree-hooks-mcp-settings.json");
  const result = detectWithWarnings(fixture.tree, reader(fixture));
  const root = result.items.filter((i) => !i.path.startsWith("tools/"));

  it("yields one hook item per event+matcher group with existing scripts only", () => {
    const hooks = ofKind(root, "hook");
    expect(hooks.map((h) => [h.name, h.files.map((f) => f.path)])).toEqual([
      ["PreToolUse (Bash)", [".claude/hooks/guard.sh"]],
      ["PostToolUse (Edit|Write)", [".claude/hooks/format.sh"]],
    ]);
    expect(hooks[0].id).toBe("hook:.claude/settings.json#hooks.PreToolUse[0]");
  });

  it("notes a missing referenced script instead of crashing", () => {
    const post = ofKind(root, "hook")[1];
    expect((post.payload as { missingScripts: string[] }).missingScripts).toEqual([
      ".claude/hooks/missing.sh",
    ]);
    expect(result.warnings.some((w) => w.includes("missing.sh"))).toBe(true);
  });

  it("yields one setting item per non-hooks key", () => {
    const settings = ofKind(root, "setting");
    expect(settings.map((s) => s.name)).toEqual(["permissions", "env", "model"]);
    expect(settings[2].payload).toEqual({ key: "model", value: "opus" });
  });

  it("yields one mcp item per server with the config as payload", () => {
    const mcp = ofKind(root, "mcp");
    expect(mcp.map((m) => m.name)).toEqual(["github", "docs"]);
    expect(mcp[0].payload).toEqual({
      command: "npx",
      args: ["-y", "gh-mcp"],
      env: { TOKEN: "${GH_TOKEN}" },
    });
  });

  it("resolves hook scripts relative to a nested .claude directory and warns on invalid JSON", () => {
    const stop = result.items.find((i) => i.path.startsWith("tools/sub/.claude/settings.json"));
    expect(stop?.name).toBe("Stop");
    expect((stop!.payload as { missingScripts: string[] }).missingScripts).toEqual([
      "tools/sub/.claude/hooks/sub.sh",
    ]);
    expect(result.warnings.some((w) => w.includes("tools/sub/.mcp.json is not valid JSON"))).toBe(
      true,
    );
  });
});

describe("detectItems: plugins and size caps", () => {
  const fixture = load("tree-plugin-marketplace.json");
  const only = (prefixes: string[]) => ({
    tree: fixture.tree.filter(
      (e) => prefixes.some((p) => e.path.startsWith(p)) || e.path.startsWith(".claude-plugin"),
    ),
    files: fixture.files,
  });

  it("marketplace: one plugin item per listed plugin, children nested and not top-level", () => {
    const scoped = only(["plugins/", "loose/"]);
    const items = detectItems(scoped.tree, reader(scoped));
    expect(items.map((i) => [i.kind, i.name])).toEqual([
      ["skill", "free"],
      ["plugin", "alpha"],
      ["plugin", "beta"],
    ]);
    const children = (name: string) => {
      const item = items.find((i) => i.name === name);
      if (!item) throw new Error(`missing ${name}`);
      return (item.payload as { children: { path: string }[] }).children.map((c) => c.path);
    };
    expect(children("alpha")).toEqual(["plugins/alpha/skills/one", "plugins/alpha/commands/go.md"]);
    expect(children("beta")).toEqual(["plugins/beta/agents/helper.md"]);
    expect(items.find((i) => i.name === "alpha")?.payload).toMatchObject({
      marketplace: "demo-market",
    });
  });

  it("plugin.json without a marketplace: plugin shown and children also top-level", () => {
    const scoped = {
      tree: fixture.tree.filter((e) => e.path.startsWith("standalone/")),
      files: fixture.files,
    };
    const items = detectItems(scoped.tree, reader(scoped));
    const plugin = items.find((i) => i.kind === "plugin");
    expect(plugin?.name).toBe("standalone-plug");
    const children = (plugin!.payload as { children: { id: string }[] }).children;
    expect(children.map((c) => c.id)).toEqual([
      "skill:standalone/skills/solo",
      "command:standalone/commands/run.md",
    ]);
    const topLevel = items.filter((i) => i.kind !== "plugin").map((i) => i.id);
    expect(topLevel).toEqual(children.map((c) => c.id));
    expect(items.find((i) => i.kind === "skill")?.pluginId).toBe(plugin?.id);
  });

  it("marks an item over MAX_ITEM_BYTES not installable and lists an oversized file without content", () => {
    const scoped = {
      tree: fixture.tree.filter((e) => e.path.startsWith("big/")),
      files: fixture.files,
    };
    const items = detectItems(scoped.tree, reader(scoped));
    const huge = items.find((i) => i.name === "huge");
    const ok = items.find((i) => i.name === "ok");
    expect(huge?.installable).toBe(false);
    expect(ok?.installable).toBe(true);
    const oversized = huge?.files.filter((f) => f.size > MAX_FILE_BYTES);
    expect(oversized?.map((f) => f.path)).toEqual([
      "big/skills/huge/SKILL.md",
      "big/skills/huge/data.bin",
      "big/skills/huge/more.bin",
    ]);
    expect(oversized?.every((f) => f.tooLarge === true)).toBe(true);
    expect(huge?.files.find((f) => f.size <= MAX_FILE_BYTES)).toBeUndefined();
  });
});

describe("detectItems: convertible", () => {
  const fixture = load("tree-convertible.json");
  const items = detectItems(fixture.tree, reader(fixture));

  it("detects all 7 Cursor/Copilot patterns with the right convertsTo, ignoring vendor dirs", () => {
    expect(items.every((i) => i.kind === "convertible")).toBe(true);
    expect(items.map((i) => [i.path, i.name, i.convertsTo])).toEqual([
      [".cursor/rules/style.mdc", "style", "skill"],
      [".cursorrules", "cursorrules", "skill"],
      [".github/agents/helper.agent.md", "helper", "agent"],
      [".github/chatmodes/planner.chatmode.md", "planner", "agent"],
      [".github/copilot-instructions.md", "copilot-instructions", "skill"],
      [".github/instructions/api.instructions.md", "api", "skill"],
      [".github/prompts/review.prompt.md", "review", "command"],
    ]);
  });

  it("keeps the source description and requests the files for content fetching", () => {
    expect(items.find((i) => i.name === "style")?.description).toBe("Code style");
    expect(neededFilePaths(fixture.tree)).toContain(".github/prompts/review.prompt.md");
    expect(neededFilePaths(fixture.tree)).not.toContain("README.md");
  });
});
