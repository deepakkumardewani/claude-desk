import type { InstalledEntry, ItemKind } from "schema";
import { getItemKindColor } from "../../lib/categoryColors";
import { KIND_SINGULAR } from "./itemKinds";

// Kept here because drawers and tables import it alongside KindChip.
export { pluginChildren } from "../../lib/discover/variants";

/** The scanned repo, so a row can tell whether it is already installed (source + path). */
export type RepoSource = { owner: string; repo: string };

export function KindChip({ kind }: { kind: ItemKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted ring-1 ring-border-subtle">
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ backgroundColor: getItemKindColor(kind) }}
      />
      {KIND_SINGULAR[kind]}
    </span>
  );
}

/** "Installed" or "Update available" for an item already installed in the active scope. */
export function InstalledBadge({ status }: { status: InstalledEntry["status"] }) {
  const updatable = status === "update-available";
  return (
    <span
      data-testid="installed-badge"
      className={`inline-flex h-fit whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium ring-1 ${
        updatable ? "text-accent ring-accent" : "text-success ring-success"
      }`}
    >
      {updatable ? "Update available" : "Installed"}
    </span>
  );
}
