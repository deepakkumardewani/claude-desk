import { expect, test } from "vite-plus/test";
import type { ClaudeSettings } from "schema";
import type { TreeCategory } from "./api";
import {
  browseCategoryFiles,
  categoryItemCount,
  describeWorkspace,
  flattenFiles,
  isDirectCategory,
  isSkillEntrypoint,
  pluginEntriesFromSettings,
  searchFiles,
  splitPathLabel,
  deriveFileLabel,
  deriveTitleFromFilename,
} from "./workspace";

test("deriveFileLabel strips SKILL.md suffix", () => {
  expect(deriveFileLabel("colorize/SKILL.md")).toBe("colorize");
});

test("deriveFileLabel strips .md extension", () => {
  expect(deriveFileLabel("build-phases.md")).toBe("build-phases");
});

test("deriveFileLabel strips .json extension", () => {
  expect(deriveFileLabel("settings.json")).toBe("settings");
});

test("deriveFileLabel uses basename for nested paths", () => {
  expect(deriveFileLabel("some/nested/file.md")).toBe("file");
});

test("deriveTitleFromFilename title-cases dash-separated words", () => {
  expect(deriveTitleFromFilename("build-phases.md")).toBe("Build Phases");
});

test("deriveTitleFromFilename title-cases underscore-separated words", () => {
  expect(deriveTitleFromFilename("my_agent.md")).toBe("My Agent");
});

test("deriveTitleFromFilename handles single word", () => {
  expect(deriveTitleFromFilename("colorize.md")).toBe("Colorize");
});

test("deriveTitleFromFilename handles skill path SKILL.md", () => {
  expect(deriveTitleFromFilename("colorize/SKILL.md")).toBe("Colorize");
});

test("deriveTitleFromFilename handles nested agent path", () => {
  expect(deriveTitleFromFilename("agents/my-custom-agent.md")).toBe("My Custom Agent");
});

const cat = (category: TreeCategory["category"], label: string, names: string[]): TreeCategory => ({
  category,
  label,
  files: names.map((name) => ({ name })),
});
const settings = (enabledPlugins?: Record<string, boolean>) =>
  ({ enabledPlugins }) as unknown as ClaudeSettings;

test("isDirectCategory is true only for settings and claudeMd", () => {
  expect(isDirectCategory("settings")).toBe(true);
  expect(isDirectCategory("claudeMd")).toBe(true);
  expect(isDirectCategory("skills")).toBe(false);
});

test("isSkillEntrypoint matches bare and nested SKILL.md only", () => {
  expect(isSkillEntrypoint("SKILL.md")).toBe(true);
  expect(isSkillEntrypoint("a/SKILL.md")).toBe(true);
  expect(isSkillEntrypoint("a/reference.md")).toBe(false);
});

test("categoryItemCount counts plugins from settings, skills by entrypoint, others by file", () => {
  expect(categoryItemCount(cat("plugins", "Plugins", ["x"]), settings({ a: true, b: false }))).toBe(
    2,
  );
  expect(categoryItemCount(cat("plugins", "Plugins", []))).toBe(0);
  expect(categoryItemCount(cat("plugins", "Plugins", []), settings())).toBe(0);
  expect(categoryItemCount(cat("skills", "Skills", ["a/SKILL.md", "a/ref.md", "b/SKILL.md"]))).toBe(
    2,
  );
  expect(categoryItemCount(cat("commands", "Commands", ["x.md", "y.md"]))).toBe(2);
});

test("describeWorkspace handles none, one, two and many authored categories", () => {
  expect(describeWorkspace([])).toBe("Your skills, commands and plans");
  expect(describeWorkspace([cat("skills", "Skills", [])])).toBe("Your skills, commands and plans");
  expect(describeWorkspace([cat("skills", "Skills", ["a/SKILL.md"])])).toBe("1 skills");
  expect(
    describeWorkspace([cat("skills", "Skills", ["a/SKILL.md"]), cat("plans", "Plans", ["p.md"])]),
  ).toBe("1 skills and 1 plans");
  expect(
    describeWorkspace([
      cat("skills", "Skills", ["a/SKILL.md"]),
      cat("commands", "Commands", ["c.md"]),
      cat("plans", "Plans", ["p.md"]),
    ]),
  ).toBe("1 skills, 1 commands and 1 plans");
});

test("pluginEntriesFromSettings sorts and derives detail for each key shape", () => {
  const rows = pluginEntriesFromSettings(
    settings({ "zed@mkt": true, "alpha@mkt": false, bare: true, off: false }),
  );
  expect(rows.map((r) => r.label)).toEqual(["alpha", "bare", "off", "zed"]);
  expect(rows.map((r) => r.detail)).toEqual(["mkt · off", "", "off", "mkt"]);
  expect(rows[0].href).toBe("/settings");
  expect(pluginEntriesFromSettings(settings())).toEqual([]);
});

test("flattenFiles and searchFiles label, scope and match case-insensitively", () => {
  const files = flattenFiles([
    cat("skills", "Skills", ["colorize/SKILL.md", "colorize/ref.md"]),
    cat("commands", "Commands", ["deploy.md"]),
  ]);
  expect(files).toHaveLength(3);
  expect(files[0]).toMatchObject({
    label: "colorize",
    categoryLabel: "Skills",
    detail: "colorize/SKILL.md",
  });
  expect(files[0].href.startsWith("/")).toBe(true);

  expect(searchFiles(files, "  ", null)).toHaveLength(3);
  expect(searchFiles(files, "", "commands").map((f) => f.label)).toEqual(["deploy"]);
  expect(searchFiles(files, "DEPLOY", null)).toHaveLength(1);
  expect(searchFiles(files, "ref.md", null)).toHaveLength(1);
  expect(searchFiles(files, "command", null)).toHaveLength(1);
  expect(searchFiles(files, "nomatch", null)).toEqual([]);
});

test("browseCategoryFiles uses settings for plugins and entrypoints for skills", () => {
  const files = flattenFiles([
    cat("skills", "Skills", ["a/SKILL.md", "a/ref.md"]),
    cat("commands", "Commands", ["c.md"]),
  ]);
  expect(browseCategoryFiles(files, "plugins", settings({ p: true })).map((f) => f.label)).toEqual([
    "p",
  ]);
  expect(browseCategoryFiles(files, "skills", settings()).map((f) => f.name)).toEqual([
    "a/SKILL.md",
  ]);
  expect(browseCategoryFiles(files, "commands", settings()).map((f) => f.name)).toEqual(["c.md"]);
});

test("splitPathLabel separates dim prefix from leaf", () => {
  expect(splitPathLabel("leaf")).toEqual({ prefix: "", leaf: "leaf" });
  expect(splitPathLabel("a/b/leaf")).toEqual({ prefix: "a/b/", leaf: "leaf" });
});
