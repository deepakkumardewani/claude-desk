import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { defaultClaudeJsonPath } from "../fs/mcp.js";

export type ProjectListItem = {
  dir: string;
  name: string;
  exists: boolean;
};

async function readKnownProjectDirs(): Promise<string[]> {
  try {
    const raw = JSON.parse(await readFile(defaultClaudeJsonPath(), "utf8")) as {
      projects?: Record<string, unknown>;
    };
    return Object.keys(raw.projects ?? {});
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

function extraDirs(extraRaw?: string): string[] {
  if (!extraRaw) return [];
  return extraRaw
    .split(",")
    .map((part) => part.trim())
    .filter((dir) => dir.length > 0 && isAbsolute(dir));
}

export async function getProjectsResponse(extraRaw?: string) {
  const known = await readKnownProjectDirs();
  const merged: string[] = [...known];
  for (const extra of extraDirs(extraRaw)) {
    if (!merged.includes(extra)) merged.push(extra);
  }

  const projects: ProjectListItem[] = merged.map((dir) => ({
    dir,
    name: basename(dir),
    exists: existsSync(dir),
  }));

  return {
    status: 200 as const,
    body: { projects },
  };
}
