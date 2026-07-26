"use client";

import { useMemo } from "react";
import katex from "katex";
import type { NotionColor, RichText } from "@/lib/types";

export function colorClass(color: NotionColor | undefined): string {
  if (!color || color === "default") return "";
  return color.endsWith("_background")
    ? `nf-bg-${color.replace("_background", "")} rounded-[3px] px-[0.15em] py-[0.05em]`
    : `nf-c-${color}`;
}

export function InlineEquation({ expression }: { expression: string }) {
  const html = useMemo(() => renderKatex(expression, false), [expression]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function BlockEquation({ expression }: { expression: string }) {
  const html = useMemo(() => renderKatex(expression, true), [expression]);
  return (
    <div
      className="my-1 overflow-x-auto py-1 text-center nf-scroll"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderKatex(expression: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expression, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: "htmlAndMathml",
    });
  } catch {
    // Malformed LaTeX shows its source rather than blowing up the card.
    return escapeHtml(expression);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}

/** Renders a Notion rich-text array with its annotations intact. */
export function RichTextView({ rich }: { rich: RichText[] }) {
  if (!rich?.length) return null;
  return (
    <>
      {rich.map((span, index) => {
        if (span.eq) return <InlineEquation key={index} expression={span.t} />;

        let node: React.ReactNode = span.t;
        if (span.c) node = <code className="nf-code">{node}</code>;
        if (span.b) node = <strong className="font-semibold">{node}</strong>;
        if (span.i) node = <em>{node}</em>;
        if (span.s) node = <s className="opacity-70">{node}</s>;
        if (span.u) node = <span className="underline underline-offset-2">{node}</span>;

        const cls = colorClass(span.color);
        if (cls) node = <span className={cls}>{node}</span>;

        if (span.href) {
          return (
            <a
              key={index}
              href={span.href}
              target="_blank"
              rel="noreferrer noopener"
              className="nf-link"
            >
              {node}
            </a>
          );
        }
        return <span key={index}>{node}</span>;
      })}
    </>
  );
}

export function plain(rich: RichText[]): string {
  return (rich ?? []).map((r) => r.t).join("");
}
