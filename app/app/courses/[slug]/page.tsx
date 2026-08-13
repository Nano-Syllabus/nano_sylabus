import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Clock3, MessageSquareText } from "lucide-react";
import { CourseLeaveButton } from "@/components/course-leave-button";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentCourse } from "@/lib/student-courses";
import { titleCase } from "@/lib/utils";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

function subjectHref(subjectSlug: string) {
  return `/app/explore/${encodeURIComponent(subjectSlug)}`;
}

export default async function CourseStudySpacePage({ params }: PageProps) {
  const { user } = await requireOnboardedUser();
  const { slug } = await params;
  const course = await getStudentCourse(user.id, slug);
  if (!course) notFound();

  const firstSubject = course.subjects[0];
  const practiceHref = firstSubject
    ? `/app/exams?subject=${encodeURIComponent(firstSubject.name)}`
    : "/app/exams";
  const chatHref = firstSubject
    ? `/app/chat?subject=${encodeURIComponent(firstSubject.name)}`
    : "/app/chat";

  return (
    <>
      <SetAppShell title="Courses" />
      <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
        <Link
          href="/app/courses"
          className="inline-flex min-h-10 items-center gap-2 text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My courses
        </Link>

        <header className="border-b border-border pb-8 pt-4">
          <div className="flex flex-wrap items-start gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-secondary">{course.category} · {course.authority}</p>
              <h1 className="mt-2 max-w-3xl font-display text-3xl font-semibold">{titleCase(course.name)}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
                {course.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {course.subjects.length} subject{course.subjects.length === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4" aria-hidden="true" /> {course.dailyMinutes} min daily
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" /> {course.durationWeeks} weeks
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={chatHref}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-strong px-4 text-sm font-medium transition hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
              >
                <MessageSquareText className="h-4 w-4" aria-hidden="true" /> Ask tutor
              </Link>
              <Link
                href={practiceHref}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
              >
                Start practice <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <CourseLeaveButton
                slug={course.slug}
                courseName={titleCase(course.name)}
                redirectTo="/app/courses"
              />
            </div>
          </div>
        </header>

        <section className="grid gap-8 border-b border-border py-8 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="font-display text-xl font-semibold">Subjects in this course</h2>
            <p className="mt-2 text-sm text-text-secondary">
              These subjects are the indexed sources used by chat, practice, and exam generation.
            </p>
            {course.subjects.length ? (
              <div className="mt-5 divide-y divide-border border-y border-border">
                {course.subjects.map((subject, index) => (
                  <Link
                    key={subject.slug}
                    href={subjectHref(subject.slug)}
                    className="group flex min-h-20 items-center gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                  >
                    <span className="w-7 shrink-0 font-mono-ui text-xs text-text-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{titleCase(subject.name)}</span>
                      <span className="mt-1 block truncate text-sm text-text-muted">
                        Indexed teacher material
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-text-primary" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-5 border-y border-border py-8 text-sm text-text-secondary">
                This course has no connected subjects yet.
              </p>
            )}
          </div>

          <aside>
            <h2 className="font-display text-xl font-semibold">Course settings</h2>
            <dl className="mt-5 divide-y divide-border border-y border-border text-sm">
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-text-secondary">Diagnostic</dt>
                <dd className="font-medium">{course.diagnosticQuestionCount} questions</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-text-secondary">Pass target</dt>
                <dd className="font-medium">{course.passPercentage}%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-text-secondary">Level</dt>
                <dd className="font-medium">{course.level}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-text-secondary">Language</dt>
                <dd className="text-right font-medium">{course.languageModes.join(", ")}</dd>
              </div>
            </dl>
          </aside>
        </section>

        {course.outcomes.length ? (
          <section className="py-8">
            <h2 className="font-display text-xl font-semibold">What this course targets</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {course.outcomes.map((outcome) => (
                <li key={outcome} className="border-b border-border pb-3 text-sm leading-6 text-text-secondary">
                  {outcome}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
