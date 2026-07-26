import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractPageId } from "@/lib/notion";
import { syncProject } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = db();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // One aggregate pass over all cards beats a per-project round trip.
  const { data: cards } = await supabase
    .from("cards")
    .select("project_id, due_at, repetitions")
    .eq("archived", false);

  const now = Date.now();
  const stats = new Map<string, { total: number; due: number }>();
  for (const c of cards ?? []) {
    const s = stats.get(c.project_id) ?? { total: 0, due: 0 };
    s.total += 1;
    if (new Date(c.due_at).getTime() <= now) s.due += 1;
    stats.set(c.project_id, s);
  }

  return NextResponse.json({
    projects: (projects ?? []).map((p) => ({
      ...p,
      total: stats.get(p.id)?.total ?? 0,
      due: stats.get(p.id)?.due ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const url: string | undefined = body?.url;
  if (!url?.trim()) {
    return NextResponse.json({ error: "A Notion page link is required." }, { status: 400 });
  }

  const pageId = extractPageId(url);
  if (!pageId) {
    return NextResponse.json(
      { error: "That doesn't look like a Notion page link. Use Share → Copy link." },
      { status: 400 },
    );
  }

  const supabase = db();
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("notion_page_id", pageId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "That page has already been added.", projectId: existing.id },
      { status: 409 },
    );
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ name: "Untitled", notion_page_id: pageId, notion_url: url.trim() })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const result = await syncProject(project.id, pageId);
    return NextResponse.json({ project: { ...project, name: result.title }, sync: result });
  } catch (err) {
    // Don't leave a half-created project behind when the first sync fails.
    await supabase.from("projects").delete().eq("id", project.id);
    return NextResponse.json({ error: describeNotionError(err) }, { status: 502 });
  }
}

export function describeNotionError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/Could not find (page|block)|object_not_found/i.test(message)) {
    return "Notion can't see that page. Open it in Notion, click ••• → Connections, and add your integration.";
  }
  if (/unauthorized|API token is invalid/i.test(message)) {
    return "Notion rejected the token. Check NOTION_TOKEN.";
  }
  return message;
}
