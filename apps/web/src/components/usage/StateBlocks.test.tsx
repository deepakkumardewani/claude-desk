// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "./StateBlocks";

afterEach(cleanup);

test("LoadingBlock uses a default and a custom accessible label", () => {
  const { rerender } = render(<LoadingBlock />);
  expect(screen.getByRole("status").textContent).toContain("Loading usage data...");
  rerender(<LoadingBlock label="Loading x" />);
  expect(screen.getByRole("status").textContent).toContain("Loading x");
});

test("ErrorBlock is an alert with the message", () => {
  render(<ErrorBlock message="kaput" />);
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("Error loading usage data");
  expect(alert.textContent).toContain("kaput");
});

test("EmptyBlock shows its message", () => {
  render(<EmptyBlock message="nothing here" />);
  expect(screen.getByText("nothing here")).toBeTruthy();
});
