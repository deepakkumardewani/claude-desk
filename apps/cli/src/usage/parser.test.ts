import { describe, it, expect } from "vite-plus/test";
import { parseTranscriptLine, parseTranscriptContent, PRICING_AS_OF } from "./parser.js";
import {
  validTranscriptEntry,
  validTranscriptEntry2,
  entryWithoutModel,
  entryWithoutUsage,
  entryWithCacheTokens,
  entryWithUnknownModel,
  retriedRequestEntryFirst,
  retriedRequestEntrySecond,
  entryWithoutDedupeKey,
  sampleTranscriptContent,
} from "./fixtures.js";

describe("parseTranscriptLine", () => {
  it("should parse a valid entry with usage data", () => {
    const line = JSON.stringify(validTranscriptEntry);
    const result = parseTranscriptLine(line);

    expect(result).not.toBeNull();
    expect(result?.model).toBe("claude-opus-4-1-20250805");
    expect(result?.inputTokens).toBe(12345);
    expect(result?.outputTokens).toBe(456);
    expect(result?.date).toBe("2026-07-14");
    expect(result?.project).toMatch(/cc-studio/);
    expect(result?.cost).toBeGreaterThan(0);
  });

  it("should parse a valid entry with different model", () => {
    const line = JSON.stringify(validTranscriptEntry2);
    const result = parseTranscriptLine(line);

    expect(result).not.toBeNull();
    expect(result?.model).toBe("claude-haiku-4-5-20251001");
    expect(result?.inputTokens).toBe(5000);
    expect(result?.outputTokens).toBe(200);
  });

  it("should return null for empty line", () => {
    expect(parseTranscriptLine("")).toBeNull();
    expect(parseTranscriptLine("   ")).toBeNull();
  });

  it("should return null for malformed JSON", () => {
    expect(parseTranscriptLine("{invalid json")).toBeNull();
  });

  it("should return null for non-object values", () => {
    expect(parseTranscriptLine('"string"')).toBeNull();
    expect(parseTranscriptLine("123")).toBeNull();
    expect(parseTranscriptLine("null")).toBeNull();
  });

  it("should return null for non-message type entries", () => {
    const entry = { type: "attachment", timestamp: "2026-07-14T13:45:19.137Z" };
    expect(parseTranscriptLine(JSON.stringify(entry))).toBeNull();
  });

  it("should return null for entries without model", () => {
    const line = JSON.stringify(entryWithoutModel);
    expect(parseTranscriptLine(line)).toBeNull();
  });

  it("should return null for entries without usage", () => {
    const line = JSON.stringify(entryWithoutUsage);
    expect(parseTranscriptLine(line)).toBeNull();
  });

  it("should return null for entries with non-claude models", () => {
    const entry = {
      message: {
        model: "gpt-4",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
      type: "assistant",
      timestamp: "2026-07-14T13:45:19.137Z",
      cwd: "/Users/test",
    };
    expect(parseTranscriptLine(JSON.stringify(entry))).toBeNull();
  });

  it("should return null for entries with zero tokens", () => {
    const entry = {
      message: {
        model: "claude-opus-4-1",
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      type: "assistant",
      timestamp: "2026-07-14T13:45:19.137Z",
      cwd: "/Users/test",
    };
    expect(parseTranscriptLine(JSON.stringify(entry))).toBeNull();
  });

  it("should handle missing optional usage fields", () => {
    const entry = {
      message: {
        model: "claude-opus-4-1",
        usage: { input_tokens: 100 }, // only input_tokens
      },
      type: "assistant",
      timestamp: "2026-07-14T13:45:19.137Z",
      cwd: "/Users/test",
    };
    const result = parseTranscriptLine(JSON.stringify(entry));
    expect(result).not.toBeNull();
    expect(result?.outputTokens).toBe(0);
  });

  it("should handle missing timestamp", () => {
    const entry = {
      message: {
        model: "claude-opus-4-1",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
      type: "assistant",
      cwd: "/Users/test",
    };
    const result = parseTranscriptLine(JSON.stringify(entry));
    expect(result).not.toBeNull();
    expect(result?.date).toBe("unknown");
  });

  it("should handle missing cwd", () => {
    const entry = {
      message: {
        model: "claude-opus-4-1",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
      type: "assistant",
      timestamp: "2026-07-14T13:45:19.137Z",
    };
    const result = parseTranscriptLine(JSON.stringify(entry));
    expect(result).not.toBeNull();
    expect(result?.project).toBe("unknown");
  });

  it("should calculate cost correctly for opus", () => {
    const line = JSON.stringify(validTranscriptEntry);
    const result = parseTranscriptLine(line);
    // Opus: $15 / 1M input, $75 / 1M output
    // 12345 input * 15 / 1M = 0.185175
    // 456 output * 75 / 1M = 0.0342
    // Total ≈ 0.219375
    expect(result?.cost).toBeCloseTo(0.219375, 5);
  });

  it("should still emit a record with cost 0 for unpriced models", () => {
    const line = JSON.stringify(entryWithUnknownModel);
    const result = parseTranscriptLine(line);

    expect(result).not.toBeNull();
    expect(result?.model).toBe("claude-unknown-model-9999");
    expect(result?.inputTokens).toBe(100);
    expect(result?.outputTokens).toBe(50);
    expect(result?.cost).toBe(0);
  });

  it("should include cache read/write tokens in cost", () => {
    const line = JSON.stringify(entryWithCacheTokens);
    const result = parseTranscriptLine(line);

    expect(result).not.toBeNull();
    expect(result?.cacheReadTokens).toBe(4000);
    expect(result?.cacheWriteTokens).toBe(2000);
    // sonnet family: input 3, output 15, cacheWrite 3.75, cacheRead 0.3 per 1M
    // 1000*3 + 500*15 + 2000*3.75 + 4000*0.3 = 3000 + 7500 + 7500 + 1200 = 19200 / 1e6
    expect(result?.cost).toBeCloseTo(0.0192, 6);
  });

  it("should default cache tokens to 0 when absent", () => {
    const line = JSON.stringify(validTranscriptEntry2);
    const result = parseTranscriptLine(line);

    expect(result?.cacheReadTokens).toBe(0);
    expect(result?.cacheWriteTokens).toBe(0);
  });

  it("should derive dedupeKey from requestId, falling back to message.id", () => {
    const withRequestId = parseTranscriptLine(JSON.stringify(retriedRequestEntryFirst));
    expect(withRequestId?.dedupeKey).toBe("req-retry-1");

    const withoutRequestId = parseTranscriptLine(JSON.stringify(validTranscriptEntry));
    expect(withoutRequestId?.dedupeKey).toBe(validTranscriptEntry.message.id);
  });

  it("should attach sessionId and projectOverride from parse options", () => {
    const result = parseTranscriptLine(JSON.stringify(validTranscriptEntry), {
      sessionId: "session-123",
      projectOverride: "my-project",
    });

    expect(result?.sessionId).toBe("session-123");
    expect(result?.project).toBe("my-project");
  });

  it("should default sessionId to unknown when not provided", () => {
    const result = parseTranscriptLine(JSON.stringify(validTranscriptEntry));
    expect(result?.sessionId).toBe("unknown");
  });

  it("should export a PRICING_AS_OF constant", () => {
    expect(typeof PRICING_AS_OF).toBe("string");
    expect(PRICING_AS_OF.length).toBeGreaterThan(0);
  });
});

describe("parseTranscriptContent", () => {
  it("should parse a multi-line transcript", () => {
    const results = parseTranscriptContent(sampleTranscriptContent);

    expect(results.length).toBe(2);
    expect(results[0].model).toBe("claude-opus-4-1-20250805");
    expect(results[1].model).toBe("claude-haiku-4-5-20251001");
  });

  it("should skip malformed entries", () => {
    const content = `${JSON.stringify(validTranscriptEntry)}
invalid json
${JSON.stringify(validTranscriptEntry2)}`;

    const results = parseTranscriptContent(content);
    expect(results.length).toBe(2);
  });

  it("should handle empty content", () => {
    expect(parseTranscriptContent("")).toEqual([]);
    expect(parseTranscriptContent("\n\n")).toEqual([]);
  });

  it("should aggregate daily sessions across models", () => {
    const results = parseTranscriptContent(sampleTranscriptContent);
    const byDay = results.reduce((acc: Record<string, typeof results>, r) => {
      if (!acc[r.date]) acc[r.date] = [];
      acc[r.date].push(r);
      return acc;
    }, {});

    expect(Object.keys(byDay).length).toBe(2);
    expect(byDay["2026-07-14"].length).toBe(1);
    expect(byDay["2026-07-15"].length).toBe(1);
  });

  it("should dedupe retried requests by requestId, last write wins", () => {
    const content = `${JSON.stringify(retriedRequestEntryFirst)}
${JSON.stringify(retriedRequestEntrySecond)}`;

    const results = parseTranscriptContent(content);
    expect(results.length).toBe(1);
    expect(results[0].inputTokens).toBe(200);
    expect(results[0].outputTokens).toBe(100);
  });

  it("should pass through records without a dedupe key untouched", () => {
    const content = `${JSON.stringify(retriedRequestEntryFirst)}
${JSON.stringify(entryWithoutDedupeKey)}`;

    const results = parseTranscriptContent(content);
    expect(results.length).toBe(2);
  });

  it("should attach sessionId and projectOverride from options to every record", () => {
    const results = parseTranscriptContent(sampleTranscriptContent, {
      sessionId: "session-abc",
      projectOverride: "shared-project",
    });

    expect(results.length).toBeGreaterThan(0);
    for (const record of results) {
      expect(record.sessionId).toBe("session-abc");
      expect(record.project).toBe("shared-project");
    }
  });
});
