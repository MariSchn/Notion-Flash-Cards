import { db } from "./db";
import { parsePage } from "./notion";

export type SyncResult = {
  added: number;
  updated: number;
  archived: number;
  restored: number;
  sections: number;
  title: string;
};

/**
 * Re-reads the Notion page and reconciles it with what's stored.
 *
 * Cards are matched on their Notion block id, so editing a question in Notion
 * updates the existing row and keeps its review history. Cards that disappear
 * from the page are archived rather than deleted — if they come back (or were
 * only temporarily moved), the schedule comes back with them.
 */
export async function syncProject(projectId: string, notionPageId: string): Promise<SyncResult> {
  const parsed = await parsePage(notionPageId);
  const supabase = db();

  // ------------------------------------------------------------- sections
  const { data: existingSections } = await supabase
    .from("sections")
    .select("id, notion_block_id")
    .eq("project_id", projectId);

  const sectionIdByKey = new Map<string, string>(
    (existingSections ?? []).map((s) => [s.notion_block_id as string, s.id as string]),
  );

  if (parsed.sections.length) {
    // No `id` in the payload: the rows are matched by the onConflict target, and
    // a mixed batch (some rows with an id, some without) would make PostgREST
    // send an explicit null for the ones missing it instead of using the default.
    const { data: upserted, error } = await supabase
      .from("sections")
      .upsert(
        parsed.sections.map((s) => ({
          project_id: projectId,
          notion_block_id: s.notionBlockId,
          title: s.title,
          level: s.level,
          position: s.position,
        })),
        { onConflict: "project_id,notion_block_id" },
      )
      .select("id, notion_block_id");
    if (error) throw new Error(`Failed to save sections: ${error.message}`);
    for (const row of upserted ?? []) sectionIdByKey.set(row.notion_block_id, row.id);

    // Parent links need every section to exist first, hence the second pass.
    const withParents = parsed.sections.filter((s) => s.parentKey);
    if (withParents.length) {
      await Promise.all(
        withParents.map((s) =>
          supabase
            .from("sections")
            .update({ parent_id: sectionIdByKey.get(s.parentKey!) ?? null })
            .eq("id", sectionIdByKey.get(s.notionBlockId)!),
        ),
      );
    }
  }

  const liveSectionIds = new Set(
    parsed.sections.map((s) => sectionIdByKey.get(s.notionBlockId)).filter(Boolean) as string[],
  );
  const staleSections = (existingSections ?? [])
    .map((s) => s.id as string)
    .filter((id) => !liveSectionIds.has(id));
  if (staleSections.length) {
    await supabase.from("sections").delete().in("id", staleSections);
  }

  // ---------------------------------------------------------------- cards
  const { data: existingCards } = await supabase
    .from("cards")
    .select("id, notion_block_id, archived")
    .eq("project_id", projectId);

  const existingByBlock = new Map(
    (existingCards ?? []).map((c) => [c.notion_block_id as string, c as { id: string; archived: boolean }]),
  );

  let added = 0;
  let restored = 0;
  const rows = parsed.cards.map((card) => {
    const prior = existingByBlock.get(card.notionBlockId);
    if (!prior) added += 1;
    else if (prior.archived) restored += 1;
    return {
      project_id: projectId,
      section_id: sectionIdByKey.get(card.sectionKey) ?? null,
      notion_block_id: card.notionBlockId,
      question: card.question,
      answer: card.answer,
      position: card.position,
      archived: false,
      updated_at: new Date().toISOString(),
    };
  });

  // Chunked so a big deck stays under Supabase's request size limit.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from("cards")
      .upsert(rows.slice(i, i + 200), { onConflict: "project_id,notion_block_id" });
    if (error) throw new Error(`Failed to save cards: ${error.message}`);
  }

  const liveBlocks = new Set(parsed.cards.map((c) => c.notionBlockId));
  const toArchive = (existingCards ?? [])
    .filter((c) => !c.archived && !liveBlocks.has(c.notion_block_id as string))
    .map((c) => c.id as string);
  if (toArchive.length) {
    await supabase.from("cards").update({ archived: true }).in("id", toArchive);
  }

  const projectUpdate = {
    name: parsed.title,
    icon: parsed.icon,
    last_synced_at: new Date().toISOString(),
  };
  const { error: projectError } = await supabase
    .from("projects")
    .update({ ...projectUpdate, breadcrumb: parsed.breadcrumb })
    .eq("id", projectId);

  if (projectError) {
    // Databases created before breadcrumbs existed lack the column. Fall back
    // so a sync still succeeds until the migration in supabase/schema.sql runs.
    if (/breadcrumb/i.test(projectError.message)) {
      const { error } = await supabase.from("projects").update(projectUpdate).eq("id", projectId);
      if (error) throw new Error(`Failed to update project: ${error.message}`);
    } else {
      throw new Error(`Failed to update project: ${projectError.message}`);
    }
  }

  return {
    added,
    restored,
    updated: rows.length - added - restored,
    archived: toArchive.length,
    sections: parsed.sections.length,
    title: parsed.title,
  };
}
