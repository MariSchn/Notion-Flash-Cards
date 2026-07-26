"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button, Callout, Chip, EmptyState, Input, Spinner } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import type { Project } from "@/lib/types";

type ProjectRow = Project & { total: number; due: number };

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load decks.");
      setProjects(json.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load decks.");
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function addProject(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't add that page.");
      setUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that page.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <AppShell breadcrumb={[{ label: "Flashcards", icon: "🎴" }]}>
      <div className="pb-16 pt-8">
        <div className="nf-page-icon" aria-hidden>
          🎴
        </div>
        <h1 className="nf-title mb-2">Flashcards</h1>
        <p className="mb-8 text-[16px] text-[var(--nf-text-secondary)]">
          Turn any Notion page of toggles into a spaced-repetition deck.
        </p>

        <form onSubmit={addProject} className="mb-3 flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a Notion page link…"
            disabled={adding}
            aria-label="Notion page link"
          />
          <Button type="submit" variant="primary" disabled={adding || !url.trim()}>
            {adding ? <Spinner /> : null}
            {adding ? "Importing…" : "Add deck"}
          </Button>
        </form>

        {error ? (
          <div className="mb-6">
            <Callout>{error}</Callout>
          </div>
        ) : null}

        {projects === null ? (
          <div className="space-y-1 py-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[52px] animate-pulse rounded-[4px] bg-[var(--nf-hover)]" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon="🎴"
            title="No decks yet"
            description="Paste a link to a Notion page whose toggles are your flashcards. Share the page with your integration first: ••• → Connections."
          />
        ) : (
          <ul className="mt-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/p/${project.id}`}
                  className="flex items-center gap-3 rounded-[4px] px-2 py-2.5 transition-colors hover:bg-[var(--nf-hover)]"
                >
                  <span className="w-6 shrink-0 text-center text-[18px] leading-none" aria-hidden>
                    {project.icon ?? "🎴"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{project.name}</span>
                    <span className="block truncate text-[13px] text-[var(--nf-text-secondary)]">
                      {project.total} card{project.total === 1 ? "" : "s"}
                      {project.last_synced_at
                        ? ` · synced ${formatRelative(project.last_synced_at)}`
                        : " · never synced"}
                    </span>
                  </span>
                  {project.due > 0 ? <Chip tone="blue">{project.due} due</Chip> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
