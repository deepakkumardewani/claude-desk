// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";
import { SelectDropdown } from "./SelectDropdown";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof SelectDropdown>> = {}) {
  const onChange = vi.fn();
  render(<SelectDropdown id="sel" value="" options={options} onChange={onChange} {...props} />);
  return { onChange, trigger: screen.getByRole("button") };
}

test("shows the label of the current value, or Not set", () => {
  setup({ value: "b" });
  expect(screen.getByRole("button").textContent).toContain("Beta");
  cleanup();
  setup({ value: "zzz" });
  expect(screen.getByRole("button").textContent).toContain("Not set");
});

test("click opens, selecting an option calls onChange and closes", () => {
  const { onChange, trigger } = setup();
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("option", { name: "Alpha" }));
  expect(onChange).toHaveBeenCalledWith("a");
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("choosing Not set emits undefined", () => {
  const { onChange, trigger } = setup({ value: "a" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("option", { name: "Not set" }));
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test("keyboard navigation: arrows, Home, End, Enter, Escape", () => {
  const { onChange, trigger } = setup();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(screen.getByRole("listbox")).toBeTruthy();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith("b");

  fireEvent.keyDown(trigger, { key: "ArrowUp" });
  expect(screen.getByRole("listbox")).toBeTruthy();
  fireEvent.keyDown(trigger, { key: "End" });
  fireEvent.keyDown(trigger, { key: "ArrowUp" });
  fireEvent.keyDown(trigger, { key: "Home" });
  fireEvent.keyDown(trigger, { key: "ArrowUp" });
  fireEvent.keyDown(trigger, { key: " " });
  expect(onChange).toHaveBeenLastCalledWith(undefined);

  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("closed dropdown ignores Home/End/Enter/Escape and unrelated keys", () => {
  const { onChange, trigger } = setup();
  for (const key of ["Home", "End", "Enter", " ", "Escape", "x"]) {
    fireEvent.keyDown(trigger, { key });
  }
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

test("outside mousedown closes the list, inside does not", () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  fireEvent.mouseDown(screen.getByRole("listbox"));
  expect(screen.getByRole("listbox")).toBeTruthy();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("hovering highlights an option via aria-activedescendant", () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  const beta = screen.getByRole("option", { name: "Beta" });
  fireEvent.mouseEnter(beta);
  expect(trigger.getAttribute("aria-activedescendant")).toBe(beta.id);
});

test("readOnly disables the trigger and ignores keys", () => {
  const { trigger } = setup({ readOnly: true });
  expect((trigger as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.click(trigger);
  expect(screen.queryByRole("listbox")).toBeNull();
});
