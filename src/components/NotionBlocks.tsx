"use client";

import { useState, useSyncExternalStore } from "react";
import { Highlight, themes } from "prism-react-renderer";
import type { NBlock, NotionColor } from "@/lib/types";
import { BlockEquation, RichTextView, colorClass, plain } from "./RichTextView";

/**
 * Renders the normalized block tree using Notion's own spacing and type scale.
 */
export function NotionBlocks({ blocks, depth = 0 }: { blocks: NBlock[]; depth?: number }) {
  if (!blocks?.length) return null;

  // Numbered lists restart per run of adjacent items, matching Notion.
  const groups: { numbered: boolean; items: NBlock[] }[] = [];
  for (const block of blocks) {
    const numbered = block.type === "numbered_list_item";
    const last = groups[groups.length - 1];
    if (last && last.numbered === numbered && numbered) last.items.push(block);
    else groups.push({ numbered, items: [block] });
  }

  return (
    <div className={depth === 0 ? "space-y-px" : "space-y-px"}>
      {groups.map((group, gi) =>
        group.numbered ? (
          <ol key={gi} className="space-y-px">
            {group.items.map((block, i) => (
              <Block key={i} block={block} depth={depth} index={i} />
            ))}
          </ol>
        ) : (
          group.items.map((block, i) => <Block key={`${gi}-${i}`} block={block} depth={depth} index={i} />)
        ),
      )}
    </div>
  );
}

function Children({ blocks, depth }: { blocks: NBlock[] | undefined; depth: number }) {
  if (!blocks?.length) return null;
  return (
    <div className="ml-[1.5em] mt-px">
      <NotionBlocks blocks={blocks} depth={depth + 1} />
    </div>
  );
}

function Block({ block, depth, index }: { block: NBlock; depth: number; index: number }) {
  switch (block.type) {
    case "paragraph":
      return (
        <div className={paragraphClass(block.color)}>
          {block.rich.length ? <RichTextView rich={block.rich} /> : null}
          <Children blocks={block.children} depth={depth} />
        </div>
      );

    case "heading": {
      const sizes = {
        1: "text-[1.5em] mt-4 mb-1",
        2: "text-[1.25em] mt-3 mb-0.5",
        3: "text-[1.08em] mt-2.5 mb-0.5",
      } as const;
      return (
        <div className={`font-semibold leading-[1.3] ${sizes[block.level]} ${colorClass(block.color)}`}>
          <RichTextView rich={block.rich} />
          <Children blocks={block.children} depth={depth} />
        </div>
      );
    }

    case "bulleted_list_item":
      return (
        <div className={paragraphClass(block.color)}>
          <div className="flex gap-1.5">
            <span className="w-[1.2em] shrink-0 select-none text-center leading-[1.5]">
              {["•", "◦", "▪"][depth % 3]}
            </span>
            <div className="min-w-0 flex-1">
              <RichTextView rich={block.rich} />
              <Children blocks={block.children} depth={depth} />
            </div>
          </div>
        </div>
      );

    case "numbered_list_item":
      return (
        <li className={`list-none ${paragraphClass(block.color)}`}>
          <div className="flex gap-1.5">
            <span className="min-w-[1.2em] shrink-0 select-none text-right leading-[1.5] tabular-nums">
              {index + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <RichTextView rich={block.rich} />
              <Children blocks={block.children} depth={depth} />
            </div>
          </div>
        </li>
      );

    case "to_do":
      return (
        <div className={paragraphClass(block.color)}>
          <div className="flex gap-2">
            <span
              className={`mt-[0.25em] flex h-[1em] w-[1em] shrink-0 items-center justify-center rounded-[2px] text-[0.7em] leading-none ${
                block.checked ? "bg-[var(--nf-blue)] text-white" : "border border-[var(--nf-border-strong)]"
              }`}
              aria-hidden
            >
              {block.checked ? "✓" : ""}
            </span>
            <div className={`min-w-0 flex-1 ${block.checked ? "opacity-50 line-through" : ""}`}>
              <RichTextView rich={block.rich} />
              <Children blocks={block.children} depth={depth} />
            </div>
          </div>
        </div>
      );

    case "toggle":
      return <NestedToggle block={block} depth={depth} />;

    case "quote":
      return (
        <blockquote className={`my-1 border-l-[3px] border-[var(--nf-text)] pl-3.5 ${colorClass(block.color)}`}>
          <RichTextView rich={block.rich} />
          <Children blocks={block.children} depth={depth} />
        </blockquote>
      );

    case "callout": {
      const bg = block.color?.endsWith("_background")
        ? `nf-bg-${block.color.replace("_background", "")}`
        : "bg-[var(--nf-bg-secondary)]";
      const text = block.color && !block.color.endsWith("_background") ? colorClass(block.color) : "";
      return (
        <div className={`my-1 flex gap-2.5 rounded-[4px] p-3 ${bg} ${text}`}>
          <span className="shrink-0 select-none text-[1.1em] leading-[1.4]">{block.icon ?? "💡"}</span>
          <div className="min-w-0 flex-1">
            <RichTextView rich={block.rich} />
            <Children blocks={block.children} depth={depth} />
          </div>
        </div>
      );
    }

    case "code":
      return <CodeBlock text={block.text} language={block.language} />;

    case "equation":
      return <BlockEquation expression={block.expression} />;

    case "image": {
      const src = block.url ?? `/api/image/${block.blockId}`;
      return (
        <figure className="my-2">
          {/* Notion image hosts are arbitrary and URLs are short-lived, so
              next/image optimization is deliberately bypassed here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={plain(block.caption ?? []) || "Card image"}
            className="max-h-[46vh] w-auto max-w-full rounded-[3px] object-contain"
            loading="lazy"
          />
          {block.caption?.length ? (
            <figcaption className="mt-1 text-[0.85em] text-[var(--nf-text-secondary)]">
              <RichTextView rich={block.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    }

    case "video":
    case "file":
    case "bookmark":
    case "embed":
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noreferrer noopener"
          className="my-1 block truncate rounded-[3px] border border-[var(--nf-border)] px-3 py-2 text-[0.9em] text-[var(--nf-text-secondary)] transition-colors hover:bg-[var(--nf-hover)]"
        >
          {block.url}
        </a>
      );

    case "divider":
      return <hr className="my-3 border-0 border-t border-[var(--nf-border)]" />;

    case "table":
      return (
        <div className="nf-scroll my-2 overflow-x-auto">
          <table className="w-full border-collapse text-[0.95em]">
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => {
                    const isHeader =
                      (block.hasColumnHeader && ri === 0) || (block.hasRowHeader && ci === 0);
                    const Tag = isHeader ? "th" : "td";
                    return (
                      <Tag
                        key={ci}
                        className={`border border-[var(--nf-border-strong)] px-2 py-1 text-left align-top ${
                          isHeader ? "bg-[var(--nf-bg-secondary)] font-semibold" : ""
                        }`}
                      >
                        <RichTextView rich={cell} />
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "columns":
      return (
        <div className="my-1 flex flex-col gap-3 sm:flex-row">
          {block.columns.map((col, i) => (
            <div key={i} className="min-w-0 flex-1">
              <NotionBlocks blocks={col} depth={depth + 1} />
            </div>
          ))}
        </div>
      );

    case "unsupported":
      return (
        <div className="my-1 text-[0.85em] text-[var(--nf-text-tertiary)]">
          Unsupported block: {block.label}
        </div>
      );
  }
}

function paragraphClass(color?: NotionColor): string {
  return `py-[3px] leading-[1.5] ${colorClass(color)}`;
}

function NestedToggle({ block, depth }: { block: Extract<NBlock, { type: "toggle" }>; depth: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`py-[3px] ${colorClass(block.color)}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full gap-1.5 text-left"
        aria-expanded={open}
      >
        <span
          className={`mt-[0.3em] w-[1.2em] shrink-0 select-none text-[0.7em] text-[var(--nf-text-secondary)] transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        <span className="min-w-0 flex-1 leading-[1.5]">
          <RichTextView rich={block.rich} />
        </span>
      </button>
      {open ? <Children blocks={block.children} depth={depth} /> : null}
    </div>
  );
}

/** Tracks the OS colour scheme so syntax highlighting matches the page. */
function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

function CodeBlock({ text, language }: { text: string; language: string }) {
  const lang = normalizeLanguage(language);
  const dark = usePrefersDark();
  return (
    <div className="nf-scroll my-2 overflow-x-auto rounded-[3px] bg-[var(--nf-bg-secondary)] p-4">
      <Highlight
        code={text.replace(/\n$/, "")}
        language={lang}
        theme={dark ? themes.vsDark : themes.vsLight}
      >
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            className="font-mono text-[0.85em] leading-[1.4]"
            style={{ background: "transparent", margin: 0 }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

const LANGUAGE_ALIASES: Record<string, string> = {
  "plain text": "text",
  "c++": "cpp",
  "c#": "csharp",
  "objective-c": "objectivec",
  shell: "bash",
  "shell session": "bash",
  html: "markup",
  xml: "markup",
  "f#": "fsharp",
  "visual basic": "basic",
};

function normalizeLanguage(language: string): string {
  const key = (language ?? "").toLowerCase().trim();
  return LANGUAGE_ALIASES[key] ?? key.replace(/\s+/g, "") ?? "text";
}
