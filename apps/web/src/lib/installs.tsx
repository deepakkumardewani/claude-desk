import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { InstalledEntry, InstallTarget, ItemKind } from "schema";
import { listInstalls, type DiscoverApiError } from "./discoverApi";

export type InstallLookup = {
  kind?: ItemKind;
  /** `owner/repo/skillId` of a skills.sh hit. */
  skillsShId?: string;
  source?: { owner: string; repo: string; path: string };
};

const sameTarget = (a: InstallTarget, b: InstallTarget) =>
  a.scope === b.scope && (a.projectDir ?? "") === (b.projectDir ?? "");

function matchesLookup(entry: InstalledEntry, lookup: InstallLookup): boolean {
  if (lookup.skillsShId && entry.source.skillsShId === lookup.skillsShId) return true;
  const { source } = lookup;
  if (!source) return false;
  return (
    entry.source.owner === source.owner &&
    entry.source.repo === source.repo &&
    entry.source.path === source.path &&
    (lookup.kind === undefined || entry.itemKind === lookup.kind)
  );
}

/** The install of this item in the active scope, matched by skills.sh id or by source + path. */
export function findInstalled(
  entries: InstalledEntry[],
  target: InstallTarget,
  lookup: InstallLookup,
): InstalledEntry | undefined {
  return entries.find((entry) => sameTarget(entry.target, target) && matchesLookup(entry, lookup));
}

export type InstallsState = {
  entries: InstalledEntry[];
  /** Scope the Installed badges are computed for. */
  target: InstallTarget;
  loading: boolean;
  /** True while a GitHub update check is running. */
  checking: boolean;
  error: DiscoverApiError | null;
  /** Re-reads the manifest (cheap, no GitHub). */
  refresh: () => Promise<void>;
  /** Compares every installed repo with GitHub; results flow to every badge. */
  check: () => Promise<void>;
};

const USER_TARGET: InstallTarget = { scope: "user" };
const noop = async () => {};

/** Outside a provider (isolated component tests) nothing is installed. */
const InstallsContext = createContext<InstallsState>({
  entries: [],
  target: USER_TARGET,
  loading: false,
  checking: false,
  error: null,
  refresh: noop,
  check: noop,
});

export function InstallsProvider({
  target,
  children,
}: {
  target: InstallTarget;
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<InstalledEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<DiscoverApiError | null>(null);

  const load = useCallback(async (withCheck: boolean) => {
    const result = await listInstalls({ check: withCheck });
    if (result.ok) {
      setEntries(result.entries);
      setError(null);
    } else setError(result);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load(false);
    setLoading(false);
  }, [load]);

  const check = useCallback(async () => {
    setChecking(true);
    await load(true);
    setChecking(false);
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ entries, target, loading, checking, error, refresh, check }),
    [entries, target, loading, checking, error, refresh, check],
  );
  return <InstallsContext.Provider value={value}>{children}</InstallsContext.Provider>;
}

export const useInstalls = (): InstallsState => useContext(InstallsContext);

/** Badge state for one item: absent when not installed in the active scope. */
export function useInstalledEntry(lookup: InstallLookup): InstalledEntry | undefined {
  const { entries, target } = useInstalls();
  const { kind, skillsShId, source } = lookup;
  return useMemo(
    () => findInstalled(entries, target, { kind, skillsShId, source }),
    [entries, target, kind, skillsShId, source],
  );
}
