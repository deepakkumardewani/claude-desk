import { describe, expect, it } from "vite-plus/test";
import {
  applySettingsOp,
  deepEqual,
  getAtPointer,
  isRecord,
  revertSettingsEntries,
  toPointer,
  type Json,
  type SettingsOp,
} from "./merge.js";
import { DiscoverError } from "./errors.js";

const op = (pointer: string, incoming: unknown): SettingsOp => ({
  itemId: "item",
  pointer,
  incoming,
});

describe("pointer helpers", () => {
  it("escapes ~ and / when building pointers", () => {
    expect(toPointer("a/b", "c~d")).toBe("/a~1b/c~0d");
  });

  it("reads values via pointer, undefined when absent or through non-objects", () => {
    const doc = { a: { "b/c": 1 }, list: [1] };
    expect(getAtPointer(doc, "/a/b~1c")).toBe(1);
    expect(getAtPointer(doc, "/a/missing")).toBeUndefined();
    expect(getAtPointer(doc, "/list/0")).toBeUndefined();
  });

  it("refuses reserved keys", () => {
    expect(() => getAtPointer({}, "/__proto__/x")).toThrow(DiscoverError);
    expect(() => applySettingsOp({}, op("/constructor", 1))).toThrow(/reserved/);
  });

  it("isRecord and deepEqual ignore key order but not content", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(undefined, null)).toBe(true);
  });
});

describe("applySettingsOp conflicts", () => {
  it("rejects a reserved key nested inside the incoming value", () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(() => applySettingsOp({ a: {} }, op("/a", hostile))).toThrow(DiscoverError);
    expect(({} as Json).polluted).toBeUndefined();
  });

  it("rejects when a path segment is a scalar in the existing settings", () => {
    const attempt = () => applySettingsOp({ permissions: "nope" }, op("/permissions/allow", ["x"]));
    expect(attempt).toThrow(/not an object/);
  });

  it("rejects when a path segment is an array in the existing settings", () => {
    expect(() => applySettingsOp({ a: [] }, op("/a/b", 1))).toThrow(DiscoverError);
  });

  it("scalar conflict replaces the value and records the previous one", () => {
    const { doc, added } = applySettingsOp({ model: "old" }, op("/model", "new"));
    expect(doc).toEqual({ model: "new" });
    expect(added).toEqual([{ pointer: "/model", value: "new", previous: "old" }]);
  });

  it("an identical scalar is a no-op", () => {
    const { doc, added } = applySettingsOp({ model: "same" }, op("/model", "same"));
    expect(doc).toEqual({ model: "same" });
    expect(added).toEqual([]);
  });

  it("type mismatch between array and object replaces and records previous", () => {
    const { doc, added } = applySettingsOp({ a: ["x"] }, op("/a", { k: 1 }));
    expect(doc).toEqual({ a: { k: 1 } });
    expect(added[0]).toMatchObject({ pointer: "/a", previous: ["x"] });
  });
});

describe("applySettingsOp happy paths", () => {
  it("creates missing containers and records the topmost created node as root", () => {
    const { doc, added } = applySettingsOp({ keep: 1 }, op("/hooks/PreToolUse", [{ m: 1 }]));
    expect(doc).toEqual({ keep: 1, hooks: { PreToolUse: [{ m: 1 }] } });
    expect(added).toEqual([{ pointer: "/hooks/PreToolUse", value: [{ m: 1 }], root: "/hooks" }]);
  });

  it("unions arrays, appending only elements not already present", () => {
    const { doc, added } = applySettingsOp(
      { permissions: { allow: ["a", { x: 1, y: 2 }] } },
      op("/permissions/allow", ["a", { y: 2, x: 1 }, "b", "b"]),
    );
    expect(doc).toEqual({ permissions: { allow: ["a", { x: 1, y: 2 }, "b"] } });
    expect(added).toEqual([{ pointer: "/permissions/allow", value: ["b"] }]);
  });

  it("fully-applied array merge is a no-op returning the same data", () => {
    const start = { list: [1, 2] };
    const { doc, added } = applySettingsOp(start, op("/list", [2, 1]));
    expect(doc).toEqual(start);
    expect(added).toEqual([]);
  });

  it("recurses into objects, adding only new keys", () => {
    const { doc, added } = applySettingsOp({ env: { A: "1" } }, op("/env", { A: "1", B: "2" }));
    expect(doc).toEqual({ env: { A: "1", B: "2" } });
    expect(added).toEqual([{ pointer: "/env/B", value: "2", root: "/env/B" }]);
  });

  it("does not mutate the input document", () => {
    const start = { a: { b: [1] } };
    const snapshot = structuredClone(start);
    applySettingsOp(start, op("/a/b", [2]));
    expect(start).toEqual(snapshot);
  });

  it("applying twice yields no further additions", () => {
    const first = applySettingsOp({}, op("/permissions/allow", ["a"]));
    const second = applySettingsOp(first.doc, op("/permissions/allow", ["a"]));
    expect(second.added).toEqual([]);
  });

  it("escapes keys containing slashes when recording nested pointers", () => {
    const { added } = applySettingsOp({ m: {} }, op("/m", { "a/b": 1 }));
    expect(added[0].pointer).toBe("/m/a~1b");
  });
});

describe("revertSettingsEntries", () => {
  const roundTrip = (start: Json, ops: SettingsOp[]) => {
    let doc = start;
    const entries = ops.flatMap((o) => {
      const result = applySettingsOp(doc, o);
      doc = result.doc;
      return result.added;
    });
    return { applied: doc, reverted: revertSettingsEntries(doc, entries) };
  };

  it("restores the original document, pruning containers the install created", () => {
    const start = { keep: { a: 1 } };
    const { applied, reverted } = roundTrip(start, [
      op("/hooks/PreToolUse", [{ m: 1 }]),
      op("/permissions/allow", ["x"]),
    ]);
    expect(applied).not.toEqual(start);
    expect(reverted).toEqual(start);
  });

  it("removes only appended array elements, keeping user entries", () => {
    const start = { permissions: { allow: ["mine"] } };
    const { reverted } = roundTrip(start, [op("/permissions/allow", ["mine", "ours"])]);
    expect(reverted).toEqual(start);
  });

  it("keeps user additions made after install in a created container", () => {
    const { applied } = roundTrip({}, [op("/hooks/Stop", [{ c: 1 }])]);
    const edited = { ...applied, hooks: { ...(applied.hooks as Json), Other: [1] } };
    const entries = applySettingsOp({}, op("/hooks/Stop", [{ c: 1 }])).added;
    expect(revertSettingsEntries(edited, entries)).toEqual({ hooks: { Other: [1] } });
  });

  it("restores a replaced scalar from `previous`", () => {
    const start = { model: "old" };
    const { reverted } = roundTrip(start, [op("/model", "new")]);
    expect(reverted).toEqual(start);
  });

  it("is a no-op when the added value is already gone", () => {
    const entries = applySettingsOp({}, op("/a/b", 1)).added;
    expect(revertSettingsEntries({ other: true }, entries)).toEqual({ other: true });
  });

  it("returns the document unchanged for no entries and for entries without a root", () => {
    expect(revertSettingsEntries({ a: 1 }, [])).toEqual({ a: 1 });
    expect(revertSettingsEntries({ a: 1 }, [{ pointer: "/a", value: 1 }])).toEqual({ a: 1 });
  });

  it("keeps a now-empty array when the entry has no root", () => {
    const result = revertSettingsEntries({ list: ["x"] }, [{ pointer: "/list", value: ["x"] }]);
    expect(result).toEqual({ list: [] });
  });
});
