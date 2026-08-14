import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "../lib/scope";
import {
  dirBasename,
  shortenPath,
  type ProjectListItem,
  type Workspace,
} from "../lib/workspaceState";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`size-3.5 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function workspaceLabel(workspace: Workspace): { name: string; path?: string } {
  if (workspace.kind === "user") {
    return { name: "~/.claude" };
  }
  return { name: dirBasename(workspace.dir), path: shortenPath(workspace.dir) };
}

function matchesQuery(project: ProjectListItem, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = `${project.name} ${project.dir}`.toLowerCase();
  return haystack.includes(query);
}

function sortProjects(projects: ProjectListItem[]): ProjectListItem[] {
  return [...projects].sort((a, b) => {
    if (a.exists !== b.exists) {
      return a.exists ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function ScopeSwitcher() {
  const { workspace, setWorkspace, projects, extras, addProject, removeExtra } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const current = workspaceLabel(workspace);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sortProjects(projects).filter((project) => matchesQuery(project, normalized));
  }, [projects, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    filterRef.current?.focus();

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleAdd() {
    const dir = pathInput.trim();
    if (!dir) {
      return;
    }
    await addProject(dir);
    setPathInput("");
    setOpen(false);
  }

  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex max-w-64 items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="rounded bg-surface-raised px-1.5 py-0.5 font-display text-[0.65rem] font-semibold uppercase tracking-wider text-text-muted">
          {workspace.kind === "user" ? "User" : "Project"}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{current.name}</span>
          {current.path ? (
            <span className="block truncate font-mono text-[0.65rem] text-text-muted">
              {current.path}
            </span>
          ) : null}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 flex w-[22rem] max-h-[min(32rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-raised shadow-lg"
        >
          <MenuRow
            selected={workspace.kind === "user"}
            title="User"
            subtitle="Machine-wide ~/.claude"
            onSelect={() => {
              setWorkspace({ kind: "user" });
              closeMenu();
            }}
          />

          <div className="flex shrink-0 flex-col gap-2 border-t border-border-subtle px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Projects
              </p>
              <p className="font-mono text-[0.65rem] text-text-muted">{projects.length}</p>
            </div>
            {projects.length > 6 ? (
              <input
                ref={filterRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name or path"
                className="w-full rounded-md border border-border-subtle bg-surface px-2 py-1.5 font-mono text-xs text-text placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {projects.length === 0 ? (
              <p className="px-3 py-3 text-sm text-text-muted">No projects yet</p>
            ) : visibleProjects.length === 0 ? (
              <p className="px-3 py-3 text-sm text-text-muted">No matching projects</p>
            ) : (
              visibleProjects.map((project) => (
                <ProjectRow
                  key={project.dir}
                  project={project}
                  selected={workspace.kind === "project" && workspace.dir === project.dir}
                  extra={extras.includes(project.dir)}
                  onSelect={() => {
                    if (!project.exists) {
                      return;
                    }
                    setWorkspace({ kind: "project", dir: project.dir });
                    closeMenu();
                  }}
                  onRemove={() => removeExtra(project.dir)}
                />
              ))
            )}
          </div>

          <form
            className="flex shrink-0 gap-2 border-t border-border-subtle bg-surface-soft p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAdd();
            }}
          >
            <input
              type="text"
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              placeholder="Absolute project path"
              className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface px-2 py-1.5 font-mono text-xs text-text placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg transition hover:opacity-90"
            >
              Add
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({
  selected,
  title,
  subtitle,
  onSelect,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`flex w-full shrink-0 flex-col items-start gap-0.5 px-3 py-2.5 text-left transition hover:bg-surface-soft ${
        selected ? "bg-surface-soft" : ""
      }`}
    >
      <span className="text-sm font-medium text-text">{title}</span>
      <span className="text-xs text-text-muted">{subtitle}</span>
    </button>
  );
}

function ProjectRow({
  project,
  selected,
  extra,
  onSelect,
  onRemove,
}: {
  project: ProjectListItem;
  selected: boolean;
  extra: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-0.5 px-1 ${selected ? "bg-surface-soft" : ""} ${
        project.exists ? "" : "opacity-60"
      }`}
    >
      <button
        type="button"
        role="menuitem"
        disabled={!project.exists}
        onClick={onSelect}
        className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-surface disabled:cursor-not-allowed"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{project.name}</span>
          {project.exists ? null : (
            <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-text-muted">
              Missing
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[0.65rem] text-text-muted">
          {shortenPath(project.dir)}
        </span>
      </button>
      {extra ? (
        <button
          type="button"
          aria-label={`Remove ${project.name}`}
          onClick={onRemove}
          className="mr-1 rounded-md px-2 py-1 text-text-muted hover:bg-surface hover:text-text"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
