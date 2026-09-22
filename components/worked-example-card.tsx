import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

/**
 * A worked example as one ruled sheet: its label, its question and its answer
 * all sit on the same lines, the way a solution is written out on a page.
 *
 * Shared by the worked examples in Revision and in a challenge's step 1, so a
 * worked example looks the same wherever it is read. The question is written in
 * the same hand as the answer — it is a page of someone's notes, question and
 * all — and is told apart from it by its darker ink and the "Solution" line.
 *
 * The lines are drawn by `.answer-paper*` in app/globals.css.
 */

/** For the answer placed in the card: handwritten, on the lines. */
export const workedAnswerClass =
  "answer-paper-body font-revision-answer whitespace-pre-wrap text-sm text-text-secondary";

/** For prose written straight onto the sheet — the concepts reading. Unlike an
 *  answer, a paragraph's soft line breaks are not kept. */
export const paperTextClass = "answer-paper-body font-revision-answer text-sm text-text-secondary";

/** A printed line on the sheet: "Example 1 · 2072 Ashwin", "Solution". */
export const paperLabelClass =
  "answer-paper-label text-xs font-semibold uppercase tracking-wide text-text-muted";

const questionClass = "answer-paper-body font-revision-answer text-sm text-text-primary";

export function WorkedExampleCard({
  label,
  question,
  children,
  className,
  collapsible = false,
}: {
  label: ReactNode;
  question?: string;
  /** The answer, rendered with `workedAnswerClass`. */
  children: ReactNode;
  className?: string;
  /**
   * Opens on the question alone and unfolds to the solution — a challenge's
   * step 1, where the student tries it before looking. `details`, not a button:
   * the question is block markdown, which a button may not contain, and the
   * native element opens without JavaScript.
   */
  collapsible?: boolean;
}) {
  if (collapsible) {
    return (
      <details className={cn("answer-paper group", className)}>
        <summary className="relative block cursor-pointer list-none rounded-t-xl marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
          <p className={paperLabelClass}>{label}</p>
          {question ? <Markdown text={question} className={questionClass} /> : null}
          {/* On the label's line, whose text is short, so it never sits over
              the question. */}
          <ChevronDown
            aria-hidden="true"
            className="absolute right-3 top-1 size-5 text-text-muted transition-transform group-open:rotate-180"
          />
        </summary>
        {/* The skipped line `.answer-paper-body + .answer-paper-label` gives
            the open card, drawn here because the summary sits between them. */}
        <p className={cn(paperLabelClass, question ? "pt-[var(--paper-line)]" : "")}>Solution</p>
        {children}
      </details>
    );
  }
  return (
    <article className={cn("answer-paper", className)}>
      <p className={paperLabelClass}>{label}</p>
      {question ? (
        <Markdown text={question} className={questionClass} />
      ) : null}
      <p className={paperLabelClass}>Solution</p>
      {children}
    </article>
  );
}
