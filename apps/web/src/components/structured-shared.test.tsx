// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  EditorList,
  EmptyHint,
  ModeTabs,
  PlusIcon,
  RawJsonPanel,
  RemoveButton,
  Switch,
} from "./structured-shared";

afterEach(cleanup);

test("ModeTabs marks the active mode and reports changes", () => {
  const onChange = vi.fn();
  render(<ModeTabs mode="fields" onChange={onChange} />);
  expect(screen.getByRole("button", { name: "Fields" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "JSON" }).getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "JSON" }));
  expect(onChange).toHaveBeenCalledWith("json");
});

test("Switch reflects checked state and emits the new value", () => {
  const onChange = vi.fn();
  render(<Switch checked={false} onChange={onChange} label="Enable" />);
  const toggle = screen.getByRole("switch", { name: "Enable" }) as HTMLInputElement;
  expect(toggle.checked).toBe(false);
  fireEvent.click(toggle);
  expect(onChange).toHaveBeenCalledWith(true);
});

test("RemoveButton, EmptyHint, EditorList and PlusIcon render", () => {
  const onClick = vi.fn();
  const { container } = render(
    <>
      <RemoveButton onClick={onClick} label="Remove row" />
      <EmptyHint>nothing</EmptyHint>
      <EditorList>
        <span>row</span>
      </EditorList>
      <PlusIcon />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove row" }));
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(screen.getByText("nothing")).toBeTruthy();
  expect(screen.getByText("row")).toBeTruthy();
  expect(container.querySelectorAll("svg").length).toBe(2);
});

test("RawJsonPanel seeds text from the value, or empty for null", () => {
  render(<RawJsonPanel value={{ a: 1 }} onChange={() => {}} />);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe('{\n  "a": 1\n}');
  cleanup();
  render(<RawJsonPanel value={null} onChange={() => {}} />);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
});

test("RawJsonPanel emits parsed JSON, undefined for blank, and pauses on invalid JSON", () => {
  const onChange = vi.fn();
  render(<RawJsonPanel value={undefined} onChange={onChange} />);
  const box = screen.getByRole("textbox");

  fireEvent.change(box, { target: { value: '{"x":2}' } });
  expect(onChange).toHaveBeenLastCalledWith({ x: 2 });
  expect(screen.queryByRole("alert")).toBeNull();

  fireEvent.change(box, { target: { value: "{bad" } });
  expect(screen.getByRole("alert").textContent).toContain("Invalid JSON");
  expect(box.getAttribute("aria-invalid")).toBe("true");
  expect(onChange).toHaveBeenCalledTimes(1);

  fireEvent.change(box, { target: { value: "   " } });
  expect(onChange).toHaveBeenLastCalledWith(undefined);
  expect(screen.queryByRole("alert")).toBeNull();
});
