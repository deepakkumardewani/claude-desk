/**
 * Lazy base-URL getters for the external services Discover talks to.
 * Env overrides exist so e2e/unit tests can point at a local stub; they are accepted
 * for loopback hosts only, so a GitHub token can never be sent to a remote override.
 */

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";
const SKILLS_SH_SEARCH_URL = "https://skills.sh/api/search";

export const GITHUB_API_BASE_VAR = "CLAUDE_DESK_GITHUB_API_BASE";
export const GITHUB_RAW_BASE_VAR = "CLAUDE_DESK_GITHUB_RAW_BASE";
export const SKILLS_SH_URL_VAR = "CLAUDE_DESK_SKILLS_SH_URL";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export class EndpointOverrideError extends Error {
  readonly variable: string;

  constructor(variable: string, reason: string) {
    super(`${variable}: ${reason}`);
    this.name = "EndpointOverrideError";
    this.variable = variable;
  }
}

function resolveEndpoint(variable: string, fallback: string): string {
  const override = process.env[variable];
  if (!override) return fallback;
  let url: URL;
  try {
    url = new URL(override);
  } catch {
    throw new EndpointOverrideError(variable, "override is not a valid URL");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new EndpointOverrideError(
      variable,
      "override must be an http(s) URL on 127.0.0.1 or localhost",
    );
  }
  return override.replace(/\/+$/, "");
}

export function githubApiBase(): string {
  return resolveEndpoint(GITHUB_API_BASE_VAR, GITHUB_API_BASE);
}

export function githubRawBase(): string {
  return resolveEndpoint(GITHUB_RAW_BASE_VAR, GITHUB_RAW_BASE);
}

export function skillsShSearchUrl(): string {
  return resolveEndpoint(SKILLS_SH_URL_VAR, SKILLS_SH_SEARCH_URL);
}
