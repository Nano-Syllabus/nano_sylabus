"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

type AnswerFormat = "key" | "text" | "position";
type OptionDraft = { id: string; key: string; text: string };
type Draft = {
  id: string;
  question: string;
  chapter: string;
  marks: string;
  explanation: string;
  bare: boolean;
  answerFormat: AnswerFormat;
  options: OptionDraft[];
  correct: string;
  selected: string;
};

type CheckResult = { question_id: string; score: number; marks: number; feedback: string };

const button = "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong disabled:cursor-not-allowed disabled:opacity-40";

function optionDraft(index: number, key = "", text = "", prefix = "draft"): OptionDraft {
  return { id: `${prefix}-option-${index}`, key, text };
}

function newDraft(index: number): Draft {
  return {
    id: `item-${index}`,
    question: "",
    chapter: "",
    marks: "1",
    explanation: "",
    bare: false,
    answerFormat: "key",
    options: Array.from({ length: 4 }, (_, optionIndex) => optionDraft(optionIndex, "", "", `item-${index}`)),
    correct: "",
    selected: "",
  };
}

function automaticKey(index: number) {
  return String.fromCharCode(65 + index);
}

function optionValue(item: Draft, option: OptionDraft, index: number) {
  if (item.answerFormat === "text") return option.text;
  if (item.answerFormat === "position") return String(index + 1);
  return option.key.trim() || automaticKey(index);
}

function matchesOption(value: string, option: OptionDraft, index: number) {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && [
    option.key.trim() || automaticKey(index),
    option.text,
    String(index + 1),
  ].some((candidate) => candidate.trim().toLowerCase() === normalized);
}

function convertAnswer(item: Draft, value: string, format: AnswerFormat) {
  const index = item.options.findIndex((option, optionIndex) => matchesOption(value, option, optionIndex));
  if (index < 0) return value;
  const option = item.options[index];
  if (format === "text") return option.text;
  if (format === "position") return String(index + 1);
  return option.key.trim() || automaticKey(index);
}

function importedDraft(raw: unknown, index: number): Draft {
  if (!raw || typeof raw !== "object") throw new Error(`Question ${index + 1} is not an object.`);
  const item = raw as Record<string, unknown>;
  const rawOptions = Array.isArray(item.options) ? item.options.slice(0, 6) : [];
  const options = rawOptions.map((rawOption, optionIndex) => {
    if (typeof rawOption === "string") return optionDraft(optionIndex, "", rawOption, `imported-${index}`);
    if (!rawOption || typeof rawOption !== "object") throw new Error(`Question ${index + 1} has an invalid option.`);
    const option = rawOption as Record<string, unknown>;
    return optionDraft(optionIndex, String(option.key ?? ""), String(option.text ?? option.value ?? ""), `imported-${index}`);
  });
  while (options.length > 0 && options.length < 2) options.push(optionDraft(options.length, "", "", `imported-${index}`));

  return {
    id: String(item.question_id ?? item.id ?? `imported-${index}`),
    question: String(item.question ?? item.text ?? ""),
    chapter: String(item.chapter ?? ""),
    marks: String(item.marks ?? 1),
    explanation: String(item.explanation ?? ""),
    bare: options.length === 0,
    answerFormat: "key",
    options: options.length ? options : Array.from({ length: 4 }, (_, optionIndex) => optionDraft(optionIndex, "", "", `imported-${index}`)),
    correct: String(item.correct ?? item.correct_option ?? ""),
    selected: String(item.selected ?? item.selected_option ?? ""),
  };
}

export function McqCheckerDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<Draft[]>([newDraft(1)]);
  const [negativeMarks, setNegativeMarks] = useState("0");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    totalScore: number;
    totalMarks: number;
    penalty: number;
    correctCount: number | null;
    wrongCount: number | null;
    unattemptedCount: number | null;
    results: CheckResult[];
  } | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  function update(id: string, patch: Partial<Draft>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setResult(null);
    setError("");
  }

  function importQuestions() {
    setImportError("");
    try {
      const parsed = JSON.parse(importText) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown[] }).items)
          ? (parsed as { items: unknown[] }).items
          : null;
      if (!list?.length) throw new Error("Paste a JSON array or an object containing a non-empty items array.");
      if (list.length > 60) throw new Error("The API accepts at most 60 questions per check.");
      setItems(list.map(importedDraft));
      setImportText("");
      setResult(null);
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : "Could not import these MCQs.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/student/practice/mcq/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          negativeMarks: Number(negativeMarks),
          items: items.map((item, index) => ({
            questionId: item.id || `question-${index + 1}`,
            question: item.question || undefined,
            chapter: item.chapter || undefined,
            marks: Number(item.marks),
            options: item.bare ? undefined : item.options.map((option) => ({ key: option.key, text: option.text })),
            correct: item.correct,
            selected: item.selected || undefined,
            explanation: item.explanation || undefined,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not check these MCQs.");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check these MCQs.");
    } finally {
      setChecking(false);
    }
  }

  const invalid = items.some((item) =>
    !item.correct.trim() || !Number.isFinite(Number(item.marks)) || Number(item.marks) <= 0 || (!item.bare && (
      item.options.length < 2 || item.options.length > 6 || item.options.some((option) => !option.text.trim())
    )),
  ) || !Number.isFinite(Number(negativeMarks)) || Number(negativeMarks) < 0;

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4">
      <button type="button" aria-label="Close MCQ checker" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="mcq-checker-title" className="relative max-h-[92vh] w-full max-w-[960px] overflow-y-auto rounded-2xl border border-border bg-bg-primary shadow-xl">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg-primary px-5 py-4">
          <div>
            <h2 id="mcq-checker-title" className="font-display text-xl font-semibold">MCQ checker</h2>
            <p className="mt-1 text-sm text-text-muted">Check up to 60 imported or hand-written questions without saving a quiz set.</p>
          </div>
          <span className="flex-1" />
          <button ref={closeRef} type="button" className={`${button} border border-border-strong`} onClick={onClose}>Close</button>
        </header>

        <form onSubmit={(event) => void submit(event)} className="space-y-4 p-5" aria-busy={checking}>
          <details className="rounded-xl border border-border bg-bg-secondary p-4">
            <summary className="cursor-pointer font-medium">Import MCQs from JSON</summary>
            <label htmlFor="mcq-import" className="mt-4 block text-sm font-medium">JSON payload</label>
            <textarea id="mcq-import" value={importText} onChange={(event) => { setImportText(event.target.value); setImportError(""); }} rows={6} spellCheck={false} placeholder='[{"question":"...","options":[{"key":"","text":"..."}],"correct":"2","selected":"Option text","marks":1}]' aria-invalid={importError ? "true" : undefined} aria-describedby={importError ? "mcq-import-error" : "mcq-import-help"} className="mt-2 w-full resize-y rounded-lg border border-border bg-bg-primary p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-border-strong" />
            <p id="mcq-import-help" className="mt-2 text-xs text-text-muted">Accepts an array or {`{ "items": [...] }`}. Options may be strings or key/text objects. Existing form questions are replaced.</p>
            {importError ? <p id="mcq-import-error" className="mt-2 text-sm text-destructive">{importError}</p> : null}
            <button type="button" disabled={!importText.trim()} className={`${button} mt-3 border border-border-strong`} onClick={importQuestions}>Import questions</button>
          </details>

          {items.map((item, itemIndex) => (
            <article key={item.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <h3 className="font-medium">Question {itemIndex + 1}</h3>
                <span className="flex-1" />
                {items.length > 1 ? <button type="button" aria-label={`Remove question ${itemIndex + 1}`} className="grid size-10 place-items-center rounded-lg border border-border hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 size={16} aria-hidden="true" /></button> : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
                <label className="text-sm font-medium">Question text <span className="font-normal text-text-muted">optional for bare comparison</span>
                  <textarea value={item.question} onChange={(event) => update(item.id, { question: event.target.value })} rows={2} className="mt-2 w-full resize-y rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm font-medium">Chapter <input value={item.chapter} onChange={(event) => update(item.id, { chapter: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /></label>
                  <label className="text-sm font-medium">Marks <input value={item.marks} onChange={(event) => update(item.id, { marks: event.target.value })} inputMode="decimal" placeholder="1" aria-label={`Marks for question ${itemIndex + 1}`} className="mt-2 h-10 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /></label>
                </div>
              </div>

              <label className="mt-3 block text-sm font-medium">Explanation <span className="font-normal text-text-muted">optional, returned with feedback</span>
                <textarea value={item.explanation} onChange={(event) => update(item.id, { explanation: event.target.value })} rows={2} className="mt-2 w-full resize-y rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" />
              </label>

              <label className="mt-3 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={item.bare} onChange={(event) => update(item.id, { bare: event.target.checked, correct: "", selected: "" })} /> Bare comparison (no option list)</label>

              {item.bare ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">Correct value <input required value={item.correct} onChange={(event) => update(item.id, { correct: event.target.value })} placeholder="Key, text, or position" className="mt-2 h-10 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /></label>
                  <label className="text-sm font-medium">Student selection <input value={item.selected} onChange={(event) => update(item.id, { selected: event.target.value })} placeholder="Blank means unattempted" className="mt-2 h-10 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /></label>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <fieldset>
                    <legend className="text-sm font-medium">Send answers as</legend>
                    <div className="mt-2 grid grid-cols-3 rounded-lg border border-border p-1">
                      {(["key", "text", "position"] as const).map((format) => <button key={format} type="button" onClick={() => update(item.id, { answerFormat: format, correct: convertAnswer(item, item.correct, format), selected: convertAnswer(item, item.selected, format) })} className={cn("min-h-10 rounded-md px-2 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", item.answerFormat === format ? "bg-text-primary font-medium text-text-inverse" : "text-text-secondary")}>{format}</button>)}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-[72px_1fr_64px_64px_44px] gap-2 text-center text-xs text-text-muted"><span className="text-left">Key</span><span className="text-left">Option text</span><span>Correct</span><span>Picked</span><span /></div>
                  {item.options.map((option, optionIndex) => {
                    const displayKey = option.key.trim() || automaticKey(optionIndex);
                    return <div key={option.id} className="grid grid-cols-[72px_1fr_64px_64px_44px] items-center gap-2">
                      <label><span className="sr-only">Option {optionIndex + 1} key</span><input value={option.key} onChange={(event) => update(item.id, { options: item.options.map((entry) => entry.id === option.id ? { ...entry, key: event.target.value } : entry) })} placeholder={displayKey} maxLength={20} spellCheck={false} className="h-10 w-full rounded-lg border border-border bg-bg-primary px-2 text-center font-mono text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /></label>
                      <label><span className="sr-only">Option {displayKey} text</span><input required value={option.text} onChange={(event) => update(item.id, { options: item.options.map((entry) => entry.id === option.id ? { ...entry, text: event.target.value } : entry) })} className="h-10 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /></label>
                      <input type="radio" aria-label={`${displayKey} is correct`} name={`${item.id}-correct`} checked={matchesOption(item.correct, option, optionIndex)} onChange={() => update(item.id, { correct: optionValue(item, option, optionIndex) })} />
                      <input type="radio" aria-label={`${displayKey} was selected`} name={`${item.id}-selected`} checked={matchesOption(item.selected, option, optionIndex)} onChange={() => update(item.id, { selected: optionValue(item, option, optionIndex) })} />
                      <button type="button" disabled={item.options.length <= 2} aria-label={`Remove option ${displayKey}`} className="grid size-10 place-items-center rounded-lg hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong" onClick={() => update(item.id, { options: item.options.filter((entry) => entry.id !== option.id), correct: matchesOption(item.correct, option, optionIndex) ? "" : item.correct, selected: matchesOption(item.selected, option, optionIndex) ? "" : item.selected })}><Trash2 size={15} aria-hidden="true" /></button>
                    </div>;
                  })}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={item.options.length >= 6} className={`${button} border border-border`} onClick={() => update(item.id, { options: [...item.options, optionDraft(item.options.length, "", "", `${item.id}-${Date.now()}`)] })}><Plus size={15} className="mr-2" aria-hidden="true" />Add option ({item.options.length}/6)</button>
                    <button type="button" className={`${button} text-text-secondary underline underline-offset-4`} onClick={() => update(item.id, { selected: "" })}>Mark unattempted</button>
                  </div>
                  <p className="text-xs text-text-muted">Leave a key blank and the API assigns A, B, C… in order.</p>
                </div>
              )}

              {result?.results[itemIndex] ? <p className="mt-4 rounded-lg bg-bg-secondary p-3 text-sm leading-6"><b>{result.results[itemIndex].score}/{result.results[itemIndex].marks}</b> · {result.results[itemIndex].feedback}</p> : null}
            </article>
          ))}

          <button type="button" disabled={items.length >= 60} className={`${button} w-full border border-dashed border-border-strong`} onClick={() => setItems((current) => [...current, newDraft(Date.now())])}><Plus size={16} className="mr-2" aria-hidden="true" />Add question ({items.length}/60)</button>

          <div className="sticky bottom-0 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-bg-secondary p-4">
            <label className="text-sm font-medium">Penalty per wrong answer <input value={negativeMarks} onChange={(event) => setNegativeMarks(event.target.value)} inputMode="decimal" placeholder="0" className="mt-2 block h-10 w-36 rounded-lg border border-border bg-bg-primary px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /></label>
            <span className="flex-1" />
            {result ? <div className="text-right text-sm"><p><b>{result.totalScore}/{result.totalMarks}</b>{result.penalty ? ` · ${result.penalty} penalty` : ""}</p>{result.correctCount != null && result.wrongCount != null && result.unattemptedCount != null ? <p className="mt-1 text-xs text-text-muted">{result.correctCount} correct · {result.wrongCount} wrong · {result.unattemptedCount} unattempted</p> : null}</div> : null}
            <button type="submit" disabled={checking || invalid} className={`${button} bg-text-primary text-text-inverse`}>{checking ? "Checking…" : "Check MCQs"}</button>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </form>
      </section>
    </div>
  );
}
