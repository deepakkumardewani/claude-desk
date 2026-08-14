import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { FileTree } from "../components/FileTree";
import { ThemeToggle } from "../components/ThemeToggle";
import { ScopeSwitcher } from "../components/ScopeSwitcher";
import { fetchTree, type TreeCategory } from "../lib/api";
import { useWorkspace } from "../lib/scope";
import { isFileExplorerPath, workspaceBasePath } from "../lib/workspaceState";

type NavItem = {
  id: string;
  label: string;
  to: string;
  end?: boolean;
};

export function Layout() {
  const { pathname } = useLocation();
  const { workspace, activeScope, projectDir } = useWorkspace();
  const basePath = workspaceBasePath(workspace);
  const showTree = isFileExplorerPath(pathname);
  const [categories, setCategories] = useState<TreeCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const navItems: NavItem[] = [
    { id: "home", label: "Home", to: basePath, end: true },
    { id: "backups", label: "Backups", to: "/backups" },
    { id: "mcp", label: "MCP Servers", to: `${basePath}/mcp` },
    { id: "settings", label: "Settings", to: `${basePath}/settings` },
    { id: "usage", label: "Usage", to: "/usage" },
    { id: "claude-md", label: "CLAUDE.md", to: `${basePath}/claude-md` },
    { id: "workspace", label: "Workspace", to: "/workspace" },
  ];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchTree(activeScope, projectDir ?? undefined)
      .then((tree) => {
        if (!cancelled) {
          setCategories(tree.categories);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load config tree.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeScope, projectDir]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface text-text">
      <header className="shrink-0">
        <div className="flex items-center justify-between gap-4 px-6 py-3.5">
          <NavLink
            to={basePath}
            end
            className="group flex items-center gap-3 focus-visible:outline-none"
          >
            <img
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 object-contain transition-transform duration-200 group-hover:-rotate-3"
            />
            <span className="leading-none">
              <span className="block font-display text-lg font-semibold tracking-tight text-text">
                Claude Desk
              </span>
              <span className="mt-1 block text-[0.65rem] font-medium uppercase tracking-[0.2em] text-text-muted">
                Claude Code config
              </span>
            </span>
          </NavLink>

          <div className="flex items-center gap-1.5">
            <nav aria-label="Primary" className="flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive
                        ? "font-medium text-text underline underline-offset-4 decoration-accent"
                        : "text-text-muted hover:text-text"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-subtle" />
            <ScopeSwitcher />
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-subtle" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showTree && (
          <aside className="w-72 shrink-0 overflow-y-auto overscroll-contain border-r border-border-subtle bg-surface-raised py-4">
            <FileTree categories={categories} loading={loading} error={error} basePath={basePath} />
          </aside>
        )}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto overscroll-contain px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
