import {
  SKILLS_SH_MAX_LIMIT,
  skillsShSearchResponseSchema,
  type DiscoveredItem,
  type SkillsShResult,
} from "schema";
import { skillsShSearchUrl } from "./endpoints.js";
import { DiscoverError } from "./errors.js";
import { scanRepo, type ScanResult } from "./github.js";

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 8_000;

export type SkillsShSearchError = "SHORT_QUERY" | "SKILLS_SH_SCHEMA" | "SKILLS_SH_UNREACHABLE";

export type SkillsShSearchOutcome = { results: SkillsShResult[] } | { error: SkillsShSearchError };

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), SKILLS_SH_MAX_LIMIT);
}

/**
 * Proxies the unauthenticated skills.sh search (spec D1). Expected failures are
 * returned as values so the route can map them to 400/502 without try/catch.
 */
export async function searchSkillsSh(
  q: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SkillsShSearchOutcome> {
  const query = q.trim();
  if (query.length < MIN_QUERY_LENGTH) return { error: "SHORT_QUERY" };

  const cap = clampLimit(limit);
  const url = `${skillsShSearchUrl()}?${new URLSearchParams({ q: query, limit: String(cap) })}`;

  let body: unknown;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "claude-desk" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return { error: "SKILLS_SH_UNREACHABLE" };
    body = await res.json();
  } catch (cause) {
    // A JSON parse failure means the endpoint answered with something other than the contract.
    if (cause instanceof SyntaxError) return { error: "SKILLS_SH_SCHEMA" };
    return { error: "SKILLS_SH_UNREACHABLE" };
  }

  const parsed = skillsShSearchResponseSchema.safeParse(body);
  if (!parsed.success) return { error: "SKILLS_SH_SCHEMA" };
  return { results: parsed.data.skills.slice(0, cap) };
}

export type ResolvedSkill = { repo: ScanResult["repo"]; item: DiscoveredItem };

/** Marketplace plugins nest their skills under `payload.children`; those are still resolvable. */
function allSkills(items: DiscoveredItem[]): DiscoveredItem[] {
  return items.flatMap((item) => {
    if (item.kind === "skill") return [item];
    const children = (item.payload as { children?: DiscoveredItem[] } | undefined)?.children;
    return item.kind === "plugin" && Array.isArray(children) ? allSkills(children) : [];
  });
}

const lastSegment = (path: string) => path.split("/").at(-1);

/**
 * Splits a skills.sh id (`<owner>/<repo>/<skillId>`, see skillsShResultSchema)
 * into its repo and skill parts. The id is self-describing, so no re-search is needed.
 */
function parseSkillsShId(id: string): { source: string; skillId: string } {
  const [owner, repo, ...rest] = id.split("/");
  const skillId = rest.join("/");
  if (!owner || !repo || !skillId) {
    throw new DiscoverError("BAD_INPUT", "skills.sh id must look like <owner>/<repo>/<skillId>");
  }
  return { source: `${owner}/${repo}`, skillId };
}

/**
 * Resolves a skills.sh hit to the live skill in its GitHub repo (scanned at HEAD).
 * Matches the skill folder name first, then the SKILL.md frontmatter name.
 */
export async function resolveSkillsShItem(id: string): Promise<ResolvedSkill> {
  const { source, skillId } = parseSkillsShId(id);
  const scan = await scanRepo(source);
  const skills = allSkills(scan.items);
  const item =
    skills.find((candidate) => lastSegment(candidate.path) === skillId) ??
    skills.find((candidate) => candidate.name === skillId);
  if (!item) {
    throw new DiscoverError("SKILL_NOT_FOUND", `${skillId} is no longer in ${source}`);
  }
  return { repo: scan.repo, item };
}
