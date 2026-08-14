// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vite-plus/test";
import type { CatalogEntry } from "schema";
import { McpAddDialog } from "./McpAddDialog";

// Mock the useScope hook
vi.mock("../lib/scope", () => ({
  useScope: () => ({ activeScope: "user" as const }),
  useWorkspace: () => ({
    workspace: { kind: "user" as const },
    projectDir: null,
    activeScope: "user" as const,
  }),
}));

// Mock Modal component
vi.mock("./Modal", () => ({
  Modal: ({ title, children, onClose }: any) => (
    <div data-testid="modal">
      <h2>{title}</h2>
      <button onClick={onClose} data-testid="close-button">
        Close
      </button>
      {children}
    </div>
  ),
}));

const mockEntry: CatalogEntry = {
  id: "test-server",
  name: "Test Server",
  description: "A test server",
  category: "devtools",
  homepage: "https://example.com",
  command: "npx",
  args: ["test-server"],
  official: true,
  env: [
    {
      key: "API_KEY",
      label: "API Key",
      required: true,
      docsUrl: "https://example.com/api-key",
    },
    {
      key: "OPTIONAL_VAR",
      label: "Optional Variable",
      required: false,
    },
  ],
  keywords: [],
};

const mockEntryNoEnv: CatalogEntry = {
  ...mockEntry,
  id: "simple-server",
  env: [],
};

describe("McpAddDialog", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("Required env var validation", () => {
    it("should block submit when required env var is empty", async () => {
      const onClose = vi.fn();
      const onServerAdded = vi.fn();

      render(
        <McpAddDialog catalogEntry={mockEntry} onClose={onClose} onServerAdded={onServerAdded} />,
      );

      const installButton = screen.getByText("Install Server");
      fireEvent.click(installButton);

      await waitFor(() => {
        const errorText = screen.queryByText("API Key is required");
        expect(errorText).toBeTruthy();
      });

      // Verify fetch was not called for POST
      const postCalls = (globalThis.fetch as any).mock.calls.filter(
        (call: any[]) => call[0] === "/api/mcp",
      );
      expect(postCalls.length).toBe(0);
    });

    it("should allow submit when all required env vars are filled", async () => {
      const onClose = vi.fn();
      const onServerAdded = vi.fn();

      (globalThis.fetch as any).mockImplementation((url: string) => {
        if (url === "/api/mcp") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }
        if (url === "/api/mcp/health") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                servers: { "test-server": { status: "connected" } },
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(
        <McpAddDialog catalogEntry={mockEntry} onClose={onClose} onServerAdded={onServerAdded} />,
      );

      // Find password input by placeholder
      const apiKeyInputs = screen.queryAllByPlaceholderText(/api key/i);
      if (apiKeyInputs.length === 0) {
        // Try to find by looking for the toggle button and then clicking it to go to literal mode
        const toggleButtons = screen.getAllByText("Paste value");
        fireEvent.click(toggleButtons[0]);

        // Now find the input and fill it
        const passwordInputs = screen.queryAllByPlaceholderText(/enter/i);
        if (passwordInputs.length > 0) {
          fireEvent.change(passwordInputs[0], { target: { value: "secret-key" } });
        }
      } else {
        fireEvent.change(apiKeyInputs[0], { target: { value: "secret-key" } });
      }

      const installButton = screen.getByText("Install Server");
      fireEvent.click(installButton);

      await waitFor(() => {
        const postCalls = (globalThis.fetch as any).mock.calls.filter(
          (call: any[]) => call[0] === "/api/mcp",
        );
        expect(postCalls.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Env var handling", () => {
    it("should not include env key when server has no env vars", async () => {
      const onClose = vi.fn();
      const onServerAdded = vi.fn();

      (globalThis.fetch as any).mockImplementation((url: string) => {
        if (url === "/api/mcp") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }
        if (url === "/api/mcp/health") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                servers: { "simple-server": { status: "connected" } },
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(
        <McpAddDialog
          catalogEntry={mockEntryNoEnv}
          onClose={onClose}
          onServerAdded={onServerAdded}
        />,
      );

      const installButton = screen.getByText("Install Server");
      fireEvent.click(installButton);

      await waitFor(() => {
        const calls = (globalThis.fetch as any).mock.calls;
        const postCall = calls.find((call: any[]) => call[0] === "/api/mcp");
        if (postCall) {
          const body = JSON.parse(postCall[1].body);
          expect(body.transport.env).toBeUndefined();
        }
      });
    });
  });

  describe("Placeholder mode POST body", () => {
    it("sends ${KEY} placeholders for fields left in placeholder mode", async () => {
      const onClose = vi.fn();
      const onServerAdded = vi.fn();

      (globalThis.fetch as any).mockImplementation((url: string) => {
        if (url === "/api/mcp") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }
        if (url === "/api/mcp/health") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                servers: { "test-server": { status: "connected" } },
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(
        <McpAddDialog catalogEntry={mockEntry} onClose={onClose} onServerAdded={onServerAdded} />,
      );

      // Fill required API_KEY as a literal value; leave OPTIONAL_VAR in placeholder mode.
      const toggleButtons = screen.getAllByText("Paste value");
      fireEvent.click(toggleButtons[0]);
      const passwordInputs = screen.queryAllByPlaceholderText(/enter/i);
      fireEvent.change(passwordInputs[0], { target: { value: "secret-key" } });

      const installButton = screen.getByText("Install Server");
      fireEvent.click(installButton);

      await waitFor(() => {
        const calls = (globalThis.fetch as any).mock.calls;
        const postCall = calls.find((call: any[]) => call[0] === "/api/mcp");
        expect(postCall).toBeTruthy();
        const body = JSON.parse(postCall[1].body);
        expect(body.transport.env).toEqual({
          API_KEY: "secret-key",
          OPTIONAL_VAR: "${OPTIONAL_VAR}",
        });
      });
    });
  });

  describe("Literal mode toggling", () => {
    it("should toggle between placeholder and literal mode", () => {
      const onClose = vi.fn();
      const onServerAdded = vi.fn();

      render(
        <McpAddDialog catalogEntry={mockEntry} onClose={onClose} onServerAdded={onServerAdded} />,
      );

      // Initially should be in placeholder mode (showing ${KEY})
      const apiKeyDisplay = screen.getByText("${API_KEY}");
      expect(apiKeyDisplay).toBeTruthy();

      // Click toggle to switch to literal mode
      const toggleButtons = screen.getAllByText("Paste value");
      fireEvent.click(toggleButtons[0]);

      // After toggle, should not show the placeholder display
      expect(screen.queryByText("Reads from your shell environment")).toBeTruthy();
    });
  });
});
