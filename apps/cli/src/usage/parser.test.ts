import { describe, it, expect } from "vite-plus/test";
import { parseTranscriptLine, parseTranscriptContent } from "./parser.js";
import {
  validTranscriptEntry,
  validTranscriptEntry2,
  entryWithoutModel,
  entryWithoutUsage,
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

  it("should handle unknown models gracefully", () => {
    const entry = {
      message: {
        model: "claude-unknown-model-9999",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
      type: "assistant",
      timestamp: "2026-07-14T13:45:19.137Z",
      cwd: "/Users/test",
    };
    const result = parseTranscriptLine(JSON.stringify(entry));
    // Should be skipped because model doesn't exist in pricing
    expect(result).toBeNull();
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
});
