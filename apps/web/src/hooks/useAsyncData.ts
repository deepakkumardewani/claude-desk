import { useEffect, useState } from "react";

type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

type UseAsyncDataOptions<T> = {
  cache?: Map<string, T>;
  cacheKey?: string;
};

/**
 * Encapsulates the common pattern of fetching data with React effects.
 * Manages loading/error/data states and handles cancellation via flag.
 *
 * Supports optional caching via Map and cache key. If cache hits, returns cached data immediately
 * without refetching.
 *
 * @param fetchFn - Async function that fetches data. Called once on mount and when deps change.
 * @param deps - Dependency array. If deps change, fetch runs again.
 * @param options - Optional cache Map and cache key for memoizing results
 * @returns Object with {data, error, loading} states
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  deps: React.DependencyList = [],
  options?: UseAsyncDataOptions<T>,
): AsyncState<T> {
  const { cache, cacheKey } = options ?? {};

  // Check cache on mount
  const cachedData = cacheKey && cache ? cache.get(cacheKey) : null;
  const [state, setState] = useState<AsyncState<T>>({
    data: cachedData ?? null,
    error: null,
    loading: cachedData ? false : true,
  });

  useEffect(() => {
    // If we have cached data, don't refetch
    if (cachedData) {
      setState({ data: cachedData, error: null, loading: false });
      return;
    }

    let cancelled = false;

    const execute = async () => {
      try {
        const result = await fetchFn();
        if (!cancelled) {
          if (cache && cacheKey) {
            cache.set(cacheKey, result);
          }
          setState({ data: result, error: null, loading: false });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "An error occurred";
          console.error("useAsyncData fetch failed:", err);
          setState({ data: null, error: message, loading: false });
        }
      }
    };

    setState((prev) => ({ ...prev, loading: true, error: null }));
    void execute();

    return () => {
      cancelled = true;
    };
  }, deps);

  return state;
}
