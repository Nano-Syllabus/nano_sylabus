"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, GraduationCap, LockKeyhole } from "lucide-react";
import { examText, DEFAULT_EXAM_COPY } from "@/lib/exam-enrollment";
import type { EnrollmentExam } from "@/lib/data/exam-enrollment";

export function FacultySelectionDialog({
  exams,
  initialExamSlug,
  initialAnswers = {},
  onSelected,
}: {
  exams: EnrollmentExam[];
  initialExamSlug?: string;
  initialAnswers?: Record<string, string>;
  onSelected: (examSlug: string, facultyId: string) => void;
}) {
  const router = useRouter();
  const queries = useQueryClient();
  const [examSlug, setExamSlug] = useState(
    exams.some((item) => item.slug === initialExamSlug) ? initialExamSlug! : exams[0]?.slug || "",
  );
  const [facultyId, setFacultyId] = useState("");
  const [answers, setAnswers] = useState(initialAnswers);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const exam = exams.find((item) => item.slug === examSlug);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const complete = exam?.config.questions.every((q) => q.options.includes(answers[q.id]));
  async function save() {
    if (!exam || !facultyId || !complete) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/student/exam-enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examSlug, facultyId, answers }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your faculty.");
      queries.clear();
      onSelected(examSlug, facultyId);
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => event.preventDefault()}
      aria-labelledby="faculty-dialog-title"
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-border bg-bg-primary p-0 text-text-primary shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="border-b border-border bg-bg-secondary p-6 sm:p-8">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600">
          <GraduationCap size={26} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Your learning space
        </p>
        <h2 id="faculty-dialog-title" className="mt-2 text-2xl font-semibold tracking-tight">
          {examText(
            exam?.config.copy.facultyTitle || DEFAULT_EXAM_COPY.facultyTitle,
            exam?.name || "",
          )}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {examText(
            exam?.config.copy.facultyDescription || DEFAULT_EXAM_COPY.facultyDescription,
            exam?.name || "",
          )}
        </p>
      </div>
      <div className="space-y-5 p-6 sm:p-8">
        {exams.length > 1 ? (
          <label className="block text-sm font-medium">
            Exam
            <select
              value={examSlug}
              onChange={(e) => {
                setExamSlug(e.target.value);
                setFacultyId("");
                setAnswers({});
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg-primary px-3"
            >
              {exams.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm font-medium text-blue-600">{exam?.name}</p>
        )}
        {exam ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {exam.faculties.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={facultyId === f.id}
                onClick={() => setFacultyId(f.id)}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${facultyId === f.id ? "border-blue-600 bg-blue-600/5 ring-1 ring-blue-600" : "border-border hover:bg-bg-secondary"}`}
              >
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${facultyId === f.id ? "border-blue-600 bg-blue-600 text-white" : "border-border"}`}
                >
                  {facultyId === f.id ? <Check size={12} /> : null}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.name}</span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {f.faculty || f.university}
                  </span>
                  <span className="mt-2 block text-xs text-text-secondary">
                    {f.subjects.length} subjects
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {exam?.config.questions
          .filter(
            (q) =>
              examSlug !== initialExamSlug ||
              !initialAnswers[q.id] ||
              !q.options.includes(initialAnswers[q.id]),
          )
          .map((q) => (
            <label key={q.id} className="block text-sm font-medium">
              {q.prompt}
              <select
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg-primary px-3"
              >
                <option value="">Choose an answer</option>
                {q.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
        <p className="flex items-start gap-2 rounded-xl bg-bg-secondary p-3 text-xs leading-relaxed text-text-secondary">
          <LockKeyhole size={16} className="shrink-0" />
          Your choice stays locked across the app. An admin can help if you need to change it.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!facultyId || !complete || pending}
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-blue-600 px-4 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
        >
          {pending ? "Setting up your faculty…" : "Confirm faculty & continue"}
        </button>
      </div>
    </dialog>
  );
}

export function FacultySelectionGate({
  exams,
  initialExamSlug,
  initialAnswers,
}: {
  exams: EnrollmentExam[];
  initialExamSlug?: string;
  initialAnswers?: Record<string, string>;
}) {
  const [done, setDone] = useState(false);
  return !done && exams.length ? (
    <FacultySelectionDialog
      exams={exams}
      initialExamSlug={initialExamSlug}
      initialAnswers={initialAnswers}
      onSelected={() => setDone(true)}
    />
  ) : null;
}
