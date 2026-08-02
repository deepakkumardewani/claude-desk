import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { FileTree } from "../components/FileTree";
import { ThemeToggle } from "../components/ThemeToggle";
import { ScopeSwitcher } from "../components/ScopeSwitcher";
import { fetchTree, type TreeCategory } from "../lib/api";
import { useScope } from "../lib/scope";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/backups", label: "Backups" },
  { to: "/mcp", label: "MCP Servers" },
  { to: "/settings", label: "Settings" },
  { to: "/usage", label: "Usage" },
  { to: "/claude-md", label: "CLAUDE.md" },
  { to: "/workspace", label: "Workspace" },
];

const FULL_WIDTH_ROUTES = new Set([
  "/",
  "/backups",
  "/mcp",
  "/settings",
  "/usage",
  "/claude-md",
  "/workspace",
]);

/** The file-tree explorer only accompanies category browsers; primary pages own their layout. */
function isFileRoute(pathname: string): boolean {
  return !FULL_WIDTH_ROUTES.has(pathname);
}

export function Layout() {
  const { pathname } = useLocation();
  const { activeScope } = useScope();
  const showTree = isFileRoute(pathname);
  const [categories, setCategories] = useState<TreeCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchTree(activeScope)
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
  }, [activeScope]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface text-text">
      <header className="shrink-0">
        <div className="flex items-center justify-between gap-4 px-6 py-3.5">
          <NavLink to="/" end className="group flex items-center gap-3 focus-visible:outline-none">
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
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
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
            <FileTree categories={categories} loading={loading} error={error} />
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
