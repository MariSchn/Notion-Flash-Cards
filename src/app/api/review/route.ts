import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schedule } from "@/lib/srs";
import type { Grade } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const cardId: string | undefined = body?.cardId;
  const grade = Number(body?.grade) as Grade;

  if (!cardId || ![0, 1, 2, 3].includes(grade)) {
    return NextResponse.json({ error: "cardId and grade (0-3) are required." }, { status: 400 });
  }

  const supabase = db();
  const { data: card, error } = await supabase
    .from("cards")
    .select("id, project_id, interval_days, ease, repetitions, lapses")
    .eq("id", cardId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });

  const next = schedule(
    {
      interval_days: card.interval_days,
      ease: card.ease,
      repetitions: card.repetitions,
      lapses: card.lapses,
    },
    grade,
  );

  const { error: updateError } = await supabase.from("cards").update(next).eq("id", cardId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Review history is append-only and best-effort: a failed insert must not
  // cost the user the scheduling update that already succeeded.
  await supabase.from("reviews").insert({
    card_id: cardId,
    project_id: card.project_id,
    grade,
    prev_interval: card.interval_days,
    new_interval: next.interval_days,
  });

  return NextResponse.json({ card: { id: cardId, ...next } });
}
