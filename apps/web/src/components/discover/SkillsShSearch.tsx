import { useEffect, useState } from "react";
import type { DiscoveredItem, SkillsShResult } from "schema";
import {
  resolveSkillsShItem,
  searchSkillsSh,
  type DiscoverApiError,
  type ScannedRepo,
} from "../../lib/discoverApi";
import { useInstalledEntry, useInstalls } from "../../lib/installs";
import { InstallDialog } from "./InstallDialog";
import { InstalledBadge } from "./ItemCard";
import { Bone } from "../Skeleton";
import { DrawerSkeleton, DrawerShell, ItemDrawer } from "./ItemDrawer";

export const SKILLS_SH_SEARCH_DEBOUNCE_MS = 250;
export const SKILLS_SH_MIN_QUERY_LENGTH = 2;
const SKILLS_SH_URL = "https://skills.sh";
const EXAMPLE_QUERIES = ["react", "testing", "pdf", "git", "docs"];

const compactCount = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatInstalls = (installs: number): string => compactCount.format(installs);

const linkClass = "text-sm font-medium text-accent underline underline-offset-4";
const actionButton =
  "cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: SkillsShResult[] }
  | { status: "error"; error: DiscoverApiError };

/** Debounced skills.sh search; each new keystroke cancels the pending timer and aborts the in-flight request. */
function useSkillsShSearch(query: string, attempt: number): SearchState {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < SKILLS_SH_MIN_QUERY_LENGTH) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchSkillsSh(trimmed, { signal: controller.signal }).then((result) => {
        if (controller.signal.aborted) return;
        setState(
          result.ok
            ? { status: "ready", results: result.results }
            : { status: "error", error: result },
        );
      });
    }, SKILLS_SH_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, attempt]);

  return state;
}

function ErrorPanel({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="alert" className="rounded-xl bg-surface-raised p-4 text-sm ring-1 ring-danger">
      <p className="font-medium text-text">{title}</p>
      {detail ? <p className="mt-1 text-text-muted">{detail}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function SearchError({ error, onRetry }: { error: DiscoverApiError; onRetry: () => void }) {
  if (error.code === "SKILLS_SH_SCHEMA") {
    return (
      <ErrorPanel title="skills.sh changed its search format">
        <a href={SKILLS_SH_URL} target="_blank" rel="noreferrer" className={linkClass}>
          Open skills.sh
        </a>
      </ErrorPanel>
    );
  }
  const unreachable = error.code === "NETWORK" || error.code === "SKILLS_SH_UNREACHABLE";
  return (
    <ErrorPanel title={unreachable ? "Can't reach skills.sh" : error.message}>
      <button type="button" onClick={onRetry} className={actionButton}>
        Retry
      </button>
    </ErrorPanel>
  );
}

function ExampleChips({ onPick }: { onPick: (query: string) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-raised p-5 ring-1 ring-border-subtle">
      <p className="text-sm text-text-muted">
        Search the skills.sh directory, then install a skill straight into Claude Code. Try:
      </p>
      <div aria-label="Example searches" className="flex flex-wrap gap-2">
        {EXAMPLE_QUERIES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="cursor-pointer rounded-full bg-surface px-3 py-1 text-xs text-text-muted ring-1 ring-border-subtle hover:text-text"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ result, onOpen }: { result: SkillsShResult; onOpen: () => void }) {
  const installed = useInstalledEntry({ skillsShId: result.id });
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full cursor-pointer flex-col gap-1 rounded-xl bg-surface-raised p-4 text-left ring-1 ring-border-subtle transition hover:ring-accent"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-text">{result.name}</span>
          {installed ? <InstalledBadge status={installed.status} /> : null}
        </span>
        <span className="truncate font-mono text-xs text-text-muted">{result.source}</span>
        <span className="text-xs text-text-muted" aria-label={`${result.installs} installs`}>
          {formatInstalls(result.installs)} installs
        </span>
      </button>
    </li>
  );
}

type ResolveState =
  | { status: "loading" }
  | { status: "ready"; repo: ScannedRepo; item: DiscoveredItem }
  | { status: "error"; error: DiscoverApiError };

function useResolvedSkill(id: string, attempt: number): ResolveState {
  const [state, setState] = useState<ResolveState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void resolveSkillsShItem(id).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", repo: result.repo, item: result.item }
          : { status: "error", error: result },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);
  return state;
}

type SkillDetailProps = {
  result: SkillsShResult;
  onClose: () => void;
  onInstall: (resolved: { repo: ScannedRepo; item: DiscoveredItem }) => void;
  onOpenRepo?: (source: string) => void;
};

function ResolveError({
  error,
  result,
  onRetry,
  onOpenRepo,
}: {
  error: DiscoverApiError;
  result: SkillsShResult;
  onRetry: () => void;
  onOpenRepo?: (source: string) => void;
}) {
  if (error.code === "SKILL_NOT_FOUND" || error.code === "REPO_NOT_FOUND") {
    return (
      <ErrorPanel title={`Couldn't locate this skill in ${result.source}`}>
        <button type="button" onClick={() => onOpenRepo?.(result.source)} className={actionButton}>
          Open repo in GitHub explorer
        </button>
      </ErrorPanel>
    );
  }
  return (
    <ErrorPanel title={error.message}>
      <button type="button" onClick={onRetry} className={actionButton}>
        Retry
      </button>
    </ErrorPanel>
  );
}

/** Placeholder chrome matching the resolved drawer: KindChip + path header, Install… + two links. */
function ResolvingHeader() {
  return (
    <>
      <Bone className="h-5 w-16 rounded-full" />
      <Bone className="h-4 w-40" />
    </>
  );
}

function ResolvingActions() {
  return (
    <>
      <Bone className="h-8 w-20 rounded-lg" />
      <Bone className="h-4 w-28" />
      <Bone className="h-4 w-32" />
    </>
  );
}

/** Resolves the hit to its live repo skill only once opened, then reuses the shared ItemDrawer. */
function SkillDetail({ result, onClose, onInstall, onOpenRepo }: SkillDetailProps) {
  const [attempt, setAttempt] = useState(0);
  const state = useResolvedSkill(result.id, attempt);

  if (state.status === "loading") {
    return (
      <DrawerShell
        ariaLabel={`${result.name} details`}
        onClose={onClose}
        header={<ResolvingHeader />}
        actions={<ResolvingActions />}
      >
        <DrawerSkeleton />
      </DrawerShell>
    );
  }

  if (state.status === "error") {
    return (
      <DrawerShell
        ariaLabel={`${result.name} details`}
        onClose={onClose}
        header={<span className="truncate font-mono text-xs text-text-muted">{result.id}</span>}
      >
        <ResolveError
          error={state.error}
          result={result}
          onRetry={() => setAttempt((n) => n + 1)}
          onOpenRepo={onOpenRepo}
        />
      </DrawerShell>
    );
  }

  const { repo, item } = state;
  return (
    <ItemDrawer
      item={item}
      repo={repo}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={() => onInstall({ repo, item })} className={actionButton}>
            Install…
          </button>
          <a
            href={`${repo.htmlUrl}/tree/${repo.sha}/${item.path}`}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            View on GitHub
          </a>
          <a
            href={`${SKILLS_SH_URL}/${result.id}`}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            View on skills.sh
          </a>
        </>
      }
    />
  );
}

export type SkillsShSearchProps = {
  /** Switches to the GitHub explorer for `owner/repo` (resolution-failure fallback). */
  onOpenRepo?: (source: string) => void;
};

export function SkillsShSearch({ onOpenRepo }: SkillsShSearchProps) {
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<SkillsShResult | null>(null);
  const [installing, setInstalling] = useState<{
    repo: ScannedRepo;
    item: DiscoveredItem;
    skillsShId: string;
  } | null>(null);
  const state = useSkillsShSearch(query, attempt);
  const { refresh: refreshInstalls } = useInstalls();

  function openRepo(source: string) {
    setOpened(null);
    onOpenRepo?.(source);
  }

  return (
    <div className="flex flex-col gap-5">
      <input
        type="search"
        autoFocus
        aria-label="Search skills.sh"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search skills.sh…"
        className="w-full rounded-xl border border-border-subtle bg-surface px-4 py-3 text-base text-text"
      />

      {state.status === "idle" && query.trim().length === 0 ? (
        <ExampleChips onPick={setQuery} />
      ) : null}
      {state.status === "idle" && query.trim().length > 0 ? (
        <p className="text-sm text-text-muted">
          Type at least {SKILLS_SH_MIN_QUERY_LENGTH} characters to search.
        </p>
      ) : null}
      {state.status === "loading" ? <p className="text-sm text-text-muted">Searching…</p> : null}
      {state.status === "error" ? (
        <SearchError error={state.error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : null}
      {state.status === "ready" && state.results.length === 0 ? (
        <p className="text-sm text-text-muted">No skills found for “{query.trim()}”.</p>
      ) : null}
      {state.status === "ready" && state.results.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.results.map((result) => (
            <ResultCard key={result.id} result={result} onOpen={() => setOpened(result)} />
          ))}
        </ul>
      ) : null}

      {opened ? (
        <SkillDetail
          result={opened}
          onClose={() => setOpened(null)}
          onInstall={(resolved) => setInstalling({ ...resolved, skillsShId: opened.id })}
          onOpenRepo={openRepo}
        />
      ) : null}
      {installing ? (
        <InstallDialog
          repo={{
            owner: installing.repo.owner,
            repo: installing.repo.repo,
            sha: installing.repo.sha,
            subpath: installing.repo.subpath,
          }}
          items={[installing.item]}
          skillsShId={installing.skillsShId}
          onClose={() => {
            setInstalling(null);
            void refreshInstalls();
          }}
        />
      ) : null}
    </div>
  );
}
