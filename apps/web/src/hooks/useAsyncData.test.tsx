// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useAsyncData } from "./useAsyncData";

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAsyncData", () => {
  it("starts loading, then exposes data on success", async () => {
    const pending = deferred<string>();
    const { result } = renderHook(() => useAsyncData(() => pending.promise, []));
    expect(result.current).toEqual({ data: null, error: null, loading: true });

    await act(async () => pending.resolve("hello"));
    expect(result.current).toEqual({ data: "hello", error: null, loading: false });
  });

  it("exposes the error message and logs it on failure", async () => {
    const { result } = renderHook(() => useAsyncData(() => Promise.reject(new Error("boom")), []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ data: null, error: "boom", loading: false });
    expect(console.error).toHaveBeenCalled();
  });

  it("uses a generic message for non-Error rejections", async () => {
    const { result } = renderHook(() => useAsyncData(() => Promise.reject("nope"), []));
    await waitFor(() => expect(result.current.error).toBe("An error occurred"));
  });

  it("refetches when deps change, going back to loading first", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const fetchFn = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ id }) => useAsyncData(fetchFn, [id]), {
      initialProps: { id: 1 },
    });
    await act(async () => first.resolve("one"));
    expect(result.current.data).toBe("one");

    rerender({ id: 2 });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve("two"));
    expect(result.current).toEqual({ data: "two", error: null, loading: false });
  });

  it("clears a previous error when refetching", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("recovered");
    const { result, rerender } = renderHook(({ id }) => useAsyncData(fetchFn, [id]), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.error).toBe("fail"));
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.data).toBe("recovered"));
    expect(result.current.error).toBeNull();
  });

  it("ignores a stale response when deps change before it settles", async () => {
    const stale = deferred<string>();
    const fresh = deferred<string>();
    const fetchFn = vi.fn().mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(({ id }) => useAsyncData(fetchFn, [id]), {
      initialProps: { id: 1 },
    });
    rerender({ id: 2 });
    await act(async () => fresh.resolve("fresh"));
    await act(async () => stale.resolve("stale"));
    expect(result.current.data).toBe("fresh");
  });

  it("does not update state or cache after unmount while pending", async () => {
    const pending = deferred<string>();
    const cache = new Map<string, string>();
    const { result, unmount } = renderHook(() =>
      useAsyncData(() => pending.promise, [], { cache, cacheKey: "k" }),
    );
    unmount();
    await act(async () => pending.resolve("late"));
    expect(result.current).toEqual({ data: null, error: null, loading: true });
    expect(cache.has("k")).toBe(false);
  });

  it("does not log or set error after unmount when the fetch rejects", async () => {
    const pending = deferred<string>();
    const { unmount } = renderHook(() => useAsyncData(() => pending.promise, []));
    unmount();
    await act(async () => pending.reject(new Error("late failure")));
    expect(console.error).not.toHaveBeenCalled();
  });

  it("stores successful results in the cache", async () => {
    const cache = new Map<string, number>();
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.resolve(7), [], { cache, cacheKey: "answer" }),
    );
    await waitFor(() => expect(result.current.data).toBe(7));
    expect(cache.get("answer")).toBe(7);
  });

  it("serves cached data without fetching", () => {
    const cache = new Map([["k", "cached"]]);
    const fetchFn = vi.fn().mockResolvedValue("fresh");
    const { result } = renderHook(() => useAsyncData(fetchFn, [], { cache, cacheKey: "k" }));
    expect(result.current).toEqual({ data: "cached", error: null, loading: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not cache failures", async () => {
    const cache = new Map<string, string>();
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.reject(new Error("x")), [], { cache, cacheKey: "k" }),
    );
    await waitFor(() => expect(result.current.error).toBe("x"));
    expect(cache.size).toBe(0);
  });
});
