"use client";

import { useEffect, useState } from "react";
import { LandingView } from "@/components/landing-view";
import { sanitizeLandingContent, type LandingContent } from "@/lib/landing-content";

export type LandingPreviewMessage =
  | { type: "landing-preview:content"; content: LandingContent }
  | { type: "landing-preview:scroll"; section: string };

/**
 * The landing page inside the editor's iframe. It takes new text from the
 * editor (same origin only) and re-renders; links are inert so a stray click
 * cannot navigate the preview away.
 */
export function LandingPreview({ initialContent }: { initialContent: LandingContent }) {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    function onMessage(event: MessageEvent<LandingPreviewMessage>) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = event.data;
      if (message?.type === "landing-preview:content") {
        setContent(sanitizeLandingContent(message.content));
      } else if (message?.type === "landing-preview:scroll") {
        const target = document.querySelector(`[data-landing-section="${CSS.escape(message.section)}"]`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        else if (message.section === "hero" || message.section === "nav") window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    function blockNavigation(event: MouseEvent) {
      const link = (event.target as HTMLElement | null)?.closest("a");
      if (link) event.preventDefault();
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("click", blockNavigation, true);
    window.parent.postMessage({ type: "landing-preview:ready" }, window.location.origin);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", blockNavigation, true);
    };
  }, []);

  return <LandingView content={content} />;
}
