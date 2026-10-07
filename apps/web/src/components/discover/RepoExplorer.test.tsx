// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { RepoExplorer } from "./RepoExplorer";

const scanRepo = vi.fn();
const fetchPlan = vi.fn();
vi.mock("../../lib/discoverApi", () => ({
  scanRepo: (...args: unknown[]) => scanRepo(...args),
  fetchRepoFile: vi.fn(),
  fetchPlan: (...args: unknown[]) => fetchPlan(...args),
  applyPlan: vi.fn(),
}));
vi.mock("../../lib/scope", () => ({
  useWorkspace: () => ({ workspace: { kind: "user" }, projects: [] }),
}));

function skillItem(name: string) {
  return { id: `skill:skills/${name}`, kind: "skill", name, path: `skills/${name}`, files: [] };
}

function scan(overrides: { truncated?: boolean; rateLimit?: object; items?: object[] } = {}) {
  return {
    ok: true,
    repo: {
      owner: "anthropics",
      repo: "skills",
      ref: "main",
      sha: "0123456789abcdef",
      description: "Public skills",
      stars: 1234,
      defaultBranch: "main",
      htmlUrl: "https://github.com/anthropics/skills",
      truncated: overrides.truncated ?? false,
    },
    items: overrides.items ?? [],
    warnings: [],
    rateLimit: overrides.rateLimit ?? { authenticated: true },
  };
}

async function explore(value = "anthropics/skills") {
  fireEvent.change(screen.getByLabelText("GitHub repository"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Explore" }));
  await screen.findByText("Open on GitHub");
}

afterEach(() => {
  cleanup();
  scanRepo.mockReset();
  fetchPlan.mockReset();
  window.localStorage.clear();
});

describe("RepoExplorer", () => {
  it("scans the submitted input and renders the header strip", async () => {
    scanRepo.mockResolvedValue(scan());
    render(<RepoExplorer />);
    await explore();
    expect(scanRepo).toHaveBeenCalledWith("anthropics/skills");
    expect(screen.getByRole("heading", { name: "anthropics/skills" })).toBeTruthy();
    expect(screen.getByText("Public skills")).toBeTruthy();
    expect(screen.getByText("0123456")).toBeTruthy();
    expect(screen.getByText(/1,234/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open on GitHub" }).getAttribute("href")).toBe(
      "https://github.com/anthropics/skills",
    );
  });

  it("shows a scanning status skeleton while the repo loads", async () => {
    let finish: (value: unknown) => void = () => {};
    scanRepo.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<RepoExplorer />);
    fireEvent.change(screen.getByLabelText("GitHub repository"), {
      target: { value: "anthropics/skills" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect((await screen.findByRole("status")).textContent).toContain("Scanning repository…");
    finish(scan());
    await screen.findByText("Open on GitHub");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows branch and subpath pills and a merged per-kind summary", async () => {
    const copy = (root: string) => ({
      id: `skill:${root}/skills/animate`,
      kind: "skill",
      name: "animate",
      path: `${root}/skills/animate`,
      files: [],
    });
    const result = scan({
      items: [copy(".claude"), copy(".agents"), copy(".codex"), skillItem("pdf")],
    });
    result.repo = { ...result.repo, subpath: "plugins/x" } as typeof result.repo;
    scanRepo.mockResolvedValue(result);
    render(<RepoExplorer />);
    await explore();
    expect(screen.getByText("plugins/x")).toBeTruthy();
    expect(screen.getByText("2 skills")).toBeTruthy();
    expect(screen.getByText("(2 duplicate copies merged)")).toBeTruthy();
  });

  it("shows the rate-limit hint only when unauthenticated and remaining < 10", async () => {
    scanRepo.mockResolvedValue(scan({ rateLimit: { authenticated: false, remaining: 3 } }));
    render(<RepoExplorer />);
    await explore();
    expect(screen.getByRole("status").textContent).toContain("3 unauthenticated");
    cleanup();

    scanRepo.mockResolvedValue(scan({ rateLimit: { authenticated: false, remaining: 10 } }));
    render(<RepoExplorer />);
    await explore();
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();

    scanRepo.mockResolvedValue(scan({ rateLimit: { authenticated: true, remaining: 2 } }));
    render(<RepoExplorer />);
    await explore();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the truncated-tree banner", async () => {
    scanRepo.mockResolvedValue(scan({ truncated: true }));
    render(<RepoExplorer />);
    await explore();
    expect(screen.getByRole("alert").textContent).toContain("/tree/<ref>/<subpath>");
  });

  it("shows the empty-scan message", async () => {
    scanRepo.mockResolvedValue(scan());
    render(<RepoExplorer />);
    await explore();
    expect(screen.getByText("No Claude Code items found in this repo")).toBeTruthy();
  });

  it("shows typed errors and does not record them as recent", async () => {
    scanRepo.mockResolvedValue({ ok: false, code: "REPO_NOT_FOUND", message: "Repo not found" });
    render(<RepoExplorer />);
    fireEvent.change(screen.getByLabelText("GitHub repository"), { target: { value: "x/y" } });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Repo not found");
    expect(window.localStorage.getItem("claude-desk-discover-recent-repos")).toBeNull();
  });

  it("clears the previous scan when a later scan fails", async () => {
    scanRepo.mockResolvedValueOnce(scan({ items: [skillItem("pdf")] }));
    render(<RepoExplorer />);
    await explore();
    expect(screen.getByText("pdf")).toBeTruthy();

    scanRepo.mockResolvedValueOnce({
      ok: false,
      code: "GITHUB_UNREACHABLE",
      message: "Can't reach GitHub",
    });
    fireEvent.change(screen.getByLabelText("GitHub repository"), { target: { value: "x/y" } });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Can't reach GitHub");
    expect(screen.queryByText("pdf")).toBeNull();
    expect(screen.queryByText("Open on GitHub")).toBeNull();
  });

  it("records recent repos (max 8, deduped) and rescans from a chip", async () => {
    scanRepo.mockResolvedValue(scan());
    render(<RepoExplorer />);
    await explore();
    expect(JSON.parse(window.localStorage.getItem("claude-desk-discover-recent-repos")!)).toEqual([
      "anthropics/skills",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "anthropics/skills" }));
    expect(scanRepo).toHaveBeenCalledTimes(2);
  });

  it("opens the install dialog for the selected items from the selection dock", async () => {
    scanRepo.mockResolvedValue(
      scan({ items: [skillItem("pdf"), skillItem("docx"), skillItem("xlsx")] }),
    );
    fetchPlan.mockResolvedValue({ ok: false, code: "BAD_INPUT", message: "stop here" });
    render(
      <MemoryRouter>
        <RepoExplorer />
      </MemoryRouter>,
    );
    await explore();
    expect(screen.queryByTestId("selection-dock")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select pdf" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select docx" }));
    expect(screen.getByTestId("selection-dock").textContent).toContain("Skills 2");
    fireEvent.click(screen.getByRole("button", { name: "Install 2" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Install 2 items from anthropics/skills");
    const listed = screen.getByRole("list", { name: "Items to install" });
    expect(listed.textContent).toContain("pdf");
    expect(listed.textContent).toContain("docx");
    expect(listed.textContent).not.toContain("xlsx");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("stop here");
    expect(fetchPlan).toHaveBeenCalledWith({
      repo: expect.objectContaining({
        owner: "anthropics",
        repo: "skills",
        sha: "0123456789abcdef",
      }),
      itemIds: ["skill:skills/pdf", "skill:skills/docx"],
      target: { scope: "user" },
    });
  });

  it("shows a clear error on total network failure and leaves other routes working", async () => {
    scanRepo.mockResolvedValue({ ok: false, code: "NETWORK", message: "offline" });
    render(
      <MemoryRouter initialEntries={["/discover"]}>
        <Link to="/backups">Backups</Link>
        <Routes>
          <Route path="/discover" element={<RepoExplorer />} />
          <Route path="/backups" element={<p>Backups page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("GitHub repository"), {
      target: { value: "anthropics/skills" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect(await screen.findByText("offline")).toBeTruthy();
    expect(screen.queryByText("Open on GitHub")).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Backups" }));
    expect(screen.getByText("Backups page")).toBeTruthy();
  });
});
