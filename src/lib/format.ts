/** "just now" / "12m ago" / "3d ago", falling back to a date past a month. */
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Renders a Notion ancestor path. Keeps the deepest ancestors — those are the
 * ones that actually distinguish two decks both named "Flashcards" — and
 * elides the middle when the chain is long.
 */
export function formatPath(breadcrumb: string[] | null | undefined, maxParts = 2): string {
  const parts = (breadcrumb ?? []).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length <= maxParts) return parts.join(" / ");
  return `… / ${parts.slice(-maxParts).join(" / ")}`;
}

/** Summarizes a sync result as a single sentence. */
export function describeSync(sync: {
  added: number;
  updated: number;
  archived: number;
  restored: number;
}): string {
  const parts: string[] = [];
  if (sync.added) parts.push(`${sync.added} new`);
  if (sync.restored) parts.push(`${sync.restored} restored`);
  if (sync.archived) parts.push(`${sync.archived} removed`);
  if (!parts.length) return `Up to date — ${sync.updated} card${sync.updated === 1 ? "" : "s"}.`;
  return `Synced: ${parts.join(", ")}.`;
}
