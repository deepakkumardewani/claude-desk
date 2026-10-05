import type { DiscoveredItem } from "schema";
import { describe, expect, it } from "vite-plus/test";
import { convertedPreview } from "./convertPreview";

const item = (name: string, convertsTo: "skill" | "command" | "agent"): DiscoveredItem => ({
  id: name,
  kind: "convertible",
  name,
  path: name,
  files: [],
  convertsTo,
});

describe("convertedPreview", () => {
  it("builds skill frontmatter with Applies to and the verbatim body", () => {
    const out = convertedPreview(
      item("style", "skill"),
      "---\ndescription: S\nglobs: a/**\n---\nUse tabs.",
      "r",
    );
    expect(out).toContain("name: style");
    expect(out).toContain("description: S Applies to: a/**");
    expect(out.endsWith("Use tabs.")).toBe(true);
  });

  it("uses the repo fallback for bare rule files", () => {
    expect(convertedPreview(item("cursorrules", "skill"), "Be concise.", "acme")).toContain(
      "Project rules from acme",
    );
  });

  it("replaces input placeholders in commands", () => {
    expect(convertedPreview(item("r", "command"), "Do ${input:x} and ${input:y}", "r")).toBe(
      "Do $ARGUMENTS and $ARGUMENTS",
    );
  });

  it("drops tools for agents", () => {
    const out = convertedPreview(
      item("p", "agent"),
      "---\ndescription: P\ntools: ['a']\n---\nbody",
      "r",
    );
    expect(out).not.toContain("tools");
    expect(out).toContain("description: P");
  });
});
