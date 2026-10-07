// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

afterEach(cleanup);

test("Stay calls onStay and Leave calls onLeave with default label", () => {
  const onStay = vi.fn();
  const onLeave = vi.fn();
  render(<UnsavedChangesDialog onStay={onStay} onLeave={onLeave} />);
  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(onStay).toHaveBeenCalledTimes(1);
  expect(onLeave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
  expect(onLeave).toHaveBeenCalledTimes(1);
});

test("custom leave label is shown and Escape stays", () => {
  const onStay = vi.fn();
  render(<UnsavedChangesDialog onStay={onStay} onLeave={vi.fn()} leaveLabel="Switch anyway" />);
  expect(screen.getByRole("button", { name: "Switch anyway" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onStay).toHaveBeenCalledTimes(1);
});
