// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { InstallPlan } from "schema";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { diffRows, mcpResolutionKey, PlanPreview, unresolvedConflicts } from "./PlanPreview";

afterEach(cleanup);

const ROOT = "/home/u/.claude";
const NAMES = {
  "skill:a": "pdf skill",
  "hook:h": "PreToolUse hook",
  "setting:p": "permissions",
  "mcp:g": "github",
  "plugin:t": "toolkit",
};

const fullPlan = (overrides: Partial<InstallPlan> = {}): InstallPlan => ({
  planHash: "h",
  target: { scope: "user" },
  fileWrites: [
    { itemId: "skill:a", targetPath: `${ROOT}/skills/pdf/SKILL.md`, status: "new", bytes: 12 },
    { itemId: "hook:h", targetPath: `${ROOT}/hooks/repo-guard.sh`, status: "new", bytes: 40 },
  ],
  settingsChanges: [
    {
      itemId: "setting:p",
      pointer: "/permissions",
      before: { allow: ["Read"] },
      after: { allow: ["Read", "Bash(ls)"], deny: ["Bash(rm:*)"] },
    },
    {
      itemId: "hook:h",
      pointer: "/hooks/PreToolUse",
      after: [{ matcher: "Bash", hooks: [{ type: "command", command: "x" }] }],
    },
  ],
  mcpChanges: [{ itemId: "mcp:g", name: "github", status: "new" }],
  marketplaceChanges: [{ itemId: "plugin:t", marketplace: "acme-market", plugin: "toolkit" }],
  findings: [],
  tokenEstimates: {},
  ...overrides,
});

function renderPlan(plan: InstallPlan, resolutions = {}, onResolve = vi.fn()) {
  render(
    <PlanPreview plan={plan} itemNames={NAMES} resolutions={resolutions} onResolve={onResolve} />,
  );
  return onResolve;
}

describe("PlanPreview merge sections", () => {
  it("renders files, settings, mcp and marketplace sections, correctly grouped", () => {
    renderPlan(fullPlan());

    const files = screen.getByRole("region", { name: "New" });
    expect(within(files).getByText("skills/pdf/SKILL.md")).toBeTruthy();
    expect(within(files).getByText("hooks/repo-guard.sh")).toBeTruthy();

    const settings = screen.getByRole("region", { name: "Settings changes" });
    expect(within(settings).getByText("/permissions")).toBeTruthy();
    expect(within(settings).getByText("/hooks/PreToolUse")).toBeTruthy();
    expect(
      within(settings)
        .getByText(/Bash\(ls\)/)
        .closest("li")
        ?.getAttribute("data-marker"),
    ).toBe("+");
    expect(within(settings).queryByText("github")).toBeNull();

    const mcp = screen.getByRole("region", { name: "MCP servers" });
    expect(within(mcp).getAllByText("github")).toHaveLength(2);
    expect(within(mcp).getByText("New")).toBeTruthy();

    const marketplace = screen.getByRole("region", { name: "Marketplace" });
    expect(within(marketplace).getAllByText("acme-market").length).toBeGreaterThan(0);
    expect(within(marketplace).getByText("toolkit@acme-market")).toBeTruthy();
  });

  it("omits sections that have no changes", () => {
    renderPlan(fullPlan({ settingsChanges: [], mcpChanges: [], marketplaceChanges: [] }));
    expect(screen.queryByRole("region", { name: "Settings changes" })).toBeNull();
    expect(screen.queryByRole("region", { name: "MCP servers" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Marketplace" })).toBeNull();
  });

  it("says so when nothing would change", () => {
    renderPlan(
      fullPlan({ fileWrites: [], settingsChanges: [], mcpChanges: [], marketplaceChanges: [] }),
    );
    expect(screen.getByText("This selection changes nothing.")).toBeTruthy();
  });

  it("shows a settings-only plan without a files section", () => {
    renderPlan(fullPlan({ fileWrites: [], mcpChanges: [], marketplaceChanges: [] }));
    expect(screen.getByRole("region", { name: "Settings changes" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "New" })).toBeNull();
  });
});

describe("MCP name collision", () => {
  const collision = () =>
    fullPlan({ mcpChanges: [{ itemId: "mcp:g", name: "github", status: "conflict" }] });

  it("gates on a choice, offering skip and keep-both but not overwrite", () => {
    const plan = collision();
    expect(unresolvedConflicts(plan, {})).toEqual([mcpResolutionKey("github")]);
    expect(unresolvedConflicts(plan, { [mcpResolutionKey("github")]: "skip" })).toEqual([]);

    const onResolve = renderPlan(plan);
    expect(screen.getByText("Name already in use")).toBeTruthy();
    expect(screen.queryByLabelText(/Overwrite/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Keep both"));
    expect(onResolve).toHaveBeenCalledWith("mcp:github", "rename");
  });

  it("previews the alternate name once keep-both is chosen", () => {
    renderPlan(collision(), { "mcp:github": "rename" });
    expect(screen.getByText("→ github-2")).toBeTruthy();
  });

  it("counts file conflicts and server conflicts together", () => {
    const plan = fullPlan({
      fileWrites: [{ itemId: "skill:a", targetPath: `${ROOT}/s.md`, status: "conflict", bytes: 1 }],
      mcpChanges: [{ itemId: "mcp:g", name: "github", status: "conflict" }],
    });
    expect(unresolvedConflicts(plan, {})).toEqual([`${ROOT}/s.md`, "mcp:github"]);
    expect(unresolvedConflicts(plan, { [`${ROOT}/s.md`]: "skip" })).toEqual(["mcp:github"]);
  });
});

describe("diffRows", () => {
  it("marks new array entries added and existing ones unchanged", () => {
    expect(diffRows(["a"], ["a", "b"])).toEqual([
      { marker: " ", text: '"a"' },
      { marker: "+", text: '"b"' },
    ]);
  });

  it("marks object keys added, changed or unchanged", () => {
    expect(diffRows({ a: 1, b: 2, l: ["x"] }, { a: 1, b: 3, c: 4, l: ["x", "y"] })).toEqual([
      { marker: " ", text: "a: 1" },
      { marker: "~", text: "b: 2 → 3" },
      { marker: "+", text: "c: 4" },
      { marker: " ", text: 'l: "x"' },
      { marker: "+", text: 'l: "y"' },
    ]);
  });

  it("handles scalars and new values", () => {
    expect(diffRows(undefined, "opus")).toEqual([{ marker: "+", text: '"opus"' }]);
    expect(diffRows("a", "b")).toEqual([{ marker: "~", text: '"a" → "b"' }]);
    expect(diffRows(undefined, { k: true })).toEqual([{ marker: "+", text: "k: true" }]);
  });
});
