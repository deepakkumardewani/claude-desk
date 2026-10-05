import type { DiscoveredItem } from "schema";
import { parseFrontmatter } from "./frontmatter";

/**
 * Client-side mirror of the CLI's `convertItem` (apps/cli/src/discover/convert.ts, spec §4.3),
 * used only for the drawer's "Converted preview". Keep the two in sync; the CLI output is
 * what actually gets installed.
 */
const INPUT_PLACEHOLDER_RE = /\$\{input:[^}]*\}/g;
const FIRST_SENTENCE_RE = /^(.+?[.!?])(?:\s|$)/;
const MAX_FALLBACK_DESCRIPTION = 200;

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, "$2");

function firstSentence(body: string): string | undefined {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  if (!line) return undefined;
  const sentence = FIRST_SENTENCE_RE.exec(line)?.[1] ?? line;
  return sentence.length <= MAX_FALLBACK_DESCRIPTION ? sentence : undefined;
}

const header = (fields: Record<string, string | undefined>) =>
  `---\n${Object.entries(fields)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${k}: ${v.replace(/\s+/g, " ").trim()}`)
    .join("\n")}\n---\n\n`;

export function convertedPreview(item: DiscoveredItem, content: string, repo: string): string {
  const { data, body, hasFrontmatter } = parseFrontmatter(content);
  const described = data.description ? unquote(data.description) : undefined;
  const name = item.name.toLowerCase();
  if (item.convertsTo === "command") {
    const text = body.replace(INPUT_PLACEHOLDER_RE, "$ARGUMENTS");
    return described ? `${header({ description: described })}${text}` : text;
  }
  const fallback = hasFrontmatter ? firstSentence(body) : undefined;
  if (item.convertsTo === "agent") {
    const description = described ?? fallback ?? `Agent converted from ${repo}`;
    return `${header({ name, description })}${body}`;
  }
  const scope = data.applyTo || data.globs;
  const description = [
    described ?? fallback ?? `Project rules from ${repo}`,
    scope ? `Applies to: ${unquote(scope)}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return `${header({ name, description })}${body}`;
}
