"use client";

import { useEffect, useState } from "react";
import { isKatexReady, loadKatex } from "@/lib/markdown";

/**
 * Tracks whether KaTeX has finished loading, and starts the load if it has not.
 *
 * KaTeX is fetched as its own chunk rather than bundled into every screen, so
 * the first render — server and client alike — happens without it and shows the
 * plain-text fallback. Flipping this flag is what tells a memoised render to run
 * again now that real math is possible. It starts from `isKatexReady()` so that
 * once the chunk is in memory, every later block renders formatted math on its
 * very first paint with no second pass.
 */
export function useKatexReady() {
  const [ready, setReady] = useState(isKatexReady);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;

    const start = () => {
      void loadKatex().then(() => {
        if (!cancelled && isKatexReady()) setReady(true);
      });
    };

    /**
     * Server-rendered maths is already correct in the HTML, so nothing on
     * screen is waiting for this. Fetching at idle keeps a 75kB download from
     * competing with hydration; the timeout bounds the wait so client-rendered
     * content — a streaming chat answer, the next challenge — does not sit in
     * the plain-text fallback on a busy main thread.
     */
    // Safari only shipped requestIdleCallback recently, so fall back to a short
    // timer where it is missing. TypeScript's DOM types declare it as always
    // present, hence the runtime check rather than a truthiness test.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const handle = hasIdle
      ? window.requestIdleCallback(start, { timeout: 2000 })
      : window.setTimeout(start, 200);

    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
    };
  }, [ready]);

  return ready;
}
