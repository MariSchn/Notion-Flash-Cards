import { NextResponse } from "next/server";
import { resolveImageUrl } from "@/lib/notion";

export const runtime = "nodejs";

/**
 * Notion's signed file URLs expire after roughly an hour, so stored answers
 * reference the image's block id instead and this route redirects to a freshly
 * signed URL at request time.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ blockId: string }> }) {
  const { blockId } = await params;
  try {
    const url = await resolveImageUrl(blockId);
    if (!url) return new NextResponse("Not found", { status: 404 });
    return NextResponse.redirect(url, {
      status: 307,
      headers: { "Cache-Control": "private, max-age=1800" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
