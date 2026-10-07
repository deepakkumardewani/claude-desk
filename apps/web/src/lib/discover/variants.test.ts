import type { DiscoveredItem } from "schema";
import { describe, expect, it } from "vite-plus/test";
import {
  countSelectedByKind,
  groupVariants,
  preferredVariant,
  sourceRoot,
  topLevelItems,
  variantsIdentical,
} from "./variants";

function make(
  kind: DiscoveredItem["kind"],
  name: string,
  path: string,
  blobs: string[] = [],
): DiscoveredItem {
  return {
    id: `${kind}:${path}`,
    kind,
    name,
    path,
    files: blobs.map((blobSha, i) => ({ path: `${path}/f${i}.md`, size: 1, blobSha })),
  };
}

describe("sourceRoot", () => {
  it("returns the leading dot-folder or root", () => {
    expect(sourceRoot(".claude/skills/x")).toBe(".claude");
    expect(sourceRoot(".agents/skills/x")).toBe(".agents");
    expect(sourceRoot("skills/x")).toBe("root");
    expect(sourceRoot(".mcp.json")).toBe("root");
  });
});

describe("groupVariants", () => {
  it("merges the same kind and name across source roots", () => {
    const groups = groupVariants([
      make("skill", "animate", ".claude/skills/animate"),
      make("skill", "animate", ".agents/skills/animate"),
      make("skill", "animate", "skills/animate"),
      make("skill", "other", ".claude/skills/other"),
    ]);
    expect(groups.map((g) => [g.key, g.variants.length])).toEqual([
      ["skill:animate", 3],
      ["skill:other", 1],
    ]);
  });

  it("does not merge different kinds with the same name", () => {
    const groups = groupVariants([
      make("skill", "review", ".claude/skills/review"),
      make("agent", "review", ".claude/agents/review.md"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps a second copy under the same root as its own group", () => {
    const groups = groupVariants([
      make("skill", "a", "skills/a"),
      make("skill", "a", "other/skills/a"),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
  });

  it("passes plugins and non-groupable kinds through as single-variant groups", () => {
    const groups = groupVariants([
      make("plugin", "p", ".claude-plugin/a"),
      make("plugin", "p", ".other/a"),
      make("hook", "h", ".claude/settings.json"),
      make("hook", "h", ".agents/settings.json"),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups.every((g) => g.variants.length === 1)).toBe(true);
  });
});

describe("preferredVariant", () => {
  it("follows SOURCE_PRIORITY: .claude, root, then .agents", () => {
    const agents = make("skill", "x", ".agents/skills/x");
    const root = make("skill", "x", "skills/x");
    const claude = make("skill", "x", ".claude/skills/x");
    const group = (variants: DiscoveredItem[]) => ({
      key: "skill:x",
      kind: "skill" as const,
      name: "x",
      variants,
    });
    expect(preferredVariant(group([agents, root, claude]))).toBe(claude);
    expect(preferredVariant(group([agents, root]))).toBe(root);
    expect(preferredVariant(group([agents]))).toBe(agents);
  });

  it("ranks unknown roots last", () => {
    const unknown = make("skill", "x", ".zed/skills/x");
    const agents = make("skill", "x", ".agents/skills/x");
    const group = { key: "k", kind: "skill" as const, name: "x", variants: [unknown, agents] };
    expect(preferredVariant(group)).toBe(agents);
  });
});

describe("variantsIdentical", () => {
  it("ignores each variant's own source-root prefix", () => {
    const a = make("skill", "x", ".claude/skills/x", ["s1", "s2"]);
    const b = make("skill", "x", ".agents/skills/x", ["s1", "s2"]);
    // Paths differ only by prefix, so file-path equality must come from stripping it.
    a.files = [{ path: ".claude/skills/x/SKILL.md", size: 1, blobSha: "s1" }];
    b.files = [{ path: ".agents/skills/x/SKILL.md", size: 1, blobSha: "s1" }];
    expect(variantsIdentical(a, b)).toBe(true);
  });

  it("detects differing content or file sets", () => {
    const a = make("skill", "x", ".claude/skills/x", ["s1"]);
    expect(variantsIdentical(a, make("skill", "x", ".agents/skills/x", ["s9"]))).toBe(false);
    expect(variantsIdentical(a, make("skill", "x", ".agents/skills/x", ["s1", "s2"]))).toBe(false);
  });

  it("does not claim identical when there are no files to compare", () => {
    const a = make("skill", "x", ".claude/skills/x");
    expect(variantsIdentical(a, make("skill", "x", ".agents/skills/x"))).toBe(false);
  });
});

describe("topLevelItems", () => {
  it("drops items owned by a plugin", () => {
    const child = make("skill", "inner", "p/skills/inner");
    const plugin = { ...make("plugin", "p", "p"), payload: { children: [child] } };
    expect(topLevelItems([plugin, child])).toEqual([plugin]);
  });
});

describe("countSelectedByKind", () => {
  it("counts only selected groups, per kind", () => {
    const groups = groupVariants([
      make("skill", "a", "skills/a"),
      make("skill", "b", "skills/b"),
      make("agent", "c", "agents/c.md"),
    ]);
    const selection = new Map([
      ["skill:a", "skill:skills/a"],
      ["agent:c", "agent:agents/c.md"],
      ["skill:gone", "x"],
    ]);
    expect(countSelectedByKind(selection, groups)).toEqual(
      new Map([
        ["skill", 1],
        ["agent", 1],
      ]),
    );
    expect(countSelectedByKind(new Map(), groups).size).toBe(0);
  });
});
