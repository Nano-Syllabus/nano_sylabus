"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  Globe2,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  teacherCourseCategories,
  teacherCourseLevels,
  type TeacherCourse,
  type TeacherCourseInput,
} from "@/lib/teacher-courses";
import { cn, titleCase } from "@/lib/utils";

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

function CourseCard({
  course,
  onEdit,
  onDelete,
}: {
  course: TeacherCourse;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className="flex min-h-64 flex-col rounded-lg border border-border bg-bg-primary p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
            {course.category} · {course.authority}
          </p>
          <h2 className="mt-3 font-display text-xl font-semibold leading-tight">{titleCase(course.name)}</h2>
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
            {titleCase(subject.name)}
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
        <span className="flex-1" />
        {onDelete ? (
          <Button
            type="button"
            variant="danger"
            onClick={onDelete}
            className="size-10 shrink-0 px-0"
            aria-label={`Delete ${titleCase(course.name)}`}
            title="Delete course"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
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
  const [deletingCourse, setDeletingCourse] = useState<TeacherCourse | null>(null);

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
            Package multiple subjects into the exam tracks students discover and enroll in.
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
          <h2 className="font-display text-xl font-semibold">No subjects available</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-secondary">
            Your existing courses are still saved. Create a subject before adding a new course or
            updating its subject list.
          </p>
          <Button className="mt-5" type="button" variant="outline" onClick={onCreateSubject}>
            Create subject
          </Button>
        </section>
      ) : null}
      {state === "ready" && subjects.length > 0 && !courses.length ? (
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
            <CourseCard
              key={course.id}
              course={course}
              onEdit={() => setEditingCourse(course)}
              onDelete={() => setDeletingCourse(course)}
            />
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

      {deletingCourse ? (
        <DeleteCourseDialog
          course={deletingCourse}
          onClose={() => setDeletingCourse(null)}
          onDeleted={async () => {
            setDeletingCourse(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

function DeleteCourseDialog({
  course,
  onClose,
  onDeleted,
}: {
  course: TeacherCourse;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, onClose]);

  async function deleteCourse() {
    setDeleting(true);
    setError("");
    try {
      await apiPayload(
        await fetch(`/api/teacher/courses/${course.id}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
      await onDeleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the course.");
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/55 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onClose();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-course-title"
        aria-describedby="delete-course-description"
        className="w-full max-w-lg rounded-lg border border-border bg-bg-primary p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full border border-destructive/30 text-destructive">
            <Trash2 className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
              {course.status === "published" ? "Published course" : "Draft course"}
            </p>
            <h2 id="delete-course-title" className="mt-1 font-display text-xl font-semibold">
              Delete {titleCase(course.name)}?
            </h2>
          </div>
        </div>

        <p id="delete-course-description" className="mt-5 text-sm leading-6 text-text-secondary">
          This permanently deletes the course, its subject links, and its student enrollments.
          The original subjects and their files stay available in Subjects.
        </p>
        {course.enrollmentCount > 0 ? (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {course.enrollmentCount} enrolled {course.enrollmentCount === 1 ? "student" : "students"}
            {" "}will lose access to this course.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error} Try again.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={deleting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={deleting}
            aria-busy={deleting}
            onClick={() => void deleteCourse()}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {deleting ? "Deleting…" : "Delete course"}
          </Button>
        </div>
      </section>
    </div>
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

            <fieldset className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Course name" id="course-name">
                  <input
                    id="course-name"
                    required
                    minLength={3}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className={inputClass}
                    placeholder="e.g. Computer Programming"
                    autoComplete="off"
                  />
                </Field>

                <Field label="Category" id="course-category">
                  <select
                    id="course-category"
                    value={
                      (teacherCourseCategories as readonly string[]).includes(draft.category)
                        ? draft.category
                        : "Other"
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft({
                        ...draft,
                        category: value === "Other" ? "" : value,
                      });
                    }}
                    className={inputClass}
                  >
                    {teacherCourseCategories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                  {(!(teacherCourseCategories as readonly string[]).includes(draft.category)) ? (
                    <input
                      id="course-category-other"
                      required
                      value={draft.category}
                      onChange={(event) =>
                        setDraft({ ...draft, category: event.target.value })
                      }
                      className={cn(inputClass, "mt-2")}
                      placeholder="Type your category…"
                      autoComplete="off"
                    />
                  ) : null}
                </Field>
              </div>

              <Field label="Description" id="course-description">
                <textarea
                  id="course-description"
                  required
                  minLength={30}
                  rows={4}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  className={cn(inputClass, "py-3 resize-y")}
                  placeholder="Explain who this course is for and how it prepares them."
                />
              </Field>
            </fieldset>

            <fieldset className="mt-6 border-t border-border pt-5">
              <legend className="font-display text-base font-semibold">
                Subjects in this course
              </legend>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {subjects.map((subject) => {
                  const checked = draft.subjectSlugs.includes(subject.slug);
                  const owner = subjectOwners.get(subject.slug);
                  const unavailable = Boolean(owner && owner.id !== course?.id);
                  return (
                    <label
                      key={subject.slug}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3",
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
                        className="size-4 accent-current"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{titleCase(subject.name)}</span>
                        {unavailable ? (
                          <span className="mt-0.5 block text-xs text-text-muted">
                            Already in {owner?.name}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-text-muted">
                {selectedNames.length
                  ? `${selectedNames.length} selected: ${selectedNames.join(", ")}`
                  : "Choose at least one subject."}
              </p>
            </fieldset>

            <fieldset className="mt-5 border-t border-border pt-4">
              <legend className="font-display text-base font-semibold">Payment plan</legend>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-text-secondary">Access:</span>
                <div className="flex gap-2">
                  {(["free", "paid"] as const).map((model) => (
                    <label
                      key={model}
                      className={cn(
                        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3.5 text-sm font-medium capitalize transition",
                        draft.accessModel === model
                          ? "border-border-strong bg-bg-secondary"
                          : "border-border hover:bg-bg-secondary/50",
                      )}
                    >
                      <input
                        type="radio"
                        name="access-model"
                        checked={draft.accessModel === model}
                        onChange={() => setDraft({ ...draft, accessModel: model })}
                        className="size-3.5 accent-current"
                      />
                      {model}
                    </label>
                  ))}
                </div>
              </div>
              {draft.accessModel === "paid" ? (
                <div className="mt-3 max-w-xs">
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
                      placeholder="e.g. 500"
                    />
                  </Field>
                </div>
              ) : null}
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
