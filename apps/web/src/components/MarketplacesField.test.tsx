// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";
import { MarketplacesField } from "./MarketplacesField";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const value = {
  team: { source: { source: "github", repo: "o/r", ref: "main" } },
  ext: { source: { source: "url", url: "https://x/m.json" } },
};

function setup(v: unknown = value) {
  const onChange = vi.fn();
  render(<MarketplacesField value={v} onChange={onChange} />);
  return onChange;
}

test("shows pluralised count and an empty hint for non-object values", () => {
  setup(null);
  expect(screen.getByText("0 marketplaces")).toBeTruthy();
  expect(screen.getByText(/No extra marketplaces/u)).toBeTruthy();
  cleanup();
  setup([1, 2]);
  expect(screen.getByText("0 marketplaces")).toBeTruthy();
  cleanup();
  setup({ only: {} });
  expect(screen.getByText("1 marketplace")).toBeTruthy();
});

test("renders github and url rows with the right input per type", () => {
  setup();
  expect(screen.getByText("2 marketplaces")).toBeTruthy();
  expect((screen.getByLabelText("GitHub repo") as HTMLInputElement).value).toBe("o/r");
  expect((screen.getByLabelText("Git URL") as HTMLInputElement).value).toBe("https://x/m.json");
  expect((screen.getAllByLabelText("Git ref")[0] as HTMLInputElement).value).toBe("main");
});

test("editing the repo emits the updated map", () => {
  const onChange = setup();
  fireEvent.change(screen.getByLabelText("GitHub repo"), { target: { value: "o/new" } });
  expect(onChange).toHaveBeenCalledWith({
    team: { source: { source: "github", repo: "o/new", ref: "main" } },
    ext: value.ext,
  });
});

test("editing the url updates only the url field", () => {
  const onChange = setup();
  fireEvent.change(screen.getByLabelText("Git URL"), { target: { value: "https://y" } });
  expect(onChange).toHaveBeenCalledWith({
    team: value.team,
    ext: { source: { source: "url", url: "https://y" } },
  });
});

test("clearing the ref removes the key; setting it adds it", () => {
  const onChange = setup();
  fireEvent.change(screen.getAllByLabelText("Git ref")[0], {
    target: { value: "" },
  });
  expect(onChange).toHaveBeenLastCalledWith({
    team: { source: { source: "github", repo: "o/r" } },
    ext: value.ext,
  });
});

test("setting a ref on a row without one adds it", () => {
  const onChange = setup({ a: { source: { source: "github", repo: "o/r" } } });
  fireEvent.change(screen.getByLabelText("Git ref"), { target: { value: "v2" } });
  expect(onChange).toHaveBeenCalledWith({
    a: { source: { source: "github", repo: "o/r", ref: "v2" } },
  });
});

test("renaming a row re-keys the map, blank names are dropped", () => {
  const onChange = setup({ a: { source: { source: "github", repo: "o/r" } } });
  fireEvent.change(screen.getByLabelText("Marketplace name"), { target: { value: " b " } });
  expect(onChange).toHaveBeenLastCalledWith({ b: { source: { source: "github", repo: "o/r" } } });
  fireEvent.change(screen.getByLabelText("Marketplace name"), { target: { value: "  " } });
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});

test("removing the last row emits undefined", () => {
  const onChange = setup({ a: { source: { source: "github", repo: "o/r" } } });
  fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test("changing the source type via the dropdown rewrites the source", () => {
  const onChange = setup({ a: { source: { source: "github", repo: "o/r" } } });
  fireEvent.click(document.getElementById("marketplace-source-0") as HTMLElement);
  fireEvent.click(screen.getByRole("option", { name: "Git URL" }));
  expect(onChange).toHaveBeenCalledWith({ a: { source: { source: "url", repo: "o/r" } } });
});

test("clearing the dropdown falls back to github", () => {
  const onChange = setup({ a: { source: { source: "url", url: "u" } } });
  fireEvent.click(document.getElementById("marketplace-source-0") as HTMLElement);
  fireEvent.click(screen.getByRole("option", { name: "Not set" }));
  expect(onChange).toHaveBeenCalledWith({ a: { source: { source: "github", url: "u" } } });
});

test("adding a marketplace via button and Enter, ignoring blank names", () => {
  const onChange = setup(null);
  const add = screen.getByRole("button", { name: "Add marketplace" }) as HTMLButtonElement;
  expect(add.disabled).toBe(true);
  const input = screen.getByLabelText("New marketplace name");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: " shared " } });
  fireEvent.click(add);
  expect(onChange).toHaveBeenLastCalledWith({
    shared: { source: { source: "github", repo: "" } },
  });
  expect((input as HTMLInputElement).value).toBe("");

  fireEvent.change(input, { target: { value: "viaenter" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith({
    viaenter: { source: { source: "github", repo: "" } },
  });
  fireEvent.keyDown(input, { key: "a" });
});

test("JSON mode shows the raw panel and forwards parsed edits", () => {
  const onChange = setup();
  fireEvent.click(screen.getByRole("button", { name: "JSON" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: '{"z":{}}' } });
  expect(onChange).toHaveBeenCalledWith({ z: {} });
});
