import type { DiscoveredItem, TrustFinding } from "schema";
import { parseFrontmatter } from "./detect.js";
import { DiscoverError } from "./errors.js";

export type ConvertTarget = NonNullable<DiscoveredItem["convertsTo"]>;

export type ConvertedItem = {
  convertsTo: ConvertTarget;
  /** `[a-z0-9._-]` slug used as the installed name. */
  slug: string;
  /** Path under the category dir: `<slug>/SKILL.md` (skills) or `<slug>.md`. */
  relativePath: string;
  content: string;
  findings: TrustFinding[];
};

export type ConvertOptions = {
  /** Repo name for the "Project rules from <repo>" description fallback. */
  repo?: string;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const INPUT_PLACEHOLDER_RE = /\$\{input:[^}]*\}/g;
const SLUG_INVALID = /[^a-z0-9._-]+/g;
const SLUG_EDGES = /^[.-]+|-+$/g;
const FIRST_SENTENCE_RE = /^(.+?[.!?])(?:\s|$)/;
const MAX_FALLBACK_DESCRIPTION = 200;
const ARGUMENTS_PLACEHOLDER = "$ARGUMENTS";

const slugify = (raw: string) =>
  raw.toLowerCase().replace(SLUG_INVALID, "-").replace(SLUG_EDGES, "");

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

function splitFrontmatter(content: string): { hasFrontmatter: boolean; body: string } {
  const match = FRONTMATTER_RE.exec(content);
  return match
    ? { hasFrontmatter: true, body: content.slice(match[0].length) }
    : { hasFrontmatter: false, body: content };
}

/** First prose sentence of the body, skipping blank lines and markdown headings. */
function firstSentence(body: string): string | undefined {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  if (!line) return undefined;
  const sentence = FIRST_SENTENCE_RE.exec(line)?.[1] ?? line;
  return sentence.length <= MAX_FALLBACK_DESCRIPTION ? sentence : undefined;
}

function frontmatterBlock(fields: Record<string, string | undefined>): string {
  const lines = Object.entries(fields)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    // JSON strings are valid YAML double-quoted scalars, so quoting/escaping stays safe.
    .map(([key, value]) => `${key}: ${JSON.stringify(oneLine(value))}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

function appliesTo(meta: Record<string, string>): string | undefined {
  const scope = meta.applyTo || meta.globs;
  return scope ? `Applies to: ${scope}` : undefined;
}

function convertRule(item: DiscoveredItem, content: string, options: ConvertOptions) {
  const { hasFrontmatter, body } = splitFrontmatter(content);
  const meta = parseFrontmatter(content);
  // A bare file (e.g. .cursorrules) has no structured description, so its first line is a rule,
  // not a summary: only structured files get the first-sentence fallback.
  const description =
    meta.description ||
    (hasFrontmatter ? firstSentence(body) : undefined) ||
    `Project rules from ${options.repo ?? item.name}`;
  const slug = slugify(item.name);
  const full = [description, appliesTo(meta)].filter(Boolean).join(" ");
  return {
    slug,
    relativePath: `${slug}/SKILL.md`,
    content: `${frontmatterBlock({ name: slug, description: full })}\n${body}`,
    findings: [] as TrustFinding[],
  };
}

function convertPrompt(item: DiscoveredItem, content: string) {
  const { body } = splitFrontmatter(content);
  const { description } = parseFrontmatter(content);
  const slug = slugify(item.name);
  const header = description ? `${frontmatterBlock({ description })}\n` : "";
  return {
    slug,
    relativePath: `${slug}.md`,
    content: `${header}${body.replace(INPUT_PLACEHOLDER_RE, ARGUMENTS_PLACEHOLDER)}`,
    findings: [] as TrustFinding[],
  };
}

function convertAgent(item: DiscoveredItem, content: string, options: ConvertOptions) {
  const { hasFrontmatter, body } = splitFrontmatter(content);
  const meta = parseFrontmatter(content);
  const slug = slugify(item.name);
  const description =
    meta.description ||
    (hasFrontmatter ? firstSentence(body) : undefined) ||
    `Agent converted from ${options.repo ?? item.name}`;
  const findings: TrustFinding[] =
    "tools" in meta
      ? [
          {
            itemId: item.id,
            severity: "info",
            rule: "allowed-tools",
            message: `Source tools (${meta.tools || "list"}) were dropped: Copilot and Claude Code tool vocabularies differ. The converted agent inherits default tools; review before use.`,
            file: item.path,
          },
        ]
      : [];
  return {
    slug,
    relativePath: `${slug}.md`,
    content: `${frontmatterBlock({ name: slug, description })}\n${body}`,
    findings,
  };
}

/** Spec §4.3: converts one Cursor/Copilot file into its Claude Code form (pure; no I/O). */
export function convertItem(
  item: DiscoveredItem,
  content: string,
  options: ConvertOptions = {},
): ConvertedItem {
  if (item.kind !== "convertible" || !item.convertsTo) {
    throw new DiscoverError("BAD_INPUT", `"${item.name}" is not a convertible item`);
  }
  const { convertsTo } = item;
  const converted =
    convertsTo === "skill"
      ? convertRule(item, content, options)
      : convertsTo === "command"
        ? convertPrompt(item, content)
        : convertAgent(item, content, options);
  if (!converted.slug) {
    throw new DiscoverError("BAD_INPUT", `"${item.name}" has no installable characters`);
  }
  return { convertsTo, ...converted };
}
