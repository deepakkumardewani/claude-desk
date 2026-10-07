// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";
import { ENV_VAR_CATALOG } from "../lib/env-catalog";
import { EnvField } from "./EnvField";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function setup(value: unknown) {
  const onChange = vi.fn();
  render(<EnvField value={value} onChange={onChange} />);
  return onChange;
}

test("shows an empty hint and a count for non-object or non-string entries", () => {
  setup(null);
  expect(screen.getByText("0 variables set")).toBeTruthy();
  expect(screen.getByText(/No environment variables set/u)).toBeTruthy();
  cleanup();
  setup(["x"]);
  expect(screen.getByText("0 variables set")).toBeTruthy();
  cleanup();
  setup({ A: "1", B: 2 });
  expect(screen.getByText("1 variable set")).toBeTruthy();
});

test("known variables show their description and a free-text control uses the example", () => {
  setup({ ANTHROPIC_MODEL: "x" });
  const def = ENV_VAR_CATALOG.find((d) => d.name === "ANTHROPIC_MODEL");
  if (def && !def.options && !def.flag) {
    expect(screen.getByText(def.description)).toBeTruthy();
    expect(screen.getByLabelText("Value for ANTHROPIC_MODEL").getAttribute("placeholder")).toBe(
      def.example ?? "value",
    );
  }
});

test("unknown variables use a plain input with a generic placeholder", () => {
  const onChange = setup({ MY_CUSTOM: "a" });
  const input = screen.getByLabelText("Value for MY_CUSTOM") as HTMLInputElement;
  expect(input.placeholder).toBe("value");
  fireEvent.change(input, { target: { value: "b" } });
  expect(onChange).toHaveBeenCalledWith({ MY_CUSTOM: "b" });
});

test("option-based and flag variables render a dropdown that writes the chosen value", () => {
  const onChange = setup({ CLAUDE_CODE_EFFORT_LEVEL: "low", CLAUDE_CODE_USE_BEDROCK: "1" });
  fireEvent.click(document.getElementById("env-CLAUDE_CODE_EFFORT_LEVEL") as HTMLElement);
  fireEvent.click(screen.getByRole("option", { name: "max" }));
  expect(onChange).toHaveBeenLastCalledWith({
    CLAUDE_CODE_EFFORT_LEVEL: "max",
    CLAUDE_CODE_USE_BEDROCK: "1",
  });

  fireEvent.click(document.getElementById("env-CLAUDE_CODE_USE_BEDROCK") as HTMLElement);
  expect(screen.getByRole("option", { name: "0" })).toBeTruthy();
  fireEvent.click(screen.getByRole("option", { name: "Not set" }));
  expect(onChange).toHaveBeenLastCalledWith({
    CLAUDE_CODE_EFFORT_LEVEL: "low",
    CLAUDE_CODE_USE_BEDROCK: "",
  });
});

test("removing the last variable emits undefined; otherwise the remaining map", () => {
  const onChange = setup({ A: "1", B: "2" });
  fireEvent.click(screen.getByRole("button", { name: "Remove A" }));
  expect(onChange).toHaveBeenLastCalledWith({ B: "2" });
  cleanup();
  const onChange2 = setup({ A: "1" });
  fireEvent.click(screen.getByRole("button", { name: "Remove A" }));
  expect(onChange2).toHaveBeenLastCalledWith(undefined);
});

test("the add dialog lists catalog variables by category, filters, and adds one", () => {
  const onChange = setup({ A: "1" });
  fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
  const dialog = screen.getByRole("dialog", { name: "Add environment variable" });
  const first = ENV_VAR_CATALOG[0];
  expect(within(dialog).getByText(first.category)).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Search environment variables"), {
    target: { value: "zzzz-no-such-var" },
  });
  expect(within(dialog).getByText("No matching variables.")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Search environment variables"), {
    target: { value: "CLAUDE_CODE_USE_BEDROCK" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: /CLAUDE_CODE_USE_BEDROCK/u }));
  expect(onChange).toHaveBeenCalledWith({ A: "1", CLAUDE_CODE_USE_BEDROCK: "" });
});

test("adding an already-set variable is ignored, and the dialog closes via Escape", () => {
  const onChange = setup({ CLAUDE_CODE_USE_BEDROCK: "1" });
  fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByRole("button", { name: /CLAUDE_CODE_USE_BEDROCK/u })).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("shows a done message when every catalogued variable is already set", () => {
  const all = Object.fromEntries(ENV_VAR_CATALOG.map((d) => [d.name, "x"]));
  setup(all);
  fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
  expect(screen.getByText("Every catalogued variable is already set.")).toBeTruthy();
});

test("JSON mode forwards raw edits", () => {
  const onChange = setup({ A: "1" });
  fireEvent.click(screen.getByRole("button", { name: "JSON" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: '{"Z":"9"}' } });
  expect(onChange).toHaveBeenCalledWith({ Z: "9" });
});
