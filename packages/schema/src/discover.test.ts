import { describe, it, expect } from "vite-plus/test";
import {
  MAX_FILE_BYTES,
  MAX_ITEM_BYTES,
  TRUST_RULES,
  itemKindSchema,
  repoRefSchema,
  discoveredItemSchema,
  trustFindingSchema,
  trustRuleSchema,
  installPlanSchema,
  manifestEntrySchema,
  skillsShSearchResponseSchema,
} from "./discover.js";

describe("discover schemas", () => {
  it("exports size caps", () => {
    expect(MAX_FILE_BYTES).toBe(1_000_000);
    expect(MAX_ITEM_BYTES).toBe(10_000_000);
  });

  it("accepts exactly the 8 item kinds", () => {
    expect(itemKindSchema.options).toHaveLength(8);
    expect(itemKindSchema.safeParse("skill").success).toBe(true);
    expect(itemKindSchema.safeParse("theme").success).toBe(false);
  });

  it("has exactly the 10 trust rules", () => {
    expect(TRUST_RULES).toHaveLength(10);
    expect(trustRuleSchema.options).toEqual([...TRUST_RULES]);
    expect(trustRuleSchema.safeParse("made-up").success).toBe(false);
  });

  it("parses RepoRef and requires sha", () => {
    const ok = { owner: "o", repo: "r", ref: "main", sha: "abc" };
    expect(repoRefSchema.parse(ok)).toEqual(ok);
    expect(repoRefSchema.safeParse({ owner: "o", repo: "r", ref: "main" }).success).toBe(false);
  });

  it("parses DiscoveredItem with optional fields", () => {
    const item = {
      id: "skill:a/SKILL.md",
      kind: "skill",
      name: "a",
      path: "a",
      files: [{ path: "a/SKILL.md", size: 1, blobSha: "x" }],
    };
    expect(discoveredItemSchema.safeParse(item).success).toBe(true);
    expect(discoveredItemSchema.safeParse({ ...item, convertsTo: "hook" }).success).toBe(false);
  });

  it("parses TrustFinding and rejects bad severity", () => {
    const f = { itemId: "i", severity: "danger", rule: "pipe-to-shell", message: "m" };
    expect(trustFindingSchema.safeParse(f).success).toBe(true);
    expect(trustFindingSchema.safeParse({ ...f, severity: "high" }).success).toBe(false);
  });

  it("parses InstallPlan", () => {
    const plan = {
      planHash: "h",
      target: { scope: "user" },
      fileWrites: [{ itemId: "i", targetPath: "/p", status: "new", bytes: 3 }],
      settingsChanges: [{ itemId: "i", pointer: "/env", after: { A: "1" } }],
      mcpChanges: [{ itemId: "i", name: "n", status: "conflict" }],
      marketplaceChanges: [{ itemId: "i", marketplace: "m", plugin: "p" }],
      findings: [],
      tokenEstimates: { i: 12 },
    };
    expect(installPlanSchema.safeParse(plan).success).toBe(true);
    expect(installPlanSchema.safeParse({ ...plan, planHash: undefined }).success).toBe(false);
  });

  it("parses ManifestEntry", () => {
    const entry = {
      id: "u",
      source: {
        kind: "skills.sh",
        owner: "o",
        repo: "r",
        sha: "s",
        path: "p",
        skillsShId: "o/r/p",
      },
      itemKind: "skill",
      itemName: "p",
      target: { scope: "project", projectDir: "/x" },
      installedAt: "2026-10-04T00:00:00Z",
      files: [{ path: "/a", sha256: "h" }],
      settingsEntries: [],
      mcpServers: [],
      sourceBlobShas: { a: "b" },
    };
    expect(manifestEntrySchema.safeParse(entry).success).toBe(true);
    expect(manifestEntrySchema.safeParse({ ...entry, itemKind: "nope" }).success).toBe(false);
  });

  it("parses a skills.sh response shaped like the recorded live fixture", () => {
    const parsed = skillsShSearchResponseSchema.parse({
      query: "react",
      count: 1,
      skills: [
        {
          id: "vercel-labs/agent-skills/vercel-react-best-practices",
          source: "vercel-labs/agent-skills",
          skillId: "vercel-react-best-practices",
          name: "vercel-react-best-practices",
          installs: 768842,
        },
      ],
    });
    expect(parsed.skills[0]?.installs).toBe(768842);
    expect(skillsShSearchResponseSchema.safeParse({ skills: [{ id: "x" }] }).success).toBe(false);
  });
});
