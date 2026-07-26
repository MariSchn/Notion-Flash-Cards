/**
 * Normalized content model.
 *
 * Notion's API block shapes are verbose and version-dependent, so the parser
 * flattens them into these types before anything is stored. The renderer only
 * ever sees this model, which keeps the database rows small and means a Notion
 * API change can't break already-synced decks.
 */

export type NotionColor =
  | "default" | "gray" | "brown" | "orange" | "yellow" | "green"
  | "blue" | "purple" | "pink" | "red"
  | "gray_background" | "brown_background" | "orange_background"
  | "yellow_background" | "green_background" | "blue_background"
  | "purple_background" | "pink_background" | "red_background";

export type RichText = {
  /** Plain text, or the LaTeX source when `equation` is true. */
  t: string;
  b?: boolean;
  i?: boolean;
  s?: boolean;
  u?: boolean;
  c?: boolean;
  /** Set when this span is an inline equation. */
  eq?: boolean;
  color?: NotionColor;
  href?: string | null;
};

export type NBlock =
  | { type: "paragraph"; rich: RichText[]; color?: NotionColor; children?: NBlock[] }
  | { type: "heading"; level: 1 | 2 | 3; rich: RichText[]; color?: NotionColor; children?: NBlock[] }
  | { type: "bulleted_list_item"; rich: RichText[]; color?: NotionColor; children?: NBlock[] }
  | { type: "numbered_list_item"; rich: RichText[]; color?: NotionColor; children?: NBlock[] }
  | { type: "to_do"; rich: RichText[]; checked: boolean; color?: NotionColor; children?: NBlock[] }
  | { type: "toggle"; rich: RichText[]; color?: NotionColor; children?: NBlock[] }
  | { type: "quote"; rich: RichText[]; color?: NotionColor; children?: NBlock[] }
  | { type: "callout"; rich: RichText[]; icon?: string; color?: NotionColor; children?: NBlock[] }
  | { type: "code"; text: string; language: string; caption?: RichText[] }
  | { type: "equation"; expression: string }
  | { type: "image"; blockId: string; url?: string; caption?: RichText[] }
  | { type: "video" | "file" | "bookmark" | "embed"; url: string; caption?: RichText[] }
  | { type: "divider" }
  | { type: "table"; hasColumnHeader: boolean; hasRowHeader: boolean; rows: RichText[][][] }
  | { type: "columns"; columns: NBlock[][] }
  | { type: "unsupported"; label: string };

export type ParsedCard = {
  notionBlockId: string;
  question: RichText[];
  answer: NBlock[];
  /** '__root__' when the toggle sits above every heading. */
  sectionKey: string;
  position: number;
};

export type ParsedSection = {
  notionBlockId: string;
  title: string;
  level: number;
  parentKey: string | null;
  position: number;
};

export type ParsedPage = {
  title: string;
  icon: string | null;
  /** Notion ancestor titles, outermost first. Excludes the page itself. */
  breadcrumb: string[];
  sections: ParsedSection[];
  cards: ParsedCard[];
};

// ------------------------------------------------------------ API payloads

export type Project = {
  id: string;
  name: string;
  icon: string | null;
  breadcrumb: string[] | null;
  notion_url: string;
  notion_page_id: string;
  created_at: string;
  last_synced_at: string | null;
};

export type SectionSummary = {
  id: string;
  title: string;
  level: number;
  parent_id: string | null;
  position: number;
  total: number;
  due: number;
  unseen: number;
};

export type ProjectDetail = {
  project: Project;
  sections: SectionSummary[];
  stats: { total: number; due: number; unseen: number; learned: number };
};

export type StudyCard = {
  id: string;
  question: RichText[];
  answer: NBlock[];
  sectionId: string | null;
  sectionTitle: string | null;
  repetitions: number;
  dueAt: string;
};

/** 0 = Again, 1 = Hard, 2 = Good, 3 = Easy. */
export type Grade = 0 | 1 | 2 | 3;
