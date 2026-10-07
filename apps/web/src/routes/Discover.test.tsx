// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../lib/theme";
import { ScopeProvider } from "../lib/scope";
import { Layout } from "./Layout";
import { Discover } from "./Discover";

const scanRepo = vi.fn();
const listInstalls = vi.fn();
vi.mock("../lib/discoverApi", () => ({
  scanRepo: (...args: unknown[]) => scanRepo(...args),
  listInstalls: (...args: unknown[]) => listInstalls(...args),
}));

// Discover reads the active workspace; the Layout test below needs the real provider instead.
let useFakeWorkspace = true;
vi.mock("../lib/scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/scope")>();
  return {
    ...actual,
    useWorkspace: () =>
      useFakeWorkspace ? { workspace: { kind: "user" }, projects: [] } : actual.useWorkspace(),
  };
});

const SCAN = {
  ok: true,
  repo: {
    owner: "o",
    repo: "r",
    ref: "main",
    sha: "abcdef1234",
    description: null,
    stars: 1,
    defaultBranch: "main",
    htmlUrl: "https://github.com/o/r",
    truncated: false,
  },
  items: [{ id: "skill:skills/pdf", kind: "skill", name: "pdf", path: "skills/pdf", files: [] }],
  warnings: [],
  rateLimit: { authenticated: true },
};

const INSTALLED = {
  id: "e1",
  source: { kind: "github", owner: "o", repo: "r", sha: "c", path: "skills/pdf" },
  itemKind: "skill",
  itemName: "pdf",
  target: { scope: "user" },
  installedAt: "2026-01-01T00:00:00.000Z",
  files: [],
  settingsEntries: [],
  mcpServers: [],
  sourceBlobShas: {},
  status: "up-to-date",
};

afterEach(() => {
  cleanup();
  useFakeWorkspace = true;
  scanRepo.mockReset();
  listInstalls.mockReset();
  window.localStorage.clear();
});

describe("Discover", () => {
  beforeEach(() => {
    listInstalls.mockResolvedValue({ ok: true, entries: [] });
  });

  it("renders the three tabs with the GitHub tab selected", () => {
    render(<Discover />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "skills.sh",
      "GitHub repo",
      "Installed",
    ]);
    expect(screen.getByRole("tab", { name: "GitHub repo" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("keeps the GitHub tab's scan when switching away and back", async () => {
    scanRepo.mockResolvedValue({
      ok: true,
      repo: {
        owner: "o",
        repo: "r",
        ref: "main",
        sha: "abcdef1234",
        description: null,
        stars: 1,
        defaultBranch: "main",
        htmlUrl: "https://github.com/o/r",
        truncated: false,
      },
      items: [],
      warnings: [],
      rateLimit: { authenticated: true },
    });
    render(<Discover />);
    fireEvent.change(screen.getByLabelText("GitHub repository"), { target: { value: "o/r" } });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    await screen.findByRole("heading", { name: "o/r" });

    fireEvent.click(screen.getByRole("tab", { name: "Installed" }));
    expect(screen.getByText(/Nothing installed yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "GitHub repo" }));
    expect(screen.getByRole("heading", { name: "o/r" })).toBeTruthy();
    expect(scanRepo).toHaveBeenCalledTimes(1);
  });

  it("marks cards Installed, and an Installed-tab update check flips them to Update available", async () => {
    scanRepo.mockResolvedValue(SCAN);
    listInstalls.mockImplementation(async (options?: { check?: boolean }) => ({
      ok: true,
      entries: [{ ...INSTALLED, status: options?.check ? "update-available" : "up-to-date" }],
    }));
    render(<Discover />);
    fireEvent.change(screen.getByLabelText("GitHub repository"), { target: { value: "o/r" } });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    const card = await screen.findByTestId("item-row");
    await waitFor(() =>
      expect(within(card).getByTestId("installed-badge").textContent).toBe("Installed"),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Installed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    await waitFor(() =>
      expect(within(card).getByTestId("installed-badge").textContent).toBe("Update available"),
    );
    expect(listInstalls).toHaveBeenLastCalledWith({ check: true });
  });

  it("shows Discover in the primary nav pointing at /discover", () => {
    useFakeWorkspace = false;
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/discover"]}>
          <ScopeProvider>
            <Layout />
          </ScopeProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(html).toMatch(/<a[^>]*href="\/discover"[^>]*>Discover<\/a>/);
  });
});
