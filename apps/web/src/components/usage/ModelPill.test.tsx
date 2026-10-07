// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";
import { ModelPill } from "./ModelPill";

afterEach(cleanup);

test("strips the claude- prefix and keeps the full id as title", () => {
  render(<ModelPill model="claude-opus-4-1" />);
  const pill = screen.getByText("opus-4-1");
  expect(pill.getAttribute("title")).toBe("claude-opus-4-1");
});

test.each([
  ["claude-opus-4", "rose"],
  ["claude-sonnet-4", "teal"],
  ["claude-haiku-4", "amber"],
  ["fable-1", "sky"],
  ["gpt-x", "bg-surface-soft"],
])("colours %s by family", (model, expected) => {
  render(<ModelPill model={model} className="extra" />);
  const pill = screen.getByTitle(model);
  expect(pill.className).toContain(expected);
  expect(pill.className).toContain("extra");
});
