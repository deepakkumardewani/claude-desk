import { useScope } from "../lib/scope.js";

export function ScopeSwitcher() {
  const { activeScope, availableScopes, setActiveScope } = useScope();

  // Don't show switcher if only user scope is available
  if (availableScopes.length <= 1) {
    return null;
  }

  const scopeLabels: Record<string, string> = {
    user: "User",
    project: "Project",
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Scope:</span>
      <div className="flex gap-1">
        {availableScopes.map((scope) => (
          <button
            key={scope}
            onClick={() => setActiveScope(scope)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              activeScope === scope
                ? "bg-blue-600 text-white dark:bg-blue-500"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            {scopeLabels[scope] || scope}
          </button>
        ))}
      </div>
    </div>
  );
}
