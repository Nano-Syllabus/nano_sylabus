"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  normalizeBoard,
  normalizeBoardScore,
  normalizeCollege,
  normalizeFullName,
  normalizeGrade,
  normalizeSubjects,
  normalizeTargetGrade,
  validateBoardScore,
} from "@/lib/profile-normalization";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { StudentProfile } from "@/lib/types";

export function OnboardingForm({
  userId,
  initialProfile,
}: {
  userId: string;
  initialProfile: StudentProfile | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState(initialProfile?.fullName ?? "");
  const [college, setCollege] = useState(initialProfile?.college ?? "");
  const [board, setBoard] = useState(initialProfile?.board ?? "");
  const [grade, setGrade] = useState(initialProfile?.grade ?? "");
  const [scoreType, setScoreType] = useState<"%" | "GPA">("%");
  const [score, setScore] = useState(initialProfile?.boardScore?.replace(/[%A-Z]+$/g, "") ?? "");
  const [subjectsInput, setSubjectsInput] = useState((initialProfile?.subjects ?? []).join(", "));
  const [targetGrade, setTargetGrade] = useState(initialProfile?.targetGrade ?? "");
  const [languagePref, setLanguagePref] = useState<"EN" | "RN">(initialProfile?.languagePref ?? "EN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const total = 5;

  function validateStep(nextStep = step) {
    if (nextStep === 1) {
      if (!normalizeFullName(fullName) || !normalizeCollege(college)) {
        return "Please complete your full name and institution.";
      }
    }

    if (nextStep === 2) {
      if (!normalizeBoard(board) || !normalizeGrade(grade)) {
        return "Please complete your board and grade or year.";
      }
    }

    if (nextStep === 3) {
      return validateBoardScore(score, scoreType);
    }

    if (nextStep === 4) {
      if (normalizeSubjects(subjectsInput.split(",")).length === 0) {
        return "Please add at least one subject.";
      }
    }

    if (nextStep === 5) {
      if (!normalizeTargetGrade(targetGrade)) {
        return "Please set your target result.";
      }
    }

    return null;
  }

  function goNext() {
    const nextError = validateStep(step);
    if (nextError) {
      setError(nextError);
      return;
    }

    setError("");
    setStep((value) => Math.min(total, value + 1));
  }

  async function finish() {
    const subjects = normalizeSubjects(subjectsInput.split(","));
    const normalizedFullName = normalizeFullName(fullName);
    const normalizedCollege = normalizeCollege(college);
    const normalizedBoard = normalizeBoard(board);
    const normalizedGrade = normalizeGrade(grade);
    const normalizedTargetGrade = normalizeTargetGrade(targetGrade);
    const scoreError = validateBoardScore(score, scoreType);

    if (
      !normalizedFullName ||
      !normalizedCollege ||
      !normalizedBoard ||
      !normalizedGrade ||
      !normalizedTargetGrade
    ) {
      setError("Please complete your name, institution, board, grade or year, and target goal.");
      return;
    }

    if (subjects.length === 0) {
      setError("Please add at least one subject.");
      return;
    }

    if (scoreError) {
      setError(scoreError);
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from("student_profiles").upsert({
      user_id: userId,
      full_name: normalizedFullName,
      college: normalizedCollege,
      board: normalizedBoard,
      grade: normalizedGrade,
      board_score: score ? `${normalizeBoardScore(score)}${scoreType}` : null,
      subjects,
      target_grade: normalizedTargetGrade,
      language_pref: languagePref,
    });

    setLoading(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    router.replace("/app/chat");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-10">
      <div className="border-b border-border bg-bg-secondary px-5 py-3">
        <div className="flex items-center justify-between text-xs font-mono-ui text-text-muted">
          <span>Step {step} of {total}</span>
          <span>{Math.round((step / total) * 100)}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-tertiary">
          <div className="h-full bg-text-primary transition-all" style={{ width: `${(step / total) * 100}%` }} />
        </div>
      </div>

      <main className="flex flex-1 flex-col py-12">
        {step === 1 ? (
          <Step title="Where do you study?" subtitle="Enter your current school, college, campus, or university.">
            <Field label="Full name">
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" />
            </Field>
            <Field label="Institution">
              <Input
                value={college}
                onChange={(event) => setCollege(event.target.value)}
                placeholder="Eg. St. Xavier's College, Tribhuvan University"
              />
            </Field>
          </Step>
        ) : null}

        {step === 2 ? (
          <Step title="Which board and grade?" subtitle="Set the board first, then your exact level.">
            <Field label="Board">
              <Input
                value={board}
                onChange={(event) => setBoard(event.target.value)}
                placeholder="Eg. NEB, TU, PU, KU, CTEVT"
                list="board-options"
              />
              <datalist id="board-options">
                <option value="NEB" />
                <option value="TU" />
                <option value="PU" />
                <option value="KU" />
                <option value="CTEVT" />
              </datalist>
            </Field>
            <Field label="Grade or year">
              <Input
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                placeholder="Eg. Class 12, BBS Year 2, BCA Year 1"
              />
            </Field>
          </Step>
        ) : null}

        {step === 3 ? (
          <Step title="Last board score" subtitle="We use this to calibrate explanation level. You can skip it.">
            <div className="mb-3 inline-flex rounded-full border border-border p-1">
              {(["%", "GPA"] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setScoreType(item)}
                  className={
                    "rounded-full px-4 py-1.5 text-xs font-mono-ui transition " +
                    (scoreType === item ? "bg-text-primary text-text-inverse" : "text-text-secondary")
                  }
                >
                  {item}
                </button>
              ))}
            </div>
            <Field label={scoreType === "%" ? "Score (0-100)" : "GPA (0-4.0)"}>
              <Input
                type="number"
                value={score}
                onChange={(event) => setScore(event.target.value)}
                placeholder={scoreType === "%" ? "82" : "3.4"}
              />
            </Field>
          </Step>
        ) : null}

        {step === 4 ? (
          <Step title="Which subjects matter?" subtitle="Add the exact subjects, separated by commas.">
            <Field label="Subjects" hint="Example: Physics, Chemistry, Mathematics">
              <Textarea
                rows={4}
                value={subjectsInput}
                onChange={(event) => setSubjectsInput(event.target.value)}
                placeholder="Physics, Chemistry, Mathematics"
              />
            </Field>
          </Step>
        ) : null}

        {step === 5 ? (
          <Step title="Goals & language" subtitle="This makes the AI feel personal from the first answer.">
            <div className="space-y-6">
              <div>
                <Field label="Target result" hint="Keep it human and specific. Example: A+, Distinction, pass all papers">
                  <Input
                    value={targetGrade}
                    onChange={(event) => setTargetGrade(event.target.value)}
                    placeholder="A+, Distinction, 3.8 GPA"
                  />
                </Field>
              </div>
              <div>
                <p className="mb-2 text-xs font-mono-ui uppercase text-text-muted">Default response language</p>
                <div className="inline-flex rounded-full border border-border p-1">
                  {(["EN", "RN"] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setLanguagePref(item)}
                      className={
                        "rounded-full px-5 py-1.5 text-xs font-mono-ui transition " +
                        (languagePref === item
                          ? "bg-text-primary text-text-inverse"
                          : "text-text-secondary")
                      }
                    >
                      {item === "EN" ? "English" : "Roman Nepali"}
                    </button>
                  ))}
                </div>
                <p className="mt-3 rounded-md border border-border bg-bg-secondary p-3 text-xs text-text-secondary">
                  <span className="font-mono-ui text-text-muted">Roman Nepali example: </span>
                  &quot;Newton ko teesro law explain gardinus na&quot;.
                </p>
              </div>
            </div>
          </Step>
        ) : null}

        {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}

        <div className="mt-auto flex items-center justify-between pt-10">
          <Button variant="ghost" type="button" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1}>
            ← Back
          </Button>
          {step < total ? (
            <Button type="button" onClick={goNext}>
              Next →
            </Button>
          ) : (
            <Button type="button" onClick={finish} disabled={loading}>
              {loading ? "Saving..." : "Start learning →"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in">
      <p className="text-xs font-mono-ui uppercase text-text-muted">Onboarding</p>
      <h1 className="mt-2 font-display text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
