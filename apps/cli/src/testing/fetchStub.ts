import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "discover",
  "__fixtures__",
);

export type StubRoute = {
  /** Substring of the full URL, a RegExp, or a predicate over the parsed URL. */
  match: string | RegExp | ((url: URL) => boolean);
  /** A `__fixtures__/<name>.json` file name (without extension), a literal body, or a Response factory. */
  respond: { fixture: string } | { body: unknown } | ((url: URL) => Response);
  status?: number;
  headers?: Record<string, string>;
};

export class UnmatchedFetchError extends Error {
  constructor(url: string) {
    super(`fetchStub: no route matches ${url}`);
    this.name = "UnmatchedFetchError";
  }
}

function matches(route: StubRoute, url: URL): boolean {
  const { match } = route;
  if (typeof match === "string") return url.href.includes(match);
  if (match instanceof RegExp) return match.test(url.href);
  return match(url);
}

function toResponse(route: StubRoute, url: URL): Response {
  const { respond } = route;
  if (typeof respond === "function") return respond(url);
  const body =
    "fixture" in respond
      ? readFileSync(join(FIXTURES_DIR, `${respond.fixture}.json`), "utf8")
      : JSON.stringify(respond.body);
  return new Response(body, {
    status: route.status ?? 200,
    headers: { "content-type": "application/json", ...route.headers },
  });
}

/**
 * Router for the global `fetch`: first matching route wins and any unmatched URL throws,
 * so a stray network call fails the test instead of leaving the machine.
 * Usage: `vi.stubGlobal("fetch", createFetchStub(routes))`.
 */
export function createFetchStub(routes: StubRoute[]) {
  const calls: string[] = [];
  const stub = async (input: string | URL | Request): Promise<Response> => {
    const href = input instanceof Request ? input.url : String(input);
    calls.push(href);
    const url = new URL(href);
    const route = routes.find((candidate) => matches(candidate, url));
    if (!route) throw new UnmatchedFetchError(href);
    return toResponse(route, url);
  };
  return Object.assign(stub, { calls });
}
