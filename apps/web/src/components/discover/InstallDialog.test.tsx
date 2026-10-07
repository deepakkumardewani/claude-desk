// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DiscoveredItem, InstallPlan } from "schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { InstallDialog } from "./InstallDialog";

const fetchPlan = vi.fn();
const applyPlan = vi.fn();
vi.mock("../../lib/discoverApi", () => ({
  fetchPlan: (...args: unknown[]) => fetchPlan(...args),
  applyPlan: (...args: unknown[]) => applyPlan(...args),
}));

let workspace: { kind: "user" } | { kind: "project"; dir: string } = { kind: "user" };
const DEFAULT_PROJECTS = [{ dir: "/work/app", name: "app", exists: true }];
let projects = DEFAULT_PROJECTS;
vi.mock("../../lib/scope", () => ({
  useWorkspace: () => ({ workspace, projects }),
}));

const ROOT = "/home/u/.claude";
const REPO = { owner: "anthropics", repo: "skills", sha: "a".repeat(40) };
const ITEM: DiscoveredItem = {
  id: "skill:skills/pdf",
  kind: "skill",
  name: "pdf",
  path: "skills/pdf",
  files: [],
};

function planWith(overrides: Partial<InstallPlan> = {}): InstallPlan {
  return {
    planHash: "hash-1",
    target: { scope: "user" },
    fileWrites: [
      { itemId: ITEM.id, targetPath: `${ROOT}/skills/pdf/SKILL.md`, status: "new", bytes: 12 },
    ],
    settingsChanges: [],
    mcpChanges: [],
    marketplaceChanges: [],
    findings: [],
    tokenEstimates: {},
    ...overrides,
  };
}

const conflictPlan = () =>
  planWith({
    fileWrites: [
      { itemId: ITEM.id, targetPath: `${ROOT}/skills/pdf/SKILL.md`, status: "conflict", bytes: 12 },
      { itemId: ITEM.id, targetPath: `${ROOT}/skills/pdf/a.txt`, status: "conflict", bytes: 3 },
      { itemId: ITEM.id, targetPath: `${ROOT}/skills/pdf/b.txt`, status: "new", bytes: 3 },
    ],
  });

const dangerPlan = () =>
  planWith({
    findings: [
      {
        itemId: ITEM.id,
        severity: "danger",
        rule: "hidden-unicode",
        message: "Hidden characters",
        file: "skills/pdf/LICENSE.txt",
        line: 1,
        evidence: "fine <U+202E> hidden",
      },
    ],
  });

function renderDialog() {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <InstallDialog repo={REPO} items={[ITEM]} onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));

async function reachChanges(plan: InstallPlan) {
  fetchPlan.mockResolvedValue({ ok: true, plan });
  renderDialog();
  next();
  await screen.findAllByRole("region", { name: /New|Conflict/ });
}

beforeEach(() => {
  workspace = { kind: "user" };
  projects = DEFAULT_PROJECTS;
});

afterEach(() => {
  cleanup();
  fetchPlan.mockReset();
  applyPlan.mockReset();
});

describe("InstallDialog target step", () => {
  const LONG_DIR = `/Users/deepak/${"deeply-nested/".repeat(8)}project`;

  it("pins User first, then a Projects group with home-abbreviated paths", () => {
    projects = [{ dir: LONG_DIR, name: "long", exists: true }];
    renderDialog();
    const radios = screen.getAllByRole("radio");
    expect(radios[0].closest("label")?.textContent).toContain("User");
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText(LONG_DIR.replace("/Users/deepak", "~"))).toBeTruthy();
  });

  it("keeps long paths from overflowing: min-w-0 fieldset and a full-path title tooltip", () => {
    projects = [{ dir: LONG_DIR, name: "long", exists: true }];
    renderDialog();
    expect(screen.getByRole("group", { name: "Install into" }).className).toContain("min-w-0");
    expect(screen.getByTitle(LONG_DIR).className).toContain("truncate");
  });

  it("renders the dialog at the wide size", () => {
    renderDialog();
    expect(screen.getByRole("dialog").className).toContain("max-w-2xl");
  });
});

describe("InstallDialog", () => {
  it("defaults the target to the active scope and requests the plan for it", async () => {
    workspace = { kind: "project", dir: "/work/app" };
    fetchPlan.mockResolvedValue({ ok: true, plan: planWith() });
    renderDialog();
    expect((screen.getByRole("radio", { name: /app/ }) as HTMLInputElement).checked).toBe(true);
    next();
    await screen.findByRole("region", { name: "New" });
    expect(fetchPlan).toHaveBeenCalledWith({
      repo: REPO,
      itemIds: [ITEM.id],
      target: { scope: "project", projectDir: "/work/app" },
    });
  });

  it("shows plan errors without leaving the target step", async () => {
    fetchPlan.mockResolvedValue({ ok: false, code: "RATE_LIMITED", message: "Slow down" });
    renderDialog();
    next();
    expect((await screen.findByRole("alert")).textContent).toContain("Slow down");
    expect(screen.getByRole("radio", { name: /User/ })).toBeTruthy();
  });

  it("blocks Continue until every conflict file has its own resolution", async () => {
    await reachChanges(conflictPlan());
    const proceed = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(proceed.disabled).toBe(true);

    const [first, second] = screen.getAllByRole("group");
    fireEvent.click(first.querySelector('input[type="radio"]')!);
    expect(proceed.disabled).toBe(true);

    fireEvent.click(second.querySelectorAll('input[type="radio"]')[2]);
    expect(proceed.disabled).toBe(false);
    expect(screen.getByText(/a-2\.txt/)).toBeTruthy();
  });

  it("sends the per-file resolutions on apply", async () => {
    await reachChanges(conflictPlan());
    const [first, second] = screen.getAllByRole("group");
    fireEvent.click(first.querySelectorAll('input[type="radio"]')[1]);
    fireEvent.click(second.querySelectorAll('input[type="radio"]')[0]);
    next();
    applyPlan.mockResolvedValue({
      ok: true,
      results: [{ itemId: ITEM.id, ok: true }],
      backups: [],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await screen.findByText(/Installed: pdf/);
    expect(applyPlan.mock.calls[0][0]).toMatchObject({
      planHash: "hash-1",
      resolutions: {
        [`${ROOT}/skills/pdf/SKILL.md`]: "overwrite",
        [`${ROOT}/skills/pdf/a.txt`]: "skip",
      },
    });
  });

  it("blocks Continue on an MCP name collision until a choice is made", async () => {
    await reachChanges(
      planWith({ mcpChanges: [{ itemId: ITEM.id, name: "github", status: "conflict" }] }),
    );
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText("Skip"));
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false);
  });

  it("keeps Apply disabled for danger findings until the ack is ticked", async () => {
    await reachChanges(dangerPlan());
    next();
    const apply = (await screen.findByRole("button", { name: "Apply" })) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed these findings/ }));
    await waitFor(() => expect(apply.disabled).toBe(false));

    applyPlan.mockResolvedValue({
      ok: true,
      results: [{ itemId: ITEM.id, ok: true }],
      backups: [],
    });
    fireEvent.click(apply);
    await screen.findByText(/Installed: pdf/);
    expect(applyPlan.mock.calls[0][0].acknowledgedDanger).toBe(true);
  });

  it("enables Apply immediately when there is no danger finding", async () => {
    await reachChanges(planWith());
    next();
    const apply = (await screen.findByRole("button", { name: "Apply" })) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows per-item results, backups and an Open in workspace link", async () => {
    await reachChanges(planWith());
    next();
    applyPlan.mockResolvedValue({
      ok: true,
      results: [{ itemId: ITEM.id, ok: true }],
      backups: [`${ROOT}/skills/pdf/old.md`],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await screen.findByText(/Installed: pdf/);
    const link = screen.getByRole("link", { name: "Open in workspace" });
    expect(link.getAttribute("href")).toBe("/user/skills/pdf/SKILL.md");
    expect(screen.getByText(`${ROOT}/skills/pdf/old.md`)).toBeTruthy();
  });

  it("reports a failed item without a workspace link", async () => {
    await reachChanges(planWith());
    next();
    applyPlan.mockResolvedValue({
      ok: true,
      results: [{ itemId: ITEM.id, ok: false, error: "disk full" }],
      backups: [],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await screen.findByText(/Failed: pdf/);
    expect(screen.getByText("disk full")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers to re-review when the plan changed", async () => {
    await reachChanges(planWith());
    next();
    applyPlan.mockResolvedValue({ ok: false, code: "PLAN_CHANGED", message: "changed" });
    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    expect((await screen.findByRole("alert")).textContent).toContain("review the plan again");
    expect(screen.getByRole("button", { name: "Review plan again" })).toBeTruthy();
  });
});
