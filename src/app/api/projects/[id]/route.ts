import { NextResponse } from "next/server";
import { db, resolveProjectId } from "@/lib/db";
import type { SectionSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: slug } = await params;
  const id = await resolveProjectId(slug);
  if (!id) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const supabase = db();

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const [{ data: sections }, { data: cards }] = await Promise.all([
    supabase.from("sections").select("*").eq("project_id", id).order("position"),
    supabase
      .from("cards")
      .select("section_id, due_at, repetitions")
      .eq("project_id", id)
      .eq("archived", false),
  ]);

  const now = Date.now();
  const counts = new Map<string, { total: number; due: number; unseen: number }>();
  const stats = { total: 0, due: 0, unseen: 0, learned: 0 };

  for (const card of cards ?? []) {
    const key = card.section_id ?? "__none__";
    const bucket = counts.get(key) ?? { total: 0, due: 0, unseen: 0 };
    bucket.total += 1;
    stats.total += 1;
    if (card.repetitions === 0) {
      bucket.unseen += 1;
      stats.unseen += 1;
    } else {
      stats.learned += 1;
    }
    if (new Date(card.due_at).getTime() <= now) {
      bucket.due += 1;
      stats.due += 1;
    }
    counts.set(key, bucket);
  }

  // Subsection counts roll up into their parent so an H1 shows its whole subtree.
  const rows = (sections ?? []) as { id: string; parent_id: string | null; title: string; level: number; position: number }[];
  const childrenOf = new Map<string, string[]>();
  for (const s of rows) {
    if (!s.parent_id) continue;
    childrenOf.set(s.parent_id, [...(childrenOf.get(s.parent_id) ?? []), s.id]);
  }

  const rollUp = (sectionId: string): { total: number; due: number; unseen: number } => {
    const own = counts.get(sectionId) ?? { total: 0, due: 0, unseen: 0 };
    return (childrenOf.get(sectionId) ?? []).reduce(
      (acc, childId) => {
        const child = rollUp(childId);
        return {
          total: acc.total + child.total,
          due: acc.due + child.due,
          unseen: acc.unseen + child.unseen,
        };
      },
      { ...own },
    );
  };

  const summaries: SectionSummary[] = rows
    .map((s) => ({
      id: s.id,
      title: s.title,
      level: s.level,
      parent_id: s.parent_id,
      position: s.position,
      ...rollUp(s.id),
    }))
    .filter((s) => s.total > 0);

  return NextResponse.json({ project, sections: summaries, stats });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id: slug } = await params;
  const id = await resolveProjectId(slug);
  if (!id) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { error } = await db().from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
