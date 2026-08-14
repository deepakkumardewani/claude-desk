import type { ContextDetails } from "../api/context";

/** In-memory only — keyed by workspace so User vs project snapshots do not mix. */
let memoryCache: { key: string; data: ContextDetails } | null = null;

export function getCachedContext(key: string): ContextDetails | null {
  if (!memoryCache || memoryCache.key !== key) {
    return null;
  }
  return memoryCache.data;
}

export function setCachedContext(key: string, data: ContextDetails): void {
  memoryCache = { key, data };
}

export function clearCachedContext(): void {
  memoryCache = null;
}
