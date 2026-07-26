"use client";

import { useEffect } from "react";

/**
 * Marks the document as embedded.
 *
 * An iframe doesn't inherit the host page's background, so a white body would
 * paint a hard rectangle on top of a Notion page — especially obvious in dark
 * mode. Flagging the root lets the stylesheet make the document transparent so
 * the embed sits flush on whatever background Notion is using.
 */
export function EmbedMode() {
  useEffect(() => {
    document.documentElement.dataset.embed = "1";
    return () => {
      delete document.documentElement.dataset.embed;
    };
  }, []);
  return null;
}
