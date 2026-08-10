"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { BookOpen, CalendarDays, Check, Globe2, Pencil, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  teacherCourseCategories,
  teacherCourseLevels,
  type TeacherCourse,
  type TeacherCourseInput,
} from "@/lib/teacher-courses";
import { cn } from "@/lib/utils";

type TeacherSubject = {
  slug: string;
  name: string;
  folderPath: string;
  code: string;
  university: string;
  programme: string;
};

type LoadState = "loading" | "ready" | "error";

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong";

function emptyCourseDraft(): TeacherCourseInput {
  return {
    name: "",
    shortName: "",
    category: "Entrance",
    authority: "",
    tagline: "",
    description: "",
    durationWeeks: 12,
    level: "Intermediate",
    languageModes: ["English"],
    accessModel: "free",
    priceNpr: 0,
    visibility: "public",
    diagnosticQuestionCount: 10,
    dailyMinutes: 20,
    passPercentage: 40,
    negativeMarking: 0,
    examDate: null,
    outcomes: [],
    subjectSlugs: [],
    status: "draft",
  };
}

function courseDraft(course: TeacherCourse): TeacherCourseInput {
  return {
    name: course.name,
    shortName: course.shortName,
    category: course.category,
    authority: course.authority,
    tagline: course.tagline,
    description: course.description,
    durationWeeks: course.durationWeeks,
    level: course.level,
    languageModes: course.languageModes,
    accessModel: course.accessModel,
    priceNpr: course.priceNpr,
    visibility: course.visibility,
    diagnosticQuestionCount: course.diagnosticQuestionCount,
    dailyMinutes: course.dailyMinutes,
    passPercentage: course.passPercentage,
    negativeMarking: course.negativeMarking,
    examDate: course.examDate,
    outcomes: course.outcomes,
    subjectSlugs: course.subjects.map((subject) => subject.slug),
    status: course.status,
  };
}

async function apiPayload(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error || "Could not load courses."));
  return payload;
}

function CoursesSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("grid gap-4", compact ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2")}>
      {Array.from({ length: compact ? 3 : 4 }).map((_, index) => (
        <div key={index} className="h-44 animate-pulse rounded-lg bg-bg-tertiary" />
      ))}
    </div>
  );
}

function CourseStatus({ course }: { course: TeacherCourse }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
        course.status === "published"
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-bg-secondary text-text-secondary",
      )}
    >
      {course.status === "published" ? <Globe2 className="size-3.5" aria-hidden="true" /> : null}
      {course.status === "published" ? "Published" : "Draft"}
    </span>
  );
}

function CourseCard({ course, onEdit }: { course: TeacherCourse; onEdit: () => void }) {
  return (
    <article className="flex min-h-64 flex-col rounded-lg border border-border bg-bg-primary p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
            {course.category} · {course.authority}
          </p>
          <h2 className="mt-3 font-display text-xl font-semibold leading-tight">{course.name}</h2>
        </div>
        <span className="flex-1" />
        <CourseStatus course={course} />
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-text-secondary">{course.tagline}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {course.subjects.slice(0, 4).map((subject) => (
          <span
            key={subject.slug}
            className="inline-flex min-h-7 items-center rounded-full border border-border px-2.5 text-xs text-text-secondary"
          >
            {subject.name}
          </span>
        ))}
        {course.subjects.length > 4 ? (
          <span className="inline-flex min-h-7 items-center rounded-full border border-border px-2.5 text-xs text-text-muted">
            +{course.subjects.length - 4}
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-6 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="size-3.5" aria-hidden="true" /> {course.subjects.length} subjects
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" /> {course.enrollmentCount} students
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5" aria-hidden="true" /> {course.durationWeeks} weeks
        </span>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden="true" /> Edit
        </Button>
      </div>
    </article>
  );
}

export function TeacherCoursesClient({
  subjects,
  onCreateSubject,
}: {
  subjects: TeacherSubject[];
  onCreateSubject: () => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [editingCourse, setEditingCourse] = useState<TeacherCourse | "new" | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const payload = await apiPayload(
        await fetch("/api/teacher/courses", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      );
      setCourses(Array.isArray(payload.courses) ? (payload.courses as TeacherCourse[]) : []);
      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load courses.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publishedCount = courses.filter((course) => course.status === "published").length;
  const connectedSubjects = new Set(
    courses.flatMap((course) => course.subjects.map((subject) => subject.slug)),
  ).size;

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Catalog</p>
          <h1 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.04em]">
            Courses
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Package multiple indexed subjects into the exam tracks students discover and enroll in.
          </p>
        </div>
        <span className="flex-1" />
        <Button type="button" onClick={() => setEditingCourse("new")} disabled={!subjects.length}>
          <Plus className="size-4" aria-hidden="true" /> New course
        </Button>
      </div>

      <dl className="mt-7 grid border-y border-border py-5 sm:grid-cols-3">
        {[
          [String(courses.length), "Courses"],
          [String(publishedCount), "Published"],
          [String(connectedSubjects), "Subjects connected"],
        ].map(([value, label], index) => (
          <div
            key={label}
            className={cn("py-2 sm:px-5", index > 0 && "sm:border-l sm:border-border")}
          >
            <dt className="text-xs text-text-muted">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {state === "loading" ? (
        <div className="mt-7">
          <CoursesSkeleton />
        </div>
      ) : null}
      {state === "error" ? (
        <section className="mt-7 rounded-lg border border-destructive/30 p-6" role="alert">
          <h2 className="font-display text-lg font-semibold">Couldn&apos;t load courses</h2>
          <p className="mt-2 text-sm text-text-secondary">{error}</p>
          <Button className="mt-5" type="button" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </section>
      ) : null}
      {state === "ready" && !subjects.length ? (
        <section className="mt-7 rounded-lg border border-dashed border-border p-10 text-center">
          <h2 className="font-display text-xl font-semibold">Create an indexed subject first</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-secondary">
            A course needs at least one subject backed by your collection material and question
            bank.
          </p>
          <Button className="mt-5" type="button" variant="outline" onClick={onCreateSubject}>
            Create subject
          </Button>
        </section>
      ) : null}
      {state === "ready" && subjects.length && !courses.length ? (
        <section className="mt-7 rounded-lg border border-dashed border-border p-10 text-center">
          <h2 className="font-display text-xl font-semibold">No courses yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-secondary">
            Build the exam package students will see, then publish it when its subjects and plan are
            ready.
          </p>
          <Button className="mt-5" type="button" onClick={() => setEditingCourse("new")}>
            <Plus className="size-4" aria-hidden="true" /> Create course
          </Button>
        </section>
      ) : null}
      {state === "ready" && courses.length ? (
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} onEdit={() => setEditingCourse(course)} />
          ))}
        </div>
      ) : null}

      {editingCourse ? (
        <CourseEditor
          course={editingCourse === "new" ? null : editingCourse}
          courses={courses}
          subjects={subjects}
          onClose={() => setEditingCourse(null)}
          onSaved={async () => {
            setEditingCourse(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

export function TeacherCoursesOverview({ onOpen }: { onOpen: () => void }) {
  const [state, setState] = useState<LoadState>("loading");
  const [courses, setCourses] = useState<TeacherCourse[]>([]);

  useEffect(() => {
    let active = true;
    void fetch("/api/teacher/courses", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(apiPayload)
      .then((payload) => {
        if (!active) return;
        setCourses(Array.isArray(payload.courses) ? (payload.courses as TeacherCourse[]) : []);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading")
    return (
      <div className="mt-5">
        <CoursesSkeleton compact />
      </div>
    );
  if (state === "error") {
    return (
      <div className="mt-5 rounded-lg border border-border p-6">
        <p className="text-sm text-text-secondary">Courses are unavailable right now.</p>
        <Button className="mt-4" type="button" variant="outline" onClick={onOpen}>
          Open courses
        </Button>
      </div>
    );
  }
  if (!courses.length) {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
        <h3 className="font-display text-xl font-semibold">Build your first course</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Combine indexed subjects into one exam-preparation track.
        </p>
        <Button className="mt-5" type="button" variant="outline" onClick={onOpen}>
          Open courses
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {courses.slice(0, 3).map((course) => (
        <CourseCard key={course.id} course={course} onEdit={onOpen} />
      ))}
    </div>
  );
}

function CourseEditor({
  course,
  courses,
  subjects,
  onClose,
  onSaved,
}: {
  course: TeacherCourse | null;
  courses: TeacherCourse[];
  subjects: TeacherSubject[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<TeacherCourseInput>(() =>
    course ? courseDraft(course) : emptyCourseDraft(),
  );
  const [outcomesText, setOutcomesText] = useState(() => draft.outcomes.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const selectedNames = useMemo(
    () =>
      subjects
        .filter((subject) => draft.subjectSlugs.includes(subject.slug))
        .map((subject) => subject.name),
    [draft.subjectSlugs, subjects],
  );
  const subjectOwners = useMemo(
    () =>
      new Map(
        courses.flatMap((item) =>
          item.subjects.map((subject) => [subject.slug, { id: item.id, name: item.name }] as const),
        ),
      ),
    [courses],
  );

  function numeric(value: string, fallback: number) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value === "published" ? "published" : "draft";
    setSaving(true);
    setError("");
    try {
      const body: TeacherCourseInput = {
        ...draft,
        status,
        outcomes: outcomesText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      };
      const response = await fetch(
        course ? `/api/teacher/courses/${course.id}` : "/api/teacher/courses",
        {
          method: course ? "PATCH" : "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      await apiPayload(response);
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the course.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-3 sm:p-6"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-editor-title"
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-bg-primary shadow-xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
              Course builder
            </p>
            <h2 id="course-editor-title" className="mt-1 font-display text-2xl font-semibold">
              {course ? "Edit course" : "New course"}
            </h2>
          </div>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid size-10 place-items-center rounded-full border border-border text-text-secondary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
            aria-label="Close course builder"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            {error ? (
              <p
                className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <fieldset>
              <legend className="font-display text-lg font-semibold">Exam identity</legend>
              <p className="mt-1 text-sm text-text-secondary">
                This becomes the public exam-track page students discover.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Course name" id="course-name">
                  <input
                    id="course-name"
                    required
                    minLength={3}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className={inputClass}
                    placeholder="IOE Engineering Entrance"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Short name" id="course-short-name" optional>
                  <input
                    id="course-short-name"
                    value={draft.shortName}
                    onChange={(event) => setDraft({ ...draft, shortName: event.target.value })}
                    className={inputClass}
                    placeholder="IOE Entrance"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Category" id="course-category">
                  <select
                    id="course-category"
                    value={draft.category}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        category: event.target.value as TeacherCourseInput["category"],
                      })
                    }
                    className={inputClass}
                  >
                    {teacherCourseCategories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Conducting authority" id="course-authority">
                  <input
                    id="course-authority"
                    required
                    value={draft.authority}
                    onChange={(event) => setDraft({ ...draft, authority: event.target.value })}
                    className={inputClass}
                    placeholder="Institute of Engineering, TU"
                    autoComplete="organization"
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Course promise" id="course-tagline">
                  <input
                    id="course-tagline"
                    required
                    minLength={10}
                    value={draft.tagline}
                    onChange={(event) => setDraft({ ...draft, tagline: event.target.value })}
                    className={inputClass}
                    placeholder="Physics, Chemistry, Maths and English at entrance difficulty."
                    autoComplete="off"
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Description" id="course-description">
                  <textarea
                    id="course-description"
                    required
                    minLength={30}
                    rows={4}
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    className={cn(inputClass, "py-3")}
                    placeholder="Explain who this course is for and how it prepares them."
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="mt-8 border-t border-border pt-7">
              <legend className="font-display text-lg font-semibold">
                Subjects in this course
              </legend>
              <p className="mt-1 text-sm text-text-secondary">
                Each indexed subject belongs to one course only. Create a separate subject when an
                exam uses a different syllabus.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {subjects.map((subject) => {
                  const checked = draft.subjectSlugs.includes(subject.slug);
                  const owner = subjectOwners.get(subject.slug);
                  const unavailable = Boolean(owner && owner.id !== course?.id);
                  return (
                    <label
                      key={subject.slug}
                      className={cn(
                        "flex min-h-16 items-start gap-3 rounded-lg border p-4",
                        unavailable ? "cursor-not-allowed opacity-55" : "cursor-pointer",
                        checked ? "border-border-strong bg-bg-secondary" : "border-border",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={unavailable}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            subjectSlugs: event.target.checked
                              ? [...draft.subjectSlugs, subject.slug]
                              : draft.subjectSlugs.filter((slug) => slug !== subject.slug),
                          })
                        }
                        className="mt-0.5 size-4 accent-current"
                      />
                      <span>
                        <span className="block text-sm font-medium">{subject.name}</span>
                        <span className="mt-1 block text-xs text-text-muted">
                          {unavailable
                            ? `Already in ${owner?.name}`
                            : subject.code || subject.university || "Indexed subject"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-text-muted">
                {selectedNames.length
                  ? `${selectedNames.length} selected: ${selectedNames.join(", ")}`
                  : "Choose at least one subject."}
              </p>
            </fieldset>

            <fieldset className="mt-8 border-t border-border pt-7">
              <legend className="font-display text-lg font-semibold">Study plan</legend>
              <p className="mt-1 text-sm text-text-secondary">
                These settings drive the diagnostic, daily plan and readiness target.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Duration (weeks)" id="course-duration">
                  <input
                    id="course-duration"
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.durationWeeks}
                    onChange={(event) =>
                      setDraft({ ...draft, durationWeeks: numeric(event.target.value, 12) })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Daily minutes" id="course-daily-minutes">
                  <input
                    id="course-daily-minutes"
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.dailyMinutes}
                    onChange={(event) =>
                      setDraft({ ...draft, dailyMinutes: numeric(event.target.value, 20) })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Diagnostic questions" id="course-diagnostic">
                  <input
                    id="course-diagnostic"
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.diagnosticQuestionCount}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        diagnosticQuestionCount: numeric(event.target.value, 10),
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Pass percentage" id="course-pass">
                  <input
                    id="course-pass"
                    required
                    inputMode="decimal"
                    value={draft.passPercentage}
                    onChange={(event) =>
                      setDraft({ ...draft, passPercentage: numeric(event.target.value, 40) })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Level" id="course-level">
                  <select
                    id="course-level"
                    value={draft.level}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        level: event.target.value as TeacherCourseInput["level"],
                      })
                    }
                    className={inputClass}
                  >
                    {teacherCourseLevels.map((level) => (
                      <option key={level}>{level}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Negative marking (%)" id="course-negative-marking">
                  <input
                    id="course-negative-marking"
                    inputMode="decimal"
                    value={draft.negativeMarking}
                    onChange={(event) =>
                      setDraft({ ...draft, negativeMarking: numeric(event.target.value, 0) })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Target exam date" id="course-exam-date" optional>
                  <input
                    id="course-exam-date"
                    type="date"
                    value={draft.examDate || ""}
                    onChange={(event) =>
                      setDraft({ ...draft, examDate: event.target.value || null })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Visibility" id="course-visibility">
                  <select
                    id="course-visibility"
                    value={draft.visibility}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        visibility: event.target.value as TeacherCourseInput["visibility"],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </Field>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-sm font-medium">Teaching language</legend>
                  <div className="mt-2 flex gap-3">
                    {(["English", "Nepali"] as const).map((language) => (
                      <label
                        key={language}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft.languageModes.includes(language)}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              languageModes: event.target.checked
                                ? [...draft.languageModes, language]
                                : draft.languageModes.filter((item) => item !== language),
                            })
                          }
                          className="size-4 accent-current"
                        />
                        {language}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-sm font-medium">Access</legend>
                  <div className="mt-2 flex gap-3">
                    {(["free", "paid"] as const).map((model) => (
                      <label
                        key={model}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm capitalize"
                      >
                        <input
                          type="radio"
                          name="access-model"
                          checked={draft.accessModel === model}
                          onChange={() => setDraft({ ...draft, accessModel: model })}
                          className="size-4 accent-current"
                        />
                        {model}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              {draft.accessModel === "paid" ? (
                <div className="mt-4 max-w-xs">
                  <Field label="Price (NPR)" id="course-price">
                    <input
                      id="course-price"
                      required
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={draft.priceNpr}
                      onChange={(event) =>
                        setDraft({ ...draft, priceNpr: numeric(event.target.value, 0) })
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
              ) : null}
              <div className="mt-4">
                <Field label="Student outcomes" id="course-outcomes" optional>
                  <textarea
                    id="course-outcomes"
                    rows={4}
                    value={outcomesText}
                    onChange={(event) => setOutcomesText(event.target.value)}
                    className={cn(inputClass, "py-3")}
                    placeholder={
                      "One outcome per line\nPast-paper mock tests\nDaily weak-topic revision"
                    }
                  />
                </Field>
              </div>
            </fieldset>
          </div>

          <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-bg-primary px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="outline"
              disabled={saving}
              aria-busy={saving}
            >
              Save draft
            </Button>
            <Button
              type="submit"
              name="intent"
              value="published"
              disabled={saving || !draft.subjectSlugs.length || draft.visibility === "private"}
              aria-busy={saving}
            >
              <Check className="size-4" aria-hidden="true" />{" "}
              {saving
                ? "Saving…"
                : course?.status === "published"
                  ? "Update published"
                  : "Publish course"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  id,
  optional,
  children,
}: {
  label: string;
  id: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label} {optional ? <span className="font-normal text-text-muted">optional</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
