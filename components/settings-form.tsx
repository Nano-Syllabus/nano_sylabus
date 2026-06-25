"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppUser, StudentProfile } from "@/lib/types";

function engineeringBoard(value: string) {
  return normalizeBoard(value) === "IOE" ? "IOE" : "IOE";
}

function engineeringLevel(value: string) {
  return normalizeGrade(value) === "Bachelor" ? "Bachelor" : "Bachelor";
}

export function SettingsForm({
  user,
  profile,
}: {
  user: AppUser;
  profile: StudentProfile;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.fullName);
  const [college, setCollege] = useState(profile.college);
  const [board, setBoard] = useState(engineeringBoard(profile.board));
  const [grade, setGrade] = useState(engineeringLevel(profile.grade));
  const [program, setProgram] = useState("");
  const [semester, setSemester] = useState<string>("");
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
  const [catalogSubjectsByBoardGrade, setCatalogSubjectsByBoardGrade] = useState<Record<string, string[]>>({});

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
  const suggestedSubjects = useMemo(
    () => catalogSubjectsByBoardGrade[`${normalizedBoard}::${normalizedGrade}`] ?? [],
    [catalogSubjectsByBoardGrade, normalizedBoard, normalizedGrade],
  );
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
    let active = true;
    const loadCatalog = async () => {
      const response = await fetch("/api/knowledge/options", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        boards?: string[];
        gradesByBoard?: Record<string, string[]>;
        subjectsByBoardGrade?: Record<string, string[]>;
      };
      if (!active) return;
      setCatalogBoards(Array.isArray(payload.boards) ? payload.boards : []);
      setCatalogGradesByBoard(payload.gradesByBoard ?? {});
      setCatalogSubjectsByBoardGrade(payload.subjectsByBoardGrade ?? {});
    };
    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

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
    const supabase = createSupabaseBrowserClient();
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

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/signup");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <div className="rounded-lg border border-border bg-bg-primary">
        <div className="border-b border-border px-5 py-3">
          <h2 className="font-display text-xl">Profile & preferences</h2>
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
                  setSemester("");
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
                  setSemester("");
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
          {isBachelor && (
            <Field label="Semester">
              <Select
                value={semester}
                onChange={(event) => setSemester(event.target.value)}
              >
                <option value="">Select semester</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={String(sem)}>
                    {sem === 1 ? "1st" : sem === 2 ? "2nd" : sem === 3 ? "3rd" : `${sem}th`} Semester
                  </option>
                ))}
              </Select>
            </Field>
          )}
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
          <h2 className="font-display text-xl">Account</h2>
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
