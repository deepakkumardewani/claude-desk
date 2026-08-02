import { getBackups, restoreBackup } from "../fs/backups.js";
import { CATEGORY_META, listAllCategories, safePath } from "../fs/scoped.js";

/**
 * Resolve a display path ("<category label>/<file>") back to an absolute path,
 * constrained to the claude root via safePath.
 */
function resolveDisplayPath(displayPath: string): string {
  const slash = displayPath.indexOf("/");
  if (slash === -1) {
    throw new Error(`Invalid path: ${displayPath}`);
  }

  const label = displayPath.slice(0, slash);
  const file = displayPath.slice(slash + 1);
  const meta = CATEGORY_META.find((m) => m.label === label);
  if (!meta) {
    throw new Error(`Unknown category: ${label}`);
  }

  const isFileCategory = meta.id === "settings" || meta.id === "claudeMd";
  return safePath(meta.id, isFileCategory ? "" : file);
}

export async function getBackupsResponse(): Promise<{
  status: 200 | 500;
  body: Record<string, unknown>;
}> {
  try {
    const categories = await listAllCategories();
    const files: Array<{
      path: string;
      backups: Awaited<ReturnType<typeof getBackups>>;
    }> = [];

    for (const category of categories) {
      for (const file of category.files) {
        try {
          // Single-file categories (settings, claudeMd) resolve with an empty relative path
          const isFileCategory =
            category.category === "settings" || category.category === "claudeMd";
          const absPath = safePath(category.category, isFileCategory ? "" : file);
          const backups = await getBackups(absPath);
          if (backups.length > 0) {
            // Store as a readable path representation
            const displayPath = `${category.label}/${file}`;
            files.push({ path: displayPath, backups });
          }
        } catch {
          // Skip files that can't be accessed
          continue;
        }
      }
    }

    return {
      status: 200,
      body: { files },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to list backups";
    return {
      status: 500,
      body: { error: message },
    };
  }
}

export async function postRestoreBackupResponse(body: unknown): Promise<{
  status: 200 | 400 | 404 | 500;
  body: { ok?: boolean; error?: string };
}> {
  if (!body || typeof body !== "object") {
    return {
      status: 400,
      body: { error: "request body must be an object" },
    };
  }

  const { backupId, originalPath } = body as Record<string, unknown>;

  if (typeof backupId !== "string" || !backupId) {
    return {
      status: 400,
      body: { error: "backupId is required and must be a string" },
    };
  }

  if (typeof originalPath !== "string" || !originalPath) {
    return {
      status: 400,
      body: { error: "originalPath is required and must be a string" },
    };
  }

  try {
    await restoreBackup(resolveDisplayPath(originalPath), backupId);
    return {
      status: 200,
      body: { ok: true },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to restore backup";
    if (message.includes("Backup not found")) {
      return {
        status: 404,
        body: { error: message },
      };
    }
    if (
      message.includes("Invalid path") ||
      message.includes("Unknown category") ||
      message.includes("escapes")
    ) {
      return {
        status: 400,
        body: { error: message },
      };
    }
    return {
      status: 500,
      body: { error: message },
    };
  }
}
