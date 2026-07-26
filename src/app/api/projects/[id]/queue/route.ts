import { NextResponse } from "next/server";
import { db, resolveProjectId } from "@/lib/db";
import type { StudyCard } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SESSION = 300;

/**
 * Builds a study queue.
 *
 * `mode=due`  — only cards scheduled for now or earlier (the default).
 * `mode=all`  — every card, ignoring the schedule (cram mode).
 * `sections`  — comma-separated section ids; omitted means the whole project.
 *
 * Reviews still update the SM-2 schedule in cram mode, so cramming is never
 * wasted work.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const id = await resolveProjectId(slug);
  if (!id) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "all" ? "all" : "due";
  const sectionIds = (url.searchParams.get("sections") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const limit = Math.min(MAX_SESSION, Number(url.searchParams.get("limit")) || MAX_SESSION);

  const supabase = db();
  let query = supabase
    .from("cards")
    .select("id, question, answer, section_id, repetitions, due_at, interval_days, ease, lapses")
    .eq("project_id", id)
    .eq("archived", false);

  if (mode === "due") query = query.lte("due_at", new Date().toISOString());
  if (sectionIds.length) query = query.in("section_id", sectionIds);

  const { data, error } = await query.limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: sections } = await supabase
    .from("sections")
    .select("id, title")
    .eq("project_id", id);
  const titleById = new Map((sections ?? []).map((s) => [s.id as string, s.title as string]));

  const cards = shuffle(data ?? [])
    .slice(0, limit)
    .map(
      (c): StudyCard & { interval_days: number; ease: number; lapses: number } => ({
        id: c.id,
        question: c.question,
        answer: c.answer,
        sectionId: c.section_id,
        sectionTitle: c.section_id ? titleById.get(c.section_id) ?? null : null,
        repetitions: c.repetitions,
        dueAt: c.due_at,
        interval_days: c.interval_days,
        ease: c.ease,
        lapses: c.lapses,
      }),
    );

  return NextResponse.json({ cards, mode });
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
