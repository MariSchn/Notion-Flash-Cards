# Notion Flashcards

Turns a Notion page of toggle blocks into a spaced-repetition flashcard deck you
can embed back into Notion.

- **Question** = the toggle's own text.
- **Answer** = whatever is inside the toggle (text, lists, code, images, LaTeX, nested toggles).
- **Topic** = the nearest heading above the toggle. `H1` is a topic, `H2`/`H3` are
  subsections nested under it and can be selected independently.

Scheduling is SM-2 (Anki-style *Again / Hard / Good / Easy*). Answering **Again**
also pushes the card back into the current session a few cards later, so nothing
leaves a session until you've recalled it correctly at least once.

## Setup

### 1. Notion integration

1. Create an internal integration at <https://www.notion.so/my-integrations> and
   copy the **Internal Integration Secret**.
2. Open your flashcard page in Notion → `•••` → **Connections** → add the
   integration. Without this the API cannot see the page.

### 2. Supabase

1. Create a project at <https://supabase.com>.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Copy the **Project URL** (Project Settings → Data API) and a **Secret key**
   (Project Settings → API Keys → Secret keys — `sb_secret_…`, not the
   publishable one).

### 3. Environment

Copy `.env.example` to `.env.local` and fill in:

```
NOTION_TOKEN=ntn_…
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
```

```bash
npm install
npm run dev
```

## Deploying to Vercel

Import the repo at <https://vercel.com/new>, then add the same three variables
under **Settings → Environment Variables** (Production + Preview). No build
configuration is needed — Next.js is detected automatically.

## Embedding in Notion

Every deck has its own URL, so each Notion page can embed its own deck. The deck
page lists ready-to-paste links under **Embed in Notion**:

| URL | What it shows |
| --- | --- |
| `/p/<notion-page-id>?embed=1` | Deck overview with the topic picker |
| `/p/<notion-page-id>/study?mode=due&embed=1` | Jumps straight into today's due cards |

In Notion, type `/embed`, paste the link, and choose **Embed link**. `embed=1`
drops the breadcrumb so the iframe doesn't duplicate navigation.

Links are keyed by the **Notion page id**, so they survive deleting and re-adding
a deck. The internal project id (`/p/<uuid>`) works too.

## How syncing works

**Resync** re-reads the page and reconciles by Notion block id:

- New toggles are added as new cards.
- Edited toggles update in place and **keep their review history**.
- Toggles deleted in Notion are archived, not dropped — restore them by adding
  them back and resyncing.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` / `Enter` | Show answer |
| `1` `2` `3` `4` | Again / Hard / Good / Easy |
| `Space` (revealed) | Good |

## Notes

- There is no authentication: anyone with the URL can read and study the decks.
- Notion-hosted images have expiring URLs, so they're served through
  `/api/image/<blockId>`, which resolves a fresh signed URL per request.
