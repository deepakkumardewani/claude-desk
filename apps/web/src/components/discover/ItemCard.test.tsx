// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { DiscoveredItem } from "schema";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ItemBrowser } from "./ItemBrowser";

const make = (partial: Partial<DiscoveredItem> & Pick<DiscoveredItem, "id" | "kind" | "name">) =>
  ({ path: `${partial.id}`, files: [], ...partial }) as DiscoveredItem;

const file = (path: string, blobSha: string) => ({ path, size: 1, blobSha });

const child = make({ id: "p/skills/inner", kind: "skill", name: "inner-skill" });
const ITEMS: DiscoveredItem[] = [
  make({ id: "skills/pdf", kind: "skill", name: "pdf", description: "Work with PDF files" }),
  make({ id: "skills/git", kind: "skill", name: "git", description: "Git helper" }),
  make({ id: "agents/rev.md", kind: "agent", name: "reviewer", description: "Reviews code" }),
  make({
    id: "p",
    kind: "plugin",
    name: "bundle",
    payload: { plugin: "bundle", children: [child] },
  }),
  // Also present top-level, as the scanner could emit; must not render twice.
  child,
];

const ANIMATE_COPIES: DiscoveredItem[] = [
  make({
    id: "claude",
    kind: "skill",
    name: "animate",
    path: ".claude/skills/animate",
    files: [file(".claude/skills/animate/SKILL.md", "a")],
  }),
  make({
    id: "agents",
    kind: "skill",
    name: "animate",
    path: ".agents/skills/animate",
    files: [file(".agents/skills/animate/SKILL.md", "a")],
  }),
  make({
    id: "codex",
    kind: "skill",
    name: "animate",
    path: ".codex/skills/animate",
    files: [file(".codex/skills/animate/SKILL.md", "different")],
  }),
];

afterEach(cleanup);

const tab = (name: string) => screen.getByRole("tab", { name });

describe("ItemBrowser tabs", () => {
  it("renders one tab per kind with group counts and exactly one selected", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Skills 2", "Agents 1", "Plugins 1"]);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(tab("Skills 2").getAttribute("aria-selected")).toBe("true");
  });

  it("shows only the active kind's rows and switches on click", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    expect(screen.getAllByTestId("item-row")).toHaveLength(2);
    fireEvent.click(tab("Agents 1"));
    const rows = screen.getAllByTestId("item-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-kind")).toBe("agent");
    expect(tab("Agents 1").getAttribute("aria-selected")).toBe("true");
    expect(tab("Skills 2").getAttribute("aria-selected")).toBe("false");
  });

  it("moves between tabs with the arrow keys", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    fireEvent.keyDown(tab("Skills 2"), { key: "ArrowRight" });
    expect(tab("Agents 1").getAttribute("aria-selected")).toBe("true");
  });

  it("narrows by name or description substring", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Filter items"), { target: { value: "PDF" } });
    expect(screen.getAllByTestId("item-row")).toHaveLength(1);
    expect(screen.getByText("Work with PDF files")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter items"), { target: { value: "zzz" } });
    expect(screen.getByText("No items match the current filters.")).toBeTruthy();
  });

  it("shows the empty message when there are no items", () => {
    render(<ItemBrowser items={[]} onOpen={vi.fn()} />);
    expect(screen.getByText("No Claude Code items found in this repo")).toBeTruthy();
  });
});

describe("ItemBrowser rows", () => {
  it("opens the drawer from the name but not from the checkbox", () => {
    const onOpen = vi.fn();
    render(<ItemBrowser items={ITEMS} onOpen={onOpen} />);
    const checkbox = screen.getByLabelText("Select pdf") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "git" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "skills/git" }));
  });

  it("expands plugin children from a chevron, listing them once", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    fireEvent.click(tab("Plugins 1"));
    expect(screen.queryByText("inner-skill")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Expand bundle" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("list", { name: "bundle contents" });
    expect(within(list).getByText("inner-skill")).toBeTruthy();
    expect(screen.getAllByText("inner-skill")).toHaveLength(1);
  });

  it("disables selection for items that are too large to install", () => {
    const big = make({ id: "skills/big", kind: "skill", name: "big", installable: false });
    render(<ItemBrowser items={[big]} onOpen={vi.fn()} />);
    expect((screen.getByLabelText("Select big") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("select all", () => {
  it("is tri-state over the visible installable rows of the active tab", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    const all = screen.getByLabelText("Select all (2)") as HTMLInputElement;
    expect(all.indeterminate).toBe(false);

    fireEvent.click(screen.getByLabelText("Select pdf"));
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);

    fireEvent.click(all);
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
    expect((screen.getByLabelText("Select git") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(all);
    expect((screen.getByLabelText("Select pdf") as HTMLInputElement).checked).toBe(false);
  });

  it("skips non-installable items and respects the text filter", () => {
    const big = make({ id: "skills/big", kind: "skill", name: "big", installable: false });
    render(<ItemBrowser items={[...ITEMS, big]} onOpen={vi.fn()} />);
    expect(screen.getByLabelText("Select all (2)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter items"), { target: { value: "pdf" } });
    fireEvent.click(screen.getByLabelText("Select all (1)"));
    fireEvent.change(screen.getByLabelText("Filter items"), { target: { value: "" } });
    expect((screen.getByLabelText("Select git") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Select pdf") as HTMLInputElement).checked).toBe(true);
  });
});

describe("source picker", () => {
  it("merges copies into one row and marks identical ones", () => {
    render(<ItemBrowser items={ANIMATE_COPIES} onOpen={vi.fn()} />);
    expect(screen.getAllByTestId("item-row")).toHaveLength(1);
    expect(tab("Skills 1")).toBeTruthy();
    const picker = screen.getByLabelText("Source for animate") as HTMLSelectElement;
    expect(picker.value).toBe("claude");
    expect(screen.getByText("+2")).toBeTruthy();
    const labels = within(picker)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual([".claude", ".agents · identical", ".codex"]);
  });

  it("opens and installs the chosen copy", () => {
    const onOpen = vi.fn();
    const onInstall = vi.fn();
    render(<ItemBrowser items={ANIMATE_COPIES} onOpen={onOpen} onInstall={onInstall} />);
    fireEvent.change(screen.getByLabelText("Source for animate"), { target: { value: "codex" } });
    fireEvent.click(screen.getByRole("button", { name: "animate" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "codex" }));

    fireEvent.click(screen.getByLabelText("Select animate"));
    fireEvent.change(screen.getByLabelText("Source for animate"), { target: { value: "agents" } });
    fireEvent.click(screen.getByRole("button", { name: "Install 1" }));
    expect(onInstall).toHaveBeenCalledWith([expect.objectContaining({ id: "agents" })]);
  });
});

describe("selection dock", () => {
  it("appears only with onInstall and a selection", () => {
    const { rerender } = render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Select pdf"));
    expect(screen.queryByTestId("selection-dock")).toBeNull();
    rerender(<ItemBrowser items={ITEMS} onOpen={vi.fn()} onInstall={vi.fn()} />);
    expect(screen.getByTestId("selection-dock")).toBeTruthy();
  });

  it("breaks counts down per kind, switches tabs, clears and installs", () => {
    const onInstall = vi.fn();
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} onInstall={onInstall} />);
    fireEvent.click(screen.getByLabelText("Select pdf"));
    fireEvent.click(screen.getByLabelText("Select git"));
    fireEvent.click(tab("Agents 1"));
    fireEvent.click(screen.getByLabelText("Select reviewer"));

    const dock = screen.getByTestId("selection-dock");
    expect(within(dock).getByRole("button", { name: "Skills 2" })).toBeTruthy();
    expect(within(dock).getByRole("button", { name: "Agents 1" })).toBeTruthy();
    expect(dock.querySelector("[aria-live='polite']")).toBeTruthy();

    fireEvent.click(within(dock).getByRole("button", { name: "Skills 2" }));
    expect(tab("Skills 2").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(dock).getByRole("button", { name: "Install 3" }));
    expect(onInstall.mock.calls[0][0].map((i: DiscoveredItem) => i.id)).toEqual([
      "skills/pdf",
      "skills/git",
      "agents/rev.md",
    ]);

    fireEvent.click(within(dock).getByRole("button", { name: "Clear" }));
    expect(screen.queryByTestId("selection-dock")).toBeNull();
    expect((screen.getByLabelText("Select pdf") as HTMLInputElement).checked).toBe(false);
  });
});
