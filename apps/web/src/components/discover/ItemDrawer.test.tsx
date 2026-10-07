// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiscoveredItem } from "schema";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ThemeProvider } from "../../lib/theme";
import { ItemDrawer } from "./ItemDrawer";

const fetchRepoFile = vi.fn();
vi.mock("../../lib/discoverApi", () => ({
  fetchRepoFile: (...args: unknown[]) => fetchRepoFile(...args),
}));
// Keep the plain <pre><code> fallback so assertions see the verbatim text.
vi.mock("../../lib/markdown", () => ({
  highlightCode: () => Promise.resolve(""),
  shikiThemeFor: () => "github-light",
}));

const repo = { owner: "o", repo: "r", sha: "deadbeef" };
const file = (path: string) => ({ path, size: 1, blobSha: "x" });

function open(item: DiscoveredItem, onClose = vi.fn()) {
  return render(
    <ThemeProvider>
      <ItemDrawer item={item} repo={repo} onClose={onClose} />
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  fetchRepoFile.mockReset();
});

describe("ItemDrawer", () => {
  it("shows an accessible skeleton while the file loads", async () => {
    fetchRepoFile.mockReturnValue(new Promise(() => {}));
    open({
      id: "skills/pdf",
      kind: "skill",
      name: "pdf",
      path: "skills/pdf",
      files: [file("skills/pdf/SKILL.md")],
    });
    const status = await screen.findByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("Loading…");
  });

  it("renders a skill's SKILL.md as markdown with frontmatter header, fetching lazily by path", async () => {
    fetchRepoFile.mockResolvedValue({
      ok: true,
      size: 10,
      content: "---\nname: pdf\ndescription: Handle PDFs\n---\n\n# Heading\n\n- one\n- two\n",
    });
    open({
      id: "skills/pdf",
      kind: "skill",
      name: "pdf",
      path: "skills/pdf",
      files: [file("skills/pdf/helper.py"), file("skills/pdf/SKILL.md")],
    });
    expect(await screen.findByRole("heading", { name: "Heading" })).toBeTruthy();
    expect(screen.getByText("Handle PDFs")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/^---/)).toBeNull();
    expect(fetchRepoFile).toHaveBeenCalledTimes(1);
    expect(fetchRepoFile).toHaveBeenCalledWith({
      ...repo,
      path: "skills/pdf/SKILL.md",
    });
  });

  it("does not fetch anything until a drawer is mounted", () => {
    expect(fetchRepoFile).not.toHaveBeenCalled();
  });

  it("shows the hook command verbatim and lists referenced scripts", async () => {
    fetchRepoFile.mockResolvedValue({ ok: true, size: 5, content: "echo script-body" });
    const command = 'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/fmt.sh --flag "a && b" `x`';
    open({
      id: "s#hooks.PostToolUse[0]",
      kind: "hook",
      name: "PostToolUse (Edit)",
      path: ".claude/settings.json",
      files: [file(".claude/hooks/fmt.sh")],
      payload: {
        event: "PostToolUse",
        matcher: "Edit",
        hooks: [{ type: "command", command }],
        missingScripts: [],
      },
    });
    expect(screen.getByText("PostToolUse")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText(command)).toBeTruthy();
    expect(screen.getByText(".claude/hooks/fmt.sh")).toBeTruthy();
    expect(await screen.findByText("echo script-body")).toBeTruthy();
    expect(fetchRepoFile).toHaveBeenCalledWith({ ...repo, path: ".claude/hooks/fmt.sh" });
  });

  it("shows MCP transport, command and env keys without values", () => {
    open({
      id: ".mcp.json#fs",
      kind: "mcp",
      name: "fs",
      path: ".mcp.json",
      files: [],
      payload: { command: "npx", args: ["-y", "pkg"], env: { API_KEY: "secret-value" } },
    });
    expect(screen.getByText("stdio")).toBeTruthy();
    expect(screen.getByText("npx -y pkg")).toBeTruthy();
    expect(screen.getByText("API_KEY")).toBeTruthy();
    expect(screen.queryByText(/secret-value/)).toBeNull();
    expect(fetchRepoFile).not.toHaveBeenCalled();
  });

  it("shows a setting's JSON and a plugin's child list without fetching", () => {
    const { unmount } = open({
      id: "s#model",
      kind: "setting",
      name: "model",
      path: ".claude/settings.json",
      files: [],
      payload: { key: "model", value: "opus" },
    });
    expect(screen.getByText(/"model": "opus"/)).toBeTruthy();
    unmount();

    open({
      id: "p",
      kind: "plugin",
      name: "bundle",
      path: ".claude-plugin/plugin.json",
      files: [],
      payload: {
        plugin: "bundle",
        marketplace: "mk",
        children: [{ id: "c", kind: "skill", name: "kid", path: "c", files: [] }],
      },
    });
    expect(screen.getByText("mk")).toBeTruthy();
    expect(screen.getByText("kid")).toBeTruthy();
    expect(fetchRepoFile).not.toHaveBeenCalled();
  });

  it("surfaces fetch errors and closes on Escape", async () => {
    fetchRepoFile.mockResolvedValue({ ok: false, code: "NOT_TEXT", message: "binary" });
    const onClose = vi.fn();
    open(
      { id: "a", kind: "agent", name: "a", path: "agents/a.md", files: [file("agents/a.md")] },
      onClose,
    );
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("binary"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles a convertible between Original and Converted preview from one fetch", async () => {
    fetchRepoFile.mockResolvedValue({
      ok: true,
      size: 10,
      content: "---\ndescription: Style rules\nglobs: src/**\n---\nUse tabs.",
    });
    open({
      id: "convertible:.cursor/rules/style.mdc",
      kind: "convertible",
      name: "style",
      path: ".cursor/rules/style.mdc",
      files: [file(".cursor/rules/style.mdc")],
      convertsTo: "skill",
    });
    expect(await screen.findByText("Style rules")).toBeTruthy();
    expect(screen.queryByText(/Applies to/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Converted preview" }));
    expect(
      screen.getByRole("button", { name: "Converted preview" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(await screen.findByText(/Applies to: src\/\*\*/)).toBeTruthy();
    expect(screen.getByText("Use tabs.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.queryByText(/Applies to/)).toBeNull();
    expect(fetchRepoFile).toHaveBeenCalledTimes(1);
  });

  it("shows no toggle for non-convertible items", async () => {
    fetchRepoFile.mockResolvedValue({ ok: true, size: 1, content: "# Hi" });
    open({ id: "a", kind: "agent", name: "a", path: "a.md", files: [file("a.md")] });
    await screen.findByRole("heading", { name: "Hi" });
    expect(screen.queryByRole("button", { name: "Converted preview" })).toBeNull();
  });
});
