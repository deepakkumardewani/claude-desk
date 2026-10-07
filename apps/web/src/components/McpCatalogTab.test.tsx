// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { CatalogEntry } from "schema";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../lib/sessionApi", () => ({ apiFetch }));

import { McpCatalogTab } from "./McpCatalogTab";

const entry = (overrides: Partial<CatalogEntry> = {}) =>
  ({
    id: "github",
    name: "GitHub",
    category: "devtools",
    description: "Repo tools",
    command: "npx",
    args: ["-y", "gh-mcp"],
    env: [],
    homepage: "https://docs.example/gh",
    official: true,
    keywords: [],
    ...overrides,
  }) as unknown as CatalogEntry;

const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, body: unknown = {}) => ({
  ok: false,
  status,
  json: async () => body,
});

const setup = (e: CatalogEntry = entry(), isLoading = false) => {
  const onServerAdded = vi.fn();
  const onClose = vi.fn();
  render(
    <McpCatalogTab
      catalogEntry={e}
      isLoading={isLoading}
      onServerAdded={onServerAdded}
      onClose={onClose}
    />,
  );
  return { onServerAdded, onClose };
};

const install = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Install Server" }));
  });
};

beforeEach(() => {
  apiFetch.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

test("renders entry details and disables install while loading", () => {
  setup(entry(), true);
  expect(screen.getByText("Devtools")).toBeTruthy();
  expect(screen.getByText("GitHub")).toBeTruthy();
  expect(screen.getByText("Repo tools")).toBeTruthy();
  expect(screen.getByText("Installs as:")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Install Server" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.queryByText("Configuration")).toBeNull();
});

test("required env var blocks install and shows the error", async () => {
  setup(entry({ env: [{ key: "TOKEN", label: "Token", required: true }] as never }));
  await install();
  expect(screen.getByText("Token is required")).toBeTruthy();
  expect(apiFetch).not.toHaveBeenCalled();
});

test("successful install posts the transport, verifies, then closes after 500ms", async () => {
  vi.useFakeTimers();
  apiFetch
    .mockResolvedValueOnce(ok())
    .mockResolvedValueOnce(ok({ servers: { github: { status: "connected" } } }));
  const { onServerAdded, onClose } = setup();
  await install();

  const [url, init] = apiFetch.mock.calls[0];
  expect(url).toBe("/api/mcp");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({
    name: "github",
    transport: { type: "stdio", command: "npx", args: ["-y", "gh-mcp"] },
  });
  expect(apiFetch.mock.calls[1][0]).toBe("/api/mcp/health");
  expect(screen.getByText("Installed successfully")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(onServerAdded).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("optional env placeholder is sent for unset values", async () => {
  apiFetch.mockResolvedValueOnce(fail(500, { error: "boom" }));
  setup(entry({ env: [{ key: "REGION", label: "Region", required: false }] as never }));
  await install();
  expect(JSON.parse(apiFetch.mock.calls[0][1].body).transport.env).toEqual({
    REGION: "${REGION}",
  });
});

test("post failure shows the server error and returns to idle", async () => {
  apiFetch.mockResolvedValueOnce(fail(400, { error: "Name taken" }));
  setup();
  await install();
  expect(screen.getByText("Name taken")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Install Server" })).toBeTruthy();
});

test("post failure without an error body uses the fallback message", async () => {
  apiFetch.mockResolvedValueOnce(fail(500, {}));
  setup();
  await install();
  expect(screen.getByText("Failed to add server")).toBeTruthy();
});

test("non-Error rejection shows Unknown error", async () => {
  apiFetch.mockRejectedValueOnce("nope");
  setup();
  await install();
  expect(screen.getByText("Unknown error")).toBeTruthy();
});

test("health non-ok warns with the status code", async () => {
  apiFetch.mockResolvedValueOnce(ok()).mockResolvedValueOnce(fail(503));
  setup();
  await install();
  expect(screen.getByText("Health check failed: 503")).toBeTruthy();
  expect(screen.getByRole("link", { name: "View docs" }).getAttribute("href")).toBe(
    "https://docs.example/gh",
  );
});

test("health with server message warns with that message", async () => {
  apiFetch
    .mockResolvedValueOnce(ok())
    .mockResolvedValueOnce(
      ok({ servers: { github: { status: "failed", message: "spawn error" } } }),
    );
  setup();
  await install();
  expect(screen.getByText("spawn error")).toBeTruthy();
});

test("health with missing server uses the default message", async () => {
  apiFetch.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok({}));
  setup();
  await install();
  expect(screen.getByText("Server not connecting")).toBeTruthy();
});

test("health fetch throwing surfaces the error message; non-Error uses default", async () => {
  apiFetch.mockResolvedValueOnce(ok()).mockRejectedValueOnce(new Error("offline"));
  setup();
  await install();
  expect(screen.getByText("offline")).toBeTruthy();
  cleanup();

  apiFetch.mockReset();
  apiFetch.mockResolvedValueOnce(ok()).mockRejectedValueOnce("x");
  setup();
  await install();
  expect(screen.getByText("Health check error")).toBeTruthy();
});

const toWarned = async () => {
  apiFetch.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok({}));
  const callbacks = setup();
  await install();
  return callbacks;
};

test("Re-check that connects moves to verified and closes", async () => {
  const { onServerAdded, onClose } = await toWarned();
  vi.useFakeTimers();
  apiFetch.mockResolvedValueOnce(ok({ servers: { github: { status: "connected" } } }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Re-check" }));
  });
  expect(screen.getByText("Installed successfully")).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(onServerAdded).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("Re-check that still fails stays warned with the still-failing message", async () => {
  await toWarned();
  apiFetch.mockResolvedValueOnce(ok({ servers: { github: { status: "failed", message: "" } } }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Re-check" }));
  });
  // checkHealth falls back to "Server not connecting" when message is empty
  expect(screen.getByText("Server not connecting")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Re-check" })).toBeTruthy();
});

test("Remove deletes the server and returns to idle", async () => {
  await toWarned();
  apiFetch.mockResolvedValueOnce(ok());
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  });
  expect(apiFetch).toHaveBeenLastCalledWith("/api/mcp/github", { method: "DELETE" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Install Server" })).toBeTruthy());
  expect(screen.queryByText("Server not connecting")).toBeNull();
});

test("Remove failure shows a message and stays warned", async () => {
  await toWarned();
  apiFetch.mockResolvedValueOnce(fail(500));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  });
  expect(screen.getByText("Failed to remove server")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Re-check" })).toBeTruthy();
});

test("Remove rejection shows the error, or a default for non-Errors", async () => {
  await toWarned();
  apiFetch.mockRejectedValueOnce(new Error("net down"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  });
  expect(screen.getByText("net down")).toBeTruthy();

  apiFetch.mockRejectedValueOnce("x");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  });
  expect(screen.getByText("Error removing server")).toBeTruthy();
});
