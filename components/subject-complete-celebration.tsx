"use client";

import { useMemo } from "react";

const CONFETTI_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

/**
 * Every subtopic of the subject is done — the Next endpoint's 409. That is the
 * finish line, not a failure, so it is celebrated: a burst of confetti over a
 * card, and the way on is another subject.
 */
export function SubjectCompleteCelebration({
  subjectName,
  onStartAnother,
  className = "",
}: {
  subjectName: string;
  onStartAnother: () => void;
  className?: string;
}) {
  // Fixed per mount so a re-render does not reshuffle the pieces mid-fall.
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.8 + Math.random() * 1.4,
        drift: (Math.random() - 0.5) * 160,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        width: 6 + Math.random() * 5,
        round: index % 4 === 0,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      })),
    [],
  );

  return (
    <>
      <div aria-hidden="true" className="subject-confetti">
        {pieces.map((piece, index) => (
          <span
            key={index}
            style={
              {
                left: `${piece.left}%`,
                width: `${piece.width}px`,
                height: piece.round ? `${piece.width}px` : `${piece.width * 1.6}px`,
                borderRadius: piece.round ? "9999px" : "2px",
                background: piece.color,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
                "--confetti-drift": `${piece.drift}px`,
                "--confetti-spin": `${piece.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <section
        role="status"
        className={`animate-[slide-up_0.4s_ease-out] rounded-2xl border border-green-600/30 bg-green-600/5 p-6 text-center ${className}`}
      >
        <p className="text-4xl" aria-hidden="true">
          🎉
        </p>
        <h2 className="mt-2 text-xl font-semibold text-text-primary">
          {subjectName ? `You finished every ${subjectName} challenge!` : "You finished every challenge in this subject!"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
          Every subtopic published so far is done. New ones will show up here when your teacher adds them.
        </p>
        <button
          type="button"
          onClick={onStartAnother}
          className="mt-5 min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Start another subject →
        </button>
      </section>
    </>
  );
}
