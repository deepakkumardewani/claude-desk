// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { DiscoveredItem, InstalledEntry } from "schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { InstallsProvider } from "../../lib/installs";
import { ItemBrowser } from "./ItemCard";
import { SkillsShSearch, SKILLS_SH_SEARCH_DEBOUNCE_MS } from "./SkillsShSearch";

const listInstalls = vi.fn();
const searchSkillsSh = vi.fn();
vi.mock("../../lib/discoverApi", () => ({
  listInstalls: (...args: unknown[]) => listInstalls(...args),
  searchSkillsSh: (...args: unknown[]) => searchSkillsSh(...args),
  resolveSkillsShItem: vi.fn(),
  fetchRepoFile: vi.fn(),
}));

const SOURCE = {
  kind: "github",
  owner: "acme",
  repo: "kit",
  sha: "c",
  path: "skills/pdf",
} as const;

function entry(overrides: Partial<InstalledEntry> = {}): InstalledEntry {
  return {
    id: "e1",
    source: SOURCE,
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

const item = (name: string, path = `skills/${name}`): DiscoveredItem => ({
  id: `skill:${path}`,
  kind: "skill",
  name,
  path,
  files: [],
});

async function mount(
  entries: InstalledEntry[],
  ui: React.ReactNode,
  target = { scope: "user" } as const,
) {
  listInstalls.mockResolvedValue({ ok: true, entries });
  await act(async () => {
    render(<InstallsProvider target={target}>{ui}</InstallsProvider>);
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  listInstalls.mockReset();
  searchSkillsSh.mockReset();
});

describe("ItemCard installed badge", () => {
  const repo = { owner: "acme", repo: "kit" };

  it("badges only the card whose source and path match", async () => {
    await mount(
      [entry()],
      <ItemBrowser items={[item("pdf"), item("git")]} repo={repo} onOpen={vi.fn()} />,
    );
    const cards = screen.getAllByTestId("item-card");
    expect(within(cards[0]).getByTestId("installed-badge").textContent).toBe("Installed");
    expect(within(cards[1]).queryByTestId("installed-badge")).toBeNull();
  });

  it("shows Update available once a check reports it", async () => {
    await mount(
      [entry({ status: "update-available" })],
      <ItemBrowser items={[item("pdf")]} repo={repo} onOpen={vi.fn()} />,
    );
    expect(screen.getByTestId("installed-badge").textContent).toBe("Update available");
  });

  it("ignores installs in another scope and other repos", async () => {
    await mount(
      [
        entry({ target: { scope: "project", projectDir: "/p" } }),
        entry({ id: "e2", source: { ...SOURCE, repo: "other" } }),
      ],
      <ItemBrowser items={[item("pdf")]} repo={repo} onOpen={vi.fn()} />,
    );
    expect(screen.queryByTestId("installed-badge")).toBeNull();
  });

  it("shows no badge without a repo to match against", async () => {
    await mount([entry()], <ItemBrowser items={[item("pdf")]} onOpen={vi.fn()} />);
    expect(screen.queryByTestId("installed-badge")).toBeNull();
  });
});

describe("skills.sh result installed badge", () => {
  beforeEach(() => vi.useFakeTimers());

  it("matches the recorded skills.sh id", async () => {
    searchSkillsSh.mockResolvedValue({
      ok: true,
      results: [
        { id: "acme/kit/pdf", source: "acme/kit", skillId: "pdf", name: "pdf", installs: 5 },
        { id: "acme/kit/git", source: "acme/kit", skillId: "git", name: "git", installs: 5 },
      ],
    });
    await mount(
      [entry({ source: { ...SOURCE, kind: "skills.sh", skillsShId: "acme/kit/pdf" } })],
      <SkillsShSearch />,
    );
    fireEvent.change(screen.getByLabelText("Search skills.sh"), { target: { value: "pdf" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SKILLS_SH_SEARCH_DEBOUNCE_MS);
    });
    const [pdf, git] = screen.getAllByRole("listitem");
    expect(within(pdf).getByTestId("installed-badge").textContent).toBe("Installed");
    expect(within(git).queryByTestId("installed-badge")).toBeNull();
  });
});
