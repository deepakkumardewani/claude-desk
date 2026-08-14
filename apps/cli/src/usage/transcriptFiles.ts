import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export const PROJECTS_DIR = join(homedir(), ".claude", "projects");

const JSONL_EXTENSION = ".jsonl";

export interface TranscriptFile {
  path: string;
  project: string;
  sessionId: string;
}

/**
 * List all transcript files. Transcripts live one level deep:
 * ~/.claude/projects/<project-dir>/<session>.jsonl
 */
export async function listTranscriptFiles(): Promise<TranscriptFile[]> {
  const files: TranscriptFile[] = [];

  try {
    const projectDirs = await readdir(PROJECTS_DIR, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;

      try {
        const entries = await readdir(join(PROJECTS_DIR, dir.name), { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(JSONL_EXTENSION)) {
            files.push({
              path: join(PROJECTS_DIR, dir.name, entry.name),
              project: dir.name,
              sessionId: entry.name.slice(0, -JSONL_EXTENSION.length),
            });
          }
        }
      } catch {
        // Skip project directories that can't be read
      }
    }
  } catch {
    // Projects directory doesn't exist or can't be read
  }

  return files;
}
