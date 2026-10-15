"use client";

import { Check, X } from "lucide-react";
import { useId } from "react";
import { Markdown } from "@/components/markdown";
import { blankMatches, type ConceptActivity } from "@/lib/concept-activities";
import { useConceptStudy } from "@/components/use-concept-study";
import { ConceptExperiment } from "@/components/concept-experiment";
import { ConceptBits } from "@/components/concept-bits";
import { ConceptFigure } from "@/components/concept-figure";
import { cn } from "@/lib/utils";

/*
 * The micro-book's activities. Each one asks the student to DO something with
 * the section they just read and answers at once, with the reason: tap an
 * option and see why it is right or wrong, reveal a derivation a step at a
 * time, fill in the key quantities. Progress is the student's own browser
 * storage; nothing here is sent anywhere.
 */

const button =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm font-semibold text-text-primary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";
const primary =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50";
const input =
  "min-h-10 min-w-0 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export type ConceptActivityProps = {
  activity: ConceptActivity;
  complete: boolean;
  onComplete: () => void;
  /** Kept for the slider lab and bit builder, which report a wrong prediction. */
  onReview?: () => void;
  storageKey?: string;
};
type Props = ConceptActivityProps;

function Feedback({ correct, children }: { correct: boolean; children?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border-l-4 p-3 text-sm",
        correct
          ? "border-l-green-600 bg-green-500/10 dark:border-l-green-400"
          : "border-l-red-600 bg-red-500/10 dark:border-l-red-400",
      )}
    >
      <p
        className={cn(
          "font-semibold",
          correct ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400",
        )}
      >
        {correct ? "Correct." : "Not quite."}
      </p>
      {children}
    </div>
  );
}

/** Tap an option: it is marked at once, and the explanation says why. */
function ChoiceCheck({
  activity,
  onComplete,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "choice" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const answered = work.selected >= 0;
  const correct = work.selected === activity.answer_index;
  return (
    <>
      <div className="grid gap-2" role="group" aria-label="Options">
        {activity.options.map((option, index) => {
          const chosen = work.selected === index;
          const isAnswer = index === activity.answer_index;
          return (
            <button
              key={index}
              type="button"
              aria-pressed={chosen}
              disabled={answered && correct}
              onClick={() => {
                update({ selected: index, attempts: work.attempts + 1 });
                if (isAnswer) onComplete();
              }}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default",
                answered && isAnswer && correct
                  ? "border-green-600 bg-green-500/10 dark:border-green-400"
                  : chosen
                    ? "border-red-600 bg-red-500/10 dark:border-red-400"
                    : "border-border bg-bg-primary hover:bg-bg-tertiary",
              )}
            >
              <span className="mt-0.5 font-semibold text-text-muted">
                {String.fromCharCode(65 + index)}
              </span>
              <Markdown text={option} className="flex-1" />
              {chosen && (correct ? (
                <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              ))}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {answered && (
          <Feedback correct={correct}>
            {correct ? (
              <Markdown text={activity.explanation} className="mt-1" />
            ) : activity.hint ? (
              <Markdown text={activity.hint} className="mt-1" />
            ) : (
              <p className="mt-1 text-text-secondary">
                Think about the idea behind each option, then try another.
              </p>
            )}
          </Feedback>
        )}
      </div>
    </>
  );
}

/** Type the number; checked within the activity's tolerance. */
function NumericCheck({
  activity,
  onComplete,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "numeric" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const id = useId();
  const value = Number(work.answer);
  return (
    <>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!work.answer.trim() || !Number.isFinite(value)) return;
          const correct =
            Math.abs(value - activity.answer) <=
            activity.tolerance + Number.EPSILON * Math.max(1, Math.abs(activity.answer)) * 8;
          update({ correct, attempts: work.attempts + 1 });
          if (correct) onComplete();
        }}
      >
        <label htmlFor={id} className="sr-only">
          Your answer{activity.unit ? ` in ${activity.unit}` : ""}
        </label>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          placeholder="Your answer"
          className={cn(input, "w-40")}
          value={work.answer}
          onChange={(event) => update({ answer: event.target.value, correct: null })}
        />
        {activity.unit && <span className="pb-2.5 text-sm text-text-secondary">{activity.unit}</span>}
        <button type="submit" className={primary}>
          Check
        </button>
      </form>
      <div aria-live="polite">
        {work.correct !== null && (
          <Feedback correct={work.correct}>
            {work.correct ? (
              <Markdown text={activity.explanation} className="mt-1" />
            ) : activity.hint ? (
              <Markdown text={activity.hint} className="mt-1" />
            ) : (
              <p className="mt-1 text-text-secondary">Check the substitution, the units and the arithmetic.</p>
            )}
          </Feedback>
        )}
      </div>
      {work.correct === false && work.attempts >= 2 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-blue-600 dark:text-blue-400">
            Show the working
          </summary>
          <Markdown text={activity.explanation} className="mt-2" />
        </details>
      )}
    </>
  );
}

/** Fill in the key quantities of a sentence, a definition or a derivation. */
function BlanksCheck({
  activity,
  onComplete,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "blanks" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const prefix = useId();
  // `values` is the shared numeric store, so the typed text lives in `answer`.
  const typed: string[] = (() => {
    try {
      const parsed = JSON.parse(work.answer || "[]");
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  })();
  const results = work.checked.length ? activity.blanks.map((item, i) => blankMatches(typed[i] ?? "", item)) : [];
  const allRight = results.length > 0 && results.every(Boolean);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const marks = activity.blanks.map((item, i) => blankMatches(typed[i] ?? "", item));
        update({ checked: marks.map((ok) => (ok ? 1 : 0)), attempts: work.attempts + 1 });
        if (marks.every(Boolean)) onComplete();
      }}
    >
      <ol className="space-y-3">
        {activity.blanks.map((item, i) => {
          const state = results[i];
          return (
            <li key={i} className="text-sm leading-8 text-text-primary">
              {item.before && <Markdown text={item.before} className="inline [&_p]:inline" />}{" "}
              <label htmlFor={`${prefix}-${i}`} className="sr-only">
                Blank {i + 1}
              </label>
              <input
                id={`${prefix}-${i}`}
                autoComplete="off"
                spellCheck={false}
                value={typed[i] ?? ""}
                readOnly={work.revealed}
                onChange={(event) => {
                  const next = [...typed];
                  next[i] = event.target.value;
                  update({ answer: JSON.stringify(next), checked: [] });
                }}
                className={cn(
                  input,
                  "mx-1 inline-block w-32 py-1 align-baseline",
                  state === true && "border-green-600 dark:border-green-400",
                  state === false && "border-red-600 dark:border-red-400",
                )}
              />{" "}
              {item.after && <Markdown text={item.after} className="inline [&_p]:inline" />}
              {work.revealed && (
                <span className="ml-2 font-semibold text-blue-600 dark:text-blue-400">→ {item.answer}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" className={primary}>
          Check blanks
        </button>
        {work.attempts > 0 && !allRight && (
          <button type="button" className={button} onClick={() => update({ revealed: !work.revealed })}>
            {work.revealed ? "Hide answers" : "Show answers"}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {results.length > 0 && (
          <Feedback correct={allRight}>
            <p className="mt-1 text-text-secondary">
              {results.filter(Boolean).length} of {results.length} right.
            </p>
            {allRight && activity.explanation && <Markdown text={activity.explanation} className="mt-1" />}
          </Feedback>
        )}
      </div>
    </form>
  );
}

/** A derivation revealed one step at a time: try the next line first, then look. */
function GuidedDerivation({
  activity,
  onComplete,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "derivation" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const total = activity.steps.length;
  const visible = Math.min(work.visible, total);
  return (
    <>
      <ol className="space-y-4">
        {activity.steps.slice(0, visible).map((step, index) => (
          <li key={index} className="border-l-2 border-blue-500 pl-4">
            <p className="text-sm font-semibold text-text-primary">
              {index + 1}. {step.heading}
            </p>
            <Markdown text={step.explanation} />
            {step.formula && <Markdown text={`$$\n${step.formula}\n$$`} />}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {visible < total ? (
          <button
            type="button"
            className={primary}
            onClick={() => {
              const next = visible + 1;
              update({ visible: next });
              if (next === total) onComplete();
            }}
          >
            Show next step
          </button>
        ) : (
          <button type="button" className={button} onClick={() => update({ visible: 1 })}>
            Start again
          </button>
        )}
        <span className="text-xs text-text-muted" aria-live="polite">
          Step {visible} of {total}
          {visible < total ? " · say the next line to yourself before you reveal it" : ""}
        </span>
      </div>
    </>
  );
}

/** Tap each part of the diagram to see what it does. */
function DiagramExplorer({
  activity,
  onComplete,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "diagram" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const selected = activity.parts[work.selected]?.id ?? null;
  const seen = work.seen.filter((id) => activity.parts.some((p) => p.id === id));
  const selectedPart = activity.parts.find((p) => p.id === selected);
  const open = (id: string) => {
    const next = Array.from(new Set([...seen, id]));
    update({ selected: activity.parts.findIndex((p) => p.id === id), seen: next });
    if (next.length === activity.parts.length) onComplete();
  };
  return (
    <>
      <svg
        viewBox="0 0 600 360"
        role="group"
        aria-label={activity.title}
        className="w-full rounded-xl border border-border bg-bg-primary text-blue-600 dark:text-blue-400"
      >
        {activity.links.map((link, index) => {
          const from = activity.parts.find((p) => p.id === link.from_id)!;
          const to = activity.parts.find((p) => p.id === link.to_id)!;
          return (
            <line
              key={index}
              x1={(from.x + from.width / 2) * 6}
              y1={(from.y + from.height / 2) * 3.6}
              x2={(to.x + to.width / 2) * 6}
              y2={(to.y + to.height / 2) * 3.6}
              stroke="currentColor"
              strokeWidth="2"
              opacity=".45"
            />
          );
        })}
        {activity.parts.map((p) => {
          const active = selected === p.id;
          const done = seen.includes(p.id);
          return (
            <g
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`Explore ${p.label}`}
              aria-pressed={active}
              className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              onClick={() => open(p.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open(p.id);
                }
              }}
            >
              {p.shape === "ellipse" ? (
                <ellipse
                  cx={(p.x + p.width / 2) * 6}
                  cy={(p.y + p.height / 2) * 3.6}
                  rx={p.width * 3}
                  ry={p.height * 1.8}
                  className={done ? "fill-blue-500/15" : "fill-bg-secondary"}
                  stroke="currentColor"
                  strokeWidth={active ? 4 : 1.5}
                />
              ) : (
                <rect
                  x={p.x * 6}
                  y={p.y * 3.6}
                  width={p.width * 6}
                  height={p.height * 3.6}
                  rx="7"
                  className={done ? "fill-blue-500/15" : "fill-bg-secondary"}
                  stroke="currentColor"
                  strokeWidth={active ? 4 : 1.5}
                />
              )}
              <text
                x={(p.x + p.width / 2) * 6}
                y={(p.y + p.height / 2) * 3.6}
                className="fill-text-primary"
                fontSize="13"
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div aria-live="polite" className="mt-3 rounded-lg bg-bg-primary p-3">
        {selectedPart ? (
          <>
            <p className="text-sm font-semibold text-text-primary">{selectedPart.label}</p>
            <Markdown text={selectedPart.description} />
          </>
        ) : (
          <p className="text-sm text-text-muted">Select a part to see what it does.</p>
        )}
        <p className="mt-2 text-xs text-text-muted">
          Parts explored: {seen.length} of {activity.parts.length}
        </p>
      </div>
    </>
  );
}

/** A paper-style question: answer, compare with the model answer, mark yourself. */
function ExamPractice({
  activity,
  onComplete,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "exam" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const checked = work.checked.filter((n) => n < activity.rubric.length);
  const id = useId();
  const total = activity.rubric.reduce((sum, item) => sum + item.marks, 0);
  const score = activity.rubric.reduce(
    (sum, item, index) => sum + (checked.includes(index) ? item.marks : 0),
    0,
  );
  return (
    <>
      <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
        Write your answer here or on paper, then open the model answer.
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={12000}
        className={cn(input, "mt-2 w-full resize-y")}
        value={work.answer}
        onChange={(event) => update({ answer: event.target.value })}
      />
      <details
        className="my-3 rounded-lg border border-border bg-bg-primary p-3"
        open={work.revealed}
        onToggle={(event) => update({ revealed: (event.target as HTMLDetailsElement).open })}
      >
        <summary className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400">
          Model answer
        </summary>
        <Markdown text={activity.solution} className="mt-2" />
      </details>
      {work.revealed && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-text-primary">
            Mark yourself · {score} of {total} marks
          </legend>
          {activity.rubric.map((item, index) => (
            <label key={index} className="mb-2 flex items-start gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-blue-600"
                checked={checked.includes(index)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...checked, index]
                    : checked.filter((n) => n !== index);
                  update({ checked: next });
                  if (next.length) onComplete();
                }}
              />
              <span>
                {item.criterion} <span className="text-text-muted">({item.marks})</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

const labels: Record<ConceptActivity["kind"], string> = {
  bits: "Build the bits",
  blanks: "Fill the blanks",
  derivation: "Derive it",
  choice: "Check your understanding",
  numeric: "Work it out",
  experiment: "Lab",
  figure: "Explore the figure",
  diagram: "Explore the diagram",
  exam: "Exam question",
};

export function ConceptActivityCard(props: Props) {
  const { activity, complete } = props;
  const heading = useId();
  return (
    <section
      aria-labelledby={heading}
      className="my-6 rounded-xl border border-border bg-bg-secondary p-4 sm:p-5"
      data-concept-activity={activity.kind}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Activity · {labels[activity.kind]}
        </p>
        {complete && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400">
            <Check className="size-3.5" aria-hidden="true" /> Done
          </span>
        )}
      </div>
      <h4 id={heading} className="type-student-card-title text-text-primary">
        {activity.title}
      </h4>
      {activity.prompt && <Markdown text={activity.prompt} className="mt-2 mb-4 text-[15px]" />}
      {activity.kind === "choice" && <ChoiceCheck {...props} activity={activity} />}
      {activity.kind === "numeric" && <NumericCheck {...props} activity={activity} />}
      {activity.kind === "blanks" && <BlanksCheck {...props} activity={activity} />}
      {activity.kind === "derivation" && <GuidedDerivation {...props} activity={activity} />}
      {activity.kind === "experiment" && <ConceptExperiment {...props} activity={activity} />}
      {activity.kind === "figure" && <ConceptFigure {...props} activity={activity} />}
      {activity.kind === "diagram" && <DiagramExplorer {...props} activity={activity} />}
      {activity.kind === "exam" && <ExamPractice {...props} activity={activity} />}
      {activity.kind === "bits" && <ConceptBits {...props} activity={activity} />}
    </section>
  );
}
