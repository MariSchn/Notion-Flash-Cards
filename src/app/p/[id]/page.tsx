"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Callout, Chip, EmptyState, Spinner } from "@/components/ui";
import { describeSync, formatPath, formatRelative } from "@/lib/format";
import type { ProjectDetail } from "@/lib/types";

export default function ProjectPageWrapper() {
  return (
    <Suspense fallback={null}>
      <ProjectPage />
    </Suspense>
  );
}

function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const embed = useSearchParams().get("embed") === "1";

  const [data, setData] = useState<ProjectDetail | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load deck.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deck.");
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function resync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${id}/sync`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed.");
      setNotice(describeSync(json.sync));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${data?.project.name}"? Your review history for this deck is lost. The Notion page is untouched.`)) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/");
  }

  // Selecting an H1 implies its subsections, so the study queue gets every
  // section id in the chosen subtree.
  const childrenOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of data?.sections ?? []) {
      if (!s.parent_id) continue;
      map.set(s.parent_id, [...(map.get(s.parent_id) ?? []), s.id]);
    }
    return map;
  }, [data]);

  const expand = useCallback(
    (ids: Set<string>): string[] => {
      const out = new Set<string>();
      const visit = (sectionId: string) => {
        if (out.has(sectionId)) return;
        out.add(sectionId);
        for (const child of childrenOf.get(sectionId) ?? []) visit(child);
      };
      ids.forEach(visit);
      return [...out];
    },
    [childrenOf],
  );

  const selectedStats = useMemo(() => {
    if (!data || selected.size === 0) return null;
    // Only count top-most selected sections; their stats already roll up.
    const chosen = data.sections.filter(
      (s) => selected.has(s.id) && !(s.parent_id && selected.has(s.parent_id)),
    );
    return chosen.reduce(
      (acc, s) => ({ total: acc.total + s.total, due: acc.due + s.due }),
      { total: 0, due: 0 },
    );
  }, [data, selected]);

  function studyHref(mode: "due" | "all") {
    const query = new URLSearchParams({ mode });
    if (selected.size) query.set("sections", expand(selected).join(","));
    if (embed) query.set("embed", "1");
    return `/p/${id}/study?${query.toString()}`;
  }

  function toggleSection(sectionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  if (!data) {
    return (
      <AppShell
        embed={embed}
        breadcrumb={[{ label: "Flashcards", href: "/", icon: "🎴" }, { label: "…" }]}
      >
        <div className="py-10">
          {error ? <Callout>{error}</Callout> : <div className="h-8 w-48 animate-pulse rounded bg-[var(--nf-hover)]" />}
        </div>
      </AppShell>
    );
  }

  const { project, sections, stats } = data;
  const dueCount = selectedStats ? selectedStats.due : stats.due;
  const totalCount = selectedStats ? selectedStats.total : stats.total;

  return (
    <AppShell
      embed={embed}
      breadcrumb={[
        { label: "Flashcards", href: "/", icon: "🎴" },
        // Only the immediate parent: the full path is already spelled out
        // above the title, and more crumbs just shrink each other to ellipses.
        ...(project.breadcrumb ?? []).slice(-1).map((label) => ({ label })),
        { label: project.name, icon: project.icon },
      ]}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={resync} disabled={syncing}>
            {syncing ? <Spinner /> : <span aria-hidden>⟳</span>}
            {syncing ? "Syncing…" : "Resync"}
          </Button>
          <a
            href={project.notion_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-7 items-center rounded-[4px] px-2 text-[13px] font-medium text-[var(--nf-text-secondary)] transition-colors hover:bg-[var(--nf-hover)] hover:text-[var(--nf-text)]"
          >
            Open in Notion ↗
          </a>
        </>
      }
    >
      <div className={embed ? "pb-6 pt-1" : "pb-16 pt-8"}>
        {/* Inside Notion the surrounding page already carries the heading, so
            the embed starts straight at the stats and the study controls. */}
        {!embed ? (
          <>
            {project.icon ? (
              <div className="nf-page-icon" aria-hidden>
                {project.icon}
              </div>
            ) : null}
            {project.breadcrumb?.length ? (
              <p className="mb-1 truncate text-[14px] text-[var(--nf-text-secondary)]">
                {formatPath(project.breadcrumb, 3)}
              </p>
            ) : null}
            <h1 className="nf-title">{project.name}</h1>
          </>
        ) : null}

        <div
          className={`flex items-center gap-2 text-[14px] text-[var(--nf-text-secondary)] ${embed ? "" : "mt-3"}`}
        >
          {/* One muted line with middle dots, the way Notion writes metadata —
              not a row of stat columns. The due count is deliberately absent:
              it already reads on the primary button. */}
          <span className="min-w-0 truncate">
            {[
              `${stats.total} card${stats.total === 1 ? "" : "s"}`,
              stats.unseen > 0 ? `${stats.unseen} new` : null,
              project.last_synced_at
                ? `synced ${formatRelative(project.last_synced_at)}`
                : "never synced",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {embed ? (
            <button
              type="button"
              onClick={resync}
              disabled={syncing}
              className="ml-auto inline-flex h-6 items-center gap-1 rounded-[4px] px-1.5 text-[14px] transition-colors hover:bg-[var(--nf-hover)] hover:text-[var(--nf-text)] disabled:opacity-40"
            >
              {syncing ? <Spinner /> : <span aria-hidden>⟳</span>}
              {syncing ? "Syncing…" : "Resync"}
            </button>
          ) : null}
        </div>

        {notice ? (
          <div className="mt-4">
            <Callout tone="gray">{notice}</Callout>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4">
            <Callout>{error}</Callout>
          </div>
        ) : null}

        {stats.total === 0 ? (
          <EmptyState
            icon="📭"
            title="No cards found on that page"
            description="Cards come from toggle blocks: the toggle's text is the question, its contents are the answer. Add some toggles in Notion, then hit Resync."
            action={
              <Button onClick={resync} disabled={syncing}>
                {syncing ? <Spinner /> : null} Resync
              </Button>
            }
          />
        ) : (
          <>
            <div className={`flex flex-wrap items-center gap-2 ${embed ? "mt-4" : "mt-7"}`}>
              <Button
                variant="primary"
                disabled={dueCount === 0}
                onClick={() => router.push(studyHref("due"))}
              >
                {dueCount > 0 ? `Study ${dueCount} due` : "Nothing due today"}
              </Button>
              <Button
                onClick={() => router.push(studyHref("all"))}
                disabled={totalCount === 0}
                title="Go through every card in random order, ignoring the review schedule"
              >
                Practice all {totalCount}
              </Button>
              {selected.size > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              ) : null}
            </div>
            {selected.size > 0 ? (
              <p className="mt-2 text-[14px] text-[var(--nf-text-secondary)]">
                Limited to {selected.size} of {sections.length}{" "}
                {sections.length === 1 ? "topic" : "topics"}.
              </p>
            ) : (
              <p className="mt-2 text-[14px] text-[var(--nf-text-secondary)]">
                Covering every topic. Tick one below to narrow it down.
              </p>
            )}

            <h2 className={`mb-2 ${embed ? "nf-label mt-6" : "nf-h2 mt-10"}`}>Topics</h2>
            <ul>
              {sections.map((section) => {
                const isSelected = selected.has(section.id);
                const inheritedFromParent = !!section.parent_id && selected.has(section.parent_id);
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--nf-hover)] ${
                        inheritedFromParent && !isSelected ? "opacity-60" : ""
                      }`}
                      style={{ paddingLeft: `${8 + (section.level - 1) * 20}px` }}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[11px] leading-none ${
                          isSelected || inheritedFromParent
                            ? "bg-[var(--nf-blue)] text-white"
                            : "shadow-[inset_0_0_0_1px_var(--nf-border-strong)]"
                        }`}
                        aria-hidden
                      >
                        {isSelected || inheritedFromParent ? "✓" : ""}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-[16px] ${
                          section.level === 1 ? "font-medium" : ""
                        }`}
                      >
                        {section.title}
                      </span>
                      {section.due > 0 ? <Chip tone="blue">{section.due}</Chip> : null}
                      <span className="w-10 shrink-0 text-right text-[14px] text-[var(--nf-text-tertiary)] tabular-nums">
                        {section.total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Embed-only decks stay read-only: no embed helper, and no
                destructive delete sitting inside someone's notes. */}
            {!embed ? (
              <>
                <EmbedPanel projectId={project.id} notionPageId={project.notion_page_id} />
                <div className="mt-12 border-t border-[var(--nf-border)] pt-4">
                  <Button variant="danger" size="sm" onClick={remove}>
                    Delete deck
                  </Button>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * Each deck already has its own URL, so embedding one page per deck is just a
 * matter of copying the right link. `?embed=1` trims the breadcrumb so the
 * iframe doesn't repeat navigation the surrounding Notion page already has.
 */
function EmbedPanel({ projectId, notionPageId }: { projectId: string; notionPageId: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  // Read after hydration only — the server has no window.location to match.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  // Keyed off the Notion page id so the link survives deleting and re-adding
  // the deck — a rebuilt deck gets a new internal id but the same page id.
  const links = [
    { label: "Deck overview", href: `${origin}/p/${notionPageId}?embed=1` },
    { label: "Straight into review", href: `${origin}/p/${notionPageId}/study?mode=due&embed=1` },
  ];

  async function copy(href: string) {
    await navigator.clipboard.writeText(href);
    setCopied(href);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="mt-12 border-t border-[var(--nf-border)] pt-6">
      <h2 className="nf-h2 mb-2">Embed in Notion</h2>
      <p className="mb-3 text-[14px] text-[var(--nf-text-secondary)]">
        In Notion type <code className="nf-code">/embed</code>, paste one of these, and pick “Embed
        link”.
      </p>
      <div className="space-y-1.5">
        {links.map((link) => (
          <div key={link.href} className="flex items-center gap-2">
            <code className="nf-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-[4px] bg-[var(--nf-bg-secondary)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--nf-text-secondary)]">
              {origin ? link.href : "…"}
            </code>
            <Button size="sm" onClick={() => copy(link.href)} disabled={!origin}>
              {copied === link.href ? "Copied" : "Copy"}
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[14px] text-[var(--nf-text-tertiary)]">
        {links[0].label}: full topic picker. {links[1].label}: skips straight to today’s due cards.
        Internal id: <code className="nf-code">{projectId.slice(0, 8)}</code>
      </p>
    </div>
  );
}
