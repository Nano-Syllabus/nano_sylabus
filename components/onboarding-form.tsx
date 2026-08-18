"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { normalizeFullName, normalizeSubjects } from "@/lib/profile-normalization";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { StudentProfile } from "@/lib/types";

/**
 * Students enroll in a teacher-authored course from inside the app (explore
 * page or a teacher's join code), so onboarding only collects identity and
 * answer language. board/grade are still written so isProfileComplete marks
 * the account as onboarded.
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

  const [fullName, setFullName] = useState(initialProfile?.fullName || initialName || "");
  const [languagePref, setLanguagePref] = useState<"EN" | "RN">(initialProfile?.languagePref ?? "RN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialProfile || hasHydratedDraft.current) return;
    hasHydratedDraft.current = true;

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;

      const draft = JSON.parse(raw) as {
        fullName?: string;
        languagePref?: "EN" | "RN";
      };

      if (typeof draft.fullName === "string") setFullName(draft.fullName);
      if (draft.languagePref === "EN" || draft.languagePref === "RN") setLanguagePref(draft.languagePref);
    } catch {
      // Ignore malformed local draft.
    }
  }, [draftKey, initialProfile]);

  useEffect(() => {
    if (initialProfile) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ fullName, languagePref }));
    } catch {
      // Ignore storage write failures.
    }
  }, [draftKey, fullName, initialProfile, languagePref]);

  async function finish() {
    if (!normalizeFullName(fullName)) {
      setError("Please tell us your name.");
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
      // board/grade presence is what the onboarding gate checks.
      board: "IOE",
      grade: "Bachelor",
      board_score: null,
      subjects: normalizeSubjects(initialProfile?.subjects ?? []),
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

    router.replace(nextPath || "/app/today");
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
        void finish();
      }}
    >
      <main className="flex flex-1 flex-col py-12">
        <Step
          title="Let's get you set up"
          subtitle="Just your name and how you like to read answers. You can join a course later with a teacher's code."
        >
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

        {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}

        <div className="mt-auto flex items-center justify-end pt-10">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Start learning →"}
          </Button>
        </div>
      </main>
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
