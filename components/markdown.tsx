"use client";

// Math is rendered here and nowhere else, so KaTeX's stylesheet loads with
// this component instead of blocking the first paint of every page.
import "katex/dist/katex.min.css";
import { renderMarkdown } from "@/lib/markdown";
import { enhanceAnswerMedia } from "@/components/answer-media";
import { useKatexReady } from "@/components/use-katex";
import React, { useMemo, useRef } from "react";

const MARKDOWN_CLASS =
  "max-w-full overflow-hidden break-words text-sm leading-relaxed text-text-primary [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_strong]:font-semibold [&_em]:italic [&_code]:font-mono-ui [&_code]:rounded [&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-bg-tertiary [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:block [&_table]:w-fit [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-left [&_thead]:bg-bg-tertiary [&_th]:min-w-20 [&_th]:border [&_th]:border-border [&_th]:px-5 [&_th]:py-3 [&_th]:text-[15px] [&_th]:font-semibold [&_td]:min-w-20 [&_td]:border [&_td]:border-border [&_td]:px-5 [&_td]:py-3.5 [&_td]:text-[15px] [&_td]:font-medium [&_tbody_tr:nth-child(even)]:bg-bg-tertiary/40 [&_.math-inline]:align-baseline [&_.math-inline]:break-normal [&_.math-block]:my-3 [&_.math-block]:max-w-full [&_.math-block]:overflow-x-auto [&_.math-block]:rounded-lg [&_.math-block]:border [&_.math-block]:border-border [&_.math-block]:bg-bg-tertiary [&_.math-block]:p-3 [&_.math-block]:text-center [&_.math-block_.katex-display]:my-0 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc [&_li]:mt-1 [&_p]:mt-2 first:[&_p]:mt-0 [&_img.answer-figure]:my-4 [&_img.answer-figure]:mx-auto [&_img.answer-figure]:block [&_img.answer-figure]:h-auto [&_img.answer-figure]:max-w-full [&_img.answer-figure]:rounded-lg [&_img.answer-figure]:border [&_img.answer-figure]:border-border [&_img.answer-figure]:bg-white [&_.answer-animation]:my-4 [&_.answer-animation]:overflow-hidden [&_.answer-animation]:rounded-lg [&_.answer-animation]:border [&_.answer-animation]:border-border [&_.answer-animation_img]:my-0 [&_.answer-animation_img]:rounded-none [&_.answer-animation_img]:border-0 [&_.answer-animation-video]:block [&_.answer-animation-video]:h-auto [&_.answer-animation-video]:w-full [&_.answer-animation-status]:px-3 [&_.answer-animation-status]:py-2 [&_.answer-animation-status]:text-xs [&_.answer-animation-status]:text-text-secondary [&_.answer-animation-failed]:text-text-secondary [&_.answer-animation-play]:w-full [&_.answer-animation-play]:cursor-pointer [&_.answer-animation-play]:px-3 [&_.answer-animation-play]:py-2 [&_.answer-animation-play]:text-left [&_.answer-animation-play]:text-xs [&_.answer-animation-play]:font-semibold ";

/*
 * TikZJax stood here, and with it the whole client-side TikZ path: a WASM TeX
 * distribution pulled from unpkg at runtime, a fence extractor, a placeholder
 * figure, a 25-second render poll and a failure card showing the source.
 *
 * Every reader of a chat answer downloaded a TeX install to look at a half
 * adder, and `next.config.ts` named that CDN fetch as one of the two reasons a
 * `script-src` policy could not be added.
 *
 * None of it is needed now. The answer model writes a ```figure description
 * rather than TikZ, the backend hands that to the render service, and what
 * arrives here is `![Diagram](/api/figure/<sha>.png)` — an ordinary image.
 * `components/answer-media.ts` gives it a frame to arrive into.
 */

export const Markdown = React.memo(function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  const katexReady = useKatexReady();

  const rendered = useMemo(() => {
    return renderMarkdown(text);
    // `katexReady` is not read in this block, so the exhaustive-deps rule calls
    // it unnecessary — but `renderMarkdown` reads the module-level KaTeX handle
    // that the flag tracks, so the same `text` renders differently once it
    // flips. Dropping it would leave math stuck in the plain-text fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, katexReady]);

  // The pictures the BACKEND drew: an animation poster becomes a player, and a
  // figure still being redrawn swaps to the better render when it lands. Runs on
  // every render because streamed answers grow an image at a time; the helper is
  // idempotent per element.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return enhanceAnswerMedia(root);
  }, [rendered]);

  return (
    <div
      ref={rootRef}
      className={MARKDOWN_CLASS + className}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
});
