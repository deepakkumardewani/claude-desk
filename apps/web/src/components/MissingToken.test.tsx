// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";
import { MissingToken } from "./MissingToken";

afterEach(cleanup);

test("explains that the studio must be opened from the CLI", () => {
  render(<MissingToken />);
  expect(screen.getByRole("heading", { name: "Open Claude Desk from the CLI" })).toBeTruthy();
  expect(screen.getByText(/launch URL contains a session token/u)).toBeTruthy();
});
