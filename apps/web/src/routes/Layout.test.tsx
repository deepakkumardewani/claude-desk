import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vite-plus/test";
import { ThemeProvider } from "../lib/theme";
import { ScopeProvider } from "../lib/scope";
import { Layout } from "./Layout";

function renderLayout(path: string) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <ScopeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Layout />
        </MemoryRouter>
      </ScopeProvider>
    </ThemeProvider>,
  );
}

test("Layout on home route omits the sidebar aside", () => {
  const html = renderLayout("/");
  expect(html).not.toContain("<aside");
});

test("Layout on settings, claude-md, and workspace routes omits the sidebar aside", () => {
  expect(renderLayout("/settings")).not.toContain("<aside");
  expect(renderLayout("/claude-md")).not.toContain("<aside");
  expect(renderLayout("/workspace")).not.toContain("<aside");
});

test("Layout on file routes renders the sidebar aside", () => {
  const html = renderLayout("/skills/some-skill");
  expect(html).toContain("<aside");
});
