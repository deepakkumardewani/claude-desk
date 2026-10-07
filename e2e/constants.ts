/**
 * E2E test constants and environment variable names
 */

/** Port for the isolated E2E test server (not user's dev server) */
export const E2E_PORT = 47830;

/** Port for the GitHub/skills.sh stub server (P3.4) */
export const E2E_STUB_PORT = 47831;

/** Environment variable: Base URL for E2E tests */
export const ENV_E2E_BASE_URL = "E2E_BASE_URL";

/** Environment variable: E2E token (set by global-setup.ts from server stdout) */
export const ENV_E2E_TOKEN = "E2E_TOKEN";

/** Environment variable: GitHub API base URL override (loopback-only, P1.9) */
export const ENV_GITHUB_API_BASE = "CLAUDE_DESK_GITHUB_API_BASE";

/** Environment variable: GitHub raw content base URL override (loopback-only, P1.9) */
export const ENV_GITHUB_RAW_BASE = "CLAUDE_DESK_GITHUB_RAW_BASE";

/** Environment variable: Skills.sh URL override (loopback-only, P1.9) */
export const ENV_SKILLS_SH_URL = "CLAUDE_DESK_SKILLS_SH_URL";

/** Loopback host both the isolated server and the stub bind to. */
export const STUB_HOST = "127.0.0.1";
