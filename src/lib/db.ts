import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service role key. Never import this
 * from a client component — the key must not reach the browser.
 */
export function db(): SupabaseClient {
  if (!cached) {
    const url = process.env.SUPABASE_URL;
    // Supabase's current "secret key" (sb_secret_…); the legacy service_role
    // JWT is accepted too, since both grant the same RLS-bypassing access.
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
    }
    // The dashboard shows several URLs for a project; supabase-js wants the
    // bare origin and appends /rest/v1 itself, so trim any copied path.
    const origin = new URL(url).origin;
    cached = createClient(origin, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/**
 * Resolves a project by its own id *or* by the Notion page id it was built
 * from. Accepting the Notion id keeps embed URLs stable: delete a deck and
 * re-add the same page, and `/p/<notion-page-id>` still resolves.
 */
export async function resolveProjectId(idOrPageId: string): Promise<string | null> {
  const raw = idOrPageId.trim().toLowerCase();
  const hex = raw.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-f]+$/.test(hex)) return null;
  const dashed = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

  const supabase = db();
  const { data } = await supabase
    .from("projects")
    .select("id, notion_page_id")
    .or(`id.eq.${dashed},notion_page_id.eq.${dashed}`)
    .limit(2);

  if (!data?.length) return null;
  // Prefer an exact primary-key match if both happen to hit.
  return (data.find((row) => row.id === dashed) ?? data[0]).id;
}
