// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { Modal } from "./Modal";

afterEach(cleanup);

function renderModal(onClose = vi.fn()) {
  render(
    <Modal title="Edit thing" onClose={onClose} headerAction={<span>extra</span>}>
      <button type="button">first</button>
      <button type="button">last</button>
    </Modal>,
  );
  return onClose;
}

test("renders an accessible dialog into document.body with header action", () => {
  renderModal();
  const dialog = screen.getByRole("dialog", { name: "Edit thing" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(document.body.contains(dialog)).toBe(true);
  expect(screen.getByText("extra")).toBeTruthy();
});

test("focuses the first focusable element on mount", () => {
  renderModal();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close dialog" }));
});

test("close button and Escape call onClose", () => {
  const onClose = renderModal();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("backdrop mousedown closes but dialog mousedown does not", () => {
  const onClose = renderModal();
  fireEvent.mouseDown(screen.getByRole("dialog"));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement as HTMLElement);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Tab wraps from last to first and Shift+Tab from first to last", () => {
  renderModal();
  const last = screen.getByRole("button", { name: "last" });
  const close = screen.getByRole("button", { name: "Close dialog" });
  last.focus();
  fireEvent.keyDown(window, { key: "Tab" });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
});

test("Tab in the middle does not move focus, other keys are ignored", () => {
  const onClose = renderModal();
  const first = screen.getByRole("button", { name: "first" });
  first.focus();
  fireEvent.keyDown(window, { key: "Tab" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(window, { key: "a" });
  expect(onClose).not.toHaveBeenCalled();
});

test("restores focus to the previously focused element on unmount", () => {
  const trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  const { unmount } = render(
    <Modal title="t" onClose={() => {}}>
      <p>body</p>
    </Modal>,
  );
  unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

test("defaults to the md width and widens for size lg", () => {
  const { unmount } = render(
    <Modal title="Default" onClose={vi.fn()}>
      <p>body</p>
    </Modal>,
  );
  expect(screen.getByRole("dialog", { name: "Default" }).className).toContain("max-w-lg");
  unmount();

  render(
    <Modal title="Wide" size="lg" onClose={vi.fn()}>
      <p>body</p>
    </Modal>,
  );
  const wide = screen.getByRole("dialog", { name: "Wide" });
  expect(wide.className).toContain("max-w-2xl");
  expect(wide.className).not.toContain("max-w-lg");
});
