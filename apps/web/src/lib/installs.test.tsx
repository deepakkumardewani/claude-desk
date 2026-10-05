// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { InstalledEntry } from "schema";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { findInstalled, InstallsProvider, useInstalledEntry, useInstalls } from "./installs";

const listInstalls = vi.fn();
vi.mock("./discoverApi", () => ({ listInstalls: (...args: unknown[]) => listInstalls(...args) }));

afterEach(() => {
  cleanup();
  listInstalls.mockReset();
});

function entry(overrides: Partial<InstalledEntry> = {}): InstalledEntry {
  return {
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
    ...overrides,
  };
}

const USER = { scope: "user" } as const;
const SOURCE = { owner: "o", repo: "r", path: "skills/pdf" };

describe("findInstalled", () => {
  it("matches by source and path in the same scope", () => {
    const entries = [entry()];
    expect(findInstalled(entries, USER, { kind: "skill", source: SOURCE })).toBe(entries[0]);
  });

  it("ignores installs in another scope", () => {
    const entries = [entry()];
    const project = { scope: "project", projectDir: "/p" } as const;
    expect(findInstalled(entries, project, { source: SOURCE })).toBeUndefined();
    const inProject = [entry({ target: project })];
    expect(findInstalled(inProject, project, { source: SOURCE })).toBe(inProject[0]);
    expect(
      findInstalled(inProject, { scope: "project", projectDir: "/q" }, { source: SOURCE }),
    ).toBeUndefined();
  });

  it("matches a skills.sh id even without a source", () => {
    const entries = [entry({ source: { ...entry().source, skillsShId: "o/r/pdf" } })];
    expect(findInstalled(entries, USER, { skillsShId: "o/r/pdf" })).toBe(entries[0]);
    expect(findInstalled(entries, USER, { skillsShId: "o/r/other" })).toBeUndefined();
  });

  it("does not confuse a different kind at the same path", () => {
    expect(findInstalled([entry()], USER, { kind: "agent", source: SOURCE })).toBeUndefined();
  });
});

describe("InstallsProvider", () => {
  function Probe() {
    const { check, checking } = useInstalls();
    const found = useInstalledEntry({ kind: "skill", source: SOURCE });
    return (
      <div>
        <span data-testid="status">{found?.status ?? "none"}</span>
        <span data-testid="checking">{String(checking)}</span>
        <button type="button" onClick={() => void check()}>
          check
        </button>
      </div>
    );
  }

  it("loads on mount and lets a check update every consumer", async () => {
    listInstalls
      .mockResolvedValueOnce({ ok: true, entries: [entry()] })
      .mockResolvedValueOnce({ ok: true, entries: [entry({ status: "update-available" })] });
    render(
      <InstallsProvider target={USER}>
        <Probe />
      </InstallsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("up-to-date"));
    screen.getByRole("button", { name: "check" }).click();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("update-available"));
    expect(listInstalls.mock.calls).toEqual([[{ check: false }], [{ check: true }]]);
  });

  it("keeps the last entries when a reload fails", async () => {
    listInstalls.mockResolvedValueOnce({ ok: true, entries: [entry()] });
    listInstalls.mockResolvedValueOnce({ ok: false, code: "NETWORK", message: "offline" });
    render(
      <InstallsProvider target={USER}>
        <Probe />
      </InstallsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("up-to-date"));
    screen.getByRole("button", { name: "check" }).click();
    await waitFor(() => expect(screen.getByTestId("checking").textContent).toBe("false"));
    expect(screen.getByTestId("status").textContent).toBe("up-to-date");
  });
});
