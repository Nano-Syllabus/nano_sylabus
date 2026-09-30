"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  normalizeBoard,
  normalizeBoardScore,
  normalizeCollege,
  normalizeFullName,
  normalizeGrade,
  normalizeSubjects,
  normalizeTargetGrade,
} from "@/lib/profile-normalization";
import { getPhoneNumberError, normalizePhoneNumber } from "@/lib/phone-number";
import { loadSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";
import type { AppUser, StudentProfile } from "@/lib/types";
import { ThemeSetting } from "@/components/theme-setting";

export function SettingsForm({
  user,
  profile,
  planCard,
}: {
  user: AppUser;
  profile: StudentProfile;
  planCard?: ReactNode;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.fullName);
  const [college, setCollege] = useState(profile.college);
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? "");
  const [languagePref, setLanguagePref] = useState<"EN" | "RN">(profile.languagePref);
  const [status, setStatus] = useState("");
  const [phoneNumberError, setPhoneNumberError] = useState("");
  const [phoneNumberStatus, setPhoneNumberStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPhoneNumber, setSavingPhoneNumber] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function saveProfile() {
    const normalizedFullName = normalizeFullName(fullName);
    const normalizedCollege = normalizeCollege(college);
    const normalizedBoard = normalizeBoard(profile.board);
    const normalizedGrade = normalizeGrade(profile.grade);
    const normalizedBoardScore = normalizeBoardScore(profile.boardScore ?? "");
    const normalizedSubjects = normalizeSubjects(profile.subjects);
    const normalizedTargetGrade = normalizeTargetGrade(profile.targetGrade);

    if (!normalizedFullName || !normalizedCollege || !normalizedBoard || !normalizedGrade) {
      setStatus("Please complete your full name and institution.");
      return;
    }

    setSaving(true);
    setStatus("");
    const supabase = await loadSupabaseBrowserClient();
    const { error } = await supabase.from("student_profiles").upsert({
      user_id: user.id,
      full_name: normalizedFullName,
      college: normalizedCollege,
      board: normalizedBoard,
      grade: normalizedGrade,
      board_score: normalizedBoardScore || null,
      subjects: normalizedSubjects,
      target_grade: normalizedTargetGrade,
      language_pref: languagePref,
    });

    setSaving(false);
    setStatus(error ? error.message : "Saved.");
  }

  async function savePhoneNumber() {
    const nextPhoneNumberError = getPhoneNumberError(phoneNumber);
    if (nextPhoneNumberError) {
      setPhoneNumberError(nextPhoneNumberError);
      setPhoneNumberStatus("");
      return;
    }

    setSavingPhoneNumber(true);
    setPhoneNumberError("");
    setPhoneNumberStatus("");

    const supabase = await loadSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({
      data: { phone_number: normalizePhoneNumber(phoneNumber) },
    });

    setSavingPhoneNumber(false);
    setPhoneNumberStatus(error ? error.message : "Phone number saved.");
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      "This will permanently delete your account, chats, notes, billing history, and saved data. Continue?",
    );
    if (!confirmed) return;

    setDeleting(true);
    setStatus("");
    const response = await fetch("/api/account", {
      method: "DELETE",
    });
    setDeleting(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setStatus(payload.error || "Failed to delete account.");
      return;
    }

    const supabase = await loadSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="student-reading-frame">
      {planCard}
      <ThemeSetting />

      <div className="rounded-lg border border-border bg-bg-primary">
        <div className="border-b border-border px-5 py-3">
          <h2 className="type-student-section-title">Profile & preferences</h2>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Full name">
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={user.email} disabled />
          </Field>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void savePhoneNumber();
            }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Field
                  label="Phone number"
                  error={phoneNumberError || undefined}
                  hint="Used for account and payment support. It is never shown publicly."
                >
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    onBlur={() => setPhoneNumberError(phoneNumber ? getPhoneNumberError(phoneNumber) : "")}
                    placeholder="9812345678 or +977 9812345678"
                    invalid={Boolean(phoneNumberError)}
                    required
                  />
                </Field>
              </div>
              <Button type="submit" variant="outline" disabled={savingPhoneNumber} aria-busy={savingPhoneNumber}>
                {savingPhoneNumber ? "Saving..." : "Save phone number"}
              </Button>
            </div>
            {phoneNumberStatus ? <p className="mt-3 text-sm text-text-secondary">{phoneNumberStatus}</p> : null}
          </form>
          <Field label="College / institution">
            <Input value={college} onChange={(event) => setCollege(event.target.value)} />
          </Field>
          {/*
          <Field label="University / academic authority">
            <Select value="Tribhuvan University" disabled>
              <option value="Tribhuvan University">Tribhuvan University</option>
            </Select>
          </Field>
          */}
          <div>
            <p className="mb-2 text-xs font-mono-ui uppercase text-text-muted">Default language</p>
            <div className="inline-flex rounded-full border border-border p-1">
              {(["EN", "RN"] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setLanguagePref(item)}
                  className={
                    "rounded-full px-5 py-1.5 text-xs font-mono-ui transition " +
                    (languagePref === item ? "bg-text-primary text-text-inverse" : "text-text-secondary")
                  }
                >
                  {item === "EN" ? "English" : "Roman Nepali"}
                </button>
              ))}
            </div>
          </div>
          {status ? <p className="text-sm text-text-secondary">{status}</p> : null}
        </div>
        <div className="flex justify-end border-t border-border bg-bg-secondary px-5 py-3">
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-bg-primary">
        <div className="border-b border-border px-5 py-3">
          <h2 className="type-student-section-title">Account</h2>
        </div>
        <div className="space-y-4 p-5">


          <div className="rounded-md border border-destructive/40 bg-[color:var(--note-red)] p-4">
            <p className="text-sm font-medium text-destructive">Delete account</p>
            <p className="mt-1 text-sm text-text-secondary">
              This permanently removes your auth account and cascades your saved study data.
            </p>
            <Button className="mt-4" variant="danger" onClick={() => void deleteAccount()} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete account"}
            </Button>
          </div>

          {status ? <p className="text-sm text-text-secondary">{status}</p> : null}
        </div>
      </div>
    </div>
  );
}
