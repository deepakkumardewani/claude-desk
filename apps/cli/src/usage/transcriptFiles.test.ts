import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createTempHome } from "../testing/tempHome.js";
import { useTempHome } from "../testing/tempHomeHooks.js";
import { listTranscriptFiles } from "./transcriptFiles.js";

const home = useTempHome();

async function seed(relative: string, content = ""): Promise<void> {
  const path = join(home().claudeDir, "projects", relative);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

describe("listTranscriptFiles", () => {
  it("returns an empty list when the projects dir does not exist", async () => {
    expect(await listTranscriptFiles()).toEqual([]);
  });

  it("discovers jsonl files one level deep with project and session ids", async () => {
    await seed("-Users-me-app/abc-123.jsonl");
    await seed("-Users-me-app/def-456.jsonl");
    await seed("-Users-me-lib/ghi.jsonl");

    const files = await listTranscriptFiles();
    const summary = files
      .map((file) => [file.project, file.sessionId])
      .sort((a, b) => a.join("/").localeCompare(b.join("/")));
    expect(summary).toEqual([
      ["-Users-me-app", "abc-123"],
      ["-Users-me-app", "def-456"],
      ["-Users-me-lib", "ghi"],
    ]);
    expect(files[0].path.startsWith(join(home().claudeDir, "projects"))).toBe(true);
  });

  it("ignores non-jsonl files, nested directories and loose files in the root", async () => {
    await seed("proj/notes.txt");
    await seed("proj/nested/deep.jsonl");
    await seed("stray.jsonl");
    await seed("proj/keep.jsonl");

    const files = await listTranscriptFiles();
    expect(files.map((file) => file.sessionId)).toEqual(["keep"]);
  });

  it("follows a mid-test HOME change", async () => {
    await seed("old-home/one.jsonl");
    expect((await listTranscriptFiles()).map((file) => file.sessionId)).toEqual(["one"]);

    const other = createTempHome();
    try {
      expect(await listTranscriptFiles()).toEqual([]);
    } finally {
      other.restore();
    }
    // restore() puts the first temp HOME back, so its transcripts are visible again.
    expect((await listTranscriptFiles()).map((file) => file.sessionId)).toEqual(["one"]);
  });
});
