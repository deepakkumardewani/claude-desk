import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENV_GITHUB_API_BASE,
  ENV_GITHUB_RAW_BASE,
  ENV_SKILLS_SH_URL,
  STUB_HOST,
} from "../../constants.js";

/**
 * Responses served by the stub. Every payload is derived from the recorded captures in
 * apps/cli/src/discover/__fixtures__, never hand-invented shapes; the tree is narrowed to a
 * single recorded file so every raw fetch the scan and install make has a recorded answer.
 */

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "apps",
  "cli",
  "src",
  "discover",
  "__fixtures__",
);

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as T;
}

/** Path prefixes that tell the three emulated services apart on one port. */
export const STUB_PREFIX = {
  githubApi: "/github-api",
  githubRaw: "/github-raw",
  skillsSh: "/skills-sh/api/search",
} as const;

export const STUB_OWNER = "anthropics";
export const STUB_REPO = "skills";
/** The one skill the narrowed tree exposes. */
export const STUB_SKILL_PATH = "skills/skill-creator/SKILL.md";
export const STUB_SKILL_NAME = "skill-creator";

const RATE_LIMIT_REMAINING = "4999";
/** Fixed far-future epoch seconds so the reset time never depends on the clock. */
const RATE_LIMIT_RESET = "1893456000";

export const RATE_LIMIT_HEADERS = {
  "x-ratelimit-remaining": RATE_LIMIT_REMAINING,
  "x-ratelimit-reset": RATE_LIMIT_RESET,
} as const;

type RepoMetaFixture = {
  description: string;
  stargazers_count: number;
  default_branch: string;
  html_url: string;
  commitSha: string;
};
type TreeEntry = { path: string; type: string; sha: string; size?: number };
type TreeFixture = { sha: string; tree: TreeEntry[]; truncated: boolean };
type RawFixture = { content: string };

const meta = readFixture<RepoMetaFixture>("github-repo-meta.json");
const fullTree = readFixture<TreeFixture>("github-tree.json");
const rawSkill = readFixture<RawFixture>("raw-skill-md.json");
const skillsShSearch = readFixture<Record<string, unknown>>("skills-sh-search.json");

const KEPT_TREE_PATHS = new Set(["skills", "skills/skill-creator", STUB_SKILL_PATH]);

/** Full commit SHA the recorded `main` resolved to; installs are pinned to it. */
export const STUB_COMMIT_SHA = meta.commitSha;

export const repoMetaPayload = {
  description: meta.description,
  stargazers_count: meta.stargazers_count,
  default_branch: meta.default_branch,
  html_url: meta.html_url,
};

export const treePayload: TreeFixture = {
  sha: fullTree.sha,
  tree: fullTree.tree.filter((entry) => KEPT_TREE_PATHS.has(entry.path)),
  truncated: false,
};

export const rawSkillContent = rawSkill.content;

export const skillsShSearchPayload = skillsShSearch;

/** Environment for the CLI child so Discover talks to the stub on `port` (loopback only). */
export function stubEnv(port: number): Record<string, string> {
  const base = `http://${STUB_HOST}:${port}`;
  return {
    [ENV_GITHUB_API_BASE]: `${base}${STUB_PREFIX.githubApi}`,
    [ENV_GITHUB_RAW_BASE]: `${base}${STUB_PREFIX.githubRaw}`,
    [ENV_SKILLS_SH_URL]: `${base}${STUB_PREFIX.skillsSh}`,
  };
}
