/* eslint-disable no-empty-pattern -- Playwright requires a destructured first fixture argument. */
import { expect, test as base, type BrowserContext } from "@playwright/test";
import { e2eBaseUrl, e2eToken, resetHome } from "./helpers.js";

const TOKEN_STORAGE_KEY = "ccs-token";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
/**
 * apps/web/index.html links Google Fonts. Answer those locally with an empty body so
 * nothing leaves the machine and the page still settles; any other origin is a failure.
 */
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const LOCAL_PROTOCOLS = new Set(["data:", "blob:", "about:"]);

type Fixtures = {
  /** Browser requests that tried to leave localhost (blocked by the backstop). */
  externalRequests: string[];
  /** Console errors/warnings and page errors collected for the current test. */
  consoleGuard: void;
  /** Declare a console message the test legitimately expects; scoped to this test only. */
  allowExpectedConsoleError: (pattern: RegExp) => void;
  resetHome: () => void;
  allowedConsole: RegExp[];
};

function isLocal(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  return LOCAL_PROTOCOLS.has(url.protocol) || LOCAL_HOSTS.has(url.hostname);
}

async function guardNetwork(context: BrowserContext, blocked: string[]): Promise<void> {
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (isLocal(url)) return route.continue();
    if (FONT_HOSTS.has(new URL(url).hostname)) return route.fulfill({ status: 200, body: "" });
    blocked.push(url);
    return route.abort("blockedbyclient");
  });
}

export const test = base.extend<Fixtures>({
  externalRequests: async ({}, use) => {
    await use([]);
  },

  // The app reads its session token from sessionStorage (written when it first sees
  // `#token=`); seeding it up front is the same state without a per-test redirect dance.
  context: async ({ context, externalRequests }, use) => {
    const token = e2eToken();
    await context.addInitScript(
      ([key, value]) => {
        if (!window.sessionStorage.getItem(key)) window.sessionStorage.setItem(key, value);
      },
      [TOKEN_STORAGE_KEY, token],
    );
    await guardNetwork(context, externalRequests);
    await use(context);
  },

  baseURL: async ({}, use) => {
    await use(e2eBaseUrl());
  },

  allowedConsole: async ({}, use) => {
    await use([]);
  },

  allowExpectedConsoleError: async ({ allowedConsole }, use) => {
    await use((pattern) => {
      allowedConsole.push(pattern);
    });
  },

  consoleGuard: [
    async ({ page, externalRequests, allowedConsole }, use) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") {
          problems.push(`console.${msg.type()}: ${msg.text()}`);
        }
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      await use();
      const unexpected = problems.filter((p) => !allowedConsole.some((re) => re.test(p)));
      expect(unexpected, "unexpected console output").toEqual([]);
      expect(externalRequests, "requests that left localhost").toEqual([]);
    },
    { auto: true },
  ],

  resetHome: async ({}, use) => {
    await use(resetHome);
  },
});

export { expect, resetHome };
