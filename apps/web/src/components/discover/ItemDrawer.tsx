import { useEffect, useState } from "react";
import type { DiscoveredItem } from "schema";
import { convertedPreview } from "../../lib/convertPreview";
import { fetchRepoFile, type ScannedRepo } from "../../lib/discoverApi";
import { parseFrontmatter } from "../../lib/frontmatter";
import { MarkdownView } from "../MarkdownView";
import { SkillHeader } from "../SkillHeader";
import { KindChip, pluginChildren } from "./ItemCard";

type ItemDrawerProps = {
  item: DiscoveredItem;
  repo: Pick<ScannedRepo, "owner" | "repo" | "sha">;
  onClose: () => void;
  actions?: React.ReactNode;
};

type FileState =
  | { status: "loading" }
  | { status: "ready"; content: string }
  | { status: "error"; message: string };

/** Fetches a repo file only while the component using it is mounted (i.e. the drawer is open). */
function useRepoFile(repo: ItemDrawerProps["repo"], path: string): FileState {
  const [state, setState] = useState<FileState>({ status: "loading" });
  const { owner, repo: name, sha } = repo;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void fetchRepoFile({ owner, repo: name, sha, path }).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", content: result.content }
          : { status: "error", message: result.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [owner, name, sha, path]);

  return state;
}

/** A fence longer than any backtick run inside, so file content can never close it early. */
function fenced(code: string, language: string): string {
  const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}

function CodeView({ code, language }: { code: string; language: string }) {
  return <MarkdownView content={fenced(code, language)} />;
}

function FileState({
  state,
  children,
}: {
  state: FileState;
  children: (content: string) => React.ReactNode;
}) {
  if (state.status === "loading") return <p className="text-sm text-text-muted">Loading…</p>;
  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn't load file: {state.message}
      </p>
    );
  }
  return <>{children(state.content)}</>;
}

function MarkdownContent({ content, fallbackTitle }: { content: string; fallbackTitle: string }) {
  const { data, body } = parseFrontmatter(content);
  return (
    <>
      <SkillHeader data={data} fallbackTitle={fallbackTitle} />
      {data["allowed-tools"] ? (
        <p className="mt-3 font-mono text-xs text-text-muted">
          allowed-tools: {data["allowed-tools"]}
        </p>
      ) : null}
      <div className="mt-6">
        <MarkdownView content={body} />
      </div>
    </>
  );
}

function MarkdownFile({
  repo,
  path,
  fallbackTitle,
}: {
  repo: ItemDrawerProps["repo"];
  path: string;
  fallbackTitle: string;
}) {
  const state = useRepoFile(repo, path);
  return (
    <FileState state={state}>
      {(content) => <MarkdownContent content={content} fallbackTitle={fallbackTitle} />}
    </FileState>
  );
}

type PreviewMode = "original" | "converted";
const PREVIEW_MODES: ReadonlyArray<{ mode: PreviewMode; label: string }> = [
  { mode: "original", label: "Original" },
  { mode: "converted", label: "Converted preview" },
];

/** Cursor/Copilot files: the same fetched source, shown as-is or as it would be installed. */
function ConvertibleDetail({
  item,
  repo,
  path,
}: {
  item: DiscoveredItem;
  repo: ItemDrawerProps["repo"];
  path: string;
}) {
  const [mode, setMode] = useState<PreviewMode>("original");
  const state = useRepoFile(repo, path);
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Preview mode" className="flex gap-1">
        {PREVIEW_MODES.map(({ mode: value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`cursor-pointer rounded px-3 py-1 text-sm ring-1 ring-border-subtle ${
              mode === value ? "bg-surface-raised font-medium text-text" : "text-text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <FileState state={state}>
        {(content) => (
          <MarkdownContent
            content={mode === "original" ? content : convertedPreview(item, content, repo.repo)}
            fallbackTitle={item.name}
          />
        )}
      </FileState>
    </div>
  );
}

function ScriptFile({ repo, path }: { repo: ItemDrawerProps["repo"]; path: string }) {
  const state = useRepoFile(repo, path);
  return (
    <div>
      <p className="font-mono text-xs text-text-muted">{path}</p>
      <FileState state={state}>
        {(content) => <CodeView code={content} language="bash" />}
      </FileState>
    </div>
  );
}

type HookPayload = {
  event?: string;
  matcher?: string;
  hooks?: Array<{ command?: string; type?: string }>;
  missingScripts?: string[];
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-text">{children}</dd>
    </div>
  );
}

function HookDetail({ item, repo }: { item: DiscoveredItem; repo: ItemDrawerProps["repo"] }) {
  const payload = (item.payload ?? {}) as HookPayload;
  const commands = (payload.hooks ?? []).flatMap((h) => (h.command ? [h.command] : []));
  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-3">
        <Detail label="Event">{payload.event}</Detail>
        <Detail label="Matcher">{payload.matcher ?? "(all)"}</Detail>
      </dl>
      <section aria-label="Commands" className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Command</h3>
        {commands.map((command) => (
          <CodeView key={command} code={command} language="bash" />
        ))}
      </section>
      {item.files.length > 0 ? (
        <section aria-label="Referenced scripts" className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Referenced scripts
          </h3>
          {item.files.map((file) => (
            <ScriptFile key={file.path} repo={repo} path={file.path} />
          ))}
        </section>
      ) : null}
      {payload.missingScripts?.length ? (
        <p className="text-xs text-text-muted">
          Missing from repo: {payload.missingScripts.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

type McpPayload = {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, unknown>;
};

function McpDetail({ item }: { item: DiscoveredItem }) {
  const server = (item.payload ?? {}) as McpPayload;
  const transport = server.type ?? (server.url ? "http" : "stdio");
  const envKeys = Object.keys(server.env ?? {});
  return (
    <dl className="flex flex-col gap-3">
      <Detail label="Transport">{transport}</Detail>
      {server.command ? (
        <Detail label="Command">
          <code className="font-mono">{[server.command, ...(server.args ?? [])].join(" ")}</code>
        </Detail>
      ) : null}
      {server.url ? (
        <Detail label="URL">
          <code className="font-mono">{server.url}</code>
        </Detail>
      ) : null}
      <Detail label="Environment keys">
        {envKeys.length > 0 ? (
          <span className="font-mono">{envKeys.join(", ")}</span>
        ) : (
          <span className="text-text-muted">none</span>
        )}
      </Detail>
    </dl>
  );
}

function SettingDetail({ item }: { item: DiscoveredItem }) {
  const { key, value } = (item.payload ?? {}) as { key?: string; value?: unknown };
  return <CodeView code={JSON.stringify({ [key ?? item.name]: value }, null, 2)} language="json" />;
}

function PluginDetail({ item }: { item: DiscoveredItem }) {
  const payload = (item.payload ?? {}) as { marketplace?: string; plugin?: string };
  const children = pluginChildren(item);
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        <Detail label="Plugin">{payload.plugin ?? item.name}</Detail>
        {payload.marketplace ? <Detail label="Marketplace">{payload.marketplace}</Detail> : null}
      </dl>
      <section aria-label="Plugin contents" className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Contains ({children.length})
        </h3>
        <ul className="flex flex-col gap-2">
          {children.map((child) => (
            <li key={child.id} className="flex items-center gap-2 text-sm text-text">
              <KindChip kind={child.kind} />
              {child.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Skill folders list SKILL.md among their files; agents/commands have a single file. */
function primaryMarkdownPath(item: DiscoveredItem): string | undefined {
  const files = item.files.map((f) => f.path);
  // Convertibles are a single source file whose name may not end in .md (.mdc, .cursorrules).
  if (item.kind === "convertible") return files[0];
  return files.find((p) => /(?:^|\/)SKILL\.md$/.test(p)) ?? files.find((p) => p.endsWith(".md"));
}

function DrawerBody({ item, repo }: { item: DiscoveredItem; repo: ItemDrawerProps["repo"] }) {
  switch (item.kind) {
    case "hook":
      return <HookDetail item={item} repo={repo} />;
    case "mcp":
      return <McpDetail item={item} />;
    case "setting":
      return <SettingDetail item={item} />;
    case "plugin":
      return <PluginDetail item={item} />;
    default: {
      const path = primaryMarkdownPath(item);
      if (!path) return <p className="text-sm text-text-muted">No previewable file.</p>;
      if (item.kind === "convertible" && item.convertsTo) {
        return <ConvertibleDetail item={item} repo={repo} path={path} />;
      }
      return <MarkdownFile repo={repo} path={path} fallbackTitle={item.name} />;
    }
  }
}

type DrawerShellProps = {
  ariaLabel: string;
  header: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional action row (links, Install…) pinned under the header. */
  actions?: React.ReactNode;
};

/** Shared right-side drawer chrome: backdrop, Escape-to-close, header, scrolling body. */
export function DrawerShell({ ariaLabel, header, onClose, children, actions }: DrawerShellProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close drawer backdrop"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-xl ring-1 ring-border-subtle"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">{header}</div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-2 py-1 text-sm text-text-muted hover:text-text"
          >
            Close
          </button>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3">
            {actions}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>
      </aside>
    </div>
  );
}

export function ItemDrawer({ item, repo, onClose, actions }: ItemDrawerProps) {
  return (
    <DrawerShell
      ariaLabel={`${item.name} details`}
      onClose={onClose}
      actions={actions}
      header={
        <>
          <KindChip kind={item.kind} />
          <span className="truncate font-mono text-xs text-text-muted">{item.path}</span>
        </>
      }
    >
      <DrawerBody item={item} repo={repo} />
    </DrawerShell>
  );
}
