import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { fetchProjects } from "./api";
import {
  EXTRA_PROJECTS_KEY,
  dirBasename,
  isMachineSection,
  loadJsonArray,
  loadRememberedWorkspace,
  parseScopedPath,
  pathForWorkspace,
  saveJsonArray,
  saveLastRoute,
  saveRememberedWorkspace,
  workspacesEqual,
  type ProjectListItem,
  type Workspace,
} from "./workspaceState";

function isMachinePath(pathname: string): boolean {
  const segment = pathname.replace(/^\//u, "").split("/")[0] ?? "";
  return isMachineSection(segment);
}

type WorkspaceContextValue = {
  workspace: Workspace;
  projectDir: string | null;
  activeScope: "user" | "project";
  setWorkspace: (workspace: Workspace) => void;
  projects: ProjectListItem[];
  extras: string[];
  addProject: (dir: string) => Promise<void>;
  removeExtra: (dir: string) => void;
  registerSwitchGuard: (isDirty: () => boolean) => () => void;
};

type ScopeContextType = {
  activeScope: "user" | "project";
  availableScopes: Array<"user" | "project">;
  projectPath: string | null;
  setActiveScope: (scope: "user" | "project") => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);
const ScopeContext = createContext<ScopeContextType | undefined>(undefined);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [extras, setExtras] = useState<string[]>(() => loadJsonArray(EXTRA_PROJECTS_KEY));
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [remembered, setRemembered] = useState<Workspace>(
    () => loadRememberedWorkspace() ?? { kind: "user" },
  );
  const [pendingWorkspace, setPendingWorkspace] = useState<Workspace | null>(null);
  const guardsRef = useRef(new Set<() => boolean>());

  const parsed = parseScopedPath(location.pathname);
  const workspace = parsed.workspace ?? remembered;
  const projectDir = workspace.kind === "project" ? workspace.dir : null;
  const activeScope = workspace.kind;
  const sectionPath = parsed.workspace ? parsed.sectionPath : "";

  useEffect(() => {
    const fromUrl = parseScopedPath(location.pathname).workspace;
    if (!fromUrl) {
      return;
    }
    setRemembered((current) => (workspacesEqual(current, fromUrl) ? current : fromUrl));
    saveRememberedWorkspace(fromUrl);
    saveLastRoute(location.pathname);
  }, [location.pathname]);

  const refreshProjects = useCallback(async (extraDirs: string[]) => {
    try {
      const response = await fetchProjects(extraDirs);
      setProjects(response.projects);
    } catch {
      setProjects(
        extraDirs.map((dir) => ({
          dir,
          name: dirBasename(dir),
          exists: false,
        })),
      );
    }
  }, []);

  useEffect(() => {
    void refreshProjects(extras);
  }, [extras, refreshProjects]);

  const persistExtras = useCallback((next: string[]) => {
    setExtras(next);
    saveJsonArray(EXTRA_PROJECTS_KEY, next);
  }, []);

  const applyWorkspace = useCallback(
    (next: Workspace) => {
      setRemembered(next);
      saveRememberedWorkspace(next);
      if (isMachinePath(location.pathname)) {
        return;
      }
      void navigate(pathForWorkspace(next, sectionPath));
    },
    [location.pathname, navigate, sectionPath],
  );

  const setWorkspace = useCallback(
    (next: Workspace) => {
      if (workspacesEqual(next, workspace)) {
        return;
      }
      const blocked = [...guardsRef.current].some((isDirty) => isDirty());
      if (blocked) {
        setPendingWorkspace(next);
        return;
      }
      applyWorkspace(next);
    },
    [applyWorkspace, workspace],
  );

  const registerSwitchGuard = useCallback((isDirty: () => boolean) => {
    guardsRef.current.add(isDirty);
    return () => {
      guardsRef.current.delete(isDirty);
    };
  }, []);

  const addProject = useCallback(
    async (dir: string) => {
      const trimmed = dir.trim();
      if (!trimmed) {
        return;
      }
      const nextExtras = extras.includes(trimmed) ? extras : [...extras, trimmed];
      persistExtras(nextExtras);
      await refreshProjects(nextExtras);
      setWorkspace({ kind: "project", dir: trimmed });
    },
    [extras, persistExtras, refreshProjects, setWorkspace],
  );

  const removeExtra = useCallback(
    (dir: string) => {
      persistExtras(extras.filter((item) => item !== dir));
      if (workspace.kind === "project" && workspace.dir === dir) {
        setWorkspace({ kind: "user" });
      }
    },
    [extras, persistExtras, setWorkspace, workspace],
  );

  const workspaceValue = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      projectDir,
      activeScope,
      setWorkspace,
      projects,
      extras,
      addProject,
      removeExtra,
      registerSwitchGuard,
    }),
    [
      workspace,
      projectDir,
      activeScope,
      setWorkspace,
      projects,
      extras,
      addProject,
      removeExtra,
      registerSwitchGuard,
    ],
  );

  const setActiveScope = useCallback(
    (scope: "user" | "project") => {
      if (scope === "user") {
        setWorkspace({ kind: "user" });
        return;
      }
      const first = projects.find((project) => project.exists) ?? projects[0];
      if (first) {
        setWorkspace({ kind: "project", dir: first.dir });
      }
    },
    [projects, setWorkspace],
  );

  const scopeValue = useMemo<ScopeContextType>(
    () => ({
      activeScope,
      availableScopes: projects.length > 0 ? ["user", "project"] : ["user"],
      projectPath: projectDir,
      setActiveScope,
    }),
    [activeScope, projectDir, projects.length, setActiveScope],
  );

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <ScopeContext.Provider value={scopeValue}>
        {children}
        {pendingWorkspace ? (
          <UnsavedChangesDialog
            onStay={() => setPendingWorkspace(null)}
            onLeave={() => {
              const next = pendingWorkspace;
              setPendingWorkspace(null);
              applyWorkspace(next);
            }}
          />
        ) : null}
      </ScopeContext.Provider>
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within ScopeProvider");
  }
  return context;
}

export function useScope(): ScopeContextType {
  const context = useContext(ScopeContext);
  if (!context) {
    throw new Error("useScope must be used within ScopeProvider");
  }
  return context;
}

export function useWorkspaceSwitchGuard(isDirty: () => boolean): void {
  const { registerSwitchGuard } = useWorkspace();
  useEffect(() => registerSwitchGuard(isDirty), [isDirty, registerSwitchGuard]);
}
