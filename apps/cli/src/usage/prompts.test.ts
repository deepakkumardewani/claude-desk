import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { useTempHome } from "../testing/tempHomeHooks.js";
import { extractPromptText, loadPromptEntries, parseTranscriptForPrompts } from "./prompts.js";

const line = (entry: unknown): string => JSON.stringify(entry);
const OPTIONS = { sessionId: "sess-1", projectOverride: "proj" };

describe("extractPromptText", () => {
  it("returns plain string content, collapsing newlines", () => {
    expect(extractPromptText("fix\n\nthe bug")).toBe("fix the bug");
  });

  it("reads the first text block of array content", () => {
    expect(
      extractPromptText([
        { type: "image" },
        { type: "text", text: "hello" },
        { type: "text", text: "ignored" },
      ]),
    ).toBe("hello");
  });

  it.each([
    "<system-reminder>x</system-reminder>",
    "  <command-name>/clear</command-name>",
    "[Request interrupted by user]",
    "This session is being continued from a previous one",
    "Base directory for this skill: /x",
  ])("filters synthetic text %s", (text) => {
    expect(extractPromptText(text)).toBeNull();
    expect(extractPromptText([{ type: "text", text }])).toBeNull();
  });

  it("keeps a real prompt that begins with an image reference", () => {
    expect(extractPromptText("[Image #4] make it blue")).toBe("[Image #4] make it blue");
  });

  it("returns null for empty, text-less or unsupported content", () => {
    expect(extractPromptText("   \n ")).toBeNull();
    expect(extractPromptText([{ type: "tool_result" }])).toBeNull();
    expect(extractPromptText([{ type: "text", text: "" }])).toBeNull();
    expect(extractPromptText(42)).toBeNull();
    expect(extractPromptText(undefined)).toBeNull();
  });

  it("truncates to maxLen with an ellipsis", () => {
    expect(extractPromptText("abcdefghij", 5)).toBe("abcd…");
    expect(extractPromptText("abcde", 5)).toBe("abcde");
  });
});

describe("parseTranscriptForPrompts", () => {
  it("parses user prompts, costed assistant turns and links across models and dates", () => {
    const content = [
      line({
        type: "user",
        uuid: "u1",
        parentUuid: null,
        timestamp: "2026-07-14T10:00:00.000Z",
        message: { content: "first prompt" },
      }),
      line({
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        message: {
          model: "claude-opus-4-1-20250805",
          usage: { input_tokens: 1000, output_tokens: 500 },
        },
      }),
      line({
        type: "assistant",
        uuid: "a2",
        parentUuid: "a1",
        message: {
          model: "claude-haiku-4-5-20251001",
          usage: { input_tokens: 1000, output_tokens: 500 },
        },
      }),
      line({ type: "user", uuid: "u2", parentUuid: "a2", message: {} }),
      line({ type: "attachment", uuid: "l1", parentUuid: "u2" }),
      line({
        type: "user",
        uuid: "u3",
        parentUuid: "l1",
        timestamp: "2026-07-15T10:00:00.000Z",
        message: { content: "<system-reminder>x" },
      }),
    ].join("\n");

    const entries = parseTranscriptForPrompts(content, OPTIONS);
    expect(entries.map((entry) => entry.type)).toEqual([
      "user",
      "assistant",
      "assistant",
      "link",
      "link",
      "user",
    ]);
    expect(entries[0]).toMatchObject({
      uuid: "u1",
      parentUuid: null,
      sessionId: "sess-1",
      project: "proj",
      text: "first prompt",
      date: expect.stringMatching(/^2026-07-1[34]$/),
    });
    const [, opus, haiku] = entries;
    // Different models must be priced differently for identical token counts.
    expect((opus as { cost: number }).cost).toBeGreaterThan(0);
    expect((opus as { cost: number }).cost).not.toBe((haiku as { cost: number }).cost);
    expect(entries[5]).toMatchObject({ type: "user", text: null });
  });

  it("uses an unknown date when the timestamp is missing and skips assistant without usage or uuid", () => {
    const content = [
      line({ type: "user", uuid: "u", message: { content: "hi" } }),
      line({ type: "assistant", message: { model: "m" } }),
      line({ type: "system" }),
    ].join("\n");
    const entries = parseTranscriptForPrompts(content, OPTIONS);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ date: "unknown", timestampMs: 0 });
  });

  it("defaults missing token fields to zero cost-safe values", () => {
    const entries = parseTranscriptForPrompts(
      line({ type: "assistant", uuid: "a", message: { usage: {} } }),
      OPTIONS,
    );
    expect(entries[0]).toMatchObject({ type: "assistant", uuid: "a", parentUuid: null });
  });

  it("skips malformed JSON, blank lines and non-object JSON without throwing", () => {
    const content = [
      "{not json",
      "",
      "   ",
      "null",
      "42",
      line({ type: "user", uuid: "ok", message: { content: "kept" } }),
    ].join("\n");
    const parse = () => parseTranscriptForPrompts(content, OPTIONS);
    expect(parse).not.toThrow();
    expect(parse()).toHaveLength(1);
  });
});

describe("loadPromptEntries", () => {
  const home = useTempHome();

  it("returns [] with no transcripts", async () => {
    expect(await loadPromptEntries()).toEqual([]);
  });

  it("merges entries from every transcript in the temp HOME and skips unreadable ones", async () => {
    const projects = join(home().claudeDir, "projects");
    await mkdir(join(projects, "proj-a"), { recursive: true });
    await mkdir(join(projects, "proj-b"), { recursive: true });
    await writeFile(
      join(projects, "proj-a", "s1.jsonl"),
      line({ type: "user", uuid: "a", message: { content: "from a" }, cwd: "/work/alpha" }),
    );
    await writeFile(
      join(projects, "proj-b", "s2.jsonl"),
      `${line({ type: "user", uuid: "b", message: { content: "from b" } })}\n{broken`,
    );
    // A directory named like a transcript is listed but cannot be read as a file.
    await mkdir(join(projects, "proj-b", "bad.jsonl"));

    const entries = await loadPromptEntries();
    const texts = entries
      .map((entry) => (entry.type === "user" ? entry.text : null))
      .sort((a, b) => String(a).localeCompare(String(b)));
    expect(texts).toEqual(["from a", "from b"]);
  });
});
