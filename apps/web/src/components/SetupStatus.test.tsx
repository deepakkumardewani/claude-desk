// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { StatusResponse } from "schema";
import { SetupStatus } from "./SetupStatus";

const apiFetch = vi.hoisted(() => vi.fn());
const workspace = vi.hoisted(() => ({ current: { kind: "user" } as unknown }));
vi.mock("../lib/sessionApi", () => ({ apiFetch }));
vi.mock("../lib/scope", () => ({ useWorkspace: () => ({ workspace: workspace.current }) }));

function reply(data: unknown) {
  apiFetch.mockImplementation(async () => ({ json: async () => data }));
}

function renderStatus() {
  return render(
    <MemoryRouter>
      <SetupStatus />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  workspace.current = { kind: "user" };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("renders nothing when everything is ok", async () => {
  reply({ allOk: true, items: [] } satisfies Partial<StatusResponse>);
  const { container } = renderStatus();
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/status"));
  await waitFor(() => expect(container.innerHTML).toBe(""));
});

test("renders nothing when not allOk but no non-ok items", async () => {
  reply({ allOk: false, items: [{ id: "a", label: "A", status: "ok", message: "" }] });
  const { container } = renderStatus();
  await waitFor(() => expect(container.innerHTML).toBe(""));
});

test("lists issues with singular count and fix links scoped to the workspace", async () => {
  workspace.current = { kind: "project", dir: "/work/app" };
  reply({
    allOk: false,
    items: [
      { id: "1", label: "Settings", status: "warn", message: "missing", fixRoute: "/settings" },
      { id: "2", label: "OK one", status: "ok", message: "fine" },
    ],
  });
  renderStatus();
  expect(await screen.findByText("Needs attention")).toBeTruthy();
  expect(screen.getByText("1 issue")).toBeTruthy();
  expect(screen.queryByText("OK one")).toBeNull();
  const href = screen.getByRole("link", { name: "Fix Settings" }).getAttribute("href") ?? "";
  expect(href.startsWith("/project/")).toBe(true);
  expect(href.endsWith("/settings")).toBe(true);
});

test("plural count, machine sections keep their route, no link without fixRoute", async () => {
  reply({
    allOk: false,
    items: [
      { id: "1", label: "Backups", status: "missing", message: "none", fixRoute: "/backups" },
      { id: "2", label: "Other", status: "missing", message: "none" },
    ],
  });
  renderStatus();
  expect(await screen.findByText("2 issues")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Fix Backups" }).getAttribute("href")).toBe("/backups");
  expect(screen.queryByRole("link", { name: "Fix Other" })).toBeNull();
});

test("shows an error block when the request fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  apiFetch.mockRejectedValue(new Error("down"));
  renderStatus();
  expect(await screen.findByText("Unable to load setup status")).toBeTruthy();
});
