// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { McpServerResponse } from "schema";
import { McpServerItem } from "./McpServerItem";

vi.mock("../lib/scope", () => ({ useWorkspace: () => ({ workspace: { kind: "user" } }) }));

afterEach(cleanup);

const server = (overrides: Partial<McpServerResponse> = {}) =>
  ({
    name: "fs",
    scope: "user",
    health: "connected",
    transport: { type: "stdio", command: "npx fs" },
    ...overrides,
  }) as McpServerResponse;

function setup(s: McpServerResponse, isRemoving = false) {
  const onRemove = vi.fn();
  const onCancelRemove = vi.fn();
  const view = render(
    <MemoryRouter>
      <McpServerItem
        server={s}
        isRemoving={isRemoving}
        onRemove={onRemove}
        onCancelRemove={onCancelRemove}
      />
    </MemoryRouter>,
  );
  return { onRemove, onCancelRemove, ...view };
}

test("shows name, scope, transport summary and connected health", () => {
  setup(server());
  expect(screen.getByText("fs")).toBeTruthy();
  expect(screen.getByText("user")).toBeTruthy();
  expect(screen.getByText("STDIO • npx fs")).toBeTruthy();
  expect(screen.getByText("Connected")).toBeTruthy();
});

test.each([
  [{ health: "failed" }, "Failed"],
  [{ health: "unknown" }, "Unknown"],
  [{ health: "connected", error: "Authentication required" }, "Needs authentication"],
] as const)("health label for %j", (overrides, label) => {
  setup(server(overrides as Partial<McpServerResponse>));
  expect(screen.getByText(label)).toBeTruthy();
});

test("http and sse transports summarise the url", () => {
  setup(server({ transport: { type: "http", url: "https://x/mcp" } as never }));
  expect(screen.getByText("HTTP • https://x/mcp")).toBeTruthy();
  cleanup();
  setup(server({ transport: { type: "sse", url: "https://y/sse" } as never }));
  expect(screen.getByText("SSE • https://y/sse")).toBeTruthy();
});

test("unknown transport type falls back to Unknown", () => {
  setup(server({ transport: { type: "ws" } as never }));
  expect(screen.getByText("WS • Unknown")).toBeTruthy();
});

test("auth issue links to settings; plain error is shown verbatim", () => {
  setup(server({ error: "authentication needed" }));
  expect(screen.getByRole("link", { name: "check setup" }).getAttribute("href")).toBe(
    "/user/settings",
  );
  cleanup();
  setup(server({ error: "spawn failed" }));
  expect(screen.getByText("spawn failed")).toBeTruthy();
});

test("editable servers can be removed with a confirmation step", () => {
  const { onRemove, container } = setup(server());
  expect(container.firstElementChild?.getAttribute("data-editable")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test("while removing, Confirm removes and Cancel cancels", () => {
  const { onRemove, onCancelRemove } = setup(server(), true);
  expect(screen.getByText("Remove?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onRemove).toHaveBeenCalledTimes(1);
  expect(onCancelRemove).toHaveBeenCalledTimes(1);
});

test("plugin-origin and non-editable servers have no remove controls", () => {
  const { container } = setup(server({ origin: "plugin" }));
  expect(screen.queryByRole("button")).toBeNull();
  expect(container.firstElementChild?.getAttribute("data-origin")).toBe("plugin");
  expect(container.firstElementChild?.getAttribute("data-editable")).toBe("false");
  cleanup();
  setup(server({ editable: false }));
  expect(screen.queryByRole("button")).toBeNull();
});
