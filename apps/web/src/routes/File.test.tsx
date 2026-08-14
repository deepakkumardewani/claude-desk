// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, test, vi } from "vite-plus/test";
import * as api from "../lib/api";
import { ScopeProvider } from "../lib/scope";
import { File } from "./File";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, fetchFile: vi.fn() };
});

vi.mock("../lib/theme", () => ({
  useTheme: () => ({ theme: "light" as const, setTheme: () => {}, toggle: () => {} }),
}));

afterEach(() => {
  cleanup();
});

function renderFileAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/:segment/*",
        element: (
          <ScopeProvider>
            <File />
          </ScopeProvider>
        ),
      },
    ],
    {
      initialEntries: [path],
    },
  );
  return render(<RouterProvider router={router} />);
}

test("plugin file shows View only badge", async () => {
  vi.mocked(api.fetchFile).mockResolvedValue({
    category: "plugins",
    name: "my-plugin.md",
    content: "Plugin description here",
  });

  renderFileAt("/plugins/my-plugin.md");

  await waitFor(() => {
    expect(screen.getByText("View only")).toBeTruthy();
  });
});

test("plugin file has no save button", async () => {
  vi.mocked(api.fetchFile).mockResolvedValue({
    category: "plugins",
    name: "my-plugin.md",
    content: "Plugin description here",
  });

  renderFileAt("/plugins/my-plugin.md");

  await waitFor(() => {
    expect(screen.getByText("View only")).toBeTruthy();
  });
  expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
});

test("command file derives title from filename", async () => {
  vi.mocked(api.fetchFile).mockResolvedValue({
    category: "commands",
    name: "build-phases.md",
    content: "Content without frontmatter",
  });

  renderFileAt("/commands/build-phases.md");

  await waitFor(() => {
    expect(screen.getByText("Build Phases")).toBeTruthy();
  });
});

test("agent file derives title from filename", async () => {
  vi.mocked(api.fetchFile).mockResolvedValue({
    category: "agents",
    name: "my-custom-agent.md",
    content: "Content without frontmatter",
  });

  renderFileAt("/agents/my-custom-agent.md");

  await waitFor(() => {
    expect(screen.getByText("My Custom Agent")).toBeTruthy();
  });
});
