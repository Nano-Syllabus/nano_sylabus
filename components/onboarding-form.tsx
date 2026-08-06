"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { normalizeFullName, normalizeSubjects } from "@/lib/profile-normalization";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { StudentProfile } from "@/lib/types";

type PublishedSubject = {
  name: string;
  slug: string;
  namespace: string;
  folderPath: string;
  providerName: string;
  documentCount: number;
  unitCount: number;
};

type PublishedProvider = {
  namespace: string;
  providerName: string;
  subjects: PublishedSubject[];
};

type CatalogPayload = {
  providers?: PublishedProvider[];
  subjects?: PublishedSubject[];
  error?: string;
};

const TOTAL_STEPS = 2;

/**
 * Content is teacher-managed, so onboarding no longer walks a faculty →
 * branch → semester taxonomy. A student picks published subjects directly, or
 * joins a teacher's classroom with a code. board/grade are still written so
 * existing profiles and the chat personalisation prompt keep working.
 */
export function OnboardingForm({
  userId,
  initialProfile,
  initialName,
}: {
  userId: string;
  initialProfile: StudentProfile | null;
  initialName?: string;
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

  const [providers, setProviders] = useState<PublishedProvider[]>([]);
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
        const response = await fetch("/api/tenant/catalog", { cache: "no-store" });
        const payload = (await response.json()) as CatalogPayload;
        if (!active) return;

        if (!response.ok) throw new Error(payload.error || "Could not load subjects.");

        setProviders(Array.isArray(payload.providers) ? payload.providers : []);
        setCatalogState("ready");
      } catch (caught) {
        if (!active) return;
        setCatalogError(caught instanceof Error ? caught.message : "Could not load subjects.");
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
        JSON.stringify({ step, fullName, selectedSubjects, languagePref }),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [draftKey, fullName, initialProfile, languagePref, selectedSubjects, step]);

  function toggleSubject(name: string) {
    setSelectedSubjects((current) => {
      const exists = current.some((item) => item.toLowerCase() === name.toLowerCase());
      if (exists) return current.filter((item) => item.toLowerCase() !== name.toLowerCase());
      return [...current, name];
    });
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
    const subjects = normalizeSubjects(selectedSubjects);

    if (!subjects.length) {
      setError("Pick at least one subject, or join your teacher's classroom with a code.");
      return;
    }

    setLoading(true);
    setError("");

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

    router.replace("/app/today");
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
            title="Pick your subjects"
            subtitle="These are published by teachers. Answers and practice come from their material."
          >
            {catalogState === "loading" ? (
              <p className="text-sm text-text-secondary">Loading published subjects…</p>
            ) : null}

            {catalogState === "error" ? (
              <div className="rounded-[14px] border border-border p-4">
                <p className="text-sm font-medium">Could not load subjects</p>
                <p className="mt-1 text-sm text-text-secondary">{catalogError}</p>
              </div>
            ) : null}

            {catalogState === "ready" && !providers.length ? (
              <div className="rounded-[14px] border border-border p-4">
                <p className="text-sm font-medium">No published subjects yet</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Join your teacher&apos;s classroom with a code to get started.
                </p>
              </div>
            ) : null}

            <div className="space-y-6">
              {providers.map((provider) => (
                <section key={provider.namespace}>
                  <p className="text-xs font-mono-ui uppercase tracking-wider text-text-muted">
                    {provider.providerName}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {provider.subjects.map((subject) => {
                      const active = selectedSubjects.some(
                        (item) => item.toLowerCase() === subject.name.toLowerCase(),
                      );
                      return (
                        <button
                          key={subject.slug}
                          type="button"
                          onClick={() => toggleSubject(subject.name)}
                          aria-pressed={active}
                          className={`rounded-[14px] border px-4 py-3 text-left transition ${
                            active
                              ? "border-text-primary bg-bg-secondary"
                              : "border-border hover:border-border-strong"
                          }`}
                        >
                          <span className="block text-[15px] font-medium">{subject.name}</span>
                          <span className="mt-1 block text-[13px] text-text-muted">
                            {subject.providerName} · {subject.documentCount} file
                            {subject.documentCount === 1 ? "" : "s"} · {subject.unitCount} unit
                            {subject.unitCount === 1 ? "" : "s"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
              <p className="text-sm text-text-secondary">Got a classroom code from your teacher?</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setJoinOpen(true)}>
                Join with a code
              </Button>
            </div>
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
              Your class code brings in the subject your teacher is running.
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
