// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";
import { UsageCard } from "./UsageCard";

afterEach(cleanup);

test("renders label and value, no sublabel by default", () => {
  render(<UsageCard label="Spend" value="$5" />);
  expect(screen.getByText("Spend")).toBeTruthy();
  expect(screen.getByText("$5").className).toContain("text-text");
});

test("applies custom value class and shows sublabel", () => {
  render(<UsageCard label="L" value="1" valueClassName="text-red-500" sublabel="note" />);
  expect(screen.getByText("1").className).toContain("text-red-500");
  expect(screen.getByText("note")).toBeTruthy();
});
