import { Client, collectPaginatedAPI, isFullBlock } from "@notionhq/client";
import type {
  BlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import type {
  NBlock,
  NotionColor,
  ParsedCard,
  ParsedPage,
  ParsedSection,
  RichText,
} from "./types";

let client: Client | null = null;

export function notion(): Client {
  if (!client) {
    const auth = process.env.NOTION_TOKEN;
    if (!auth) throw new Error("NOTION_TOKEN is not set");
    client = new Client({ auth });
  }
  return client;
}

/**
 * Pulls the 32-hex page id out of any Notion URL form:
 *   notion.so/Title-<id>, notion.so/<workspace>/<id>?v=..., app.notion.com/p/Title-<id>
 * A bare id (dashed or not) is accepted too.
 */
export function extractPageId(input: string): string | null {
  const cleaned = input.trim().split("?")[0].split("#")[0];
  const matches = cleaned.match(/[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g);
  if (!matches?.length) return null;
  const raw = matches[matches.length - 1].replace(/-/g, "").toLowerCase();
  if (raw.length !== 32) return null;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

// ------------------------------------------------------------- rich text

function toRich(items: RichTextItemResponse[] | undefined): RichText[] {
  if (!items?.length) return [];
  return items.map((item) => {
    const a = item.annotations;
    const isEquation = item.type === "equation";
    const out: RichText = {
      t: isEquation ? item.equation.expression : item.plain_text,
    };
    if (a.bold) out.b = true;
    if (a.italic) out.i = true;
    if (a.strikethrough) out.s = true;
    if (a.underline) out.u = true;
    if (a.code) out.c = true;
    if (isEquation) out.eq = true;
    if (a.color && a.color !== "default") out.color = a.color as NotionColor;
    if (item.href) out.href = item.href;
    return out;
  });
}

export function plainText(rich: RichText[]): string {
  return rich.map((r) => r.t).join("");
}

// ---------------------------------------------------------------- fetching

async function listChildren(blockId: string): Promise<BlockObjectResponse[]> {
  const results = await collectPaginatedAPI(notion().blocks.children.list, {
    block_id: blockId,
    page_size: 100,
  });
  return results.filter(isFullBlock);
}

/**
 * Blocks whose children we never need to walk. Toggles are the exception the
 * caller handles explicitly: a top-level toggle *is* a card, so its subtree is
 * fetched as the answer rather than scanned for more cards.
 */
const LEAF_TYPES = new Set(["code", "equation", "image", "divider", "video", "file", "bookmark", "embed"]);

/** Recursively converts a block and its descendants into the normalized model. */
async function convert(block: BlockObjectResponse, depth: number): Promise<NBlock | null> {
  const kids = async (): Promise<NBlock[] | undefined> => {
    // Depth guard: Notion allows arbitrary nesting, flashcard answers never
    // need more than a few levels and each level costs an API round-trip.
    if (!block.has_children || depth >= 4) return undefined;
    const children = await listChildren(block.id);
    const converted = await Promise.all(children.map((c) => convert(c, depth + 1)));
    const kept = converted.filter((c): c is NBlock => c !== null);
    return kept.length ? kept : undefined;
  };

  switch (block.type) {
    case "paragraph":
      return { type: "paragraph", rich: toRich(block.paragraph.rich_text), color: color(block.paragraph.color), children: await kids() };
    case "heading_1":
      return { type: "heading", level: 1, rich: toRich(block.heading_1.rich_text), color: color(block.heading_1.color), children: await kids() };
    case "heading_2":
      return { type: "heading", level: 2, rich: toRich(block.heading_2.rich_text), color: color(block.heading_2.color), children: await kids() };
    case "heading_3":
      return { type: "heading", level: 3, rich: toRich(block.heading_3.rich_text), color: color(block.heading_3.color), children: await kids() };
    case "bulleted_list_item":
      return { type: "bulleted_list_item", rich: toRich(block.bulleted_list_item.rich_text), color: color(block.bulleted_list_item.color), children: await kids() };
    case "numbered_list_item":
      return { type: "numbered_list_item", rich: toRich(block.numbered_list_item.rich_text), color: color(block.numbered_list_item.color), children: await kids() };
    case "to_do":
      return { type: "to_do", rich: toRich(block.to_do.rich_text), checked: block.to_do.checked, color: color(block.to_do.color), children: await kids() };
    case "toggle":
      return { type: "toggle", rich: toRich(block.toggle.rich_text), color: color(block.toggle.color), children: await kids() };
    case "quote":
      return { type: "quote", rich: toRich(block.quote.rich_text), color: color(block.quote.color), children: await kids() };
    case "callout": {
      const icon = block.callout.icon;
      return {
        type: "callout",
        rich: toRich(block.callout.rich_text),
        icon: icon?.type === "emoji" ? icon.emoji : undefined,
        color: color(block.callout.color),
        children: await kids(),
      };
    }
    case "code":
      return {
        type: "code",
        text: plainText(toRich(block.code.rich_text)),
        language: block.code.language ?? "plain text",
        caption: toRich(block.code.caption),
      };
    case "equation":
      return { type: "equation", expression: block.equation.expression };
    case "image": {
      const img = block.image;
      // Notion-hosted file URLs are signed and expire in about an hour, so only
      // `external` URLs are stored. Hosted ones are resolved on demand through
      // /api/image/[blockId], which asks Notion for a fresh signed URL.
      return {
        type: "image",
        blockId: block.id,
        url: img.type === "external" ? img.external.url : undefined,
        caption: toRich(img.caption),
      };
    }
    case "video":
    case "file": {
      const f = block.type === "video" ? block.video : block.file;
      const url = f.type === "external" ? f.external.url : f.file.url;
      return { type: block.type, url, caption: toRich(f.caption) };
    }
    case "bookmark":
      return { type: "bookmark", url: block.bookmark.url, caption: toRich(block.bookmark.caption) };
    case "embed":
      return { type: "embed", url: block.embed.url, caption: toRich(block.embed.caption) };
    case "divider":
      return { type: "divider" };
    case "table": {
      const rows = await listChildren(block.id);
      return {
        type: "table",
        hasColumnHeader: block.table.has_column_header,
        hasRowHeader: block.table.has_row_header,
        rows: rows
          .filter((r) => r.type === "table_row")
          .map((r) => (r.type === "table_row" ? r.table_row.cells.map(toRich) : [])),
      };
    }
    case "column_list": {
      const cols = await listChildren(block.id);
      const columns = await Promise.all(
        cols.map(async (col) => {
          const inner = await listChildren(col.id);
          const conv = await Promise.all(inner.map((b) => convert(b, depth + 1)));
          return conv.filter((c): c is NBlock => c !== null);
        }),
      );
      return { type: "columns", columns };
    }
    case "synced_block": {
      // Render the synced content inline; an empty original renders as nothing.
      const children = await kids();
      return children?.length ? { type: "paragraph", rich: [], children } : null;
    }
    case "table_of_contents":
    case "breadcrumb":
    case "child_page":
    case "child_database":
      return null;
    default:
      if (LEAF_TYPES.has(block.type)) return null;
      return { type: "unsupported", label: block.type.replace(/_/g, " ") };
  }
}

function color(c: string | undefined): NotionColor | undefined {
  return c && c !== "default" ? (c as NotionColor) : undefined;
}

// ----------------------------------------------------------------- parsing

const ROOT_KEY = "__root__";

/**
 * Walks a flashcard page top to bottom.
 *
 * Headings open sections (H1 = topic, H2/H3 = subsections nested under the
 * nearest shallower heading). Every toggle becomes a card attributed to the
 * most recent heading, at any nesting depth — a toggle inside a column or
 * callout still counts, but a toggle *inside another toggle* does not, since
 * that one is part of its parent's answer.
 */
export async function parsePage(pageId: string): Promise<ParsedPage> {
  const page = await notion().pages.retrieve({ page_id: pageId });

  let title = "Untitled";
  let icon: string | null = null;
  if ("properties" in page) {
    for (const prop of Object.values(page.properties)) {
      if (prop.type === "title") {
        const t = plainText(toRich(prop.title)).trim();
        if (t) title = t;
        break;
      }
    }
    if (page.icon?.type === "emoji") icon = page.icon.emoji;
  }

  const sections: ParsedSection[] = [];
  const cards: ParsedCard[] = [];
  /** Stack of open headings, shallowest first, used to resolve parents. */
  const stack: ParsedSection[] = [];
  let currentKey = ROOT_KEY;
  let rootUsed = false;

  const openSection = (id: string, titleText: string, level: number) => {
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const section: ParsedSection = {
      notionBlockId: id,
      title: titleText || "Untitled section",
      level,
      parentKey: stack.length ? stack[stack.length - 1].notionBlockId : null,
      position: sections.length,
    };
    sections.push(section);
    stack.push(section);
    currentKey = id;
  };

  const walk = async (blockId: string, depth: number): Promise<void> => {
    const children = await listChildren(blockId);
    for (const block of children) {
      if (block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3") {
        const heading =
          block.type === "heading_1"
            ? { level: 1, rich: block.heading_1.rich_text }
            : block.type === "heading_2"
              ? { level: 2, rich: block.heading_2.rich_text }
              : { level: 3, rich: block.heading_3.rich_text };
        openSection(block.id, plainText(toRich(heading.rich)).trim(), heading.level);
        // A toggleable heading's children are section content, not an answer.
        if (block.has_children && depth < 3) await walk(block.id, depth + 1);
        continue;
      }

      if (block.type === "toggle") {
        const question = toRich(block.toggle.rich_text);
        if (!plainText(question).trim()) continue;
        const answer = block.has_children
          ? (await Promise.all((await listChildren(block.id)).map((c) => convert(c, 1)))).filter(
              (b): b is NBlock => b !== null,
            )
          : [];
        if (currentKey === ROOT_KEY) rootUsed = true;
        cards.push({
          notionBlockId: block.id,
          question,
          answer,
          sectionKey: currentKey,
          position: cards.length,
        });
        continue;
      }

      // Containers can hold toggles; descend into them looking for more cards.
      if (
        block.has_children &&
        depth < 3 &&
        (block.type === "column_list" || block.type === "column" || block.type === "callout" ||
          block.type === "quote" || block.type === "synced_block" || block.type === "bulleted_list_item" ||
          block.type === "numbered_list_item")
      ) {
        await walk(block.id, depth + 1);
      }
    }
  };

  await walk(pageId, 0);

  if (rootUsed) {
    sections.unshift({
      notionBlockId: ROOT_KEY,
      title: "Ungrouped",
      level: 1,
      parentKey: null,
      position: -1,
    });
  }

  const breadcrumb = await fetchAncestorPath(pageId);

  return { title, icon, breadcrumb, sections, cards };
}

/** Pulls the title out of any page/database object shape. */
function objectTitle(obj: unknown): string | null {
  const o = obj as { properties?: Record<string, { type: string; title?: RichTextItemResponse[] }>; title?: RichTextItemResponse[] };
  if (Array.isArray(o?.title)) {
    const t = plainText(toRich(o.title)).trim();
    if (t) return t;
  }
  for (const prop of Object.values(o?.properties ?? {})) {
    if (prop.type === "title") {
      const t = plainText(toRich(prop.title ?? [])).trim();
      if (t) return t;
    }
  }
  return null;
}

/**
 * Walks up the parent chain to build the Notion breadcrumb, outermost first.
 *
 * Decks are usually all called "Flashcards", so the enclosing page is what
 * actually tells them apart. The walk stops at the workspace root, at a depth
 * cap, or as soon as a parent isn't shared with the integration — a partial
 * path is more useful than none.
 */
type NotionParent = {
  type: string;
  page_id?: string;
  block_id?: string;
  database_id?: string;
};

export async function fetchAncestorPath(pageId: string, maxDepth = 6): Promise<string[]> {
  const path: string[] = [];
  let currentId = pageId;
  let currentType: "page" | "block" = "page";

  for (let depth = 0; depth < maxDepth; depth++) {
    let parent: NotionParent | null = null;
    try {
      const obj =
        currentType === "page"
          ? await notion().pages.retrieve({ page_id: currentId })
          : await notion().blocks.retrieve({ block_id: currentId });
      parent = (obj as { parent?: NotionParent }).parent ?? null;
    } catch {
      break; // Not shared with the integration; keep what we have.
    }
    if (!parent || parent.type === "workspace") break;

    if (parent.type === "page_id" && parent.page_id) {
      try {
        const page = await notion().pages.retrieve({ page_id: parent.page_id });
        const title = objectTitle(page);
        if (title) path.unshift(title);
      } catch {
        break;
      }
      currentId = parent.page_id;
      currentType = "page";
      continue;
    }

    if (parent.type === "block_id" && parent.block_id) {
      // A page nested inside a column or toggle: keep climbing, no title here.
      currentId = parent.block_id;
      currentType = "block";
      continue;
    }

    if (parent.type === "database_id" && parent.database_id) {
      try {
        const database = await notion().databases.retrieve({ database_id: parent.database_id });
        const title = objectTitle(database);
        if (title) path.unshift(title);
      } catch {
        // Databases may be unreadable while their pages are fine.
      }
      break;
    }

    break;
  }

  return path;
}

/** Resolves a fresh signed URL for a Notion-hosted image. */
export async function resolveImageUrl(blockId: string): Promise<string | null> {
  const block = await notion().blocks.retrieve({ block_id: blockId });
  if (!isFullBlock(block) || block.type !== "image") return null;
  const img = block.image;
  return img.type === "external" ? img.external.url : img.file.url;
}
