import { z } from "zod";

/** Single source of truth for fetch/size caps (spec §9). */
export const MAX_FILE_BYTES = 1_000_000;
export const MAX_ITEM_BYTES = 10_000_000;
export const SKILLS_SH_MAX_LIMIT = 50;

export const itemKindSchema = z.enum([
  "skill",
  "agent",
  "command",
  "hook",
  "mcp",
  "setting",
  "plugin",
  "convertible",
]);
export type ItemKind = z.infer<typeof itemKindSchema>;

export const repoRefSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  ref: z.string(),
  sha: z.string(),
  subpath: z.string().optional(),
});
export type RepoRef = z.infer<typeof repoRefSchema>;

export const convertsToSchema = z.enum(["skill", "command", "agent"]);

export const discoveredItemSchema = z.object({
  id: z.string(),
  kind: itemKindSchema,
  name: z.string(),
  description: z.string().optional(),
  path: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      size: z.number(),
      blobSha: z.string(),
      /** Over MAX_FILE_BYTES: listed but never fetched. */
      tooLarge: z.boolean().optional(),
    }),
  ),
  /** false when the item's files total more than MAX_ITEM_BYTES; the UI must not offer install. */
  installable: z.boolean().optional(),
  pluginId: z.string().optional(),
  convertsTo: convertsToSchema.optional(),
  payload: z.unknown().optional(),
});
export type DiscoveredItem = z.infer<typeof discoveredItemSchema>;

export const TRUST_RULES = [
  "hidden-unicode",
  "pipe-to-shell",
  "broad-permission",
  "runs-command",
  "bundled-script",
  "network",
  "destructive",
  "allowed-tools",
  "env-placeholder",
  "token-cost",
] as const;
export const trustRuleSchema = z.enum(TRUST_RULES);
export type TrustRule = z.infer<typeof trustRuleSchema>;

export const trustFindingSchema = z.object({
  itemId: z.string(),
  severity: z.enum(["info", "caution", "danger"]),
  rule: trustRuleSchema,
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
  evidence: z.string().optional(),
});
export type TrustFinding = z.infer<typeof trustFindingSchema>;

export const installTargetSchema = z.object({
  scope: z.enum(["user", "project"]),
  projectDir: z.string().optional(),
});
export type InstallTarget = z.infer<typeof installTargetSchema>;

export const installPlanSchema = z.object({
  planHash: z.string(),
  target: installTargetSchema,
  fileWrites: z.array(
    z.object({
      itemId: z.string(),
      targetPath: z.string(),
      status: z.enum(["new", "overwrite", "conflict", "identical"]),
      bytes: z.number(),
    }),
  ),
  settingsChanges: z.array(
    z.object({
      itemId: z.string(),
      pointer: z.string(),
      before: z.unknown().optional(),
      after: z.unknown(),
    }),
  ),
  /** Update plans only: recorded files the new version no longer ships; apply deletes them. */
  fileRemovals: z.array(z.object({ itemId: z.string(), targetPath: z.string() })).optional(),
  mcpChanges: z.array(
    z.object({ itemId: z.string(), name: z.string(), status: z.enum(["new", "conflict"]) }),
  ),
  marketplaceChanges: z.array(
    z.object({ itemId: z.string(), marketplace: z.string(), plugin: z.string() }),
  ),
  findings: z.array(trustFindingSchema),
  tokenEstimates: z.record(z.string(), z.number()),
});
export type InstallPlan = z.infer<typeof installPlanSchema>;

export const manifestEntrySchema = z.object({
  id: z.string(),
  source: z.object({
    kind: z.enum(["github", "skills.sh"]),
    owner: z.string(),
    repo: z.string(),
    sha: z.string(),
    path: z.string(),
    skillsShId: z.string().optional(),
  }),
  itemKind: itemKindSchema,
  itemName: z.string(),
  target: installTargetSchema,
  installedAt: z.string(),
  files: z.array(z.object({ path: z.string(), sha256: z.string() })),
  settingsEntries: z.array(
    z.object({
      pointer: z.string(),
      value: z.unknown(),
      /** Set when a merge replaced an existing scalar; uninstall puts this value back. */
      previous: z.unknown().optional(),
      /** Pointer of the topmost node the merge created; uninstall prunes empty containers up to it. */
      root: z.string().optional(),
    }),
  ),
  mcpServers: z.array(z.string()),
  marketplace: z.object({ name: z.string(), plugins: z.array(z.string()) }).optional(),
  sourceBlobShas: z.record(z.string(), z.string()),
  /** Overwritten file path -> backup of what it held before the install; uninstall restores it. */
  backups: z.record(z.string(), z.string()).optional(),
});
export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

export const INSTALL_STATUSES = [
  "up-to-date",
  "update-available",
  "modified-locally",
  "missing-on-disk",
  "source-unavailable",
] as const;
export const installStatusSchema = z.enum(INSTALL_STATUSES);
export type InstallStatus = z.infer<typeof installStatusSchema>;

/** One row of `GET /api/discover/installs`. */
export type InstalledEntry = ManifestEntry & { status: InstallStatus };

/**
 * One skills.sh search hit. Shape taken from the live
 * `GET https://skills.sh/api/search?q=react` response (fixture: skills-sh-search.json).
 * `id` is `<owner>/<repo>/<skillId>`; `source` is `<owner>/<repo>`.
 */
export const skillsShResultSchema = z.object({
  id: z.string(),
  source: z.string(),
  skillId: z.string(),
  name: z.string(),
  installs: z.number(),
});
export type SkillsShResult = z.infer<typeof skillsShResultSchema>;

/** Envelope: only `skills` is relied on; other keys (timings, count) may change freely. */
export const skillsShSearchResponseSchema = z.object({
  skills: z.array(skillsShResultSchema),
});
