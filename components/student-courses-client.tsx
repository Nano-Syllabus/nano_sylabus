"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";
import { CourseLeaveButton } from "@/components/course-leave-button";
import type { StudentCourse } from "@/lib/student-courses";

function enrollmentDate(value: string) {
  if (!value) return "Recently enrolled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently enrolled";
  return `Enrolled ${new Intl.DateTimeFormat("en-NP", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)}`;
}

function CourseCard({ course }: { course: StudentCourse }) {
  return (
    <article className="flex min-h-64 flex-col rounded-lg border border-border bg-bg-primary p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          {course.category}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          {course.enrollmentStatus === "completed" ? "Completed" : "Active"}
        </span>
      </div>
      <h2 className="mt-4 font-display text-xl font-semibold">{course.name}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">{course.tagline}</p>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          {course.subjects.length} subject{course.subjects.length === 1 ? "" : "s"}
        </span>
        <span>{course.dailyMinutes} min daily</span>
      </div>
      <p className="mt-2 text-xs text-text-muted">{enrollmentDate(course.enrolledAt)}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
        <Link
          href={`/app/courses/${course.slug}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
        >
          Open study space <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <CourseLeaveButton slug={course.slug} courseName={course.name} />
      </div>
    </article>
  );
}

export function StudentCoursesClient({
  courses,
}: {
  courses: StudentCourse[];
}) {
  return (
    <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
      <div className="flex flex-wrap items-start gap-4 border-b border-border pb-6">
        <div>
          <p className="text-sm text-text-secondary">Courses</p>
          <h1 className="mt-2 font-display text-[28px] font-semibold">My courses</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Each course keeps its subjects, practice, exams, and progress together.
          </p>
        </div>
        <span className="flex-1" />
        <Link
          href="/exams"
          className="inline-flex min-h-10 items-center rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
        >
          Browse courses
        </Link>
      </div>

      {!courses.length ? (
        <section className="flex min-h-80 flex-col items-center justify-center border-b border-border py-16 text-center">
          <CheckCircle2 className="h-9 w-9 text-text-muted" aria-hidden="true" />
          <h2 className="mt-4 font-display text-xl font-semibold">Choose your first course</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-text-secondary">
            Enroll from the public course catalog. Courses you leave can be added again from there.
          </p>
          <Link
            href="/exams"
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
          >
            Browse courses <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <section className="py-6" aria-label="Enrolled courses">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
