/**
 * Static trust analyzer for discovered items (spec §4.5).
 *
 * Known limitations (deterministic regex only, plan §6): obfuscated pipe-to-shell
 * (variable indirection, base64, `sh <(curl ...)`) and invisible characters outside the
 * scanned Unicode ranges are NOT caught. Findings are a review aid, not a security guarantee.
 */
import type { DiscoveredItem, TrustFinding, TrustRule } from "schema";

const SCRIPT_EXT_RE = /\.(sh|bash|zsh|py|js|mjs|ts|rb|ps1)$/i;
const CHARS_PER_TOKEN = 4;
const EVIDENCE_MAX = 200;

/** Zero-width (U+200B-200F, U+2060-2064, U+FEFF), bidi (U+202A-202E, U+2066-2069), tag chars. */
const HIDDEN_CHAR_RE = /[​-‏⁠-⁤﻿‪-‮⁦-⁩\u{E0000}-\u{E007F}]/gu;
const PIPE_TO_SHELL_RE = /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/;
const EVAL_CURL_RE = /\beval\s+["']?\$\(\s*(?:curl|wget)\b/;
const NETWORK_RE = /\b(?:curl|wget)\b|\bfetch\(|https?:\/\//;
const DESTRUCTIVE_RE =
  /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|\bgit\s+push\b[^\n]*--force|\bchmod\s+(?:-R\s+)?777\b|\bsudo\b/;
const ENV_PLACEHOLDER_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const BROAD_PERMISSIONS = new Set(["Bash", "Bash(*)", "*"]);

export type TrustFiles = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

export const estimateTokens = (chars: number): number => Math.ceil(chars / CHARS_PER_TOKEN);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const lookup = (files: TrustFiles, path: string): string | undefined =>
  files instanceof Map ? files.get(path) : (files as Record<string, string>)[path];

const clip = (text: string): string => {
  const trimmed = text.trim();
  return trimmed.length > EVIDENCE_MAX ? `${trimmed.slice(0, EVIDENCE_MAX)}…` : trimmed;
};

/** Makes invisible characters visible so the evidence is reviewable. */
const revealHidden = (line: string): string =>
  line.replace(HIDDEN_CHAR_RE, (char) => {
    const hex = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
    return `<U+${hex}>`;
  });

type Source = { file?: string; text: string };

function finding(
  item: DiscoveredItem,
  severity: TrustFinding["severity"],
  rule: TrustRule,
  message: string,
  extra: Partial<Pick<TrustFinding, "file" | "line" | "evidence">> = {},
): TrustFinding {
  return { itemId: item.id, severity, rule, message, ...extra };
}

function itemFileSources(item: DiscoveredItem, files: TrustFiles): Source[] {
  return item.files.flatMap((ref) => {
    const text = lookup(files, ref.path);
    return text === undefined ? [] : [{ file: ref.path, text }];
  });
}

/** Hook commands and MCP launch strings that live in the payload rather than in files. */
function payloadCommands(item: DiscoveredItem): string[] {
  const payload = item.payload;
  if (!isRecord(payload)) return [];
  if (item.kind === "hook" && Array.isArray(payload.hooks)) {
    return payload.hooks.flatMap((hook) =>
      isRecord(hook) && typeof hook.command === "string" ? [hook.command] : [],
    );
  }
  if (item.kind === "mcp" && typeof payload.command === "string") {
    const args = Array.isArray(payload.args) ? payload.args.map(String) : [];
    return [[payload.command, ...args].join(" ")];
  }
  return [];
}

/** Everything executable: bundled script files plus hook / MCP commands. */
function executableSources(item: DiscoveredItem, files: TrustFiles): Source[] {
  const scripts = itemFileSources(item, files).filter((s) => SCRIPT_EXT_RE.test(s.file ?? ""));
  return [...scripts, ...payloadCommands(item).map((text) => ({ text }))];
}

function firstLineMatching(
  text: string,
  re: RegExp,
): { line: number; evidence: string } | undefined {
  const lines = text.split(/\r\n|\r|\n/);
  const index = lines.findIndex((l) => re.test(l));
  return index === -1 ? undefined : { line: index + 1, evidence: clip(lines[index]) };
}

function hiddenUnicode(item: DiscoveredItem, files: TrustFiles): TrustFinding[] {
  const sources: Source[] = [...itemFileSources(item, files)];
  if (item.payload !== undefined) sources.push({ text: JSON.stringify(item.payload) ?? "" });
  return sources.flatMap(({ file, text }) =>
    text.split(/\r\n|\r|\n/).flatMap((line, index) => {
      HIDDEN_CHAR_RE.lastIndex = 0;
      if (!HIDDEN_CHAR_RE.test(line)) return [];
      return [
        finding(
          item,
          "danger",
          "hidden-unicode",
          "Contains hidden or bidirectional Unicode characters",
          {
            file,
            line: index + 1,
            evidence: clip(revealHidden(line)),
          },
        ),
      ];
    }),
  );
}

function pipeToShell(item: DiscoveredItem, files: TrustFiles): TrustFinding[] {
  const sources: Source[] = [
    ...itemFileSources(item, files),
    ...payloadCommands(item).map((text) => ({ text })),
  ];
  return sources.flatMap(({ file, text }) =>
    text.split(/\r\n|\r|\n/).flatMap((line, index) =>
      PIPE_TO_SHELL_RE.test(line) || EVAL_CURL_RE.test(line)
        ? [
            finding(
              item,
              "danger",
              "pipe-to-shell",
              "Downloads and executes remote code without review",
              {
                file,
                line: index + 1,
                evidence: clip(line),
              },
            ),
          ]
        : [],
    ),
  );
}

function broadPermission(item: DiscoveredItem): TrustFinding[] {
  const payload = item.payload;
  if (item.kind !== "setting" || !isRecord(payload)) return [];
  const { key, value } = payload;
  const out: TrustFinding[] = [];
  if (key === "permissions" && isRecord(value) && Array.isArray(value.allow)) {
    for (const entry of value.allow) {
      if (typeof entry === "string" && BROAD_PERMISSIONS.has(entry.trim())) {
        out.push(
          finding(
            item,
            "danger",
            "broad-permission",
            "Allows unrestricted tool use without prompting",
            {
              evidence: `permissions.allow: ${entry}`,
            },
          ),
        );
      }
    }
  }
  const mode = key === "defaultMode" ? value : isRecord(value) ? value.defaultMode : undefined;
  if (mode === "bypassPermissions") {
    out.push(
      finding(item, "danger", "broad-permission", "Disables all permission prompts", {
        evidence: 'defaultMode: "bypassPermissions"',
      }),
    );
  }
  return out;
}

function runsCommand(item: DiscoveredItem): TrustFinding[] {
  return payloadCommands(item).map((command) =>
    finding(item, "caution", "runs-command", `Runs a command on your machine: ${clip(command)}`, {
      evidence: command,
    }),
  );
}

function bundledScript(item: DiscoveredItem): TrustFinding[] {
  return item.files
    .filter((ref) => SCRIPT_EXT_RE.test(ref.path))
    .map((ref) =>
      finding(item, "caution", "bundled-script", "Bundles an executable script", {
        file: ref.path,
      }),
    );
}

function network(item: DiscoveredItem, files: TrustFiles): TrustFinding[] {
  const out = executableSources(item, files).flatMap(({ file, text }) => {
    const hit = firstLineMatching(text, NETWORK_RE);
    return hit
      ? [finding(item, "caution", "network", "Makes network requests", { file, ...hit })]
      : [];
  });
  const payload = item.payload;
  if (item.kind === "mcp" && isRecord(payload) && typeof payload.url === "string") {
    out.push(
      finding(item, "caution", "network", "Connects to a remote MCP server", {
        evidence: payload.url,
      }),
    );
  }
  return out;
}

function destructive(item: DiscoveredItem, files: TrustFiles): TrustFinding[] {
  return executableSources(item, files).flatMap(({ file, text }) => {
    const hit = firstLineMatching(text, DESTRUCTIVE_RE);
    return hit
      ? [
          finding(item, "caution", "destructive", "Contains a destructive command", {
            file,
            ...hit,
          }),
        ]
      : [];
  });
}

/** Frontmatter block of the item's primary markdown file, if any. */
function frontmatterOf(item: DiscoveredItem, files: TrustFiles): string | undefined {
  for (const { text } of itemFileSources(item, files)) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (match && /^(?:allowed-tools|tools)\s*:/m.test(match[1])) return match[1];
  }
  return undefined;
}

function allowedTools(item: DiscoveredItem, files: TrustFiles): TrustFinding[] {
  if (item.kind !== "skill" && item.kind !== "agent") return [];
  const block = frontmatterOf(item, files);
  if (!block) return [];
  const line = block.split(/\r?\n/).findIndex((l) => /^(?:allowed-tools|tools)\s*:/.test(l));
  const grant = block.split(/\r?\n/)[line];
  return [
    finding(item, "info", "allowed-tools", "Grants tools to the model", {
      line: line + 2,
      evidence: clip(grant),
    }),
  ];
}

function envPlaceholder(item: DiscoveredItem): TrustFinding[] {
  const payload = item.payload;
  if (item.kind !== "mcp" || !isRecord(payload) || !isRecord(payload.env)) return [];
  const names = new Set<string>();
  for (const value of Object.values(payload.env)) {
    if (typeof value !== "string") continue;
    for (const match of value.matchAll(ENV_PLACEHOLDER_RE)) names.add(match[1]);
  }
  if (!names.size) return [];
  const list = [...names].join(", ");
  return [
    finding(item, "info", "env-placeholder", `Requires you to export: ${list}`, { evidence: list }),
  ];
}

function tokenCost(item: DiscoveredItem): TrustFinding[] {
  const isLoaded = item.kind === "skill" || item.kind === "agent" || item.kind === "command";
  if (!isLoaded || !item.description) return [];
  const tokens = estimateTokens(item.description.length);
  return [finding(item, "info", "token-cost", `Always-loaded description costs ~${tokens} tokens`)];
}

export function analyzeTrust(item: DiscoveredItem, files: TrustFiles): TrustFinding[] {
  return [
    ...hiddenUnicode(item, files),
    ...pipeToShell(item, files),
    ...broadPermission(item),
    ...runsCommand(item),
    ...bundledScript(item),
    ...network(item, files),
    ...destructive(item, files),
    ...allowedTools(item, files),
    ...envPlaceholder(item),
    ...tokenCost(item),
  ];
}
