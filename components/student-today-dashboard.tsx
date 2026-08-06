"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { StudentToday, TodayChapter, TodayExam } from "@/lib/data/student-today";
import { countAnswered, readSavedSitting, type SavedSitting } from "@/lib/practice-sitting";

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "Student";
}

function chatHref(topic: string, subject: string) {
  const params = new URLSearchParams({
    subject,
    prompt: `I have a doubt about ${topic}. Please help me understand it.`,
  });
  return `/app/chat?${params.toString()}`;
}

function practiceHref(subject: string, topicKey?: string) {
  const params = new URLSearchParams({ subject });
  if (topicKey) params.set("topic", topicKey);
  return `/app/exams?${params.toString()}`;
}

const STATUS_LABEL: Record<TodayChapter["status"], string> = {
  weak: "Struggling",
  developing: "Getting there",
  strong: "Solid",
  not_attempted: "Not started",
};

const STATUS_DOT: Record<TodayChapter["status"], string> = {
  weak: "bg-destructive",
  developing: "bg-amber-500",
  strong: "bg-emerald-600",
  not_attempted: "bg-border-strong",
};

function ExamCard({ exam, compact = false }: { exam: TodayExam; compact?: boolean }) {
  return (
    <article
      className={`rounded-[14px] border border-border-strong px-4 py-[15px] ${compact ? "max-w-[300px]" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          {exam.subjectName}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          {exam.classroomName}
        </span>
      </div>
      <h3 className="mt-2 font-display text-[16.5px] font-semibold">{exam.title}</h3>
      <p className="mt-1 text-[13px] text-text-muted">
        {exam.totalMarks ? `${exam.totalMarks} marks · ` : ""}
        {exam.windowLabel}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {exam.windowState === "open" && exam.canAttempt ? (
          <Link
            href={`/app/exams?exam=teacher_${exam.assignmentId}&mode=sit`}
            className="inline-flex min-h-10 items-center rounded-lg bg-text-primary px-3 text-[13px] font-medium text-text-inverse transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
          >
            Start
          </Link>
        ) : (
          <Link
            href="/app/exams"
            className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-[13px] font-medium transition hover:bg-bg-secondary"
          >
            See what it covers
          </Link>
        )}
      </div>
    </article>
  );
}

export function StudentTodayDashboard({
  fullName,
  today,
}: {
  fullName: string;
  today: StudentToday;
}) {
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [joining, setJoining] = useState(false);
  const joinInputRef = useRef<HTMLInputElement>(null);
  const joinTriggerRef = useRef<HTMLButtonElement>(null);

  const firstSubject = today.subjects[0] ?? "";
  // An unfinished sitting outranks everything else in the hero, the way it did
  // in the prototype — half a paper is the most urgent thing on the page.
  const [sitting, setSitting] = useState<SavedSitting | null>(null);

  useEffect(() => {
    setSitting(readSavedSitting());
  }, []);

  useEffect(() => {
    if (!joinOpen) return;
    joinInputRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setJoinOpen(false);
        joinTriggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [joinOpen]);

  function closeJoin() {
    setJoinOpen(false);
    setJoinError("");
    joinTriggerRef.current?.focus();
  }

  async function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter the code your teacher shared.");
      return;
    }

    setJoining(true);
    setJoinError("");
    setJoinMessage("");

    // The confirm page shows whose classroom and which subject this is before
    // anything is joined.
    router.push(`/app/join/${encodeURIComponent(code)}`);
  }

  const subjectLine = `${today.subjectCount} subject${today.subjectCount === 1 ? "" : "s"}. ${
    today.examsToSit
      ? `${today.examsToSit} exam${today.examsToSit === 1 ? "" : "s"} to sit.`
      : "Nothing due right now."
  }`;

  const topWeak = today.weakestChapters[0];

  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-[26px]">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-text-secondary">Today</p>
          <h1 className="mt-3 font-display text-[28px] font-semibold tracking-[-0.04em]">
            Good morning, {firstName(fullName)}
          </h1>
          <p className="mt-2 text-[15px] text-text-secondary">{subjectLine}</p>
        </div>
        <button
          ref={joinTriggerRef}
          type="button"
          className="inline-flex min-h-10 w-fit items-center justify-center rounded-lg border border-border-strong px-4 text-sm font-medium transition hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
          onClick={() => setJoinOpen(true)}
        >
          Join with a code
        </button>
      </section>

      {/* Hero mirrors the three states: an exam waiting, else the weakest
          chapter, else nothing to do yet. */}
      <section className="mt-5 flex flex-col gap-4 rounded-2xl bg-text-primary px-5 py-[22px] text-text-inverse sm:flex-row sm:items-center sm:justify-between sm:px-6">
        {sitting ? (
          <>
            <div>
              <h2 className="font-display text-[22px] font-semibold">{sitting.exam.title}</h2>
              <p className="mt-1 text-[13.5px] opacity-70">
                Half done · {countAnswered(sitting.answers)} of {sitting.exam.questions.length} answered ·{" "}
                {Math.max(0, Math.round((sitting.deadline - Date.now()) / 60000))} min left
              </p>
            </div>
            <Link
              href={`/app/exams?exam=${sitting.exam.id}&mode=sit`}
              className="inline-flex min-h-10 w-fit items-center justify-center rounded-[10px] border border-current/40 px-5 text-[15px] font-medium transition hover:bg-bg-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bg-primary"
            >
              Carry on
            </Link>
          </>
        ) : today.nextExam ? (
          <>
            <div>
              <h2 className="font-display text-[22px] font-semibold">{today.nextExam.title}</h2>
              <p className="mt-1 text-[13.5px] opacity-70">
                {today.nextExam.subjectName} · {today.nextExam.windowLabel}
                {today.nextExam.totalMarks ? ` · ${today.nextExam.totalMarks} marks` : ""}
              </p>
            </div>
            <Link
              href={
                today.nextExam.windowState === "open"
                  ? `/app/exams?exam=teacher_${today.nextExam.assignmentId}&mode=sit`
                  : "/app/exams"
              }
              className="inline-flex min-h-10 w-fit items-center justify-center rounded-[10px] border border-current/40 px-5 text-[15px] font-medium transition hover:bg-bg-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bg-primary"
            >
              {today.nextExam.windowState === "open" ? "Start" : "See what it covers"}
            </Link>
          </>
        ) : topWeak ? (
          <>
            <div>
              <h2 className="font-display text-[22px] font-semibold">
                Nothing due. {topWeak.topicTitle} is your weakest chapter.
              </h2>
              <p className="mt-1 text-[13.5px] opacity-70">
                {topWeak.subjectName} · you keep losing marks here
              </p>
            </div>
            <Link
              href={practiceHref(topWeak.subjectName, topWeak.topicKey)}
              className="inline-flex min-h-10 w-fit items-center justify-center rounded-[10px] border border-current/40 px-5 text-[15px] font-medium transition hover:bg-bg-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bg-primary"
            >
              Practise it
            </Link>
          </>
        ) : (
          <>
            <div>
              <h2 className="font-display text-[22px] font-semibold">All quiet</h2>
              <p className="mt-1 text-[13.5px] opacity-70">
                {today.subjectCount
                  ? "Sit a practice paper and your weak chapters will show up here."
                  : "Join a subject with the code your teacher gave you."}
              </p>
            </div>
            {today.subjectCount ? (
              <Link
                href={practiceHref(firstSubject)}
                className="inline-flex min-h-10 w-fit items-center justify-center rounded-[10px] border border-current/40 px-5 text-[15px] font-medium transition hover:bg-bg-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bg-primary"
              >
                Practise
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setJoinOpen(true)}
                className="inline-flex min-h-10 w-fit items-center justify-center rounded-[10px] border border-current/40 px-5 text-[15px] font-medium transition hover:bg-bg-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bg-primary"
              >
                Join with a code
              </button>
            )}
          </>
        )}
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-[14px] border border-border p-4">
          <p className="text-[13px] text-text-muted">Your average so far</p>
          <p className="mt-3 font-display text-[32px] font-semibold leading-none">
            {today.averagePercentage === null
              ? "—"
              : `${Math.round(today.averagePercentage * 100)}%`}
          </p>
          <p className="mt-4 text-[13px] text-text-muted">
            over {today.publishedResultCount} graded result
            {today.publishedResultCount === 1 ? "" : "s"}
          </p>
        </article>
        <article className="rounded-[14px] border border-border-strong p-4">
          <p className="text-[13px] text-text-muted">Chapters still red</p>
          <p className="mt-3 font-display text-[32px] font-semibold leading-none">
            {today.hasMasteryData ? today.chaptersStillRed : "—"}
          </p>
          <p className="mt-4 text-[13px] text-text-muted">
            {today.hasMasteryData
              ? "across all your subjects"
              : "sit a paper and this fills in"}
          </p>
        </article>
      </section>

      <section className="mt-[26px]">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="font-display text-lg font-semibold">Worth an hour today</h2>
          <p className="text-[13px] text-text-muted">your weakest chapters</p>
        </div>

        {today.weakestChapters.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {today.weakestChapters.map((topic) => (
              <article
                key={`${topic.subjectName}-${topic.topicKey}`}
                className="rounded-[14px] border border-border-strong px-4 py-[15px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-[13px] text-text-muted">
                    <span
                      className={`h-2 w-2 rounded-full ${STATUS_DOT[topic.status]}`}
                      aria-hidden="true"
                    />
                    {STATUS_LABEL[topic.status]}
                  </p>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
                    {topic.subjectName}
                  </span>
                </div>
                <h3 className="mt-2 font-display text-[16.5px] font-semibold">{topic.topicTitle}</h3>
                <p className="mt-1 text-[13px] text-text-muted">
                  {Math.round(topic.percentage * 100)}% over {topic.attempts} attempt
                  {topic.attempts === 1 ? "" : "s"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={practiceHref(topic.subjectName, topic.topicKey)}
                    className="inline-flex min-h-10 items-center rounded-lg bg-text-primary px-3 text-[13px] font-medium text-text-inverse transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
                  >
                    Practise
                  </Link>
                  <Link
                    href={chatHref(topic.topicTitle, topic.subjectName)}
                    className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-[13px] font-medium transition hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
                  >
                    Ask a doubt
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[14px] border border-border px-4 py-5">
            <p className="text-[15px] font-medium">No weak chapters yet</p>
            <p className="mt-1 text-[13px] text-text-muted">
              {today.hasMasteryData
                ? "Nothing is red right now. Keep going."
                : "Sit a practice paper and the chapters you lose marks in will appear here."}
            </p>
            {firstSubject ? (
              <Link
                href={practiceHref(firstSubject)}
                className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-text-primary px-3 text-[13px] font-medium text-text-inverse transition hover:opacity-85"
              >
                Practise {firstSubject}
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {today.upcomingExams.length ? (
        <section className="mt-[26px]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-semibold">Exams coming up</h2>
            <Link
              href="/app/exams"
              className="text-[13px] text-text-secondary underline-offset-4 hover:underline"
            >
              All exams
            </Link>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {today.upcomingExams.map((exam) => (
              <ExamCard key={exam.assignmentId} exam={exam} />
            ))}
          </div>
        </section>
      ) : null}

      {joinOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close join dialog"
            className="absolute inset-0 bg-black/45"
            onClick={closeJoin}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-title"
            className="relative w-full max-w-md rounded-2xl border border-border bg-bg-primary p-6 shadow-xl"
          >
            <h2 id="join-title" className="font-display text-2xl font-semibold">
              Join with a code
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Your class code brings in the subject your teacher is running.
            </p>
            <form className="mt-6" onSubmit={submitJoin}>
              <label htmlFor="classroom-code" className="text-sm font-medium">
                Classroom code
              </label>
              <input
                ref={joinInputRef}
                id="classroom-code"
                type="text"
                className="mt-2 block h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm uppercase text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                value={joinCode}
                onChange={(event) => {
                  setJoinCode(event.target.value);
                  setJoinError("");
                  setJoinMessage("");
                }}
                placeholder="BEI-4K2M"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={joinError ? "true" : undefined}
                aria-describedby={
                  joinError ? "classroom-code-error" : joinMessage ? "classroom-code-message" : undefined
                }
              />
              {joinError ? (
                <p id="classroom-code-error" className="mt-2 text-sm text-destructive">
                  {joinError}
                </p>
              ) : null}
              {joinMessage ? (
                <p id="classroom-code-message" className="mt-2 text-sm text-text-secondary">
                  {joinMessage}
                </p>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeJoin}>
                  {joinMessage ? "Done" : "Cancel"}
                </Button>
                <Button type="submit" disabled={joining}>
                  {joining ? "Joining…" : "Join"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
