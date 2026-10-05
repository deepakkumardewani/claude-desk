import { DiscoverError } from "./errors.js";

export type Json = Record<string, unknown>;

/** One additive change to the settings document (spec §4.6 "merged into settings.json"). */
export type SettingsOp = {
  itemId: string;
  /** RFC 6901 JSON pointer, e.g. `/permissions` or `/hooks/PreToolUse`. */
  pointer: string;
  incoming: unknown;
  /** Set for plugin installs so the plan can list them as marketplace changes. */
  marketplace?: { marketplace: string; plugin: string };
};

/**
 * What a merge actually added, in the manifest's `settingsEntries` shape (spec §4.4).
 * For array pointers `value` holds only the appended elements; for new keys the whole value.
 */
export type AddedEntry = {
  pointer: string;
  value: unknown;
  /** Present when the merge replaced an existing value; revert puts it back. */
  previous?: unknown;
  /** Pointer of the topmost node the merge created, so revert can prune now-empty containers. */
  root?: string;
};

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const escapeSegment = (segment: string) => segment.replace(/~/g, "~0").replace(/\//g, "~1");
const unescapeSegment = (segment: string) => segment.replace(/~1/g, "/").replace(/~0/g, "~");

export const toPointer = (...segments: string[]): string =>
  `/${segments.map(escapeSegment).join("/")}`;

function assertSafeKey(key: string): void {
  if (FORBIDDEN_KEYS.has(key)) {
    throw new DiscoverError("BAD_INPUT", `Refusing to merge reserved settings key "${key}"`);
  }
}

function segmentsOf(pointer: string): string[] {
  const segments = pointer.slice(1).split("/").map(unescapeSegment);
  segments.forEach(assertSafeKey);
  return segments;
}

/** Key-order independent serialization so structurally equal values compare equal. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value) ?? "null";
  const body = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${body.join(",")}}`;
}

export const deepEqual = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

export function getAtPointer(doc: Json, pointer: string): unknown {
  let current: unknown = doc;
  for (const segment of segmentsOf(pointer)) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Additive merge: arrays union, objects recurse, scalars take the incoming value. */
function mergeValue(before: unknown, incoming: unknown, pointer: string, added: AddedEntry[]) {
  if (before === undefined) {
    added.push({ pointer, value: incoming });
    return incoming;
  }
  if (Array.isArray(before) && Array.isArray(incoming)) {
    const fresh: unknown[] = [];
    for (const element of incoming) {
      const known = [...before, ...fresh].some((existing) => deepEqual(existing, element));
      if (!known) fresh.push(element);
    }
    if (fresh.length === 0) return before;
    added.push({ pointer, value: fresh });
    return [...before, ...fresh];
  }
  if (isRecord(before) && isRecord(incoming)) {
    const merged: Json = { ...before };
    for (const key of Object.keys(incoming)) {
      assertSafeKey(key);
      merged[key] = mergeValue(
        before[key],
        incoming[key],
        `${pointer}/${escapeSegment(key)}`,
        added,
      );
    }
    return merged;
  }
  if (deepEqual(before, incoming)) return before;
  added.push({ pointer, value: incoming, previous: before });
  return incoming;
}

function mergeInto(
  node: unknown,
  segments: string[],
  op: SettingsOp,
  walked: string[],
  added: AddedEntry[],
): unknown {
  if (segments.length === 0) return mergeValue(node, op.incoming, op.pointer, added);
  if (node !== undefined && !isRecord(node)) {
    throw new DiscoverError(
      "BAD_INPUT",
      `Cannot merge ${op.pointer}: ${toPointer(...walked)} is not an object in the existing settings`,
    );
  }
  const [head, ...rest] = segments;
  const container = node ?? {};
  return {
    ...container,
    [head]: mergeInto(container[head], rest, op, [...walked, head], added),
  };
}

/** Pointer of the first node on the path that `doc` lacks, or undefined when the whole path exists. */
function firstMissingPointer(doc: Json, segments: string[]): string | undefined {
  let current: unknown = doc;
  for (const [index, segment] of segments.entries()) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return toPointer(...segments.slice(0, index + 1));
    }
    current = current[segment];
  }
  return undefined;
}

/** Pure: returns a new document plus exactly what this op added (empty when already applied). */
export function applySettingsOp(doc: Json, op: SettingsOp): { doc: Json; added: AddedEntry[] } {
  const added: AddedEntry[] = [];
  const merged = mergeInto(doc, segmentsOf(op.pointer), op, [], added);
  const withRoots = added.map((entry) => {
    const root = firstMissingPointer(doc, segmentsOf(entry.pointer));
    return root === undefined ? entry : { ...entry, root };
  });
  return { doc: merged as Json, added: withRoots };
}

// ---------- revert (uninstall) ----------

function setAt(node: unknown, segments: string[], value: unknown): unknown {
  if (segments.length === 0) return value;
  const [head, ...rest] = segments;
  const container = isRecord(node) ? node : {};
  return { ...container, [head]: setAt(container[head], rest, value) };
}

function removeAt(node: unknown, segments: string[]): unknown {
  if (!isRecord(node) || segments.length === 0) return node;
  const [head, ...rest] = segments;
  if (rest.length > 0) return { ...node, [head]: removeAt(node[head], rest) };
  const { [head]: _removed, ...kept } = node;
  return kept;
}

/** Drops containers the install created once nothing else lives in them; stops at the first non-empty one. */
function pruneCreatedAncestors(doc: Json, segments: string[], root: string): Json {
  const rootDepth = segmentsOf(root).length;
  let result = doc;
  for (let depth = segments.length - 1; depth >= rootDepth; depth -= 1) {
    const ancestor = segments.slice(0, depth);
    const node = getAtPointer(result, toPointer(...ancestor));
    if (!isRecord(node) || Object.keys(node).length > 0) break;
    result = removeAt(result, ancestor) as Json;
  }
  return result;
}

function revertEntry(doc: Json, entry: AddedEntry): Json {
  const segments = segmentsOf(entry.pointer);
  if ("previous" in entry) return setAt(doc, segments, entry.previous) as Json;
  const current = getAtPointer(doc, entry.pointer);
  if (current === undefined) return doc;
  if (Array.isArray(entry.value) && Array.isArray(current)) {
    const remaining = current.filter(
      (el) => !(entry.value as unknown[]).some((v) => deepEqual(v, el)),
    );
    if (remaining.length > 0 || entry.root === undefined)
      return setAt(doc, segments, remaining) as Json;
  }
  if (entry.root === undefined) return doc;
  return pruneCreatedAncestors(removeAt(doc, segments) as Json, segments, entry.root);
}

/**
 * Pure inverse of `applySettingsOp`: removes exactly the recorded additions and restores
 * replaced scalars, leaving every other key (and key order) untouched (spec §4.4).
 */
export function revertSettingsEntries(doc: Json, entries: readonly AddedEntry[]): Json {
  return [...entries].reverse().reduce(revertEntry, doc);
}
