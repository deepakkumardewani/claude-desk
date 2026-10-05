import { describe, it, expect } from "vite-plus/test";
import { parseRepoInput } from "./repoInput.js";

const value = (input: string) => {
  const r = parseRepoInput(input);
  if (!r.ok) throw new Error(`expected ok for ${input}: ${r.error.message}`);
  return r.value;
};

describe("parseRepoInput", () => {
  it("parses a full https URL", () => {
    expect(value("https://github.com/anthropics/skills")).toEqual({
      owner: "anthropics",
      repo: "skills",
    });
  });

  it("parses owner/repo shorthand and tolerates whitespace and trailing slash", () => {
    expect(value("  anthropics/skills/ ")).toEqual({ owner: "anthropics", repo: "skills" });
  });

  it("parses scheme-less github.com URLs", () => {
    expect(value("github.com/o/r")).toEqual({ owner: "o", repo: "r" });
  });

  it("strips trailing .git (URL and shorthand)", () => {
    expect(value("https://github.com/o/r.git")).toEqual({ owner: "o", repo: "r" });
    expect(value("o/r.git")).toEqual({ owner: "o", repo: "r" });
  });

  it("keeps dots in repo names", () => {
    expect(value("o/my.repo")).toEqual({ owner: "o", repo: "my.repo" });
  });

  it("parses tree links with nested subpath", () => {
    expect(value("https://github.com/o/r/tree/main/a/b/c")).toEqual({
      owner: "o",
      repo: "r",
      ref: "main",
      subpath: "a/b/c",
    });
  });

  it("parses tree links without subpath", () => {
    expect(value("https://github.com/o/r/tree/v1.2.0")).toEqual({
      owner: "o",
      repo: "r",
      ref: "v1.2.0",
    });
  });

  it("parses blob links to a nested file, ignoring query/hash", () => {
    expect(value("https://github.com/o/r/blob/dev/.claude/settings.json?plain=1#L3")).toEqual({
      owner: "o",
      repo: "r",
      ref: "dev",
      subpath: ".claude/settings.json",
    });
  });

  it("decodes percent-encoded path segments", () => {
    expect(value("https://github.com/o/r/tree/main/my%20dir").subpath).toBe("my dir");
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["non-GitHub URL", "https://gitlab.com/o/r"],
    ["missing repo (shorthand)", "owner"],
    ["missing repo (URL)", "https://github.com/owner"],
    ["tree without ref", "https://github.com/o/r/tree"],
    ["unsupported path", "https://github.com/o/r/issues/1"],
    ["invalid characters", "o/r r"],
    ["dot-dot repo", "o/.."],
    ["bad percent encoding", "https://github.com/o/r/tree/main/%E0%A4%A"],
    ["bad URL", "https://"],
  ])("returns BAD_INPUT for %s without throwing", (_name, input) => {
    const r = parseRepoInput(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_INPUT");
  });

  it("handles non-string input defensively", () => {
    expect(parseRepoInput(undefined as unknown as string).ok).toBe(false);
  });
});
