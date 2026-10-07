// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getRecent, recordRecent } from "./recent";

const KEY = "claude-desk-recent";
const item = (n: number) => ({ href: `/skills/${n}`, label: `s${n}`, categoryLabel: "Skills" });

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getRecent", () => {
  it("returns [] when nothing is stored", () => {
    expect(getRecent()).toEqual([]);
  });

  it("returns [] for invalid JSON or a non-array value", () => {
    window.localStorage.setItem(KEY, "{oops");
    expect(getRecent()).toEqual([]);
    window.localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    expect(getRecent()).toEqual([]);
  });

  it("drops malformed items but keeps valid ones", () => {
    const valid = { ...item(1), viewedAt: 5 };
    window.localStorage.setItem(
      KEY,
      JSON.stringify([valid, null, 3, { href: "x" }, { ...valid, viewedAt: "5" }]),
    );
    expect(getRecent()).toEqual([valid]);
  });
});

describe("recordRecent", () => {
  it("stores the item with a timestamp", () => {
    recordRecent(item(1));
    expect(getRecent()).toEqual([{ ...item(1), viewedAt: 1_000 }]);
  });

  it("moves a re-viewed item to the front without duplicating it", () => {
    recordRecent(item(1));
    vi.setSystemTime(2_000);
    recordRecent(item(2));
    vi.setSystemTime(3_000);
    recordRecent(item(1));
    expect(getRecent().map((entry) => entry.href)).toEqual(["/skills/1", "/skills/2"]);
    expect(getRecent()[0].viewedAt).toBe(3_000);
  });

  it("keeps only the 6 most recent items", () => {
    for (let n = 1; n <= 8; n += 1) recordRecent(item(n));
    const hrefs = getRecent().map((entry) => entry.href);
    expect(hrefs).toHaveLength(6);
    expect(hrefs[0]).toBe("/skills/8");
    expect(hrefs).not.toContain("/skills/1");
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => recordRecent(item(1))).not.toThrow();
  });
});
