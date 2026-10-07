// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vite-plus/test";
import { FieldDescription } from "./FieldDescription";

afterEach(cleanup);

test("plain text renders without links, code tokens or toggle", () => {
  const { container } = render(<FieldDescription text="Just words." />);
  expect(container.textContent).toBe("Just words.");
  expect(container.querySelector("a")).toBeNull();
  expect(container.querySelector("code")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

test("URLs become safe external links; trailing punctuation is excluded", () => {
  render(<FieldDescription text="See (https://a.example/x) and https://b.example, ok" />);
  const links = screen.getAllByRole("link");
  expect(links.map((l) => l.getAttribute("href"))).toEqual([
    "https://a.example/x",
    "https://b.example",
  ]);
  expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
  expect(links[0].getAttribute("target")).toBe("_blank");
});

test("env-var tokens render as code, plain caps words do not", () => {
  const { container } = render(
    <FieldDescription text="Set CLAUDE_CODE_FLAG or DEBUG then ANOTHER_ONE." />,
  );
  expect([...container.querySelectorAll("code")].map((c) => c.textContent)).toEqual([
    "CLAUDE_CODE_FLAG",
    "ANOTHER_ONE",
  ]);
  expect(container.textContent).toBe("Set CLAUDE_CODE_FLAG or DEBUG then ANOTHER_ONE.");
});

test("token at the very start and links adjacent to tokens render in order", () => {
  const { container } = render(<FieldDescription text="FOO_BAR https://x.example BAZ_QUX" />);
  expect(container.textContent).toBe("FOO_BAR https://x.example BAZ_QUX");
  expect(container.querySelectorAll("code")).toHaveLength(2);
  expect(container.querySelectorAll("a")).toHaveLength(1);
});

test("highlightQuery marks matches in text", () => {
  const { container } = render(<FieldDescription text="alpha beta" highlightQuery="beta" />);
  expect(container.querySelector("mark")?.textContent).toBe("beta");
});

test("long descriptions collapse and toggle", () => {
  const long = "word ".repeat(60);
  const { container } = render(<FieldDescription text={long} />);
  const toggle = screen.getByRole("button", { name: "Show more" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector("p")?.className).toContain("line-clamp-2");

  fireEvent.click(toggle);
  const less = screen.getByRole("button", { name: "Show less" });
  expect(less.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector("p")?.className).not.toContain("line-clamp-2");
});

test("an active search query disables collapsing", () => {
  render(<FieldDescription text={"word ".repeat(60)} highlightQuery="word" />);
  expect(screen.queryByRole("button")).toBeNull();
});
