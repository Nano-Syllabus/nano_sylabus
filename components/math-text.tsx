"use client";

import { useMemo } from "react";
import { renderMathText } from "@/lib/markdown";
import { useKatexReady } from "@/components/use-katex";

/**
 * Prose that may contain LaTeX.
 *
 * Challenge lessons, worked solutions and exam questions come back from the
 * tenant API with `$...$` embedded in ordinary sentences. They used to be
 * rendered as raw text, so a student read `$\frac{p}{q}$` instead of the
 * fraction. This renders the maths while leaving the surrounding typography to
 * the caller's own classes.
 *
 * It emits only inline-level markup, so it is safe to use in the places these
 * strings already live — inside existing paragraphs — unlike the full `Markdown`
 * component, whose block-level output cannot legally nest there.
 */
export function MathText({
  text,
  className = "",
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  /** Use "div" where the text is multi-line and the caller sets whitespace. */
  as?: "span" | "div";
}) {
  const katexReady = useKatexReady();

  const html = useMemo(
    () => renderMathText(text),
    // `katexReady` is not read here, but `renderMathText` consults the
    // module-level KaTeX handle it tracks, so the same text renders differently
    // once it flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, katexReady],
  );

  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
