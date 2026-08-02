import { z } from "zod";

const hookCommandSchema = z.object({
  type: z.string(),
  command: z.string(),
});

const hookMatcherSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(hookCommandSchema),
});

const permissionsSchema = z
  .object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    ask: z.array(z.string()).optional(),
    defaultMode: z
      .enum(["acceptEdits", "bypassPermissions", "default", "delegate", "dontAsk", "plan", "auto"])
      .optional(),
    disableBypassPermissionsMode: z.enum(["disable"]).optional(),
    disableAutoMode: z.enum(["disable"]).optional(),
    additionalDirectories: z.array(z.string().min(1)).optional(),
  })
  .strict();

const statusLineSchema = z
  .object({
    type: z.literal("command"),
    command: z.string(),
    padding: z.number().optional(),
    refreshInterval: z.number().int().min(1).optional(),
    hideVimModeIndicator: z.boolean().optional(),
  })
  .strict();

const fileSuggestionSchema = z
  .object({
    type: z.literal("command"),
    command: z.string(),
  })
  .strict();

const attributionSchema = z
  .object({
    commit: z.string().optional(),
    pr: z.string().optional(),
  })
  .strict();

const marketplaceSourceSchema = z
  .object({
    source: z.string(),
  })
  .passthrough();

const marketplaceEntrySchema = z
  .object({
    source: marketplaceSourceSchema,
    installLocation: z.string().optional(),
    autoUpdate: z.boolean().optional(),
    lastUpdated: z.string().optional(),
  })
  .strict();

export const claudeSettingsSchema = z
  .object({
    $schema: z.string().optional(),
    apiKeyHelper: z.string().optional(),
    autoMemoryEnabled: z.boolean().optional(),
    autoUpdatesChannel: z.enum(["stable", "latest"]).optional(),
    awsCredentialExport: z.string().optional(),
    awsAuthRefresh: z.string().optional(),
    claudeMdExcludes: z.array(z.unknown()).optional(),
    cleanupPeriodDays: z.number().int().optional(),
    includeGitInstructions: z.boolean().optional(),
    includeCoAuthoredBy: z.boolean().optional(),
    plansDirectory: z.string().optional(),
    respectGitignore: z.boolean().optional(),
    language: z.string().optional(),
    model: z.string().optional(),
    availableModels: z.array(z.unknown()).optional(),
    effortLevel: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
    fastMode: z.boolean().optional(),
    fastModePerSessionOptIn: z.boolean().optional(),
    feedbackSurveyRate: z.number().optional(),
    enableAllProjectMcpServers: z.boolean().optional(),
    enabledMcpjsonServers: z.array(z.unknown()).optional(),
    disabledMcpjsonServers: z.array(z.unknown()).optional(),
    allowedMcpServers: z.array(z.unknown()).optional(),
    deniedMcpServers: z.array(z.unknown()).optional(),
    httpHookAllowedEnvVars: z.array(z.unknown()).optional(),
    disableAllHooks: z.boolean().optional(),
    allowedChannelPlugins: z.array(z.unknown()).optional(),
    allowedHttpHookUrls: z.array(z.unknown()).optional(),
    allowManagedHooksOnly: z.boolean().optional(),
    allowManagedPermissionRulesOnly: z.boolean().optional(),
    strictKnownMarketplaces: z.array(z.unknown()).optional(),
    skippedMarketplaces: z.array(z.unknown()).optional(),
    skippedPlugins: z.array(z.unknown()).optional(),
    forceLoginMethod: z.enum(["claudeai", "console"]).optional(),
    forceLoginOrgUUID: z.string().optional(),
    otelHeadersHelper: z.string().optional(),
    outputStyle: z.string().optional(),
    skipWebFetchPreflight: z.boolean().optional(),
    spinnerTipsEnabled: z.boolean().optional(),
    terminalProgressBarEnabled: z.boolean().optional(),
    showTurnDuration: z.boolean().optional(),
    prefersReducedMotion: z.boolean().optional(),
    prUrlTemplate: z.string().optional(),
    alwaysThinkingEnabled: z.boolean().optional(),
    companyAnnouncements: z.array(z.unknown()).optional(),
    teammateMode: z.enum(["auto", "in-process", "tmux"]).optional(),
    parentSettingsBehavior: z.enum(["first-wins", "merge"]).optional(),
    pluginTrustMessage: z.string().optional(),
    allowManagedMcpServersOnly: z.boolean().optional(),
    blockedMarketplaces: z.array(z.unknown()).optional(),
    agent: z.string().optional(),
    autoMemoryDirectory: z.string().optional(),
    channelsEnabled: z.boolean().optional(),
    defaultShell: z.enum(["bash", "powershell"]).optional(),
    disableDeepLinkRegistration: z.enum(["disable"]).optional(),
    disableSkillShellExecution: z.boolean().optional(),
    forceRemoteSettingsRefresh: z.boolean().optional(),
    minimumVersion: z.string().optional(),
    showClearContextOnPlanAccept: z.boolean().optional(),
    showThinkingSummaries: z.boolean().optional(),
    skipDangerousModePermissionPrompt: z.boolean().optional(),
    strictPluginOnlyCustomization: z.union([z.boolean(), z.array(z.string())]).optional(),
    tui: z.enum(["fullscreen", "default"]).optional(),
    viewMode: z.enum(["default", "verbose", "focus"]).optional(),
    useAutoModeDuringPlan: z.boolean().optional(),
    voiceEnabled: z.boolean().optional(),
    wslInheritsWindowsSettings: z.boolean().optional(),
    permissions: permissionsSchema.optional(),
    env: z.record(z.string(), z.string()).optional(),
    hooks: z.record(z.string(), z.array(hookMatcherSchema)).optional(),
    statusLine: statusLineSchema.optional(),
    fileSuggestion: fileSuggestionSchema.optional(),
    attribution: attributionSchema.optional(),
    extraKnownMarketplaces: z.record(z.string(), marketplaceEntrySchema).optional(),
    enabledPlugins: z.record(z.string(), z.union([z.boolean(), z.array(z.string())])).optional(),
    skillOverrides: z
      .record(z.string(), z.enum(["on", "name-only", "user-invocable-only", "off"]))
      .optional(),
    modelOverrides: z.record(z.string(), z.string()).optional(),
    pluginConfigs: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    sandbox: z.record(z.string(), z.unknown()).optional(),
    worktree: z.record(z.string(), z.unknown()).optional(),
    spinnerVerbs: z.record(z.string(), z.unknown()).optional(),
    spinnerTipsOverride: z.record(z.string(), z.unknown()).optional(),
    autoMode: z.record(z.string(), z.unknown()).optional(),
    subagentStatusLine: statusLineSchema.optional(),
  })
  .passthrough();

export type ClaudeSettings = z.infer<typeof claudeSettingsSchema>;

export const DEFAULT_SETTINGS: ClaudeSettings = {};

export function parseSettings(input: unknown): ClaudeSettings {
  return claudeSettingsSchema.parse(input);
}

export function safeParseSettings(input: unknown) {
  return claudeSettingsSchema.safeParse(input);
}

// Backup types
export const backupSchema = z.object({
  id: z.string(),
  path: z.string(),
  timestamp: z.string(),
  size: z.number(),
});

export type Backup = z.infer<typeof backupSchema>;

export const backupsListResponseSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      backups: z.array(backupSchema),
    }),
  ),
});

export type BackupsListResponse = z.infer<typeof backupsListResponseSchema>;

export const restoreBackupRequestSchema = z.object({
  backupId: z.string(),
  originalPath: z.string(),
});

export type RestoreBackupRequest = z.infer<typeof restoreBackupRequestSchema>;

export {
  getSettingsFieldMetadata,
  SETTINGS_GROUP_ORDER,
  SETTINGS_FIELD_METADATA,
  type FieldMetadata,
  type SettingsGroup,
} from "./metadata.js";

export {
  mergeSettings,
  getSettingScope,
  type Scope,
  type EffectiveValue,
  type MergedSettings,
} from "./scope.js";

export {
  stdioTransportSchema,
  httpTransportSchema,
  sseTransportSchema,
  mcpServerSchema,
  mcpConfigSchema,
  mcpServerResponseSchema,
  mcpListResponseSchema,
  mcpAddRequestSchema,
  mcpRemoveRequestSchema,
  mcpHealthResponseSchema,
  mcpHealthCheckResponseSchema,
  parseMcpConfig,
  safeParseMcpConfig,
  type StdioTransport,
  type HttpTransport,
  type SseTransport,
  type McpServer,
  type McpConfig,
  type McpServerResponse,
  type McpListResponse,
  type McpAddRequest,
  type McpRemoveRequest,
  type McpHealthResponse,
  type McpHealthCheckResponse,
} from "./mcp.js";

export {
  catalogCategorySchema,
  catalogEnvVarSchema,
  catalogEntrySchema,
  catalogSchema,
  CATALOG_CATEGORIES,
  type CatalogCategory,
  type CatalogEnvVar,
  type CatalogEntry,
  type Catalog,
} from "./mcpCatalog.js";

export { CATALOG } from "./catalog.js";

// Status check types
export const statusItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["ok", "warn", "missing"]),
  message: z.string(),
  fixRoute: z.string().optional(),
});

export type StatusItem = z.infer<typeof statusItemSchema>;

export const statusResponseSchema = z.object({
  allOk: z.boolean(),
  items: z.array(statusItemSchema),
});

export type StatusResponse = z.infer<typeof statusResponseSchema>;
