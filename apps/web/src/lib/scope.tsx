import { createContext, useContext, useEffect, useState } from "react";
import type { Scope } from "schema";

interface ScopeContextType {
  activeScope: Scope;
  availableScopes: Scope[];
  projectPath: string | null;
  setActiveScope: (scope: Scope) => void;
}

const ScopeContext = createContext<ScopeContextType | undefined>(undefined);

const SCOPE_STORAGE_KEY = "claude-desk-active-scope";
const SCOPES_CACHE_KEY = "claude-desk-scopes-cache";

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [activeScope, setActiveScopeState] = useState<Scope>("user");
  const [availableScopes, setAvailableScopes] = useState<Scope[]>(["user"]);
  const [projectPath, setProjectPath] = useState<string | null>(null);

  // Fetch available scopes on mount
  useEffect(() => {
    const fetchScopes = async () => {
      try {
        // Check cache first
        const cachedData = localStorage.getItem(SCOPES_CACHE_KEY);
        if (cachedData) {
          const { scopes, projectPath: cached } = JSON.parse(cachedData);
          setAvailableScopes(scopes);
          setProjectPath(cached);
        } else {
          const response = await fetch("/api/scopes");
          if (response.ok) {
            const data = (await response.json()) as { scopes: Scope[]; projectPath: string | null };
            setAvailableScopes(data.scopes);
            setProjectPath(data.projectPath);
            localStorage.setItem(SCOPES_CACHE_KEY, JSON.stringify(data));
          }
        }
      } catch (error) {
        console.error("Failed to fetch available scopes:", error);
      }
    };

    void fetchScopes();
  }, []);

  // Restore saved scope from localStorage
  useEffect(() => {
    const savedScope = localStorage.getItem(SCOPE_STORAGE_KEY) as Scope | null;
    if (savedScope && availableScopes.includes(savedScope)) {
      setActiveScopeState(savedScope);
    }
  }, [availableScopes]);

  const setActiveScope = (scope: Scope) => {
    if (availableScopes.includes(scope)) {
      setActiveScopeState(scope);
      localStorage.setItem(SCOPE_STORAGE_KEY, scope);
    }
  };

  return (
    <ScopeContext.Provider value={{ activeScope, availableScopes, projectPath, setActiveScope }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope() {
  const context = useContext(ScopeContext);
  if (!context) {
    throw new Error("useScope must be used within ScopeProvider");
  }
  return context;
}
