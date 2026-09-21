"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { emptyFigureSection } from "@/lib/answer-figures";
import { normalizeQuestionText } from "@/lib/challenge-learn-questions";
import type { StudentChallengeDetail } from "@/lib/data/student-challenges";

export type DrawnFigure = { challenge: StudentChallengeDetail; solution: string };

/** One request per example per page, however many times it mounts. */
const inFlight = new Map<string, Promise<DrawnFigure | null>>();

function requestFigure(challengeId: string, question: string) {
  const key = `${challengeId}:${normalizeQuestionText(question)}`;
  const pending =
    inFlight.get(key) ??
    fetch(`/api/student/challenges/${challengeId}/figure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as Partial<DrawnFigure>;
        return response.ok && payload.challenge && payload.solution
          ? { challenge: payload.challenge, solution: payload.solution }
          : null;
      })
      .catch(() => null)
      .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

function withNote(solution: string, insertAt: number, note: string) {
  return `${solution.slice(0, insertAt)}\n\n*${note}*${solution.slice(insertAt)}`;
}

const IMAGE = /!\[[^\]]*\]\([^)\s]+\)/;

/**
 * A translation of the solution, with the figure drawn since it was translated.
 *
 * The translation was written from the solution as it stood — "### Diagram"
 * over nothing — so it has no picture to carry. The picture goes under the
 * translated figure heading when one can be found, and above the answer when
 * the heading was translated past recognising.
 */
function translatedWithFigure(text: string, drawn: string) {
  const image = drawn.match(IMAGE)?.[0];
  if (!image || IMAGE.test(text)) return text;
  const section = emptyFigureSection(text);
  return section
    ? `${text.slice(0, section.insertAt)}\n\n${image}${text.slice(section.insertAt)}`
    : `${image}\n\n${text}`;
}

/**
 * A worked solution, and the picture it promised if it lost one.
 *
 * A solution that says "### Diagram" over nothing (see lib/answer-figures.ts)
 * asks the server to draw it — once it is on screen, so a question nobody opens
 * costs nothing. The server names the figure straight away and files it on the
 * challenge, and the image's own loading frame (components/answer-media.ts)
 * covers the seconds the drawing takes. A failure is said under the heading and
 * tried again the next time the answer is opened.
 */
export function WorkedSolution({
  challengeId,
  question,
  solution,
  text,
  className,
  onDrawn,
}: {
  challengeId: string;
  question: string;
  /** The stored solution: what is checked for a missing picture. */
  solution: string;
  /** What is shown, when it is not `solution` — a translation of it. */
  text?: string;
  className?: string;
  /** Hands the updated challenge to a screen that caches it. */
  onDrawn?: (drawn: DrawnFigure) => void;
}) {
  const [drawnSolution, setDrawnSolution] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "drawing" | "failed">("idle");
  const current = drawnSolution ?? solution;
  const section = useMemo(() => emptyFigureSection(current), [current]);
  const rootRef = useRef<HTMLDivElement>(null);
  // Read at resolve time, so a parent re-rendering with a new callback does not
  // restart the observer.
  const onDrawnRef = useRef(onDrawn);
  useEffect(() => {
    onDrawnRef.current = onDrawn;
  });

  const missing = Boolean(section);
  // A ref, not `state`: the request's own "drawing" must not re-run this effect,
  // whose cleanup would then discard the answer it is waiting for.
  const startedRef = useRef(false);
  useEffect(() => {
    const node = rootRef.current;
    if (!missing || startedRef.current || !node || typeof IntersectionObserver === "undefined") {
      return;
    }
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (startedRef.current || !entries.some((entry) => entry.isIntersecting)) return;
        startedRef.current = true;
        observer.disconnect();
        setState("drawing");
        void requestFigure(challengeId, question).then((drawn) => {
          if (!active) return;
          if (!drawn || emptyFigureSection(drawn.solution)) {
            setState("failed");
            return;
          }
          setDrawnSolution(drawn.solution);
          onDrawnRef.current?.(drawn);
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [challengeId, question, missing]);

  const translated = text !== undefined && text !== solution;
  const shown = translated
    ? // A translation carries no note: its offsets are not the English ones.
      drawnSolution
      ? translatedWithFigure(text, drawnSolution)
      : text
    : section && state === "drawing"
      ? withNote(current, section.insertAt, "Drawing the diagram…")
      : section && state === "failed"
        ? withNote(
            current,
            section.insertAt,
            "The diagram could not be drawn right now. It will be tried again next time you open this.",
          )
        : current;

  return (
    <div ref={rootRef}>
      <Markdown text={shown} className={className} />
    </div>
  );
}
