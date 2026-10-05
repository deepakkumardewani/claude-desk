// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { InstalledEntry, InstallStatus } from "schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { InstallsProvider } from "../../lib/installs";
import { InstalledTable, STATUS_META } from "./InstalledTable";

const listInstalls = vi.fn();
const uninstall = vi.fn();
const fetchPlan = vi.fn();
const applyPlan = vi.fn();
vi.mock("../../lib/discoverApi", () => ({
  listInstalls: (...args: unknown[]) => listInstalls(...args),
  uninstall: (...args: unknown[]) => uninstall(...args),
  fetchPlan: (...args: unknown[]) => fetchPlan(...args),
  applyPlan: (...args: unknown[]) => applyPlan(...args),
}));
vi.mock("../../lib/scope", () => ({
  useWorkspace: () => ({ workspace: { kind: "user" }, projects: [] }),
}));

function entry(overrides: Partial<InstalledEntry> = {}): InstalledEntry {
  return {
    id: "e1",
    source: { kind: "github", owner: "acme", repo: "kit", sha: "c1", path: "skills/pdf" },
    itemKind: "skill",
    itemName: "pdf",
    target: { scope: "user" },
    installedAt: "2026-01-02T12:00:00.000Z",
    files: [{ path: "/home/u/.claude/skills/pdf/SKILL.md", sha256: "h" }],
    settingsEntries: [{ pointer: "/permissions/allow", value: ["Read"] }],
    mcpServers: ["docs"],
    sourceBlobShas: {},
    status: "up-to-date",
    ...overrides,
  };
}

function renderTable(entries: InstalledEntry[]) {
  listInstalls.mockResolvedValue({ ok: true, entries });
  render(
    <MemoryRouter>
      <InstallsProvider target={{ scope: "user" }}>
        <InstalledTable />
      </InstallsProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchPlan.mockResolvedValue({
    ok: true,
    plan: {
      planHash: "h",
      target: { scope: "user" },
      fileWrites: [
        {
          itemId: "skill:skills/pdf",
          targetPath: "/home/u/.claude/skills/pdf/SKILL.md",
          status: "overwrite",
          bytes: 4,
        },
      ],
      fileRemovals: [
        { itemId: "skill:skills/pdf", targetPath: "/home/u/.claude/skills/pdf/old.md" },
      ],
      settingsChanges: [],
      mcpChanges: [],
      marketplaceChanges: [],
      findings: [],
      tokenEstimates: {},
    },
  });
});

afterEach(() => {
  cleanup();
  for (const fn of [listInstalls, uninstall, fetchPlan, applyPlan]) fn.mockReset();
});

describe("InstalledTable", () => {
  it("lists item, kind, scope, source, installed date and status", async () => {
    renderTable([
      entry(),
      entry({ id: "e2", itemName: "ci", target: { scope: "project", projectDir: "/work/app" } }),
    ]);
    const rows = await screen.findAllByTestId("installed-row");
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getByText("pdf")).toBeTruthy();
    expect(first.getByText("skill")).toBeTruthy();
    expect(first.getByText("User")).toBeTruthy();
    expect(first.getByText("acme/kit")).toBeTruthy();
    expect(first.getByText(new Date("2026-01-02T12:00:00.000Z").toLocaleDateString())).toBeTruthy();
    expect(first.getByText("Up to date")).toBeTruthy();
    expect(within(rows[1]).getByText("Project: app")).toBeTruthy();
  });

  it("renders all five statuses as distinct badges", async () => {
    const statuses = Object.keys(STATUS_META) as InstallStatus[];
    renderTable(statuses.map((status, i) => entry({ id: `e${i}`, itemName: `n${i}`, status })));
    await screen.findAllByTestId("installed-row");
    const labels = statuses.map((status) => STATUS_META[status].label);
    expect(new Set(labels).size).toBe(5);
    for (const status of statuses) {
      const badge = document.querySelector(`[data-status="${status}"]`);
      expect(badge?.textContent).toBe(STATUS_META[status].label);
    }
    const classes = statuses.map((s) => STATUS_META[s].className);
    expect(new Set(classes).size).toBe(5);
  });

  it("shows an empty state", async () => {
    renderTable([]);
    expect(await screen.findByText(/Nothing installed yet/)).toBeTruthy();
  });

  it("Check for updates asks the API to compare with GitHub and shows the result", async () => {
    renderTable([entry()]);
    await screen.findAllByTestId("installed-row");
    listInstalls.mockResolvedValue({ ok: true, entries: [entry({ status: "update-available" })] });
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Update available")).toBeTruthy();
    expect(listInstalls).toHaveBeenLastCalledWith({ check: true });
  });

  it("Update opens the install dialog with update: manifestId and skips the target step", async () => {
    renderTable([entry()]);
    fireEvent.click(await screen.findByRole("button", { name: "Update pdf" }));
    await screen.findByRole("region", { name: "Overwrite" });
    expect(fetchPlan).toHaveBeenCalledWith({ update: "e1" });
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("region", { name: "Removed" })).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Update pdf from acme/kit");
  });

  it("Uninstall confirms with the files and merges, then removes and refreshes", async () => {
    renderTable([entry()]);
    fireEvent.click(await screen.findByRole("button", { name: "Uninstall pdf" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("/home/u/.claude/skills/pdf/SKILL.md");
    expect(dialog.textContent).toContain("/permissions/allow");
    expect(dialog.textContent).toContain("docs");

    uninstall.mockResolvedValue({ ok: true, removedFiles: [], revertedEntries: [] });
    listInstalls.mockResolvedValue({ ok: true, entries: [] });
    fireEvent.click(within(dialog).getByRole("button", { name: "Uninstall" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(uninstall).toHaveBeenCalledWith("e1", { force: false });
    expect(await screen.findByText(/Nothing installed yet/)).toBeTruthy();
  });

  it("locally modified files need an explicit Delete anyway", async () => {
    renderTable([entry({ status: "modified-locally" })]);
    fireEvent.click(await screen.findByRole("button", { name: "Uninstall pdf" }));
    uninstall.mockResolvedValueOnce({
      ok: false,
      code: "LOCALLY_MODIFIED",
      message: "edited",
      files: ["/home/u/.claude/skills/pdf/SKILL.md"],
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Uninstall" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("/home/u/.claude/skills/pdf/SKILL.md");
    expect(screen.queryByRole("button", { name: "Uninstall" })).toBeNull();

    uninstall.mockResolvedValueOnce({ ok: true, removedFiles: [], revertedEntries: [] });
    fireEvent.click(screen.getByRole("button", { name: "Delete anyway" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(uninstall.mock.calls).toEqual([
      ["e1", { force: false }],
      ["e1", { force: true }],
    ]);
  });

  it("shows other uninstall failures without offering to force", async () => {
    renderTable([entry()]);
    fireEvent.click(await screen.findByRole("button", { name: "Uninstall pdf" }));
    uninstall.mockResolvedValue({ ok: false, code: "INSTALL_NOT_FOUND", message: "Gone" });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Uninstall" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Gone");
    expect(screen.queryByRole("button", { name: "Delete anyway" })).toBeNull();
  });
});
