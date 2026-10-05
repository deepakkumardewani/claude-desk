import { useEffect, useState, type FormEvent } from "react";
import type { DiscoveredItem } from "schema";
import { scanRepo, type DiscoverApiError, type ScanResponse } from "../../lib/discoverApi";
import { useInstalls } from "../../lib/installs";
import { ItemBrowser } from "./ItemCard";
import { InstallDialog } from "./InstallDialog";
import { ItemDrawer } from "./ItemDrawer";

const RECENT_REPOS_KEY = "claude-desk-discover-recent-repos";
const MAX_RECENT_REPOS = 8;
const LOW_RATE_LIMIT_THRESHOLD = 10;
const SHORT_SHA_LENGTH = 7;
const TRUNCATED_BANNER =
  "Repo is very large; some files may be missing — try a /tree/<ref>/<subpath> link";

function readRecentRepos(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_REPOS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT_REPOS)
      : [];
  } catch {
    return [];
  }
}

function writeRecentRepos(repos: string[]): void {
  try {
    window.localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(repos));
  } catch {
    // Storage unavailable (private mode, quota) — recents are a convenience only.
  }
}

/** Input string that re-scans the same repo (and subpath) later. */
function recentKey(repo: ScanResponse["repo"]): string {
  const base = `${repo.owner}/${repo.repo}`;
  return repo.subpath ? `${base}/tree/${repo.ref}/${repo.subpath}` : base;
}

function RateLimitHint({ rateLimit }: { rateLimit: ScanResponse["rateLimit"] }) {
  const { authenticated, remaining, resetAt } = rateLimit;
  if (authenticated || remaining === undefined || remaining >= LOW_RATE_LIMIT_THRESHOLD) {
    return null;
  }
  return (
    <p role="status" className="text-xs text-text-muted">
      Only {remaining} unauthenticated GitHub requests left
      {resetAt ? ` (resets ${new Date(resetAt).toLocaleTimeString()})` : ""}. Set GITHUB_TOKEN or
      run `gh auth login` to raise the limit.
    </p>
  );
}

function RepoHeader({ scan }: { scan: ScanResponse }) {
  const { repo } = scan;
  return (
    <header className="flex flex-col gap-2 rounded-xl bg-surface-raised p-4 ring-1 ring-border-subtle">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-text">
          {repo.owner}/{repo.repo}
        </h2>
        <a
          href={repo.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-accent underline underline-offset-4"
        >
          Open on GitHub
        </a>
      </div>
      {repo.description ? <p className="text-sm text-text-muted">{repo.description}</p> : null}
      <p className="text-xs text-text-muted">
        <span aria-label="Stars">★ {repo.stars.toLocaleString()}</span>
        {" · "}
        <span>
          {repo.ref} @ <code className="font-mono">{repo.sha.slice(0, SHORT_SHA_LENGTH)}</code>
        </span>
        {repo.subpath ? ` · ${repo.subpath}` : ""}
      </p>
      <RateLimitHint rateLimit={scan.rateLimit} />
    </header>
  );
}

function ErrorNotice({ error }: { error: DiscoverApiError }) {
  return (
    <div role="alert" className="rounded-xl bg-surface-raised p-4 text-sm ring-1 ring-danger">
      <p className="font-medium text-text">{error.message}</p>
      {"hint" in error && error.hint ? <p className="mt-1 text-text-muted">{error.hint}</p> : null}
      {"resetAt" in error && error.resetAt ? (
        <p className="mt-1 text-text-muted">
          Resets at {new Date(error.resetAt).toLocaleTimeString()}.
        </p>
      ) : null}
    </div>
  );
}

/** A request from elsewhere in the app to explore a repo; `nonce` lets the same repo be re-requested. */
export type ExploreRequest = { input: string; nonce: number };

export function RepoExplorer({ request }: { request?: ExploreRequest }) {
  const [input, setInput] = useState("");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<DiscoverApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>(readRecentRepos);
  const [openItem, setOpenItem] = useState<DiscoveredItem | null>(null);
  const [installItems, setInstallItems] = useState<DiscoveredItem[] | null>(null);
  const { refresh: refreshInstalls } = useInstalls();

  async function explore(value: string) {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    // A failed rescan must not leave the previous repo's items installable under the error banner.
    setScan(null);
    setOpenItem(null);
    setInstallItems(null);
    const result = await scanRepo(trimmed);
    setLoading(false);
    if (!result.ok) {
      setError(result);
      return;
    }
    setScan(result);
    const key = recentKey(result.repo);
    const next = [key, ...recent.filter((entry) => entry !== key)].slice(0, MAX_RECENT_REPOS);
    setRecent(next);
    writeRecentRepos(next);
  }

  useEffect(() => {
    if (!request) return;
    setInput(request.input);
    void explore(request.input);
    // Only a new request should trigger a scan, not changes to the closed-over state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void explore(input);
  }

  function handleRecent(value: string) {
    setInput(value);
    void explore(value);
  }

  const extraWarnings = scan?.warnings.filter((w) => w !== TRUNCATED_BANNER) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          aria-label="GitHub repository"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="owner/repo or https://github.com/owner/repo"
          className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-sm text-text"
        />
        <button
          type="submit"
          disabled={loading || input.trim() === ""}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "Scanning…" : "Explore"}
        </button>
      </form>

      {recent.length > 0 ? (
        <div aria-label="Recent repositories" className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted">Recent</span>
          {recent.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => handleRecent(entry)}
              className="cursor-pointer rounded-full bg-surface-raised px-3 py-1 font-mono text-xs text-text-muted ring-1 ring-border-subtle hover:text-text"
            >
              {entry}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <ErrorNotice error={error} /> : null}

      {scan ? (
        <>
          <RepoHeader scan={scan} />
          {scan.repo.truncated ? (
            <div
              role="alert"
              className="rounded-xl bg-surface-raised p-3 text-sm ring-1 ring-warning"
            >
              {TRUNCATED_BANNER}
            </div>
          ) : null}
          {extraWarnings.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-text-muted">
              {extraWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <ItemBrowser
            key={`${scan.repo.owner}/${scan.repo.repo}@${scan.repo.sha}/${scan.repo.subpath ?? ""}`}
            items={scan.items}
            repo={scan.repo}
            onOpen={setOpenItem}
            onInstall={setInstallItems}
          />
          {openItem ? (
            <ItemDrawer item={openItem} repo={scan.repo} onClose={() => setOpenItem(null)} />
          ) : null}
          {installItems ? (
            <InstallDialog
              repo={{
                owner: scan.repo.owner,
                repo: scan.repo.repo,
                sha: scan.repo.sha,
                subpath: scan.repo.subpath,
              }}
              items={installItems}
              onClose={() => {
                setInstallItems(null);
                void refreshInstalls();
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
