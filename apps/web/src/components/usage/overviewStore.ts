/**
 * Module-level cache for the /api/usage/overview response.
 * Shared by OverviewTab (full data) and the Usage shell (pricing note),
 * deduping concurrent requests so the endpoint is only fetched once.
 */
import { fetchUsageOverview, type UsageOverview } from "../../lib/api";

export const POLL_MS = 30_000;

type OverviewListener = (overview: UsageOverview) => void;

let cachedOverview: UsageOverview | null = null;
let pendingFetch: Promise<UsageOverview> | null = null;
const listeners = new Set<OverviewListener>();

export function getCachedOverview(): UsageOverview | null {
  return cachedOverview;
}

export function subscribeOverview(listener: OverviewListener): () => void {
  listeners.add(listener);
  if (cachedOverview) listener(cachedOverview);
  return () => {
    listeners.delete(listener);
  };
}

function notify(overview: UsageOverview): void {
  for (const listener of listeners) listener(overview);
}

export function fetchOverviewCached(options?: { force?: boolean }): Promise<UsageOverview> {
  if (pendingFetch) return pendingFetch;
  if (cachedOverview && !options?.force) {
    return Promise.resolve(cachedOverview);
  }

  pendingFetch = fetchUsageOverview()
    .then((data) => {
      cachedOverview = data;
      pendingFetch = null;
      notify(data);
      return data;
    })
    .catch((error: unknown) => {
      pendingFetch = null;
      throw error;
    });

  return pendingFetch;
}
