// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { McpCustomServerTab } from "./McpCustomServerTab";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("../lib/sessionApi", () => ({ apiFetch }));

type Props = React.ComponentProps<typeof McpCustomServerTab>;

function setup(overrides: Partial<Props> = {}) {
  const handlers = {
    onCustomNameChange: vi.fn(),
    onCustomTypeChange: vi.fn(),
    onCustomCommandChange: vi.fn(),
    onCustomArgsChange: vi.fn(),
    onCustomUrlChange: vi.fn(),
    onError: vi.fn(),
    onServerAdded: vi.fn(),
    onClose: vi.fn(),
  };
  const props: Props = {
    customName: "srv",
    customType: "stdio",
    customCommand: "npx",
    customArgs: " -y  pkg ",
    customUrl: "",
    isLoading: false,
    error: null,
    scope: "user",
    ...handlers,
    ...overrides,
  };
  render(<McpCustomServerTab {...props} />);
  return handlers;
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

const addButton = () => screen.getByRole("button", { name: /Add Server|Adding/u });

test("stdio form posts trimmed command and split args then closes", async () => {
  const h = setup();
  fireEvent.click(addButton());
  await waitFor(() => expect(h.onClose).toHaveBeenCalledTimes(1));
  expect(apiFetch).toHaveBeenCalledWith("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "srv",
      transport: { type: "stdio", command: "npx", args: ["-y", "pkg"] },
      scope: "user",
    }),
  });
  expect(h.onServerAdded).toHaveBeenCalledTimes(1);
  expect(h.onError).toHaveBeenCalledWith(null);
});

test("empty args are omitted and projectDir goes into the query string", async () => {
  const h = setup({ customArgs: "   ", projectDir: "/a b", scope: "project" });
  fireEvent.click(addButton());
  await waitFor(() => expect(h.onClose).toHaveBeenCalled());
  const [url, init] = apiFetch.mock.calls[0];
  expect(url).toBe("/api/mcp?projectDir=%2Fa+b");
  expect(JSON.parse(init.body)).toEqual({
    name: "srv",
    transport: { type: "stdio", command: "npx" },
    scope: "project",
  });
});

test("http transport posts the trimmed url", async () => {
  const h = setup({ customType: "http", customUrl: " https://x/mcp " });
  expect(screen.getByPlaceholderText("https://example.com/mcp")).toBeTruthy();
  fireEvent.click(addButton());
  await waitFor(() => expect(h.onClose).toHaveBeenCalled());
  expect(JSON.parse(apiFetch.mock.calls[0][1].body).transport).toEqual({
    type: "http",
    url: "https://x/mcp",
  });
});

test("validation errors do not hit the API", () => {
  let h = setup({ customName: "  " });
  fireEvent.click(addButton());
  expect(h.onError).toHaveBeenCalledWith("Server name is required");
  cleanup();

  h = setup({ customCommand: " " });
  fireEvent.click(addButton());
  expect(h.onError).toHaveBeenCalledWith("Command is required for stdio servers");
  cleanup();

  h = setup({ customType: "sse", customUrl: "" });
  fireEvent.click(addButton());
  expect(h.onError).toHaveBeenCalledWith("URL is required for HTTP/SSE servers");
  expect(apiFetch).not.toHaveBeenCalled();
});

test("field edits and transport changes are reported", () => {
  const h = setup();
  fireEvent.change(screen.getByPlaceholderText("e.g. my-server"), { target: { value: "n" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. npx"), { target: { value: "c" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. -y some-package"), { target: { value: "a" } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "sse" } });
  expect(h.onCustomNameChange).toHaveBeenCalledWith("n");
  expect(h.onCustomCommandChange).toHaveBeenCalledWith("c");
  expect(h.onCustomArgsChange).toHaveBeenCalledWith("a");
  expect(h.onCustomTypeChange).toHaveBeenCalledWith("sse");
});

test("url field reports edits for remote transports", () => {
  const h = setup({ customType: "sse" });
  fireEvent.change(screen.getByPlaceholderText("https://example.com/mcp"), {
    target: { value: "https://z" },
  });
  expect(h.onCustomUrlChange).toHaveBeenCalledWith("https://z");
});

test("shows the error banner and disables the button while loading", () => {
  setup({ error: "boom", isLoading: true });
  expect(screen.getByText("boom")).toBeTruthy();
  expect((addButton() as HTMLButtonElement).disabled).toBe(true);
  expect(addButton().textContent).toBe("Adding…");
});
