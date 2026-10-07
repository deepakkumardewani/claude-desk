// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { PluginsField } from "./PluginsField";

afterEach(cleanup);

function setup(value: unknown) {
  const onChange = vi.fn();
  render(<PluginsField value={value} onChange={onChange} />);
  return onChange;
}

test("empty and non-object values show a hint and zero count", () => {
  setup(null);
  expect(screen.getByText("0 plugins configured")).toBeTruthy();
  expect(screen.getByText(/No plugins configured yet/u)).toBeTruthy();
  cleanup();
  setup([1]);
  expect(screen.getByText("0 plugins configured")).toBeTruthy();
});

test("groups plugins by marketplace (sorted), with unscoped keys under other", () => {
  setup({ "b@zeta": true, "a@alpha": true, "c@alpha": false, plain: true });
  expect(screen.getByText("4 plugins configured")).toBeTruthy();
  const headings = screen.getAllByText(/^(alpha|zeta|other)$/u).map((el) => el.textContent);
  expect(headings).toEqual(["alpha", "other", "zeta"]);
  expect(screen.getByText("a@alpha")).toBeTruthy();
  expect((screen.getByRole("switch", { name: "Toggle c@alpha" }) as HTMLInputElement).checked).toBe(
    false,
  );
  expect((screen.getByRole("switch", { name: "Toggle a@alpha" }) as HTMLInputElement).checked).toBe(
    true,
  );
});

test("array-valued entries count as enabled", () => {
  setup({ "x@m": ["a"] });
  expect((screen.getByRole("switch", { name: "Toggle x@m" }) as HTMLInputElement).checked).toBe(
    true,
  );
  expect(screen.getByText("1 plugin configured")).toBeTruthy();
});

test("toggling writes the boolean; removing the last plugin emits undefined", () => {
  const onChange = setup({ "x@m": true, "y@m": true });
  fireEvent.click(screen.getByRole("switch", { name: "Toggle x@m" }));
  expect(onChange).toHaveBeenLastCalledWith({ "x@m": false, "y@m": true });
  fireEvent.click(screen.getByRole("button", { name: "Remove x@m" }));
  expect(onChange).toHaveBeenLastCalledWith({ "y@m": true });
  cleanup();
  const onChange2 = setup({ "x@m": true });
  fireEvent.click(screen.getByRole("button", { name: "Remove x@m" }));
  expect(onChange2).toHaveBeenLastCalledWith(undefined);
});

test("adding requires both parts, trims them, and clears the inputs", () => {
  const onChange = setup({ "x@m": true });
  const add = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
  const name = screen.getByLabelText("New plugin id") as HTMLInputElement;
  const market = screen.getByLabelText("New plugin marketplace") as HTMLInputElement;
  expect(add.disabled).toBe(true);

  fireEvent.change(name, { target: { value: "p" } });
  fireEvent.keyDown(name, { key: "Enter" });
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.change(market, { target: { value: " mk " } });
  fireEvent.click(add);
  expect(onChange).toHaveBeenLastCalledWith({ "x@m": true, "p@mk": true });
  expect(name.value).toBe("");
  expect(market.value).toBe("");

  fireEvent.change(name, { target: { value: "q" } });
  fireEvent.change(market, { target: { value: "mk" } });
  fireEvent.keyDown(market, { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith({ "x@m": true, "q@mk": true });
  fireEvent.keyDown(market, { key: "a" });
});

test("JSON mode forwards parsed edits", () => {
  const onChange = setup({ "x@m": true });
  fireEvent.click(screen.getByRole("button", { name: "JSON" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: '{"z@y":false}' } });
  expect(onChange).toHaveBeenCalledWith({ "z@y": false });
});
