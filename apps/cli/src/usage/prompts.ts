import { readFile } from "node:fs/promises";
import {
  calculateCost,
  extractTimestampMs,
  localDateString,
  resolveSessionProjectName,
  type TranscriptEntry,
} from "./parser.js";
import { listTranscriptFiles } from "./transcriptFiles.js";

/**
 * Synthetic system/tool envelopes Claude Code writes into the transcript that
 * should never be surfaced as a "prompt" (slash commands, tool output, reminders).
 */
const SYSTEM_TEXT_PREFIXES = [
  "<local-command",
  "<bash-stdout",
  "<bash-input",
  "<bash-stderr",
  "<command-name",
  "<command-message",
  "<system-reminder",
  "<user-prompt",
  "<task-notification",
  "<task-update",
  "[Request interrupted",
  "[Image: source",
  "[Image source",
  // Auto-generated caption Claude Code inserts alongside a downscaled pasted
  // image (e.g. "[Image: original 1280x3589, displayed at ... ]") — not
  // something the user typed. Distinct from "[Image #4] <real instructions>",
  // which is left alone.
  "[Image: original",
  "This session is being continued",
  // Skill / subagent injections written into the transcript as user turns.
  "Base directory for this skill",
  "Launching skill:",
  "You are a **thin orchestrator**",
];

function isSystemText(text: string): boolean {
  return SYSTEM_TEXT_PREFIXES.some((prefix) => text.startsWith(prefix));
}

interface ContentTextBlock {
  type?: string;
  text?: string;
}

/**
 * Pull a readable prompt out of a stored user message's `content`, skipping
 * synthetic system/tool envelopes. Returns null when nothing user-authored is found.
 */
export function extractPromptText(content: unknown, maxLen = 200): string | null {
  let text: string;

  if (typeof content === "string") {
    if (isSystemText(content.trimStart())) return null;
    text = content;
  } else if (Array.isArray(content)) {
    const block = (content as ContentTextBlock[]).find((b) => b.type === "text");
    if (!block?.text) return null;
    if (isSystemText(block.text.trimStart())) return null;
    text = block.text;
  } else {
    return null;
  }

  text = text.replace(/\n+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

interface FullTranscriptEntry extends TranscriptEntry {
  uuid?: string;
  parentUuid?: string;
}

export interface PromptUserEntry {
  type: "user";
  uuid: string | null;
  parentUuid: string | null;
  timestampMs: number;
  date: string;
  project: string;
  sessionId: string;
  text: string | null;
}

export interface PromptAssistantEntry {
  type: "assistant";
  uuid: string | null;
  parentUuid: string | null;
  cost: number;
}

/**
 * Non-prompt, non-costed entry (tool results without text, attachments,
 * thinking-only assistant turns, etc). Kept only so `computePrompts` can walk
 * parentUuid chains through them without the links going dark — a prompt's
 * actual assistant reply is often several of these hops away, not a direct
 * child, once tool calls are involved.
 */
export interface PromptLinkEntry {
  type: "link";
  uuid: string | null;
  parentUuid: string | null;
}

export type PromptEntry = PromptUserEntry | PromptAssistantEntry | PromptLinkEntry;

function extractDate(timestamp: string | undefined): string {
  const ms = extractTimestampMs(timestamp);
  return ms > 0 ? localDateString(ms) : "unknown";
}

/**
 * Parse user prompts and assistant cost from a single transcript's raw content.
 * Unlike `parseTranscriptContent`, this keeps user turns and does not dedupe —
 * prompts are read fresh so a just-finished turn always shows up.
 */
export function parseTranscriptForPrompts(
  content: string,
  { sessionId, projectOverride }: { sessionId: string; projectOverride: string },
): PromptEntry[] {
  const entries: PromptEntry[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const e = entry as FullTranscriptEntry;
    const uuid = e.uuid ?? null;
    const parentUuid = e.parentUuid ?? null;

    if (e.type === "user") {
      const content = (e.message as unknown as { content?: unknown } | undefined)?.content;
      if (content === undefined) {
        entries.push({ type: "link", uuid, parentUuid });
        continue;
      }
      entries.push({
        type: "user",
        uuid,
        parentUuid,
        timestampMs: extractTimestampMs(e.timestamp),
        date: extractDate(e.timestamp),
        project: projectOverride,
        sessionId,
        text: extractPromptText(content),
      });
    } else if (e.type === "assistant" && e.message?.usage) {
      const usage = e.message.usage;
      entries.push({
        type: "assistant",
        uuid,
        parentUuid,
        cost: calculateCost(
          e.message.model ?? "",
          usage.input_tokens ?? 0,
          usage.output_tokens ?? 0,
          usage.cache_read_input_tokens ?? 0,
          usage.cache_creation_input_tokens ?? 0,
        ),
      });
    } else if (uuid) {
      entries.push({ type: "link", uuid, parentUuid });
    }
  }

  return entries;
}

/**
 * Load every prompt/assistant-cost entry across all transcripts. Intentionally
 * uncached — prompts should reflect the very latest turn on every request.
 */
export async function loadPromptEntries(): Promise<PromptEntry[]> {
  const files = await listTranscriptFiles();
  const perFile = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await readFile(file.path, "utf-8");
        return parseTranscriptForPrompts(content, {
          sessionId: file.sessionId,
          projectOverride: resolveSessionProjectName(content, file.project),
        });
      } catch {
        return [];
      }
    }),
  );
  return perFile.flat();
}
