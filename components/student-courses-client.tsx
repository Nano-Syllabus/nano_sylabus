"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { StudentCourse } from "@/lib/student-courses";
import type { TeacherCourse } from "@/lib/teacher-courses";

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
      <div className="mt-auto pt-6">
        <Link
          href={`/app/courses/${course.slug}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
        >
          Open study space <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function AvailableCourseCard({
  course,
  enrolling,
  onEnroll,
}: {
  course: TeacherCourse;
  enrolling: boolean;
  onEnroll: (course: TeacherCourse) => void;
}) {
  const isFree = course.accessModel === "free";

  return (
    <article className="flex min-h-60 flex-col rounded-lg border border-border bg-bg-primary p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          {course.category}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          {isFree ? "Free" : "Paid"}
        </span>
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold">{course.name}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">{course.tagline}</p>
      <p className="mt-5 inline-flex items-center gap-1.5 text-sm text-text-muted">
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        {course.subjects.length} subject{course.subjects.length === 1 ? "" : "s"}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
        <Link
          href={`/exams/${course.slug}`}
          className="inline-flex min-h-10 items-center rounded-full border border-border-strong px-4 text-sm font-medium transition hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
        >
          View course
        </Link>
        <Button
          type="button"
          onClick={() => onEnroll(course)}
          disabled={!isFree || enrolling}
        >
          {enrolling ? (
            <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Enrolling...</>
          ) : isFree ? (
            <>Enroll <ArrowRight className="h-4 w-4" aria-hidden="true" /></>
          ) : (
            "Paid access coming soon"
          )}
        </Button>
      </div>
    </article>
  );
}

export function StudentCoursesClient({
  courses,
  availableCourses,
}: {
  courses: StudentCourse[];
  availableCourses: TeacherCourse[];
}) {
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [enrollingSlug, setEnrollingSlug] = useState("");
  const [enrollError, setEnrollError] = useState("");

  async function enroll(course: TeacherCourse) {
    setEnrollingSlug(course.slug);
    setEnrollError("");
    try {
      const response = await fetch(`/api/student/courses/${encodeURIComponent(course.slug)}/enroll`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not enroll in this course.");
      router.push(`/app/courses/${encodeURIComponent(course.slug)}`);
      router.refresh();
    } catch (caught) {
      setEnrollError(caught instanceof Error ? caught.message : "Could not enroll in this course.");
      setEnrollingSlug("");
    }
  }

  async function joinWithCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter the code your teacher shared.");
      return;
    }

    setJoining(true);
    setJoinError("");
    try {
      const response = await fetch("/api/student/teacher-classrooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        course?: { slug?: string } | null;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not join with that code.");

      if (payload.course?.slug) {
        router.push(`/app/courses/${encodeURIComponent(payload.course.slug)}`);
      } else {
        router.refresh();
      }
      setJoinCode("");
      setJoinOpen(false);
    } catch (caught) {
      setJoinError(caught instanceof Error ? caught.message : "Could not join with that code.");
    } finally {
      setJoining(false);
    }
  }

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
        <div className="flex flex-wrap gap-2">
          {/* <Button type="button" variant="outline" onClick={() => setJoinOpen((value) => !value)}>
            <KeyRound className="h-4 w-4" aria-hidden="true" /> Join with a code
          </Button> */}
          <Link
            href="/exams"
            className="inline-flex min-h-10 items-center rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
          >
            Browse courses
          </Link>
        </div>
      </div>

      {/* joinOpen section commented out
      {joinOpen ? (
        <section className="border-b border-border py-6" aria-labelledby="join-course-title">
          <div className="max-w-xl">
            <h2 id="join-course-title" className="font-display text-lg font-semibold">
              Join a teacher course
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              A classroom code can also unlock the course connected to that class.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                value={joinCode}
                onChange={(event) => {
                  setJoinCode(event.target.value);
                  setJoinError("");
                }}
                className="uppercase sm:max-w-xs"
                placeholder="BEI-4K2M"
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="button" onClick={() => void joinWithCode()} disabled={joining}>
                {joining ? "Joining..." : "Join course"}
              </Button>
            </div>
            {joinError ? <p className="mt-2 text-sm text-destructive">{joinError}</p> : null}
          </div>
        </section>
      ) : null}
      */}

      {!courses.length ? (
        <section className="flex min-h-80 flex-col items-center justify-center border-b border-border py-16 text-center">
          <CheckCircle2 className="h-9 w-9 text-text-muted" aria-hidden="true" />
          <h2 className="mt-4 font-display text-xl font-semibold">Choose your first course</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-text-secondary">
            Enroll from the public course catalog, or use a code shared by your teacher.
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

      {availableCourses.length ? (
        <section className="border-t border-border py-8" aria-labelledby="available-courses-title">
          <div className="mb-5">
            <h2 id="available-courses-title" className="font-display text-xl font-semibold">
              Available courses
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Enroll to unlock every connected subject in Subjects, chat, practice, and exams.
            </p>
            {enrollError ? <p className="mt-2 text-sm text-destructive">{enrollError}</p> : null}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {availableCourses.map((course) => (
              <AvailableCourseCard
                key={course.id}
                course={course}
                enrolling={enrollingSlug === course.slug}
                onEnroll={(selectedCourse) => void enroll(selectedCourse)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
