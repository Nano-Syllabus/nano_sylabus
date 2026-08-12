"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { SubjectExplorerSummary } from "@/lib/types";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const button = `inline-flex min-h-10 items-center justify-center rounded-[10px] border px-4 text-sm font-medium transition ${focusRing}`;

type EnrolledCourseGroup = {
  slug: string;
  name: string;
  subjects: Array<{ slug: string; name: string }>;
};

type SubjectLevel = "green" | "yellow" | "red" | "grey";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function subjectLevel(subject: SubjectExplorerSummary): SubjectLevel {
  if (subject.questionCount >= 10) return "green";
  if (subject.questionCount > 0 || subject.sessionCount > 0) return "yellow";
  return "grey";
}

function formatLastActivity(value: string | null) {
  if (!value) return "No study activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent activity";
  return `Last asked ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
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

function SubjectCard({ subject, courseName }: { subject: SubjectExplorerSummary; courseName: string }) {
  const level = subjectLevel(subject);

  return (
    <Link
      href={`/app/explore/${encodeURIComponent(subject.slug)}`}
      className={`flex flex-col gap-[7px] rounded-lg border border-border bg-bg-primary px-4 py-[15px] text-left no-underline shadow-sm transition-transform hover:-translate-y-px hover:border-border-strong ${focusRing}`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-full border border-border bg-bg-primary px-2.5 py-1 text-xs text-text-secondary">
          {subject.category}
        </span>
        <span className="flex-1" />
        <Dot level={level} label="Study activity" />
      </div>
      <h2 className="font-display text-[16.5px] font-semibold leading-[1.28]">{subject.subject}</h2>
      <p className="text-[13px] text-text-muted">{subject.board} · {subject.grade}</p>
      <p className="text-[13px] text-text-muted">
        {subject.questionCount} question{subject.questionCount === 1 ? "" : "s"} asked · {subject.sessionCount} chat{subject.sessionCount === 1 ? "" : "s"}
      </p>
      <div className="mt-auto flex flex-wrap pt-[9px]">
        <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          {courseName}
        </span>
        <span className="ml-2 text-xs text-text-muted">{formatLastActivity(subject.lastActivityAt)}</span>
      </div>
    </Link>
  );
}

function Modal({ title, wide = false, children, footer, onClose }: { title: string; wide?: boolean; children: ReactNode; footer: ReactNode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-5" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="subject-modal-title" className={`max-h-[86vh] w-full overflow-y-auto rounded-2xl border border-border bg-bg-primary shadow-xl ${wide ? "max-w-5xl" : "max-w-xl"}`}>
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <h2 id="subject-modal-title" className="font-display text-xl font-semibold">{title}</h2>
          <span className="flex-1" />
          <button ref={closeRef} type="button" onClick={onClose} className={`${button} border-border bg-bg-primary text-text-primary hover:bg-bg-secondary`}>Close</button>
        </header>
        <div className="px-5 py-5">{children}</div>
        {footer ? <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-bg-primary px-5 py-4">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function SubjectExplorerClient({
  subjects,
  courses,
}: {
  subjects: SubjectExplorerSummary[];
  courses: EnrolledCourseGroup[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"join" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    if (!modal) {
      setJoinCode("");
      setJoinError("");
      setJoinMessage("");
    }
  }, [modal]);

  async function useCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter the code your teacher shared.");
      return;
    }

    setJoining(true);
    setJoinError("");
    setJoinMessage("");

    // Confirm on the join page, which names the classroom and its subject first.
    router.push(`/app/join/${encodeURIComponent(code)}`);
  }

  return (
    <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.04em]">Subjects</h1>
        <span className="flex-1" />
        <Link href="/exams" className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>Browse courses</Link>
        {/* <button type="button" onClick={() => setModal("join")} className={`${button} border-border-strong bg-text-primary text-text-inverse hover:opacity-85`}>Join with a code</button> */}
      </div>

      <p className="mb-4 text-sm text-text-secondary">
        Only subjects included in your enrolled courses appear here. Open one for its materials, chats, and practice tools.
      </p>

      {courses.length ? (
        <div className="space-y-8">
          {courses.map((course) => {
            const subjectKeys = new Set(
              course.subjects.flatMap((subject) => [slugify(subject.slug), slugify(subject.name)]),
            );
            const courseSubjects = subjects.filter((subject) =>
              subjectKeys.has(slugify(subject.slug)) || subjectKeys.has(slugify(subject.subject)),
            );

            return (
              <section key={course.slug}>
                <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-border pb-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-semibold">{course.name}</h2>
                    <p className="mt-0.5 text-sm text-text-muted">
                      {courseSubjects.length} subject{courseSubjects.length === 1 ? "" : "s"} included
                    </p>
                  </div>
                  <Link href={`/app/courses/${encodeURIComponent(course.slug)}`} className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>
                    Open course
                  </Link>
                </div>
                {courseSubjects.length ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
                    {courseSubjects.map((subject) => (
                      <SubjectCard key={`${course.slug}-${subject.slug}`} subject={subject} courseName={course.name} />
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
      ) : (
        <section className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h2 className="font-display text-xl font-semibold">No enrolled subjects yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
            Enroll in a published course to unlock all of its subjects here.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {/* <button type="button" onClick={() => setModal("join")} className={`${button} border-border-strong bg-text-primary text-text-inverse`}>Join with a code</button> */}
            <Link href="/exams" className={`${button} border-border bg-bg-primary`}>Browse courses</Link>
          </div>
        </section>
      )}

      {/* join modal commented out
      {modal === "join" ? (
        <Modal title="Join with a code" onClose={() => { setModal(null); setJoinError(""); }} footer={null}>
          <form onSubmit={useCode}>
            <label htmlFor="join-code" className="mb-1.5 block text-[13px] font-medium text-text-secondary">Type the code you were given</label>
            <input id="join-code" type="text" autoComplete="off" spellCheck={false} value={joinCode} onChange={(event) => { setJoinCode(event.target.value.toUpperCase()); setJoinError(""); }} placeholder="BEI-4K2M" aria-invalid={joinError ? true : undefined} aria-describedby={joinError ? "join-code-error" : undefined} className={`h-12 w-full rounded-[10px] border border-border bg-bg-primary px-3 font-mono-ui text-lg uppercase tracking-[0.1em] ${focusRing}`} />
            {joinError ? <p id="join-code-error" className="mt-2 text-sm text-destructive">{joinError}</p> : null}
            {joinMessage ? <p className="mt-2 text-sm text-success">{joinMessage}</p> : null}
            <div className="mt-4 rounded-[14px] border border-border bg-bg-secondary p-5 text-[13px]">Your class code connects to a real teacher classroom and saves your membership in the database.</div>
            <hr className="my-4 border-border" />
            <p className="text-[13px] text-text-muted">No code? Ask your teacher for the classroom code.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>Cancel</button>
              <button type="submit" disabled={joining} className={`${button} border-border-strong bg-text-primary text-text-inverse disabled:cursor-not-allowed disabled:opacity-60`}>{joining ? "Joining..." : "Join"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
      */}
    </main>
  );
}
