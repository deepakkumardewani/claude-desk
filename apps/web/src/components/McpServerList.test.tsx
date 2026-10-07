// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { McpServerResponse } from "schema";
import { McpServerList } from "./McpServerList";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("../lib/sessionApi", () => ({ apiFetch }));
vi.mock("../lib/scope", () => ({ useWorkspace: () => ({ workspace: { kind: "user" } }) }));

const server = (name: string, overrides: Partial<McpServerResponse> = {}) =>
  ({
    name,
    scope: "user",
    health: "connected",
    transport: { type: "stdio", command: name },
    ...overrides,
  }) as McpServerResponse;

function setup(servers: McpServerResponse[]) {
  const onServerRemoved = vi.fn();
  render(
    <MemoryRouter>
      <McpServerList servers={servers} onServerRemoved={onServerRemoved} />
    </MemoryRouter>,
  );
  return onServerRemoved;
}

beforeEach(() => {
  apiFetch.mockReset();
});
afterEach(cleanup);

test("empty state", () => {
  setup([]);
  expect(screen.getByText("No servers installed yet")).toBeTruthy();
});

test("groups user servers and plugin servers, each sorted by name", () => {
  setup([
    server("zeta"),
    server("alpha"),
    server("plug-b", { origin: "plugin" }),
    server("plug-a", { editable: false }),
  ]);
  expect(screen.getByRole("heading", { name: "Your servers" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "From plugins" })).toBeTruthy();
  expect(screen.getByText("Managed by Claude plugins, view only")).toBeTruthy();
  const names = screen.getAllByText(/^(zeta|alpha|plug-a|plug-b)$/u).map((el) => el.textContent);
  expect(names).toEqual(["alpha", "zeta", "plug-a", "plug-b"]);
});

test("only plugin servers hides the your-servers group", () => {
  setup([server("p", { origin: "plugin" })]);
  expect(screen.queryByRole("heading", { name: "Your servers" })).toBeNull();
});

test("two-step removal sends DELETE with encoded name and scope, then notifies", async () => {
  apiFetch.mockResolvedValue({ ok: true });
  const onServerRemoved = setup([server("my srv", { scope: "project" })]);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(apiFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(onServerRemoved).toHaveBeenCalledTimes(1));
  expect(apiFetch).toHaveBeenCalledWith("/api/mcp/my%20srv?scope=project", { method: "DELETE" });
  expect(screen.queryByText("Remove?")).toBeNull();
});

test("cancel leaves removal mode without calling the API", () => {
  setup([server("a")]);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByText("Remove?")).toBeNull();
  expect(apiFetch).not.toHaveBeenCalled();
});

test("shows the server error message on a failed delete, or the status text", async () => {
  apiFetch.mockResolvedValueOnce({
    ok: false,
    statusText: "Bad",
    json: async () => ({ error: "locked" }),
  });
  const onServerRemoved = setup([server("a")]);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("Failed to remove server: locked")).toBeTruthy();
  expect(onServerRemoved).not.toHaveBeenCalled();

  apiFetch.mockResolvedValueOnce({ ok: false, statusText: "Bad", json: async () => ({}) });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("Failed to remove server: Bad")).toBeTruthy();
});

test("network failures surface an error message, including non-Error rejections", async () => {
  apiFetch.mockRejectedValueOnce(new Error("offline"));
  setup([server("a")]);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("Failed to remove server: offline")).toBeTruthy();

  apiFetch.mockRejectedValueOnce("x");
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("Failed to remove server: Unknown error")).toBeTruthy();
});
