"use client";

import { useId } from "react";
import { Markdown } from "@/components/markdown";
import { type ConceptActivity } from "@/lib/concept-activities";
import { useConceptStudy } from "@/components/use-concept-study";
import { ConceptExperiment } from "@/components/concept-experiment";
import { ConceptBits } from "@/components/concept-bits";

const button =
  "rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";
const primary = `${button} bg-blue-600 text-white hover:bg-blue-700`;
const input =
  "min-w-0 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
export type ConceptActivityProps = {
  activity: ConceptActivity;
  complete: boolean;
  onComplete: () => void;
  onReview?: () => void;
  storageKey?: string;
  needsReview?: boolean;
};
type Props = ConceptActivityProps;

function GuidedDerivation({
  activity,
  onComplete,
  onReview,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "derivation" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const visible = Math.min(work.visible, activity.steps.length);
  const id = useId();
  return (
    <>
      {work.revealed ? (
        <p className="rounded-lg border border-dashed border-blue-500/40 p-4 text-sm text-text-secondary">
          Steps covered. Start with the governing law and reconstruct the reasoning in your own
          words.
        </p>
      ) : (
        <ol className="space-y-4">
          {activity.steps.slice(0, visible).map((step, index) => (
            <li key={index} className="border-l-2 border-blue-500 pl-4">
              <p className="font-semibold text-text-primary">
                {index + 1}. {step.heading}
              </p>
              <Markdown text={step.explanation} />
              {step.formula && <Markdown text={`$$\n${step.formula}\n$$`} />}
            </li>
          ))}
        </ol>
      )}
      <label htmlFor={id} className="mt-4 block text-sm font-medium text-text-primary">
        {visible < activity.steps.length
          ? "What should happen next, and why?"
          : "Explain the derivation from memory"}
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={12000}
        className={`${input} mt-2 w-full resize-y`}
        value={work.answer}
        onChange={(event) => update({ answer: event.target.value })}
        placeholder="Think through the law, substitution and assumptions…"
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primary}
          disabled={visible === activity.steps.length}
          onClick={() => {
            const next = visible + 1;
            update({ visible: next });
          }}
        >
          Show next step
        </button>
        <span className="text-xs text-text-muted" aria-live="polite">
          {visible} of {activity.steps.length} steps
        </span>
        <button
          type="button"
          className={button}
          onClick={() => update({ visible: 1, revealed: false })}
        >
          Start again
        </button>
      </div>
      {visible === activity.steps.length && (
        <div className="mt-4 space-y-3">
          <button
            type="button"
            className={button}
            aria-pressed={work.revealed}
            onClick={() => update({ revealed: !work.revealed })}
          >
            {work.revealed ? "Compare with derivation" : "Cover the steps"}
          </button>
          {!work.revealed && work.answer.trim() && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button}
                onClick={() => {
                  update({ confidence: "review" });
                  onReview?.();
                }}
              >
                I need to revisit the reasoning
              </button>
              <button
                type="button"
                className={primary}
                onClick={() => {
                  update({ confidence: "ready" });
                  onComplete();
                }}
              >
                I can explain each step
              </button>
            </div>
          )}
          <p className="text-xs text-text-muted">
            Self-check the starting law, each transition and the conditions. Revealing all steps
            does not mark this complete.
          </p>
        </div>
      )}
    </>
  );
}

function KnowledgeCheck({
  activity,
  onComplete,
  onReview,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "choice" | "numeric" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const { selected, answer, correct } = work;
  const id = useId();
  const check = (value: boolean) => {
    update({ correct: value, attempts: work.attempts + 1 });
    if (value) onComplete();
    else onReview?.();
  };
  return (
    <>
      {activity.kind === "choice" ? (
        <div className="space-y-2">
          {activity.options.map((option, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={selected === index}
              className={`${button} w-full text-left ${selected === index ? "border-blue-500 bg-blue-500/10" : "bg-bg-primary"}`}
              onClick={() => {
                update({ selected: index, correct: null, revealed: false });
              }}
            >
              <Markdown text={option} />
            </button>
          ))}
          <button
            type="button"
            className={`${primary} mt-3`}
            disabled={selected < 0}
            onClick={() => check(selected === activity.answer_index)}
          >
            Check my choice
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!answer.trim() || !Number.isFinite(Number(answer))) return;
            check(
              Math.abs(Number(answer) - activity.answer) <=
                activity.tolerance + Number.EPSILON * Math.max(1, Math.abs(activity.answer)) * 8,
            );
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm text-text-secondary">
              Your answer{activity.unit ? ` (${activity.unit})` : ""}
            </label>
            <input
              id={id}
              type="number"
              step="any"
              required
              className={input}
              value={answer}
              onChange={(event) => {
                update({ answer: event.target.value, correct: null, revealed: false });
              }}
            />
          </div>
          <button type="submit" className={primary}>
            Check answer
          </button>
        </form>
      )}
      <div aria-live="polite" className="mt-3">
        {correct !== null && (
          <>
            <p
              className={`text-sm font-semibold ${correct ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
            >
              {correct
                ? "Correct — you’ve got it."
                : "Not quite. Revisit the principle and try again."}
            </p>
            {correct ? (
              <Markdown text={activity.explanation} />
            ) : activity.hint ? (
              <Markdown text={activity.hint} />
            ) : (
              <p className="mt-2 text-sm text-text-secondary">
                {activity.kind === "numeric"
                  ? "Check the substitution, sign and units against your notes."
                  : "Compare each choice with the explanation in your notes."}
              </p>
            )}
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-text-muted" aria-live="polite">
        {work.attempts
          ? `${work.attempts} ${work.attempts === 1 ? "attempt" : "attempts"}`
          : "Commit to an answer before checking."}
      </p>
      {correct !== true && work.attempts > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className={button}
            onClick={() => {
              update({ revealed: !work.revealed });
            }}
          >
            {work.revealed ? "Hide explanation and retry" : "Show worked explanation"}
          </button>
          {work.revealed && (
            <div className="mt-3 rounded-lg border border-border bg-bg-primary p-3">
              <Markdown text={activity.explanation} />
              <p className="mt-2 text-xs text-text-muted">
                Hide the explanation, then try again from memory.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DiagramExplorer({
  activity,
  onComplete,
  onReview,
  storageKey,
}: Props & { activity: Extract<ConceptActivity, { kind: "diagram" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const selected = activity.parts[work.selected]?.id ?? null;
  const seen = work.seen.filter((id) => activity.parts.some((p) => p.id === id));
  const selectedPart = activity.parts.find((p) => p.id === selected);
  const target = activity.parts.findIndex((_, index) => !work.checked.includes(index));
  const open = (id: string) => {
    if (work.revealed) return;
    const next = Array.from(new Set([...seen, id]));
    update({ selected: activity.parts.findIndex((p) => p.id === id), seen: next });
    if (next.length === activity.parts.length) onComplete();
  };
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          aria-pressed={!work.revealed}
          onClick={() => update({ revealed: false })}
        >
          Explore parts
        </button>
        <button
          type="button"
          className={button}
          aria-pressed={work.revealed}
          onClick={() => update({ revealed: true, correct: null })}
        >
          Recall part functions
        </button>
      </div>
      {work.revealed && (
        <div className="mb-4 rounded-lg border border-blue-500/30 bg-bg-primary p-4">
          {target >= 0 ? (
            <>
              <p className="text-sm font-semibold text-text-primary">
                Which part matches this function?
              </p>
              <Markdown text={activity.parts[target].description} />
              <div className="mt-3 flex flex-wrap gap-2">
                {activity.parts.map((p, index) => (
                  <button
                    key={p.id}
                    type="button"
                    className={button}
                    onClick={() => {
                      const correct = index === target;
                      const checked = correct ? [...work.checked, index] : work.checked;
                      update({ correct, checked, attempts: work.attempts + 1 });
                      if (checked.length === activity.parts.length) onComplete();
                      else if (!correct) onReview?.();
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">
              You matched every part to its function.
            </p>
          )}
          <p aria-live="polite" className="mt-3 text-sm text-text-secondary">
            {work.correct === false
              ? "Not quite. That part has a different function; compare it with your notes."
              : work.correct === true
                ? "Correct match. Continue with the next function."
                : "Identify the part before uncovering the labels."}{" "}
            {work.checked.length} / {activity.parts.length} matched.
          </p>
          <button
            type="button"
            className={`${button} mt-3`}
            onClick={() => update({ checked: [], correct: null })}
          >
            Start function recall again
          </button>
        </div>
      )}
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
        {activity.parts.map((p) => (
          <g
            key={p.id}
            role="button"
            tabIndex={0}
            aria-label={
              work.revealed ? `Part ${activity.parts.indexOf(p) + 1}` : `Explore ${p.label}`
            }
            aria-pressed={selected === p.id}
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
                fill="var(--color-bg-secondary, #eff6ff)"
                stroke="currentColor"
                strokeWidth={selected === p.id ? 4 : 1.5}
              />
            ) : (
              <rect
                x={p.x * 6}
                y={p.y * 3.6}
                width={p.width * 6}
                height={p.height * 3.6}
                rx="7"
                fill="var(--color-bg-secondary, #eff6ff)"
                stroke="currentColor"
                strokeWidth={selected === p.id ? 4 : 1.5}
              />
            )}
            <text
              x={(p.x + p.width / 2) * 6}
              y={(p.y + p.height / 2) * 3.6}
              fill="currentColor"
              fontSize="12"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {work.revealed ? activity.parts.indexOf(p) + 1 : p.label}
            </text>
          </g>
        ))}
      </svg>
      {!work.revealed && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activity.parts.map((p) => (
            <button
              key={p.id}
              type="button"
              className={button}
              aria-pressed={selected === p.id}
              onClick={() => open(p.id)}
            >
              {seen.includes(p.id) ? "✓ " : ""}
              {p.label}
            </button>
          ))}
        </div>
      )}
      {!work.revealed && (
        <div aria-live="polite" className="mt-3 rounded-lg bg-bg-primary p-3">
          {selectedPart ? (
            <>
              <p className="font-semibold text-text-primary">{selectedPart.label}</p>
              <Markdown text={selectedPart.description} />
            </>
          ) : (
            <p className="text-sm text-text-muted">Select a part to learn how it works.</p>
          )}
          <p className="mt-2 text-xs text-text-muted">
            {seen.length} of {activity.parts.length} parts explored
          </p>
        </div>
      )}
    </>
  );
}

function ExamPractice({
  activity,
  onComplete,
  onReview,
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
      <p className="text-sm text-text-muted">
        Write your answer first, then compare it with the solution and mark your work.
      </p>
      <label htmlFor={id} className="mt-4 block text-sm font-semibold text-text-primary">
        Your answer or key points
      </label>
      <textarea
        id={id}
        rows={5}
        maxLength={12000}
        className={`${input} mt-2 w-full resize-y`}
        value={work.answer}
        onChange={(event) => update({ answer: event.target.value })}
        placeholder="Draft your answer here, or write it on paper and record your key points…"
      />
      <details className="my-4 rounded-lg border border-border bg-bg-primary p-3">
        <summary className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400">
          Show model answer
        </summary>
        <Markdown text={activity.solution} />
      </details>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-text-primary">
          Self-marking rubric · {total} marks
        </legend>
        {activity.rubric.map((item, index) => (
          <label key={index} className="mb-2 flex items-start gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 accent-blue-600"
              checked={checked.includes(index)}
              onChange={(event) =>
                update({
                  checked: event.target.checked
                    ? [...checked, index]
                    : checked.filter((n) => n !== index),
                })
              }
            />
            <span>
              {item.criterion} <span className="text-text-muted">({item.marks} marks)</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="mt-2 text-sm font-semibold text-text-primary" aria-live="polite">
        Your self-assessment: {score} / {total}
      </p>
      <button
        type="button"
        disabled={!work.answer.trim()}
        className={`${primary} mt-3`}
        onClick={() => {
          if (score < total) onReview?.();
          else onComplete();
        }}
      >
        I reviewed my answer
      </button>
      {work.answer.trim() && score < total && (
        <p className="mt-2 text-xs text-text-muted">
          Unmet marking points will put this section on your review list.
        </p>
      )}
    </>
  );
}

const labels: Record<ConceptActivity["kind"], string> = {
  bits: "Build and inspect bits",
  derivation: "Guided derivation",
  choice: "Check your understanding",
  numeric: "Numerical practice",
  experiment: "Predict, then experiment",
  diagram: "Explore the diagram",
  exam: "Exam practice",
};

export function ConceptActivityCard(props: Props) {
  const { activity, complete, needsReview } = props;
  const heading = useId();
  return (
    <section
      aria-labelledby={heading}
      className="my-5 rounded-xl border border-border border-l-4 border-l-blue-500 bg-bg-secondary p-4 font-sans sm:p-5"
      data-concept-activity={activity.kind}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          {labels[activity.kind]}
        </p>
        {complete && (
          <span className="text-xs font-semibold text-green-700 dark:text-green-400">
            ✓ Completed
          </span>
        )}
        {!complete && needsReview && (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Needs another pass
          </span>
        )}
      </div>
      <h4 id={heading} className="mb-2 text-lg font-semibold text-text-primary">
        {activity.title}
      </h4>
      {activity.prompt && (
        <div className="mb-4">
          <Markdown text={activity.prompt} />
        </div>
      )}
      {activity.hint && (
        <details className="mb-4 text-sm">
          <summary className="cursor-pointer text-text-secondary">Need a hint?</summary>
          <Markdown text={activity.hint} />
        </details>
      )}
      {activity.kind === "derivation" && <GuidedDerivation {...props} activity={activity} />}
      {(activity.kind === "choice" || activity.kind === "numeric") && (
        <KnowledgeCheck {...props} activity={activity} />
      )}
      {activity.kind === "experiment" && <ConceptExperiment {...props} activity={activity} />}
      {activity.kind === "diagram" && <DiagramExplorer {...props} activity={activity} />}
      {activity.kind === "exam" && <ExamPractice {...props} activity={activity} />}
      {activity.kind === "bits" && <ConceptBits {...props} activity={activity} />}
    </section>
  );
}
