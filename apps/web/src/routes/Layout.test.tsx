import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vite-plus/test";
import { ThemeProvider } from "../lib/theme";
import { ScopeProvider } from "../lib/scope";
import { Layout } from "./Layout";

function renderLayout(path: string) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <ScopeProvider>
          <Layout />
        </ScopeProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

test("Layout on home route omits the sidebar aside", () => {
  const html = renderLayout("/user");
  expect(html).not.toContain("<aside");
});

test("Layout on settings, claude-md, and workspace routes omits the sidebar aside", () => {
  expect(renderLayout("/user/settings")).not.toContain("<aside");
  expect(renderLayout("/user/claude-md")).not.toContain("<aside");
  expect(renderLayout("/workspace")).not.toContain("<aside");
});

test("Layout on file routes renders the sidebar aside", () => {
  const html = renderLayout("/user/skills/some-skill");
  expect(html).toContain("<aside");
});
