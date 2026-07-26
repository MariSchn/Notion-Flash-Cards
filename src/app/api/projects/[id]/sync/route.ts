import { NextResponse } from "next/server";
import { db, resolveProjectId } from "@/lib/db";
import { syncProject } from "@/lib/sync";
import { describeNotionError } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const id = await resolveProjectId(slug);
  if (!id) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { data: project } = await db()
    .from("projects")
    .select("id, notion_page_id")
    .eq("id", id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  try {
    const result = await syncProject(project.id, project.notion_page_id);
    return NextResponse.json({ sync: result });
  } catch (err) {
    return NextResponse.json({ error: describeNotionError(err) }, { status: 502 });
  }
}
