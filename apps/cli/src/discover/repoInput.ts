import { DiscoverError, err, ok, type Result } from "./errors.js";

export type ParsedRepoInput = {
  owner: string;
  repo: string;
  ref?: string;
  subpath?: string;
};

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const GIT_SUFFIX = /\.git$/i;

const bad = (message: string) => err(new DiscoverError("BAD_INPUT", message));

/** Reduces any accepted input shape to the path segments after the host. */
function toSegments(input: string): Result<string[]> {
  if (/^https?:\/\//i.test(input) || /^(www\.)?github\.com\//i.test(input)) {
    const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return bad("Not a valid URL");
    }
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase()))
      return bad("Only github.com repos are supported");
    return ok(url.pathname.split("/").filter(Boolean));
  }
  return ok(input.split("/").filter(Boolean));
}

function decode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/**
 * Accepts `https://github.com/o/r`, `o/r`, `.../tree/<ref>/<subpath>`,
 * `.../blob/<ref>/<path>`, with optional trailing `.git`. Never throws.
 * A ref containing slashes is ambiguous in URLs; the first segment is taken as the ref.
 */
export function parseRepoInput(input: string): Result<ParsedRepoInput> {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return bad("Enter a GitHub repository");

  const segments = toSegments(trimmed);
  if (!segments.ok) return segments;

  const [owner, rawRepo, kind, ref, ...rest] = segments.value;
  if (!owner || !rawRepo) return bad("Expected owner/repo");

  const repo = rawRepo.replace(GIT_SUFFIX, "");
  if (!NAME_PATTERN.test(owner) || !NAME_PATTERN.test(repo) || repo === "." || repo === "..") {
    return bad("Invalid owner or repo name");
  }
  if (!kind) return ok({ owner, repo });

  if (kind !== "tree" && kind !== "blob") return bad(`Unsupported GitHub path: /${kind}`);
  const decodedRef = ref === undefined ? undefined : decode(ref);
  if (!decodedRef) return bad(`Missing ref after /${kind}/`);

  const subpath = rest.map(decode);
  if (subpath.includes(undefined)) return bad("Malformed path encoding");
  const joined = subpath.join("/");
  return ok({ owner, repo, ref: decodedRef, ...(joined ? { subpath: joined } : {}) });
}
