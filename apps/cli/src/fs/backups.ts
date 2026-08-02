import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const MAX_BACKUPS_PER_FILE = 20;

/**
 * Get the backup directory for storing backup files.
 * Mirrors the source file's path structure under ~/.claude/.claude-desk-backups/
 */
function getBackupDir(absPath: string): string {
  const claudeRoot = resolve(process.env.CLAUDE_ROOT ?? resolve(homedir(), ".claude"));
  const backupRoot = resolve(claudeRoot, ".claude-desk-backups");
  // For simplicity, we'll use the absolute path with slashes replaced by dashes
  // to avoid deep directory structure, but keep it readable
  const normalized = absPath.replace(/^\//, "").replace(/\//g, "_");
  return resolve(backupRoot, normalized.substring(0, Math.max(0, normalized.lastIndexOf("_"))));
}

/**
 * Get all backup files for a given source file path, sorted by timestamp (newest first).
 */
async function listBackups(absPath: string): Promise<string[]> {
  const backupDir = getBackupDir(absPath);
  const fileName = absPath.split("/").pop() || "file";

  try {
    const entries = await readdir(backupDir);
    return entries
      .filter((entry) => entry.startsWith(fileName) && entry.endsWith(".bak"))
      .sort()
      .reverse();
  } catch {
    // Directory doesn't exist yet
    return [];
  }
}

/**
 * Prune backups for a file, keeping only the most recent MAX_BACKUPS_PER_FILE.
 */
async function pruneBackups(absPath: string): Promise<void> {
  const backups = await listBackups(absPath);
  const backupDir = getBackupDir(absPath);

  if (backups.length > MAX_BACKUPS_PER_FILE) {
    const toDelete = backups.slice(MAX_BACKUPS_PER_FILE);
    for (const backup of toDelete) {
      await rm(join(backupDir, backup), { force: true });
    }
  }
}

/**
 * Backup a file to ~/.claude/.claude-desk-backups/<mirrored-path>/<ISO-timestamp>.bak
 * No-op if source file doesn't exist.
 * Automatically prunes old backups, keeping only the most recent MAX_BACKUPS_PER_FILE.
 */
export async function backupFile(absPath: string): Promise<void> {
  // Check if source exists
  try {
    await stat(absPath);
  } catch {
    // File doesn't exist, no-op
    return;
  }

  const backupDir = getBackupDir(absPath);
  const fileName = absPath.split("/").pop() || "file";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `${fileName}.${timestamp}.bak`);

  // Create backup directory if it doesn't exist
  await mkdir(backupDir, { recursive: true });

  // Copy file to backup
  await copyFile(absPath, backupPath);

  // Prune old backups
  await pruneBackups(absPath);
}

/**
 * Get a list of all backups for a file, with metadata.
 */
export async function getBackups(absPath: string): Promise<
  Array<{
    id: string;
    path: string;
    timestamp: string;
    size: number;
  }>
> {
  const backups = await listBackups(absPath);
  const backupDir = getBackupDir(absPath);
  const fileName = absPath.split("/").pop() || "file";

  const results = [];

  for (const backup of backups) {
    const backupPath = join(backupDir, backup);
    try {
      const stats = await stat(backupPath);
      // Extract timestamp from filename: fileName.timestamp.bak
      const match = backup.match(new RegExp(`^${fileName}\\.(.+)\\.bak$`));
      if (match) {
        const timestamp = match[1];
        // Convert back: "2026-07-16T23-23-58-123Z" → "2026-07-16T23:23:58.123Z"
        const restored = timestamp
          .replace(/^(.{19})-(.{3})Z$/, "$1.$2Z")
          .replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");

        results.push({
          id: backup,
          path: backupPath,
          timestamp: restored,
          size: stats.size,
        });
      }
    } catch {
      // Backup file was deleted or inaccessible, skip
    }
  }

  return results;
}

/**
 * Restore a backup file, first backing up the current version.
 */
export async function restoreBackup(absPath: string, backupId: string): Promise<void> {
  // First, backup the current version if it exists
  await backupFile(absPath);

  // Restore from backup
  const backupDir = getBackupDir(absPath);
  const backupPath = join(backupDir, backupId);

  try {
    await stat(backupPath);
  } catch {
    throw new Error(`Backup not found: ${backupId}`);
  }

  const dir = dirname(absPath);
  await mkdir(dir, { recursive: true });
  await copyFile(backupPath, absPath);
}
