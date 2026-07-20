"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  validateBoardScore,
} from "@/lib/profile-normalization";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { StudentProfile } from "@/lib/types";

type TenantCatalogPayload = {
  faculties?: string[];
  levelsByFaculty?: Record<string, string[]>;
  branchesByPath?: Record<string, string[]>;
  semestersByPath?: Record<string, Array<{ value: string; label: string; code: string }>>;
  subjectsByPath?: Record<
    string,
    Array<{
      name: string;
      slug: string;
      namespaceSlug: string;
      folderPath: string;
      semesterValue: string;
      semesterLabel: string;
      semesterCode: string;
      branch: string;
    }>
  >;
};

function engineeringBoard(value: string) {
  return normalizeBoard(value) === "IOE" ? "IOE" : "IOE";
}

function engineeringLevel(value: string) {
  return normalizeGrade(value) === "Bachelor" ? "Bachelor" : "Bachelor";
}

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
  const [college, setCollege] = useState(initialProfile?.college ?? "");
  const [board, setBoard] = useState(engineeringBoard(initialProfile?.board ?? ""));
  const [grade, setGrade] = useState(engineeringLevel(initialProfile?.grade ?? ""));
  const [program, setProgram] = useState("");
  const [semester, setSemester] = useState<string>("");
  const isBachelor = grade.toLowerCase().includes("bachelor");
  const [scoreType, setScoreType] = useState<"%" | "GPA">("%");
  const [score, setScore] = useState(initialProfile?.boardScore?.replace(/[%A-Z]+$/g, "") ?? "");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    normalizeSubjects(initialProfile?.subjects ?? []),
  );
  const [targetGrade, setTargetGrade] = useState(initialProfile?.targetGrade ?? "");
  const [languagePref, setLanguagePref] = useState<"EN" | "RN">(initialProfile?.languagePref ?? "RN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalogFaculties, setCatalogFaculties] = useState<string[]>([]);
  const [catalogLevelsByFaculty, setCatalogLevelsByFaculty] = useState<Record<string, string[]>>({});
  const [catalogBranchesByPath, setCatalogBranchesByPath] = useState<Record<string, string[]>>({});
  const [catalogSemestersByPath, setCatalogSemestersByPath] = useState<
    Record<string, Array<{ value: string; label: string; code: string }>>
  >({});
  const [catalogSubjectsByPath, setCatalogSubjectsByPath] = useState<Record<string, Array<{ name: string }>>>({});

  const total = 1;
  const normalizedBoard = normalizeBoard(board);
  const normalizedGrade = normalizeGrade(grade);
  const isIoeBachelor = normalizedBoard === "IOE" && normalizedGrade === "Bachelor";
  const suggestedGrades = useMemo(
    () => catalogLevelsByFaculty[normalizedBoard] ?? [],
    [catalogLevelsByFaculty, normalizedBoard],
  );
  const boardOptions = useMemo(
    () =>
      mergeDropdownOptions({
        catalogValues: catalogFaculties.filter((item) => normalizeBoard(item) === "IOE"),
        fallbackValues: defaultBoardOptions(),
        includeValue: board,
      }),
    [board, catalogFaculties],
  );
  const gradeOptions = useMemo(
    () =>
      mergeDropdownOptions({
        catalogValues: suggestedGrades,
        fallbackValues: catalogFaculties.length ? [] : defaultGradeOptions(board),
        includeValue: grade,
      }),
    [board, catalogFaculties.length, grade, suggestedGrades],
  );
  const branchCatalogKey = `${normalizedBoard}::${normalizedGrade}`;
  const suggestedSubjects = useMemo(
    () =>
      (catalogSubjectsByPath[`${normalizedBoard}::${normalizedGrade}::${program}::${semester}`] ?? []).map(
        (subject) => subject.name,
      ),
    [catalogSubjectsByPath, normalizedBoard, normalizedGrade, program, semester],
  );
  const programOptions = useMemo(
    () =>
      mergeDropdownOptions({
        catalogValues: catalogBranchesByPath[branchCatalogKey] ?? [],
        fallbackValues: catalogFaculties.length ? [] : defaultProgramOptions(normalizedBoard, normalizedGrade),
        includeValue: program,
      }),
    [branchCatalogKey, catalogBranchesByPath, catalogFaculties.length, normalizedBoard, normalizedGrade, program],
  );
  const semesterOptions = useMemo(
    () => catalogSemestersByPath[`${normalizedBoard}::${normalizedGrade}::${program}`] ?? [],
    [catalogSemestersByPath, normalizedBoard, normalizedGrade, program],
  );
  const showBranchField = programOptions.length > 0;

  useEffect(() => {
    if (programOptions.length === 1 && program !== programOptions[0]) {
      setProgram(programOptions[0]);
    }
  }, [program, programOptions]);

  useEffect(() => {
    if (semesterOptions.length === 1 && semester !== semesterOptions[0]?.value) {
      setSemester(semesterOptions[0].value);
    }
  }, [semester, semesterOptions]);

  useEffect(() => {
    if (semester && semesterOptions.length > 0 && !semesterOptions.some((option) => option.value === semester)) {
      setSemester("");
    }
  }, [semester, semesterOptions]);

  useEffect(() => {
    if (!program || !semester) return;
    setSelectedSubjects((current) =>
      current.filter((item) =>
        suggestedSubjects.some((subject) => subject.toLowerCase() === item.toLowerCase()),
      ),
    );
  }, [program, semester, suggestedSubjects]);

  useEffect(() => {
    if (initialProfile || hasHydratedDraft.current) return;
    hasHydratedDraft.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        step?: number;
        fullName?: string;
        college?: string;
        board?: string;
        grade?: string;
        program?: string;
        semester?: string;
        scoreType?: "%" | "GPA";
        score?: string;
        selectedSubjects?: string[];
        targetGrade?: string;
        languagePref?: "EN" | "RN";
      };
      if (typeof draft.step === "number" && Number.isFinite(draft.step)) {
        setStep(Math.min(total, Math.max(1, Math.trunc(draft.step))));
      }
      if (typeof draft.fullName === "string") setFullName(draft.fullName);
      if (typeof draft.college === "string") setCollege(draft.college);
      if (typeof draft.board === "string") setBoard(engineeringBoard(draft.board));
      if (typeof draft.grade === "string") setGrade(engineeringLevel(draft.grade));
      if (typeof draft.program === "string") setProgram(draft.program);
      if (typeof draft.semester === "string") setSemester(draft.semester);
      if (draft.scoreType === "%" || draft.scoreType === "GPA") setScoreType(draft.scoreType);
      if (typeof draft.score === "string") setScore(draft.score);
      if (Array.isArray(draft.selectedSubjects)) {
        setSelectedSubjects(
          normalizeSubjects(
            draft.selectedSubjects.filter((item): item is string => typeof item === "string"),
          ),
        );
      }
      if (typeof draft.targetGrade === "string") setTargetGrade(draft.targetGrade);
      if (draft.languagePref === "EN" || draft.languagePref === "RN") setLanguagePref(draft.languagePref);
    } catch {
      // Ignore malformed local draft.
    }
  }, [draftKey, initialProfile, total]);

  useEffect(() => {
    if (initialProfile) return;
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({
          step,
          fullName,
          college,
          board,
          grade,
          program,
          semester,
          scoreType,
          score,
          selectedSubjects,
          targetGrade,
          languagePref,
        }),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [
    board,
    college,
    draftKey,
    fullName,
    grade,
    program,
    semester,
    initialProfile,
    languagePref,
    score,
    scoreType,
    selectedSubjects,
    step,
    targetGrade,
  ]);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      const response = await fetch("/api/tenant/catalog", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as TenantCatalogPayload;
      if (!active) return;
      setCatalogFaculties(Array.isArray(payload.faculties) ? payload.faculties : []);
      setCatalogLevelsByFaculty(payload.levelsByFaculty ?? {});
      setCatalogBranchesByPath(payload.branchesByPath ?? {});
      setCatalogSemestersByPath(payload.semestersByPath ?? {});
      setCatalogSubjectsByPath(payload.subjectsByPath ?? {});
    };

    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  function validateStep(nextStep = step) {
    if (nextStep === 1) {
      if (!normalizeBoard(board) || !normalizeGrade(grade)) {
        return "Please complete your IOE Bachelor path.";
      }
      if (isIoeBachelor && !program) {
        return "Please select your branch.";
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
    finish();
  }

  function toggleSubject(subject: string) {
    setSelectedSubjects((current) => {
      const exists = current.some((item) => item.toLowerCase() === subject.toLowerCase());
      if (exists) return current.filter((item) => item.toLowerCase() !== subject.toLowerCase());
      return [...current, subject];
    });
  }

  async function finish() {
    const semesterSubjectSet = normalizeSubjects(suggestedSubjects);
    const subjects = semesterSubjectSet.length > 0 ? semesterSubjectSet : [];
    const normalizedBoard = normalizeBoard(board);
    const normalizedGrade = normalizeGrade(grade);

    if (!normalizedBoard || !normalizedGrade) {
      setError("Please complete your IOE Bachelor path.");
      return;
    }



    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const { error: upsertError } = await supabase.from("student_profiles").upsert({
      user_id: userId,
      full_name: fullName || "Student",
      college: "",
      board: normalizedBoard,
      grade: normalizedGrade,
      board_score: null,
      subjects,
      target_grade: "Pass",
      language_pref: "EN",
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

    router.replace("/app/chat");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center animate-fade-in pb-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-text-primary"></div>
        <h2 className="mt-6 text-lg font-medium">Setting up your profile...</h2>
        <p className="mt-2 text-sm text-text-muted">Personalizing your learning experience</p>
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex flex-1 w-full max-w-2xl flex-col px-5 py-10"
      onSubmit={(e) => {
        e.preventDefault();
        if (step < total) {
          goNext();
        } else {
          void finish();
        }
      }}
    >
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
          <Step title="Select your academic path" subtitle="Set your TU IOE Bachelor context before choosing subjects.">
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

            <StepTrap onFocusForward={goNext} onFocusBack={() => setStep((v) => Math.max(1, v - 1))} />
          </Step>
        ) : null}

        {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}

        <div className="mt-auto flex items-center justify-between pt-10">
          <Button variant="ghost" type="button" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1}>
            ← Back
          </Button>
          {step < total ? (
            <Button type="submit">
              Next →
            </Button>
          ) : (
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Start learning →"}
            </Button>
          )}
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

/** Hidden focusable element placed after the last field in each step.
 *  When the mobile keyboard "Next" arrow navigates past the last input,
 *  this trap catches focus and auto-advances to the next step.
 *  Similarly for "Previous" arrow → goes back. */
function StepTrap({
  onFocusForward,
  onFocusBack,
}: {
  onFocusForward: () => void;
  onFocusBack: () => void;
}) {
  return (
    <>
      <input
        aria-hidden
        tabIndex={0}
        onFocus={onFocusForward}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </>
  );
}
