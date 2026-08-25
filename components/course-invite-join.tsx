"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Clock3, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

type CourseInviteJoinProps = {
  code: string;
  course: {
    slug: string;
    name: string;
    description: string;
    category: string;
    level: string;
    durationWeeks: number;
    dailyMinutes: number;
    subjectNames: string[];
    teacherName: string;
  };
  signedIn: boolean;
  alreadyJoined: boolean;
  isCreator: boolean;
};

export function CourseInviteJoin({
  code,
  course,
  signedIn,
  alreadyJoined,
  isCreator,
}: CourseInviteJoinProps) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const returnPath = `/join/course/${encodeURIComponent(code)}`;

  async function joinCourse() {
    setJoining(true);
    setError("");
    try {
      const response = await fetch(`/api/student/course-invites/${encodeURIComponent(code)}/join`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not join this course.");
      router.replace(`/app/courses/${encodeURIComponent(course.slug)}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join this course.");
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[calc(100vh-72px)] w-full max-w-6xl place-items-center px-4 py-12 sm:px-6">
      <section className="grid w-full overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-sm lg:grid-cols-[1.35fr_0.65fr]">
        <div className="p-6 sm:p-9 lg:p-12">
          <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium text-text-secondary">
            <LockKeyhole className="size-3.5" aria-hidden="true" /> Private course invitation
          </span>
          <p className="mt-7 text-sm text-text-secondary">
            {course.category} · {course.level}
          </p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {course.name}
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-text-secondary">
            {course.description}
          </p>

          <dl className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <dt className="flex items-center gap-2 text-xs text-text-muted">
                <BookOpen className="size-4" aria-hidden="true" /> Subjects
              </dt>
              <dd className="mt-2 font-display text-xl font-semibold">
                {course.subjectNames.length}
              </dd>
            </div>
            <div className="rounded-lg border border-border p-4">
              <dt className="flex items-center gap-2 text-xs text-text-muted">
                <CalendarDays className="size-4" aria-hidden="true" /> Study plan
              </dt>
              <dd className="mt-2 font-display text-xl font-semibold">
                {course.durationWeeks} weeks
              </dd>
            </div>
            <div className="rounded-lg border border-border p-4">
              <dt className="flex items-center gap-2 text-xs text-text-muted">
                <Clock3 className="size-4" aria-hidden="true" /> Daily target
              </dt>
              <dd className="mt-2 font-display text-xl font-semibold">{course.dailyMinutes} min</dd>
            </div>
          </dl>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-xs uppercase tracking-widest text-text-muted">Included subjects</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {course.subjectNames.map((subject) => (
                <span
                  key={subject}
                  className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-sm text-text-secondary"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
        </div>

        <aside className="border-t border-border bg-bg-secondary p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-10">
          <p className="text-xs uppercase tracking-widest text-text-muted">Invited by</p>
          <p className="mt-2 font-display text-xl font-semibold">{course.teacherName}</p>
          <p className="mt-5 text-sm leading-6 text-text-secondary">
            Joining creates a regular enrollment. Every subject and indexed course source becomes
            available in your study space, chat, practice, and exams.
          </p>

          {error ? (
            <p
              className="mt-5 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-7 space-y-3">
            {isCreator ? (
              <>
                <p className="text-sm text-text-secondary">
                  You created this course, so you do not need to enroll in it.
                </p>
                <Link href="/teachers" className="block">
                  <Button className="w-full">Manage course</Button>
                </Link>
              </>
            ) : alreadyJoined ? (
              <Link href={`/app/courses/${encodeURIComponent(course.slug)}`} className="block">
                <Button className="w-full">
                  Open course <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </Link>
            ) : signedIn ? (
              <Button
                className="w-full"
                onClick={() => void joinCourse()}
                disabled={joining}
                aria-busy={joining}
              >
                {joining ? "Joining…" : "Join course"}
                {!joining ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
              </Button>
            ) : (
              <>
                <Link href={`/login?next=${encodeURIComponent(returnPath)}`} className="block">
                  <Button className="w-full">Log in to join</Button>
                </Link>
                <Link href={`/signup?next=${encodeURIComponent(returnPath)}`} className="block">
                  <Button className="w-full" variant="outline">
                    Create account
                  </Button>
                </Link>
              </>
            )}
          </div>
          <p className="mt-5 break-all font-mono-ui text-[11px] text-text-muted">
            Invite code: {code}
          </p>
        </aside>
      </section>
    </main>
  );
}
