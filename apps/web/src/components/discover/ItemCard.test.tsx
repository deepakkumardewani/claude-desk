// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { DiscoveredItem } from "schema";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ItemBrowser } from "./ItemCard";

const make = (partial: Partial<DiscoveredItem> & Pick<DiscoveredItem, "id" | "kind" | "name">) =>
  ({ path: `${partial.id}`, files: [], ...partial }) as DiscoveredItem;

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

afterEach(cleanup);

describe("ItemBrowser", () => {
  it("renders a count chip per kind and groups cards by kind", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    const strip = screen.getByRole("group", { name: "Filter by kind" });
    expect(within(strip).getByRole("button", { name: "Skills 2" })).toBeTruthy();
    expect(within(strip).getByRole("button", { name: "Agents 1" })).toBeTruthy();
    expect(within(strip).getByRole("button", { name: "Plugins 1" })).toBeTruthy();
  });

  it("filters to a kind when its chip is clicked and toggles back", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agents 1" }));
    const cards = screen.getAllByTestId("item-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-kind")).toBe("agent");
    fireEvent.click(screen.getByRole("button", { name: "Agents 1" }));
    expect(screen.getAllByTestId("item-card").length).toBeGreaterThan(1);
  });

  it("narrows by name or description substring", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Filter items"), { target: { value: "PDF" } });
    expect(screen.getAllByTestId("item-card")).toHaveLength(1);
    expect(screen.getByText("Work with PDF files")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter items"), { target: { value: "zzz" } });
    expect(screen.getByText("No items match the current filters.")).toBeTruthy();
  });

  it("nests plugin children inside the plugin card, not as top-level cards", () => {
    render(<ItemBrowser items={ITEMS} onOpen={vi.fn()} />);
    const pluginCard = screen
      .getAllByTestId("item-card")
      .find((card) => card.getAttribute("data-kind") === "plugin")!;
    expect(within(pluginCard).getByText("inner-skill")).toBeTruthy();
    // 2 skills + 1 agent + 1 plugin + 1 nested child = 5 cards, and inner-skill appears once.
    expect(screen.getAllByTestId("item-card")).toHaveLength(5);
    expect(screen.getAllByText("inner-skill")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Skills 3" })).toBeNull();
  });

  it("calls onOpen when a card is clicked and toggles the checkbox", () => {
    const onOpen = vi.fn();
    render(<ItemBrowser items={ITEMS} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("reviewer"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "agents/rev.md" }));
    const checkbox = screen.getByLabelText("Select reviewer") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it("shows the empty message when there are no items", () => {
    render(<ItemBrowser items={[]} onOpen={vi.fn()} />);
    expect(screen.getByText("No Claude Code items found in this repo")).toBeTruthy();
  });
});
