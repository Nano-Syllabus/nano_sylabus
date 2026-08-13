"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { normalizeFullName, normalizeSubjects } from "@/lib/profile-normalization";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { TeacherCourse } from "@/lib/teacher-courses";
import type { StudentProfile } from "@/lib/types";
import { titleCase } from "@/lib/utils";

type CatalogPayload = {
  courses?: TeacherCourse[];
  error?: string;
};

const TOTAL_STEPS = 2;

/**
 * Students enroll in a teacher-authored course. Subject names are mirrored to
 * the legacy profile so existing chat and practice APIs retain their context.
 */
export function OnboardingForm({
  userId,
  initialProfile,
  initialName,
  nextPath,
}: {
  userId: string;
  initialProfile: StudentProfile | null;
  initialName?: string;
  nextPath?: string;
}) {
  const router = useRouter();
  const draftKey = useMemo(() => `nano:onboarding:draft:${userId}`, [userId]);
  const hasHydratedDraft = useRef(false);

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState(initialProfile?.fullName || initialName || "");
  const [languagePref, setLanguagePref] = useState<"EN" | "RN">(initialProfile?.languagePref ?? "RN");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    normalizeSubjects(initialProfile?.subjects ?? []),
  );
  const [selectedCourseSlug, setSelectedCourseSlug] = useState("");

  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogError, setCatalogError] = useState("");

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      try {
        const response = await fetch("/api/public/courses", { cache: "no-store" });
        const payload = (await response.json()) as CatalogPayload;
        if (!active) return;

        if (!response.ok) throw new Error(payload.error || "Could not load courses.");

        setCourses(Array.isArray(payload.courses) ? payload.courses : []);
        setCatalogState("ready");
      } catch (caught) {
        if (!active) return;
        setCatalogError(caught instanceof Error ? caught.message : "Could not load courses.");
        setCatalogState("error");
      }
    };

    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (initialProfile || hasHydratedDraft.current) return;
    hasHydratedDraft.current = true;

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;

      const draft = JSON.parse(raw) as {
        step?: number;
        fullName?: string;
        selectedSubjects?: string[];
        selectedCourseSlug?: string;
        languagePref?: "EN" | "RN";
      };

      if (typeof draft.step === "number" && Number.isFinite(draft.step)) {
        setStep(Math.min(TOTAL_STEPS, Math.max(1, Math.trunc(draft.step))));
      }
      if (typeof draft.fullName === "string") setFullName(draft.fullName);
      if (Array.isArray(draft.selectedSubjects)) {
        setSelectedSubjects(
          normalizeSubjects(draft.selectedSubjects.filter((item): item is string => typeof item === "string")),
        );
      }
      if (typeof draft.selectedCourseSlug === "string") {
        setSelectedCourseSlug(draft.selectedCourseSlug);
      }
      if (draft.languagePref === "EN" || draft.languagePref === "RN") setLanguagePref(draft.languagePref);
    } catch {
      // Ignore malformed local draft.
    }
  }, [draftKey, initialProfile]);

  useEffect(() => {
    if (initialProfile) return;
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ step, fullName, selectedSubjects, selectedCourseSlug, languagePref }),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [draftKey, fullName, initialProfile, languagePref, selectedCourseSlug, selectedSubjects, step]);

  function selectCourse(course: TeacherCourse) {
    setSelectedCourseSlug(course.slug);
    setSelectedSubjects(normalizeSubjects(course.subjects.map((subject) => subject.name)));
    setError("");
  }

  async function submitJoinCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter the code your teacher shared.");
      return;
    }

    setJoining(true);
    setJoinError("");

    try {
      const response = await fetch("/api/student/teacher-classrooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        classroom?: { subjectName?: string; name?: string };
        course?: { slug?: string; name?: string } | null;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error || "Could not join the classroom.");

      const subjectName = payload.classroom?.subjectName;
      if (subjectName) {
        setSelectedSubjects((current) =>
          current.some((item) => item.toLowerCase() === subjectName.toLowerCase())
            ? current
            : [...current, subjectName],
        );
      }
      if (payload.course?.slug) {
        setSelectedCourseSlug(payload.course.slug);
        const joinedCourse = courses.find((course) => course.slug === payload.course?.slug);
        if (joinedCourse) {
          setSelectedSubjects(normalizeSubjects(joinedCourse.subjects.map((subject) => subject.name)));
        }
      }

      setJoinOpen(false);
      setJoinCode("");
    } catch (caught) {
      setJoinError(caught instanceof Error ? caught.message : "Could not join the classroom.");
    } finally {
      setJoining(false);
    }
  }

  function goNext() {
    if (step === 1 && !normalizeFullName(fullName)) {
      setError("Please tell us your name.");
      return;
    }
    setError("");
    setStep((value) => Math.min(TOTAL_STEPS, value + 1));
  }

  async function finish() {
    const selectedCourse = courses.find((course) => course.slug === selectedCourseSlug);
    const subjects = normalizeSubjects(
      selectedCourse?.subjects.map((subject) => subject.name) ?? selectedSubjects,
    );

    if (!selectedCourseSlug && !subjects.length) {
      setError("Choose a course, or join with the code your teacher shared.");
      return;
    }

    setLoading(true);
    setError("");

    if (selectedCourseSlug) {
      const enrollmentResponse = await fetch(
        `/api/student/courses/${encodeURIComponent(selectedCourseSlug)}/enroll`,
        { method: "POST", headers: { Accept: "application/json" } },
      );
      const enrollmentPayload = (await enrollmentResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!enrollmentResponse.ok) {
        setLoading(false);
        setError(enrollmentPayload.error || "Could not enroll in that course.");
        return;
      }
    }

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from("student_profiles").upsert({
      user_id: userId,
      full_name: normalizeFullName(fullName) || "Student",
      college: "",
      // Retained so existing profiles and the chat prompt keep their shape;
      // the onboarding gate is the subject picks above.
      board: "IOE",
      grade: "Bachelor",
      board_score: null,
      subjects,
      target_grade: "Pass",
      language_pref: languagePref,
    });

    if (upsertError) {
      setLoading(false);
      setError(upsertError.message);
      return;
    }

    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Ignore storage delete failures.
    }

    router.replace(
      nextPath || "/app/explore",
    );
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center animate-fade-in pb-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-text-primary" />
        <h2 className="mt-6 text-lg font-medium">Setting up your profile...</h2>
        <p className="mt-2 text-sm text-text-muted">Personalizing your learning experience</p>
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-10"
      onSubmit={(event) => {
        event.preventDefault();
        if (step < TOTAL_STEPS) goNext();
        else void finish();
      }}
    >
      <div className="border-b border-border bg-bg-secondary px-5 py-3">
        <div className="flex items-center justify-between text-xs font-mono-ui text-text-muted">
          <span>
            Step {step} of {TOTAL_STEPS}
          </span>
          <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full bg-text-primary transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      <main className="flex flex-1 flex-col py-12">
        {step === 1 ? (
          <Step title="Let's get you set up" subtitle="Just your name and how you like to read answers.">
            <Field label="Your name">
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Prashant Giri"
                autoComplete="name"
              />
            </Field>
            <Field label="Answer language">
              <div className="flex gap-2">
                {(
                  [
                    { value: "RN", label: "Roman Nepali" },
                    { value: "EN", label: "English" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLanguagePref(option.value)}
                    aria-pressed={languagePref === option.value}
                    className={`min-h-10 rounded-lg border px-4 text-sm font-medium transition ${
                      languagePref === option.value
                        ? "border-text-primary bg-text-primary text-text-inverse"
                        : "border-border hover:bg-bg-secondary"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>
          </Step>
        ) : null}

        {step === 2 ? (
          <Step
            title="Choose your course"
            subtitle="A course brings its full set of indexed subjects, practice, and exams into one study space."
          >
            {catalogState === "loading" ? (
              <p className="text-sm text-text-secondary">Loading published courses...</p>
            ) : null}

            {catalogState === "error" ? (
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">Could not load courses</p>
                <p className="mt-1 text-sm text-text-secondary">{catalogError}</p>
              </div>
            ) : null}

            {catalogState === "ready" && !courses.length ? (
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">No published courses yet</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Join with the code your teacher shared to get started.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {courses.map((course) => {
                const active = selectedCourseSlug === course.slug;
                const canEnroll = course.accessModel === "free";
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => {
                      if (canEnroll) selectCourse(course);
                    }}
                    aria-pressed={active}
                    disabled={!canEnroll}
                    className={`min-h-40 rounded-lg border p-4 text-left transition ${
                      active
                        ? "border-text-primary bg-bg-secondary"
                        : canEnroll
                          ? "border-border hover:border-border-strong"
                          : "cursor-not-allowed border-border opacity-55"
                    }`}
                  >
                    <span className="text-xs text-text-muted">
                      {course.category} · {course.authority}
                    </span>
                    <span className="mt-3 block font-display text-lg font-semibold">
                      {titleCase(course.name)}
                    </span>
                    <span className="mt-2 line-clamp-2 block text-sm leading-6 text-text-secondary">
                      {course.tagline}
                    </span>
                    <span className="mt-3 block text-xs text-text-muted">
                      {course.subjects.length} subject{course.subjects.length === 1 ? "" : "s"} · {course.dailyMinutes} min daily
                    </span>
                    {!canEnroll ? (
                      <span className="mt-2 block text-xs font-medium text-text-secondary">
                        Enrollment opening soon
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
              <p className="text-sm text-text-secondary">Got a course code from your teacher?</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setJoinOpen(true)}>
                Join with a code
              </Button>
            </div> */}
          </Step>
        ) : null}

        {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}

        <div className="mt-auto flex items-center justify-between pt-10">
          <Button
            variant="ghost"
            type="button"
            onClick={() => setStep((value) => Math.max(1, value - 1))}
            disabled={step === 1}
          >
            ← Back
          </Button>
          {step < TOTAL_STEPS ? (
            <Button type="submit">Next →</Button>
          ) : (
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Start learning →"}
            </Button>
          )}
        </div>
      </main>

      {/* joinOpen dialog commented out
      {joinOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close join dialog"
            className="absolute inset-0 bg-black/45"
            onClick={() => setJoinOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-join-title"
            className="relative w-full max-w-md rounded-2xl border border-border bg-bg-primary p-6 shadow-xl"
          >
            <h2 id="onboarding-join-title" className="font-display text-2xl font-semibold">
              Join with a code
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Your code enrolls you in the connected course and its subjects.
            </p>
            <Input
              className="mt-5 uppercase"
              value={joinCode}
              onChange={(event) => {
                setJoinCode(event.target.value);
                setJoinError("");
              }}
              placeholder="BEI-4K2M"
              autoComplete="off"
              spellCheck={false}
            />
            {joinError ? <p className="mt-2 text-sm text-destructive">{joinError}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setJoinOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submitJoinCode()} disabled={joining}>
                {joining ? "Joining…" : "Join"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      */}
    </form>
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
      <div className="mt-8 space-y-6">{children}</div>
    </div>
  );
}
