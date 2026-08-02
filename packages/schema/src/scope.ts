import { ClaudeSettings } from "./index.js";

/**
 * Configuration scope — where a setting is defined.
 * - user: ~/.claude/settings.json
 * - project: ./.claude/settings.json (project-local)
 */
export type Scope = "user" | "project";

/**
 * Metadata about a configuration value's origin and effective value.
 */
export interface EffectiveValue<T = unknown> {
  value: T;
  scope: Scope;
}

/**
 * Configuration with per-key scope tracking.
 * Includes the merged effective settings and metadata about each value's origin.
 */
export interface MergedSettings {
  effective: ClaudeSettings;
  scopeMap: Record<string, Scope>;
}

/**
 * Merge settings layers with scope tracking.
 *
 * Precedence: project > user (project overrides user)
 *
 * Returns the merged effective configuration and a map of each top-level key
 * to its originating scope.
 *
 * @param layers - Settings from each scope, keyed by scope name
 * @returns Merged settings with effective config and per-key scope tracking
 */
export function mergeSettings(layers: Partial<Record<Scope, ClaudeSettings>>): MergedSettings {
  const effective: ClaudeSettings = {};
  const scopeMap: Record<string, Scope> = {};

  // Precedence: user first (lowest priority)
  const precedence: Scope[] = ["user", "project"];

  for (const scope of precedence) {
    const settings = layers[scope];
    if (!settings) continue;

    for (const [key, value] of Object.entries(settings)) {
      // For objects (nested settings), merge them recursively
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const existing = effective[key as keyof ClaudeSettings];
        if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
          // Merge nested objects
          effective[key as keyof ClaudeSettings] = {
            ...existing,
            ...value,
          } as any;
        } else {
          effective[key as keyof ClaudeSettings] = value as any;
        }
      } else {
        // For primitives and arrays, overwrite
        effective[key as keyof ClaudeSettings] = value as any;
      }

      // Track which scope provided this key (later scopes override)
      scopeMap[key] = scope;
    }
  }

  return {
    effective,
    scopeMap,
  };
}

/**
 * Get the scope origin for a specific setting key.
 * Returns undefined if the key is not set in any layer.
 */
export function getSettingScope(scopeMap: Record<string, Scope>, key: string): Scope | undefined {
  return scopeMap[key];
}
