// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";
import { CategorySummaryTable, type CategorySummaryTableCategory } from "./CategorySummaryTable";

afterEach(cleanup);

const base = (overrides: Partial<CategorySummaryTableCategory>): CategorySummaryTableCategory => ({
  name: "Cat",
  tokens: 1000,
  percentage: 12.34,
  color: "#123456",
  ...overrides,
});

test("category without items renders a static row with percentage and tokens", () => {
  render(<CategorySummaryTable categories={[base({ name: "Free space", tokens: 12345 })]} />);
  expect(screen.getByText("Free space")).toBeTruthy();
  expect(screen.getByText("12.3%")).toBeTruthy();
  expect(screen.getByText("12,345")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

test("category with items is collapsed by default and expands to share-sorted rows", () => {
  render(
    <CategorySummaryTable
      categories={[
        base({
          items: [{ name: "small", tokens: 1 }, { name: "big", tokens: 500 }, { name: "unknown" }],
        }),
      ]}
    />,
  );
  const toggle = screen.getByRole("button", { name: /Cat/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByLabelText("Cat items")).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const rows = within(screen.getByLabelText("Cat items")).getAllByRole("listitem");
  expect(rows.map((r) => r.textContent)).toEqual(["big50.0%500", "small0.1%1", "unknown——"]);

  fireEvent.click(toggle);
  expect(screen.queryByLabelText("Cat items")).toBeNull();
});

test("tiny share renders as <0.1%", () => {
  render(
    <CategorySummaryTable
      categories={[base({ tokens: 100000, items: [{ name: "tiny", tokens: 1 }] })]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Cat/ }));
  expect(screen.getByText("<0.1%")).toBeTruthy();
});

test("zero parent tokens yields a dash share", () => {
  render(
    <CategorySummaryTable categories={[base({ tokens: 0, items: [{ name: "x", tokens: 5 }] })]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Cat/ }));
  expect(within(screen.getByLabelText("Cat items")).getByRole("listitem").textContent).toBe("x—5");
});

test("groups are expanded by default and each group toggles its own items", () => {
  render(
    <CategorySummaryTable
      categories={[
        base({
          name: "Skills",
          groups: [
            { name: "Project", tokens: 600, items: [{ name: "a", tokens: 300 }] },
            { name: "User", tokens: 400, items: [{ name: "b", tokens: 100 }] },
          ],
          items: [{ name: "loose", tokens: 10 }],
        }),
      ]}
    />,
  );
  const category = screen.getByRole("button", { name: /^Skills/ });
  expect(category.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByLabelText("Skills items")).toBeTruthy();

  const project = screen.getByRole("button", { name: /^Project/ });
  expect(project.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByLabelText("Project skills")).toBeNull();
  fireEvent.click(project);
  expect(within(screen.getByLabelText("Project skills")).getByText("a")).toBeTruthy();
  expect(screen.queryByLabelText("User skills")).toBeNull();
  fireEvent.click(project);
  expect(screen.queryByLabelText("Project skills")).toBeNull();
});

test("expanded group-only category shows no loose items list", () => {
  render(
    <CategorySummaryTable
      categories={[
        base({ name: "S", groups: [{ name: "G", tokens: 1, items: [{ name: "i", tokens: 1 }] }] }),
      ]}
    />,
  );
  expect(screen.queryByLabelText("S items")).toBeNull();
});
