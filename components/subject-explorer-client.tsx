"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Clock3, FileText, MessageSquareText, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CourseLeaveButton } from "@/components/course-leave-button";
import type { StudentCourse } from "@/lib/student-courses";
import type { SubjectExplorerSummary } from "@/lib/types";
import { titleCase } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const button = `inline-flex min-h-10 items-center justify-center rounded-[10px] border px-4 text-sm font-medium transition ${focusRing}`;
type SubjectLevel = "green" | "yellow" | "red" | "grey";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function subjectLevel(subject: SubjectExplorerSummary): SubjectLevel {
  if (subject.weakTopicCount > 0) return "red";
  if (subject.latestPracticeScore !== null && subject.latestPracticeScore >= 70) return "green";
  if (subject.latestPracticeScore !== null) return "yellow";
  if (subject.questionCount > 0 || subject.sessionCount > 0) return "yellow";
  return "grey";
}

function subjectInsights(subject: SubjectExplorerSummary) {
  return [
    subject.syllabusTopicCount === null
      ? "Syllabus topics unavailable"
      : `${subject.syllabusTopicCount} syllabus ${subject.syllabusTopicCount === 1 ? "topic" : "topics"}`,
    `${subject.weakTopicCount} weak ${subject.weakTopicCount === 1 ? "topic" : "topics"}`,
    subject.untestedTopicCount === null
      ? "Untested topics unavailable"
      : `${subject.untestedTopicCount} ${subject.untestedTopicCount === 1 ? "topic" : "topics"} not yet tested`,
    subject.latestPracticeScore === null
      ? "No graded practice yet"
      : `Latest practice score: ${Math.round(subject.latestPracticeScore)}%`,
  ];
}

function formatLastActivity(value: string | null) {
  if (!value) return "No study activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent activity";
  return `Last studied ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function Dot({ level, label }: { level: SubjectLevel; label: string }) {
  const colour = {
    green: "bg-success",
    yellow: "bg-warning",
    red: "bg-destructive",
    grey: "bg-bg-tertiary",
  }[level];
  return <span role="img" aria-label={label} title={label} className={`h-2.5 w-2.5 shrink-0 rounded-full border border-border-strong/30 ${colour}`} />;
}

function SubjectCard({ subject }: { subject: SubjectExplorerSummary }) {
  const level = subjectLevel(subject);

  return (
    <Link
      href={`/app/explore/${encodeURIComponent(subject.slug)}`}
      className={`group flex min-h-[180px] flex-col justify-between rounded-[16px] border border-border bg-bg-primary p-5 text-left no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md ${focusRing}`}
    >
      <div>
        {/* Top bar: Category & Activity Dot */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-border bg-bg-secondary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
              {subject.category || "Subject"}
            </span>
            {subject.private ? (
              <span className="inline-flex rounded-full border border-border-strong bg-bg-tertiary px-2.5 py-0.5 text-xs font-medium text-text-primary">
                Private
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <Dot level={level} label="Study activity" />
          </div>
        </div>

        {/* Title and Academic Level */}
        <h2 className="mt-3.5 font-display text-[17px] font-semibold leading-snug text-text-primary transition-colors">
          {titleCase(subject.subject)}
        </h2>
        {subject.board || subject.grade ? (
          <p className="mt-1 text-xs text-text-muted">
            {[subject.board, subject.grade].filter(Boolean).join(" · ")}
          </p>
        ) : null}

        {/* Questions & Chat activity */}
        <p className="mt-2.5 text-xs text-text-muted">
          {subject.questionCount} {subject.questionCount === 1 ? "question" : "questions"} asked ·{" "}
          {subject.sessionCount} {subject.sessionCount === 1 ? "chat" : "chats"}
        </p>

        <div className="mt-3 rounded-[14px] border border-border bg-bg-secondary/70 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            NanoSyllabus sees
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-text-secondary">
            {subjectInsights(subject).map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer: Last Activity & Always Visible CTA */}
      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-text-muted">
        <span>{formatLastActivity(subject.lastActivityAt)}</span>
        <span className="inline-flex items-center gap-1 font-medium text-text-primary transition-transform group-hover:translate-x-0.5">
          Open →
        </span>
      </div>
    </Link>
  );
}

function Modal({ title, children, footer, onClose }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4 sm:p-6">
      <button type="button" aria-label="Close course details" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-[2px]" />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="course-modal-title" className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-bg-primary shadow-xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <h2 id="course-modal-title" className="font-display text-xl font-semibold">{title}</h2>
          <span className="flex-1" />
          <button ref={closeRef} type="button" onClick={onClose} className={`${button} border-border bg-bg-primary text-text-primary hover:bg-bg-secondary`}>Close</button>
        </header>
        <div className="p-5 sm:p-6">{children}</div>
        {footer ? <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-bg-primary px-5 py-4">{footer}</footer> : null}
      </section>
    </div>
  );
}

function CourseDetails({ course, onLeft }: { course: StudentCourse; onLeft: () => void }) {
  const firstSubject = course.subjects[0];
  const chatHref = firstSubject
    ? `/app/chat?subject=${encodeURIComponent(firstSubject.name)}`
    : "/app/chat";
  const practiceHref = firstSubject
    ? `/app/exams?subject=${encodeURIComponent(firstSubject.name)}`
    : "/app/exams";

  return (
    <div className="grid gap-7 lg:grid-cols-[1.45fr_1fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{course.category}</span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{course.level}</span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{course.enrollmentStatus === "completed" ? "Completed" : "Active"}</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-text-secondary">{course.description}</p>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [BookOpen, `${course.subjects.length}`, "Subjects"],
            [FileText, `${course.sourceStats.sourceFileCount}`, "Source files"],
            [Clock3, `${course.dailyMinutes} min`, "Daily target"],
            [CalendarDays, `${course.durationWeeks} weeks`, "Study plan"],
          ].map(([Icon, value, label]) => {
            const MetricIcon = Icon as typeof BookOpen;
            return (
              <div key={String(label)} className="rounded-lg border border-border bg-bg-secondary p-3">
                <MetricIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <dd className="mt-2 font-display text-lg font-semibold">{String(value)}</dd>
                <dt className="mt-0.5 text-xs text-text-muted">{String(label)}</dt>
              </div>
            );
          })}
        </dl>

        <div className="mt-7">
          <h3 className="font-display text-base font-semibold">Subjects in this course</h3>
          {course.subjects.length ? (
            <div className="mt-3 divide-y divide-border border-y border-border">
              {course.subjects.map((subject, index) => (
                <Link key={subject.slug} href={`/app/explore/${encodeURIComponent(subject.slug)}`} className={`group flex min-h-14 items-center gap-3 py-3 no-underline ${focusRing}`}>
                  <span className="w-6 shrink-0 font-mono-ui text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{titleCase(subject.name)}</span>
                  <ArrowRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-text-secondary">No indexed subject is connected yet.</p>
          )}
        </div>
      </div>

      <aside className="rounded-xl border border-border bg-bg-secondary p-5">
        <h3 className="font-display text-base font-semibold">Course details</h3>
        <dl className="mt-4 divide-y divide-border text-sm">
          <div className="flex items-start justify-between gap-4 py-3"><dt className="text-text-secondary">Teacher</dt><dd className="text-right font-medium">{course.author.displayName}</dd></div>
          <div className="flex items-start justify-between gap-4 py-3"><dt className="text-text-secondary">Institution</dt><dd className="text-right font-medium">{course.authority}</dd></div>
          <div className="flex items-start justify-between gap-4 py-3"><dt className="text-text-secondary">Language</dt><dd className="text-right font-medium">{course.languageModes.join(", ")}</dd></div>
          <div className="flex items-start justify-between gap-4 py-3"><dt className="text-text-secondary">Diagnostic</dt><dd className="text-right font-medium">{course.diagnosticQuestionCount} questions</dd></div>
          <div className="flex items-start justify-between gap-4 py-3"><dt className="text-text-secondary">Pass target</dt><dd className="text-right font-medium">{course.passPercentage}%</dd></div>
        </dl>
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-bg-primary p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-tertiary"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><p className="truncate text-sm font-medium">{course.author.displayName}</p><p className="truncate text-xs text-text-muted">{course.author.headline || "Course instructor"}</p></div>
        </div>
        <div className="mt-5 grid gap-2">
          <Link href={chatHref} className={`${button} gap-2 border-border bg-bg-primary hover:bg-bg-tertiary`}><MessageSquareText className="h-4 w-4" aria-hidden="true" /> Ask tutor</Link>
          <Link href={practiceHref} className={`${button} gap-2 border-text-primary bg-text-primary text-text-inverse hover:opacity-90`}>Start practice <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          <div className="mt-2 border-t border-border pt-2">
            <CourseLeaveButton
              slug={course.slug}
              courseName={course.name}
              label="Leave course"
              onLeft={onLeft}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

export function SubjectExplorerClient({
  subjects,
  courses,
}: {
  subjects: SubjectExplorerSummary[];
  courses: StudentCourse[];
}) {
  const [enrolledCourses, setEnrolledCourses] = useState(courses);
  const [selectedCourse, setSelectedCourse] = useState<StudentCourse | null>(null);
  const privateSubjects = subjects.filter((subject) => subject.private);

  useEffect(() => {
    setEnrolledCourses(courses);
  }, [courses]);

  return (
    <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.04em]">My Subjects</h1>
        <span className="flex-1" />
        <Link
          href="/exams"
          target="_blank"
          rel="noopener noreferrer"
          className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}
        >
          Browse Community Courses
        </Link>
        <Link
          href="/teachers"
          target="_blank"
          rel="noopener noreferrer"
          className={`${button} border-border-strong bg-text-primary text-text-inverse hover:opacity-90`}
        >
          Upload Subject Material
        </Link>
      </div>

      <p className="mb-4 text-sm text-text-secondary">
        Your enrolled course subjects appear first. Private subjects you create are kept below them and are visible only to you.
      </p>

      {enrolledCourses.length ? (
        <div className="space-y-8">
          {enrolledCourses.map((course) => {
            const subjectKeys = new Set(
              course.subjects.flatMap((subject) => [slugify(subject.slug), slugify(subject.name)]),
            );
            const courseSubjects = subjects.filter(
              (subject) =>
                !subject.private &&
                (subjectKeys.has(slugify(subject.slug)) ||
                  subjectKeys.has(slugify(subject.subject))),
            );

            return (
              <section key={course.slug}>
                <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-border pb-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-semibold">{titleCase(course.name)}</h2>
                    <p className="mt-0.5 text-sm text-text-muted">
                      {courseSubjects.length} subject{courseSubjects.length === 1 ? "" : "s"} included
                    </p>
                  </div>
                  <button type="button" onClick={() => setSelectedCourse(course)} className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>
                    Open course
                  </button>
                </div>
                {courseSubjects.length ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {courseSubjects.map((subject) => (
                      <SubjectCard key={`${course.slug}-${subject.slug}`} subject={subject} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                    This course does not have an available indexed subject yet.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {privateSubjects.length ? (
        <section className="mt-8 border-t border-border pt-7" aria-labelledby="private-subjects-title">
          <div className="mb-3 flex flex-wrap items-end gap-3 border-b border-border pb-3">
            <div className="min-w-0 flex-1">
              <h2 id="private-subjects-title" className="font-display text-lg font-semibold">
                Private subjects
              </h2>
              <p className="mt-0.5 text-sm text-text-muted">
                Personal subjects only you can access.
              </p>
            </div>
            <span className="text-sm text-text-muted">
              {privateSubjects.length} subject{privateSubjects.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {privateSubjects.map((subject) => (
                <SubjectCard key={`private-${subject.slug}`} subject={subject} />
              ))}
          </div>
        </section>
      ) : null}

      {!enrolledCourses.length && !privateSubjects.length ? (
        <section className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h2 className="font-display text-xl font-semibold">No enrolled subjects yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
            Enroll in a published course to unlock all of its subjects here.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/exams"
              target="_blank"
              rel="noopener noreferrer"
              className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}
            >
              Browse Community Courses
            </Link>
            <Link
              href="/teachers"
              target="_blank"
              rel="noopener noreferrer"
              className={`${button} border-border-strong bg-text-primary text-text-inverse hover:opacity-90`}
            >
              Upload Subject Material
            </Link>
          </div>
        </section>
      ) : null}

      {selectedCourse ? (
        <Modal title={selectedCourse.name} onClose={() => setSelectedCourse(null)}>
          <CourseDetails
            course={selectedCourse}
            onLeft={() => {
              setEnrolledCourses((current) => current.filter((course) => course.id !== selectedCourse.id));
              setSelectedCourse(null);
            }}
          />
        </Modal>
      ) : null}
    </main>
  );
}
