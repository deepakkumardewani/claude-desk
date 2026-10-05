import { describe, expect, it } from "vite-plus/test";
import type { DiscoveredItem } from "schema";
import { convertItem } from "./convert.js";
import { parseFrontmatter } from "./detect.js";

const item = (
  path: string,
  name: string,
  convertsTo: "skill" | "command" | "agent",
): DiscoveredItem => ({
  id: `convertible:${path}`,
  kind: "convertible",
  name,
  path,
  files: [],
  convertsTo,
});

describe("convertItem: rules -> skill", () => {
  it("keeps description, appends globs as 'Applies to', keeps body verbatim", () => {
    const body = "Use tabs.\n\n- keep `code` intact\n";
    const out = convertItem(
      item(".cursor/rules/Style.mdc", "Style", "skill"),
      `---\ndescription: Code style\nglobs: src/**/*.ts\n---\n${body}`,
    );
    expect(out.relativePath).toBe("style/SKILL.md");
    const meta = parseFrontmatter(out.content);
    expect(meta.name).toBe("style");
    expect(meta.description).toBe("Code style Applies to: src/**/*.ts");
    expect(out.content.endsWith(body)).toBe(true);
  });

  it("appends applyTo for copilot instructions", () => {
    const out = convertItem(
      item(".github/instructions/api.instructions.md", "api", "skill"),
      "---\napplyTo: api/**\n---\nValidate input.",
    );
    expect(out.content).toContain("Applies to: api/**");
  });

  it("falls back to the first sentence of a structured file's body", () => {
    const out = convertItem(
      item(".cursor/rules/a.mdc", "a", "skill"),
      "---\nglobs: x\n---\n# Title\nPrefer small functions. Always.\n",
    );
    expect(parseFrontmatter(out.content).description).toContain("Prefer small functions.");
  });

  it("falls back to 'Project rules from <repo>' for a .cursorrules file without description", () => {
    const out = convertItem(item(".cursorrules", "cursorrules", "skill"), "Always be concise.", {
      repo: "acme",
    });
    expect(parseFrontmatter(out.content).description).toBe("Project rules from acme");
    expect(out.content.endsWith("Always be concise.")).toBe(true);
    expect(out.findings).toEqual([]);
  });
});

describe("convertItem: prompt -> command", () => {
  it("keeps description and replaces every ${input:x} with $ARGUMENTS", () => {
    const out = convertItem(
      item(".github/prompts/review.prompt.md", "review", "command"),
      "---\ndescription: Review code\n---\nReview ${input:file} for ${input:focus:bugs}. Again ${input:file}.",
    );
    expect(out.relativePath).toBe("review.md");
    expect(out.content).toContain("Review $ARGUMENTS for $ARGUMENTS. Again $ARGUMENTS.");
    expect(out.content).not.toContain("${input");
    expect(parseFrontmatter(out.content).description).toBe("Review code");
  });

  it("omits frontmatter when the source has no description", () => {
    const out = convertItem(item("p.prompt.md", "p", "command"), "Do ${input:x}");
    expect(out.content).toBe("Do $ARGUMENTS");
  });
});

describe("convertItem: chatmode/agent -> agent", () => {
  it("drops tools with an info trust finding, never silently", () => {
    const it_ = item(".github/chatmodes/Planner.chatmode.md", "Planner", "agent");
    const out = convertItem(it_, "---\ndescription: Plan\ntools: ['codebase']\n---\nPlan first.");
    expect(out.relativePath).toBe("planner.md");
    const meta = parseFrontmatter(out.content);
    expect(meta).toEqual({ name: "planner", description: "Plan" });
    expect(out.content).not.toContain("tools");
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      itemId: it_.id,
      severity: "info",
      rule: "allowed-tools",
    });
    expect(out.findings[0].message).toMatch(/dropped/);
  });

  it("emits no finding when the source declared no tools", () => {
    const out = convertItem(item("a.agent.md", "a", "agent"), "---\ndescription: A\n---\nbody");
    expect(out.findings).toEqual([]);
  });
});

describe("convertItem: guards", () => {
  it("rejects non-convertible items and unusable names", () => {
    expect(() => convertItem({ ...item("x", "x", "skill"), kind: "skill" }, "")).toThrow();
    expect(() => convertItem(item("x", "!!!", "skill"), "")).toThrow(/installable/);
  });
});
