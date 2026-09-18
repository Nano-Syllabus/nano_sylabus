"use client";

import { useState } from "react";
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
import { loadSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";
import type { AppUser, StudentProfile } from "@/lib/types";
import { ThemeSetting } from "@/components/theme-setting";
import { CommunitySwitcher } from "@/components/community-switcher";
import type { CommunitySwitchOption } from "@/lib/community-switch";

export function SettingsForm({
  user,
  profile,
  communityOptions = [],
  selectedCommunitySlug = "",
}: {
  user: AppUser;
  profile: StudentProfile;
  communityOptions?: CommunitySwitchOption[];
  selectedCommunitySlug?: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.fullName);
  const [college, setCollege] = useState(profile.college);
  const [languagePref, setLanguagePref] = useState<"EN" | "RN">(profile.languagePref);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  async function exportAccount() {
    setExporting(true);
    setStatus("");
    const response = await fetch("/api/account/export", { cache: "no-store" });
    setExporting(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setStatus(payload.error || "Failed to export account.");
      return;
    }

    const payload = await response.json();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nano-syllabus-export-${user.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Account export downloaded.");
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
      <ThemeSetting />

      {communityOptions && communityOptions.length > 0 ? (
        <section
          aria-labelledby="community-settings-heading"
          className="mb-6 rounded-lg border border-border bg-bg-primary"
        >
          <div className="border-b border-border px-5 py-3">
            <h2 id="community-settings-heading" className="type-student-section-title font-display text-xl">
              Community
            </h2>
          </div>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Active community</p>
              <p className="mt-1 max-w-md text-sm text-text-secondary">
                Select your active community to browse its curriculum, notes, and study resources across Nano Syllabus.
              </p>
            </div>
            <div className="w-full shrink-0 sm:w-[290px]">
              <CommunitySwitcher
                options={communityOptions}
                selectedSlug={selectedCommunitySlug}
                hideLabel
              />
            </div>
          </div>
        </section>
      ) : null}

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
          <div className="rounded-md border border-border bg-bg-secondary p-4">
            <p className="text-sm font-medium">Export your data</p>
            <p className="mt-1 text-sm text-text-secondary">
              Download your profile, chats, notes, billing records, and credit history as JSON.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void exportAccount()} disabled={exporting}>
              {exporting ? "Preparing export..." : "Download export"}
            </Button>
          </div>

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
