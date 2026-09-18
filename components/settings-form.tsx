"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  defaultBoardOptions,
  defaultGradeOptions,
  defaultProgramOptions,
  mergeDropdownOptions,
} from "@/lib/onboarding-options";
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
import { usePublishedCatalog } from "@/lib/query/catalog";
import { patchDashboardRunningSemester } from "@/lib/query/dashboard";

function engineeringBoard(value: string) {
  return normalizeBoard(value) === "IOE" ? "IOE" : "IOE";
}

function engineeringLevel(value: string) {
  return normalizeGrade(value) === "Bachelor" ? "Bachelor" : "Bachelor";
}

export function SettingsForm({
  user,
  profile,
  examsSat,
  runningSemester,
  communityOptions = [],
  selectedCommunitySlug = "",
}: {
  user: AppUser;
  profile: StudentProfile;
  examsSat: number;
  runningSemester: {
    communitySlug: string;
    currentTermId?: string | null;
    terms: Array<{ id: string; semesterNumber: number }>;
  } | null;
  communityOptions?: CommunitySwitchOption[];
  selectedCommunitySlug?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(profile.fullName);
  const [college, setCollege] = useState(profile.college);
  const [board, setBoard] = useState(engineeringBoard(profile.board));
  const [grade, setGrade] = useState(engineeringLevel(profile.grade));
  const [program, setProgram] = useState("");
  const [semester, setSemester] = useState(runningSemester?.currentTermId ?? "");
  const [savingSemester, setSavingSemester] = useState(false);
  const [semesterError, setSemesterError] = useState("");
  const semesterSaveInFlight = useRef(false);
  const isBachelor = grade.toLowerCase().includes("bachelor");
  const [boardScore, setBoardScore] = useState(profile.boardScore ?? "");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    normalizeSubjects(profile.subjects),
  );
  const [targetGrade, setTargetGrade] = useState(profile.targetGrade);
  const [languagePref, setLanguagePref] = useState<"EN" | "RN">(profile.languagePref);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalogBoards, setCatalogBoards] = useState<string[]>([]);
  const [catalogGradesByBoard, setCatalogGradesByBoard] = useState<Record<string, string[]>>({});
  /**
   * The published subject list, shared with every other surface that shows it.
   *
   * Settings used to fetch this itself on mount, into its own state, with no
   * cache — so opening settings after the course browser downloaded the same
   * catalog a moment earlier downloaded it again. It is now the same query
   * entry, which in practice means this form renders its subject chips from
   * memory with no request at all.
   */
  const { data: catalog } = usePublishedCatalog();
  const publishedSubjects = useMemo(
    () => normalizeSubjects((catalog?.subjects ?? []).map((subject) => subject.name)),
    [catalog],
  );

  const normalizedBoard = normalizeBoard(board);
  const normalizedGrade = normalizeGrade(grade);
  const isIoeBachelor = normalizedBoard === "IOE" && normalizedGrade === "Bachelor";
  const suggestedGrades = useMemo(
    () => catalogGradesByBoard[normalizedBoard] ?? [],
    [catalogGradesByBoard, normalizedBoard],
  );
  const boardOptions = useMemo(
    () =>
      mergeDropdownOptions({
        catalogValues: catalogBoards.filter((item) => normalizeBoard(item) === "IOE"),
        fallbackValues: defaultBoardOptions(),
        includeValue: board,
      }),
    [board, catalogBoards],
  );
  const gradeOptions = useMemo(
    () =>
      mergeDropdownOptions({
        catalogValues: suggestedGrades,
        fallbackValues: catalogBoards.length ? [] : defaultGradeOptions(board),
        includeValue: grade,
      }),
    [board, catalogBoards.length, grade, suggestedGrades],
  );
  // Teachers own the content, so every published subject is pickable — there is
  // no faculty/level scope left to filter them by.
  const suggestedSubjects = publishedSubjects;
  const programOptions = useMemo(
    () => defaultProgramOptions(normalizedBoard, normalizedGrade),
    [normalizedBoard, normalizedGrade],
  );
  const showBranchField = programOptions.length > 0;

  useEffect(() => {
    if (programOptions.length === 1 && program !== programOptions[0]) {
      setProgram(programOptions[0]);
    }
  }, [program, programOptions]);

  useEffect(() => {
    setSemester(runningSemester?.currentTermId ?? "");
  }, [runningSemester?.currentTermId]);

  async function saveRunningSemester(termId: string) {
    if (
      !runningSemester ||
      semesterSaveInFlight.current ||
      termId === semester ||
      !runningSemester.terms.some((term) => term.id === termId)
    ) {
      return;
    }
    const previousTermId = semester;
    setSemester(termId);
    setSemesterError("");
    setSavingSemester(true);
    semesterSaveInFlight.current = true;
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(runningSemester.communitySlug)}/membership`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ termId }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        currentTermId?: string;
        error?: string;
      };
      if (!response.ok || payload.currentTermId !== termId) {
        throw new Error(payload.error || "Could not save your running semester.");
      }
      patchDashboardRunningSemester(queryClient, runningSemester.communitySlug, termId);
      router.refresh();
    } catch (error) {
      setSemester(previousTermId);
      setSemesterError(
        error instanceof Error ? error.message : "Could not save your running semester.",
      );
    } finally {
      semesterSaveInFlight.current = false;
      setSavingSemester(false);
    }
  }

  function toggleSubject(subject: string) {
    setSelectedSubjects((current) => {
      const exists = current.some((item) => item.toLowerCase() === subject.toLowerCase());
      if (exists) return current.filter((item) => item.toLowerCase() !== subject.toLowerCase());
      return [...current, subject];
    });
  }

  async function saveProfile() {
    const normalizedFullName = normalizeFullName(fullName);
    const normalizedCollege = normalizeCollege(college);
    const normalizedBoard = normalizeBoard(board);
    const normalizedGrade = normalizeGrade(grade);
    const normalizedTargetGrade = normalizeTargetGrade(targetGrade);
    const normalizedSubjects = normalizeSubjects(selectedSubjects);

    if (!normalizedFullName || !normalizedCollege || !normalizedBoard || !normalizedGrade || !normalizedTargetGrade) {
      setStatus("Please complete your full name, institution, IOE Bachelor path, and target grade.");
      return;
    }
    if (isIoeBachelor && !program) {
      setStatus("Please select your branch.");
      return;
    }
    if (normalizedSubjects.length === 0) {
      setStatus("Please select at least one subject.");
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
      board_score: normalizeBoardScore(boardScore) || null,
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
          <Field label="Faculty">
            <Select
              value={board}
              onChange={(event) => {
                const nextBoard = event.target.value;
                if (nextBoard !== board) {
                  setGrade("");
                  setProgram("");
                }
                setBoard(nextBoard);
              }}
            >
              <option value="">Select faculty</option>
              {boardOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level">
            <Select
              value={grade}
              onChange={(event) => {
                const nextGrade = event.target.value;
                if (!nextGrade.toLowerCase().includes("bachelor")) {
                  setProgram("");
                }
                setGrade(nextGrade);
              }}
              disabled={!board}
            >
              <option value="">{board ? "Select level" : "Select faculty first"}</option>
              {gradeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          {isIoeBachelor && showBranchField ? (
            <Field label="Branch">
              <Select
                value={program}
                onChange={(event) => setProgram(event.target.value)}
              >
                <option value="">Select branch</option>
                {programOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {isBachelor && runningSemester?.terms.length ? (
            <Field
              label="Running semester"
              hint="This saved semester is used as the default across Nano Syllabus."
            >
              <Select
                value={semester}
                disabled={savingSemester}
                aria-busy={savingSemester}
                aria-invalid={Boolean(semesterError)}
                onChange={(event) => void saveRunningSemester(event.target.value)}
              >
                {runningSemester.terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.semesterNumber === 1
                      ? "1st"
                      : term.semesterNumber === 2
                        ? "2nd"
                        : term.semesterNumber === 3
                          ? "3rd"
                          : `${term.semesterNumber}th`} Semester
                  </option>
                ))}
              </Select>
              {semesterError ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {semesterError}
                </p>
              ) : null}
            </Field>
          ) : null}
          <Field label="Last published Board Result">
            <Input value={boardScore} onChange={(event) => setBoardScore(event.target.value)} />
          </Field>
          <Field label="Target grade">
            <Input value={targetGrade} onChange={(event) => setTargetGrade(event.target.value)} />
          </Field>
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
          <div className="rounded-[14px] border border-border p-4">
            <p className="text-[13px] text-text-muted">You are a student</p>
            <p className="mt-2 text-sm">
              {selectedSubjects.length} subject{selectedSubjects.length === 1 ? "" : "s"} · {examsSat} paper
              {examsSat === 1 ? "" : "s"} handed in
            </p>
          </div>
          <Field label="Subjects" hint="Select subjects available in your indexed books.">
            {suggestedSubjects.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono-ui uppercase text-text-muted">Available subjects</p>
                  <p className="text-xs text-text-muted">{selectedSubjects.length} selected</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestedSubjects.map((subject) => {
                    const isSelected = selectedSubjects.some(
                      (item) => item.toLowerCase() === subject.toLowerCase(),
                    );
                    return (
                      <Button
                        key={subject}
                        type="button"
                        size="sm"
                        variant={isSelected ? "filled" : "outline"}
                        onClick={() => toggleSubject(subject)}
                      >
                        {subject}
                      </Button>
                    );
                  })}
                </div>
                {selectedSubjects.length > 0 ? (
                  <div className="rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
                    Selected: {selectedSubjects.join(", ")}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  No indexed subjects available for this IOE Bachelor scope.
                </div>
                {selectedSubjects.length > 0 ? (
                  <div className="rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
                    Current selection: {selectedSubjects.join(", ")}
                  </div>
                ) : null}
              </div>
            )}
          </Field>
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
