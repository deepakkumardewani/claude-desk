/**
 * Test fixtures for usage analytics
 * These represent real transcript entries from ~/.claude/projects/*.jsonl
 */

export const validTranscriptEntry = {
  parentUuid: "d0f9af8c-dbfd-44df-bbb5-956399307601",
  isSidechain: false,
  message: {
    id: "e68f6c76-93f3-4374-99c3-e15f92ef0706",
    type: "assistant",
    role: "assistant",
    model: "claude-opus-4-1-20250805",
    usage: {
      input_tokens: 12345,
      output_tokens: 456,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  },
  type: "assistant",
  timestamp: "2026-07-14T13:45:19.137Z",
  cwd: "/Users/deepakdewani1/Documents/Programs/react/cc-studio",
};

export const validTranscriptEntry2 = {
  parentUuid: "d0f9af8c-dbfd-44df-bbb5-956399307602",
  message: {
    id: "e68f6c76-93f3-4374-99c3-e15f92ef0707",
    type: "assistant",
    role: "assistant",
    model: "claude-haiku-4-5-20251001",
    usage: {
      input_tokens: 5000,
      output_tokens: 200,
    },
  },
  type: "assistant",
  timestamp: "2026-07-15T10:30:00.000Z",
  cwd: "/Users/deepakdewani1/Documents/Programs/react/weavr-landing",
};

export const malformedEntry = {
  type: "assistant",
  timestamp: "2026-07-14T13:45:19.137Z",
  // Missing message field - should be skipped
};

export const entryWithoutModel = {
  message: {
    id: "e68f6c76-93f3-4374-99c3-e15f92ef0708",
    type: "assistant",
    role: "assistant",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  },
  type: "assistant",
  timestamp: "2026-07-14T13:45:19.137Z",
  cwd: "/Users/deepakdewani1/Documents/Programs/react/cc-studio",
};

export const entryWithoutUsage = {
  message: {
    id: "e68f6c76-93f3-4374-99c3-e15f92ef0709",
    type: "assistant",
    role: "assistant",
    model: "claude-sonnet-4-20250514",
  },
  type: "assistant",
  timestamp: "2026-07-14T13:45:19.137Z",
  cwd: "/Users/deepakdewani1/Documents/Programs/react/cc-studio",
};

export const sampleTranscriptContent = `${JSON.stringify(validTranscriptEntry)}
${JSON.stringify(validTranscriptEntry2)}
${JSON.stringify(malformedEntry)}
${JSON.stringify(entryWithoutModel)}
${JSON.stringify(entryWithoutUsage)}
`;
