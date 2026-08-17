import { type ReactNode } from "react";
import { apiFetch } from "../lib/sessionApi";

interface McpCustomServerTabProps {
  customName: string;
  onCustomNameChange: (value: string) => void;
  customType: "stdio" | "http" | "sse";
  onCustomTypeChange: (value: "stdio" | "http" | "sse") => void;
  customCommand: string;
  onCustomCommandChange: (value: string) => void;
  customArgs: string;
  onCustomArgsChange: (value: string) => void;
  customUrl: string;
  onCustomUrlChange: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  onError: (error: string | null) => void;
  onServerAdded: () => void;
  onClose: () => void;
  scope: "user" | "project" | "local";
  projectDir?: string;
}

const FIELD_INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text";
const FIELD_INPUT_MONO_CLASS = `${FIELD_INPUT_CLASS} font-mono`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text">{label}</label>
      {children}
    </div>
  );
}

export function McpCustomServerTab({
  customName,
  onCustomNameChange,
  customType,
  onCustomTypeChange,
  customCommand,
  onCustomCommandChange,
  customArgs,
  onCustomArgsChange,
  customUrl,
  onCustomUrlChange,
  isLoading,
  error,
  onError,
  onServerAdded,
  onClose,
  scope,
  projectDir,
}: McpCustomServerTabProps) {
  const postServer = async (name: string, transport: unknown) => {
    onError(null);
    try {
      const params = new URLSearchParams();
      if (projectDir) {
        params.set("projectDir", projectDir);
      }
      const query = params.toString();
      const response = await apiFetch(query ? `/api/mcp?${query}` : "/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, transport, scope }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to add server");
      }
      return response;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    }
  };

  const handleAddCustom = async () => {
    if (!customName.trim()) {
      onError("Server name is required");
      return;
    }

    if (customType === "stdio") {
      if (!customCommand.trim()) {
        onError("Command is required for stdio servers");
        return;
      }
      const args = customArgs
        .split(/\s+/)
        .map((a) => a.trim())
        .filter(Boolean);
      await postServer(customName.trim(), {
        type: "stdio",
        command: customCommand.trim(),
        ...(args.length > 0 ? { args } : {}),
      });
      onServerAdded();
      onClose();
      return;
    }

    if (!customUrl.trim()) {
      onError("URL is required for HTTP/SSE servers");
      return;
    }
    await postServer(customName.trim(), { type: customType, url: customUrl.trim() });
    onServerAdded();
    onClose();
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <Field label="Server Name">
        <input
          type="text"
          value={customName}
          onChange={(e) => onCustomNameChange(e.target.value)}
          className={FIELD_INPUT_CLASS}
          placeholder="e.g. my-server"
        />
      </Field>

      <Field label="Transport">
        <select
          value={customType}
          onChange={(e) => onCustomTypeChange(e.target.value as "stdio" | "http" | "sse")}
          className={FIELD_INPUT_CLASS}
        >
          <option value="stdio">Stdio</option>
          <option value="http">HTTP</option>
          <option value="sse">SSE</option>
        </select>
      </Field>

      {customType === "stdio" ? (
        <>
          <Field label="Command">
            <input
              type="text"
              value={customCommand}
              onChange={(e) => onCustomCommandChange(e.target.value)}
              className={FIELD_INPUT_MONO_CLASS}
              placeholder="e.g. npx"
            />
          </Field>
          <Field label="Args (optional)">
            <input
              type="text"
              value={customArgs}
              onChange={(e) => onCustomArgsChange(e.target.value)}
              className={FIELD_INPUT_MONO_CLASS}
              placeholder="e.g. -y some-package"
            />
          </Field>
        </>
      ) : (
        <Field label="URL">
          <input
            type="url"
            value={customUrl}
            onChange={(e) => onCustomUrlChange(e.target.value)}
            className={FIELD_INPUT_MONO_CLASS}
            placeholder="https://example.com/mcp"
          />
        </Field>
      )}

      <button
        type="button"
        onClick={() => void handleAddCustom()}
        disabled={isLoading}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40"
      >
        {isLoading ? "Adding…" : "Add Server"}
      </button>
    </div>
  );
}
