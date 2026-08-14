import { isCategory, readFileText, writeFileText, safePath } from "../fs/scoped.js";
import { backupFile } from "../fs/backups.js";
import type { Scope } from "schema";
import { isInvalidProjectDir } from "./scopeQuery.js";

export async function getFileResponse(
  categoryParam: string,
  nameParam: string,
  scope: Scope = "user",
  projectDir?: string,
) {
  if (!isCategory(categoryParam)) {
    return { status: 400 as const, body: { error: "invalid category" } };
  }

  const name = nameParam.trim();
  if (!name && categoryParam !== "claudeMd" && categoryParam !== "settings") {
    return { status: 400 as const, body: { error: "name is required" } };
  }

  try {
    const relative = categoryParam === "claudeMd" || categoryParam === "settings" ? "" : name;
    const content = await readFileText(categoryParam, relative, scope, projectDir);
    return {
      status: 200 as const,
      body: {
        category: categoryParam,
        name: name || (categoryParam === "claudeMd" ? "CLAUDE.md" : "settings.json"),
        content,
      },
    };
  } catch (error) {
    if (isInvalidProjectDir(error)) {
      return { status: 400 as const, body: { error: error.message } };
    }
    const message = error instanceof Error ? error.message : "unable to read file";
    if (message.includes("path escapes")) {
      return { status: 403 as const, body: { error: "forbidden path" } };
    }
    return { status: 404 as const, body: { error: "file not found" } };
  }
}

export async function postFileResponse(
  categoryParam: string,
  nameParam: string,
  content: string,
  scope: Scope = "user",
  projectDir?: string,
) {
  if (!isCategory(categoryParam)) {
    return { status: 400 as const, body: { error: "invalid category" } };
  }

  const name = nameParam.trim();
  if (!name && categoryParam !== "claudeMd") {
    return { status: 400 as const, body: { error: "name is required" } };
  }

  if (categoryParam === "settings") {
    return { status: 400 as const, body: { error: "use PUT /api/settings to update settings" } };
  }

  if (categoryParam === "plugins") {
    return { status: 403 as const, body: { error: "plugins are read-only" } };
  }

  try {
    const relative = categoryParam === "claudeMd" ? "" : name;
    const filePath = safePath(categoryParam, relative, scope, projectDir);

    await backupFile(filePath);
    await writeFileText(categoryParam, relative, content, scope, projectDir);
    return {
      status: 200 as const,
      body: {
        category: categoryParam,
        name: name || "CLAUDE.md",
        ok: true,
      },
    };
  } catch (error) {
    if (isInvalidProjectDir(error)) {
      return { status: 400 as const, body: { error: error.message } };
    }
    const message = error instanceof Error ? error.message : "unable to write file";
    if (message.includes("path escapes")) {
      return { status: 403 as const, body: { error: "forbidden path" } };
    }
    return { status: 500 as const, body: { error: message } };
  }
}
