import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vite-plus/test";
import { List } from "./List";
import { ScopeProvider } from "../lib/scope";

test("List renders loading state", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ScopeProvider>
        <List />
      </ScopeProvider>
    </MemoryRouter>,
  );
  expect(html).toContain("Loading your workspace");
  expect(html).toContain("animate-pulse");
});
