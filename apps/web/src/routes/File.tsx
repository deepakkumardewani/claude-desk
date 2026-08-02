import { useEffect, useState } from "react";
import { useBlocker, useParams } from "react-router-dom";
import { CategoryIndex } from "../components/CategoryIndex";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MarkdownView } from "../components/MarkdownView";
import { SkillHeader } from "../components/SkillHeader";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import {
  fetchFile,
  fileHref,
  isEditableCategory,
  isRouteSegment,
  routeToCategory,
  saveFile,
  type ApiCategory,
} from "../lib/api";
import { parseFrontmatter } from "../lib/frontmatter";
import { recordRecent } from "../lib/recent";
import { useScope } from "../lib/scope";
import { CATEGORY_LABELS, deriveFileLabel, deriveTitleFromFilename } from "../lib/workspace";

function resolveName(category: ApiCategory, nameParam?: string): string {
  if (category === "claudeMd") {
    return "CLAUDE.md";
  }
  if (category === "settings") {
    return "settings.json";
  }
  if (!nameParam) {
    return "";
  }
  return nameParam.split("/").map(decodeURIComponent).join("/");
}

const editButtonClass =
  "rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-sm font-medium text-text transition hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const cancelButtonClass =
  "rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted transition hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";

const saveButtonClass =
  "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";

export function File() {
  const { segment } = useParams<{ segment: string }>();
  const params = useParams<{ "*": string }>();
  const nameParam = params["*"];
  const { activeScope } = useScope();
  const [content, setContent] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const category = segment && isRouteSegment(segment) ? routeToCategory(segment) : null;
  const resolvedName = category ? resolveName(category, nameParam) : "";
  const isCategoryIndex =
    category !== null && category !== "claudeMd" && category !== "settings" && !resolvedName;
  const canEdit = category !== null && isEditableCategory(category);
  const isDirty = editing && draft !== content;

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (isCategoryIndex) {
      setLoading(false);
      setError(null);
      setEditing(false);
      return;
    }

    if (!segment || !isRouteSegment(segment) || !category) {
      setError("Unknown config category.");
      setLoading(false);
      return;
    }

    const name = resolvedName;
    if (!name) {
      setError("File name is required.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveError(null);
    setEditing(false);

    fetchFile(category, name, activeScope)
      .then((file) => {
        if (!cancelled) {
          setContent(file.content);
          setDraft(file.content);
          setTitle(file.name);
          const isFileCategory = category === "claudeMd" || category === "settings";
          recordRecent({
            href: fileHref(category, file.name),
            label: isFileCategory ? CATEGORY_LABELS[category] : deriveFileLabel(file.name),
            categoryLabel: CATEGORY_LABELS[category],
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load this file.");
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
  }, [segment, nameParam, category, resolvedName, isCategoryIndex, activeScope]);

  async function handleSave() {
    if (!category || !resolvedName) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      await saveFile(category, resolvedName, draft, activeScope);
      setContent(draft);
      setEditing(false);
    } catch {
      setSaveError("Unable to save this file.");
    } finally {
      setSaving(false);
    }
  }

  function discardEdits() {
    setDraft(content);
    setSaveError(null);
    setConfirmDiscard(false);
    setEditing(false);
  }

  function handleCancel() {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    discardEdits();
  }

  function handleStartEdit() {
    setDraft(content);
    setSaveError(null);
    setConfirmDiscard(false);
    setEditing(true);
  }

  if (isCategoryIndex && category) {
    return <CategoryIndex category={category} />;
  }

  if (loading) {
    return <p className="text-text-muted">Loading file…</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  const isJson = title.endsWith(".json");
  const { data, body, hasFrontmatter } = parseFrontmatter(content);
  const markdownContent = hasFrontmatter ? body : content;

  const isPlugin = category === "plugins";
  const isCommandOrAgent = category === "commands" || category === "agents";

  const fallbackTitle = isCommandOrAgent ? deriveTitleFromFilename(title) : undefined;
  const showHeader = !editing && (hasFrontmatter || Boolean(fallbackTitle));
  const pluginBadge = isPlugin ? (
    <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-muted ring-1 ring-border-subtle">
      View only
    </span>
  ) : null;

  const editAction =
    canEdit && !isJson ? (
      <button type="button" onClick={handleStartEdit} className={editButtonClass}>
        Edit
      </button>
    ) : null;

  const dialogs = (
    <>
      {blocker.state === "blocked" ? (
        <UnsavedChangesDialog
          onStay={() => blocker.reset?.()}
          onLeave={() => blocker.proceed?.()}
        />
      ) : null}
      {confirmDiscard ? (
        <UnsavedChangesDialog
          onStay={() => setConfirmDiscard(false)}
          onLeave={discardEdits}
          leaveLabel="Discard"
        />
      ) : null}
    </>
  );

  if (editing) {
    return (
      <>
        {dialogs}
        <div className="absolute inset-0 flex flex-col bg-surface">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-surface-raised px-4 py-2">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-text">{title}</p>
              {isDirty ? <p className="text-xs text-text-muted">Unsaved changes</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className={cancelButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !isDirty}
                className={saveButtonClass}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {saveError ? (
            <p className="shrink-0 border-b border-border-subtle bg-surface-raised px-4 py-2 text-sm text-danger">
              {saveError}
            </p>
          ) : null}

          <div className="min-h-0 flex-1">
            <MarkdownEditor value={draft} onChange={setDraft} disabled={saving} />
          </div>
        </div>
      </>
    );
  }

  return (
    <article className="mx-auto max-w-[70ch]">
      {dialogs}

      {showHeader ? (
        <SkillHeader
          data={data}
          fallbackTitle={fallbackTitle}
          badge={pluginBadge}
          action={editAction}
        />
      ) : (
        <div className="mb-4 flex items-center justify-between gap-3">
          {isPlugin ? pluginBadge : <span />}
          {editAction}
        </div>
      )}

      {isJson ? (
        <pre className="overflow-x-auto rounded-lg bg-surface-raised p-5 font-mono text-sm text-text-muted ring-1 ring-border-subtle">
          {content}
        </pre>
      ) : (
        <div className={showHeader ? "mt-6" : undefined}>
          <MarkdownView content={markdownContent} />
        </div>
      )}
    </article>
  );
}
