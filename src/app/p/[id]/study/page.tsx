"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { NotionBlocks } from "@/components/NotionBlocks";
import { RichTextView } from "@/components/RichTextView";
import { Button, Callout, EmptyState, Spinner } from "@/components/ui";
import { previewInterval } from "@/lib/srs";
import type { Grade, StudyCard } from "@/lib/types";

type QueueCard = StudyCard & { interval_days: number; ease: number; lapses: number };

/** Where an "Again" card lands relative to the current position. */
const REQUEUE_MIN = 3;
const REQUEUE_MAX = 7;

const GRADES: { grade: Grade; label: string; key: string; className: string }[] = [
  { grade: 0, label: "Again", key: "1", className: "nf-c-red nf-grade--red" },
  { grade: 1, label: "Hard", key: "2", className: "nf-c-orange nf-grade--orange" },
  { grade: 2, label: "Good", key: "3", className: "nf-c-blue nf-grade--blue" },
  { grade: 3, label: "Easy", key: "4", className: "nf-c-green nf-grade--green" },
];

export default function StudyPageWrapper() {
  return (
    <Suspense fallback={null}>
      <StudyPage />
    </Suspense>
  );
}

function StudyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") === "all" ? "all" : "due";
  const sections = params.get("sections") ?? "";
  const embed = params.get("embed") === "1";
  const suffix = `${sections ? `&sections=${sections}` : ""}${embed ? "&embed=1" : ""}`;

  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deckName, setDeckName] = useState("Study");
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  /** Queue size at session start, so the progress bar has a stable denominator. */
  const [initialCount, setInitialCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ mode });
        if (sections) query.set("sections", sections);
        const [queueRes, projectRes] = await Promise.all([
          fetch(`/api/projects/${id}/queue?${query.toString()}`, { cache: "no-store" }),
          fetch(`/api/projects/${id}`, { cache: "no-store" }),
        ]);
        const queueJson = await queueRes.json();
        if (!queueRes.ok) throw new Error(queueJson.error ?? "Couldn't build the queue.");
        if (cancelled) return;
        setInitialCount(queueJson.cards.length);
        setQueue(queueJson.cards);
        if (projectRes.ok) {
          const projectJson = await projectRes.json();
          setDeckName(projectJson.project.name);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't build the queue.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, mode, sections]);

  const current = queue?.[0] ?? null;

  const grade = useCallback(
    (value: Grade) => {
      if (!queue?.length) return;
      const [card, ...rest] = queue;

      // The schedule update is fire-and-forget: the next card appears
      // immediately rather than waiting on a round trip.
      void fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, grade: value }),
      });

      setAnswered((n) => n + 1);
      if (value > 0) setCorrect((n) => n + 1);

      if (value === 0) {
        // Wrong answers go back into the queue a few cards later, so the card
        // only leaves the session once it's been answered correctly.
        const offset = Math.min(
          rest.length,
          REQUEUE_MIN + Math.floor(Math.random() * (REQUEUE_MAX - REQUEUE_MIN + 1)),
        );
        const requeued = [...rest];
        requeued.splice(offset, 0, { ...card, repetitions: 0, interval_days: 0, lapses: card.lapses + 1 });
        setQueue(requeued);
      } else {
        setQueue(rest);
      }

      setRevealed(false);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [queue],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

      if (!revealed && (event.code === "Space" || event.code === "Enter")) {
        event.preventDefault();
        if (current) setRevealed(true);
        return;
      }
      if (revealed) {
        const match = GRADES.find((g) => g.key === event.key);
        if (match) {
          event.preventDefault();
          grade(match.grade);
          return;
        }
        if (event.code === "Space") {
          event.preventDefault();
          grade(2);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, grade, current]);

  const remaining = queue?.length ?? 0;
  const progress = useMemo(() => {
    const total = Math.max(initialCount, answered + remaining);
    return total === 0 ? 0 : (answered / total) * 100;
  }, [answered, remaining, initialCount]);

  const breadcrumb = [
    { label: "Flashcards", href: "/", icon: "🎴" },
    { label: deckName, href: `/p/${id}` },
    { label: mode === "all" ? "Cram" : "Review" },
  ];

  if (error) {
    return (
      <AppShell breadcrumb={breadcrumb} embed={embed}>
        <div className="py-10">
          <Callout>{error}</Callout>
        </div>
      </AppShell>
    );
  }

  if (queue === null) {
    return (
      <AppShell breadcrumb={breadcrumb} embed={embed}>
        <div className="flex items-center justify-center gap-2 py-24 text-[var(--nf-text-secondary)]">
          <Spinner /> Building your queue…
        </div>
      </AppShell>
    );
  }

  if (!current) {
    const isFinished = answered > 0;
    return (
      <AppShell breadcrumb={breadcrumb} embed={embed}>
        <EmptyState
          icon={isFinished ? "🎉" : "✅"}
          title={isFinished ? "Session complete" : "Nothing to review"}
          description={
            isFinished
              ? `${answered} answer${answered === 1 ? "" : "s"}, ${Math.round((correct / answered) * 100)}% recalled. Every card is scheduled for its next review.`
              : "Everything in this selection is scheduled for later. Try cram mode to go through it anyway."
          }
          action={
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => router.push(`/p/${id}${embed ? "?embed=1" : ""}`)}
              >
                Back to deck
              </Button>
              {mode === "due" ? (
                <Button
                  onClick={() =>
                    router.push(`/p/${id}/study?mode=all${suffix}`)
                  }
                >
                  Cram instead
                </Button>
              ) : null}
            </div>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumb={breadcrumb}
      embed={embed}
      actions={
        <span className="px-2 text-[13px] tabular-nums text-[var(--nf-text-secondary)]">
          {remaining} left
        </span>
      }
    >
      <div className={`flex items-center gap-3 ${embed ? "pt-1" : ""}`}>
        {/* With no breadcrumb in the embed, this is the only way back to the
            topic picker without leaving the iframe. */}
        {embed ? (
          <Link
            href={`/p/${id}?embed=1`}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-[14px] text-[var(--nf-text-secondary)] transition-colors hover:bg-[var(--nf-hover)] hover:text-[var(--nf-text)]"
          >
            <span aria-hidden>←</span> Topics
          </Link>
        ) : null}
        <div
          className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--nf-hover)]"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-[var(--nf-blue)] transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {embed ? (
          <span className="shrink-0 text-[14px] tabular-nums text-[var(--nf-text-secondary)]">
            {remaining} left
          </span>
        ) : null}
      </div>

      <div className={`flex flex-1 flex-col ${embed ? "" : "min-h-[calc(100dvh-11rem)]"}`}>
        <div ref={scrollRef} className={`nf-scroll flex-1 overflow-y-auto ${embed ? "py-5" : "py-8"}`}>
          {current.sectionTitle ? (
            <p className="mb-2 text-[14px] text-[var(--nf-text-secondary)]">{current.sectionTitle}</p>
          ) : null}

          <h1 className="nf-h1">
            <RichTextView rich={current.question} />
          </h1>

          {revealed ? (
            <div className="nf-reveal mt-6 border-t border-[var(--nf-border)] pt-6 text-[16px]">
              {current.answer.length ? (
                <NotionBlocks blocks={current.answer} />
              ) : (
                <p className="text-[var(--nf-text-tertiary)]">This toggle is empty in Notion.</p>
              )}
            </div>
          ) : null}
        </div>

        <div
          className={`sticky bottom-0 border-t border-[var(--nf-border)] py-3 ${
            embed ? "" : "bg-[var(--nf-bg)]/90 backdrop-blur-sm"
          }`}
        >
          {revealed ? (
            <div className="grid grid-cols-4 gap-1.5">
              {GRADES.map(({ grade: value, label, key, className }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => grade(value)}
                  className={`nf-grade ${className}`}
                >
                  <span>{label}</span>
                  <span className="text-[12px] font-normal opacity-70 tabular-nums">
                    {previewInterval(
                      {
                        interval_days: current.interval_days,
                        ease: current.ease,
                        repetitions: current.repetitions,
                        lapses: current.lapses,
                      },
                      value,
                    )}
                  </span>
                  <span className="hidden text-[11px] opacity-40 sm:block">{key}</span>
                </button>
              ))}
            </div>
          ) : (
            <Button
              variant="primary"
              className="h-10 w-full text-[15px]"
              onClick={() => setRevealed(true)}
            >
              Show answer
              <span className="ml-1 text-[12px] opacity-70">Space</span>
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
