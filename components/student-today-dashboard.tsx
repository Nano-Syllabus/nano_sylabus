"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const weakChapters = [
  { name: "de Broglie waves", chapter: "Modern physics" },
  { name: "Don't-care terms", chapter: "Combinational logic" },
  { name: "Lenz's law", chapter: "Induction" },
];

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "Student";
}

function chatHref(topic: string) {
  const params = new URLSearchParams({
    subject: "Engineering Physics I",
    prompt: `I have a doubt about ${topic}. Please help me understand it.`,
  });
  return `/app/chat?${params.toString()}`;
}

export function StudentTodayDashboard({
  fullName,
  subjectCount,
}: {
  fullName: string;
  subjectCount: number;
}) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const joinInputRef = useRef<HTMLInputElement>(null);
  const joinTriggerRef = useRef<HTMLButtonElement>(null);

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

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter the code your teacher shared.");
      return;
    }
    setJoinError("");
    setJoinMessage(`${code} is ready. Classroom joining will connect when classroom data is enabled.`);
  }

  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-[26px]">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-text-secondary">Today</p>
          <h1 className="mt-3 font-display text-[28px] font-semibold tracking-[-0.04em]">
            Good morning, {firstName(fullName)}
          </h1>
          <p className="mt-2 text-[15px] text-text-secondary">
            {subjectCount} subjects. 2 exams to sit.
          </p>
        </div>
        <button ref={joinTriggerRef} type="button" className="inline-flex min-h-10 w-fit items-center justify-center rounded-lg border border-border-strong px-4 text-sm font-medium transition hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2" onClick={() => setJoinOpen(true)}>
          Join with a code
        </button>
      </section>

      <section className="mt-5 flex flex-col gap-4 rounded-2xl bg-text-primary px-5 py-[22px] text-text-inverse sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="font-display text-[22px] font-semibold">Midterm exam</h2>
          <p className="mt-1 text-[13.5px] opacity-70">
            Engineering Physics I · Opens 10 Aug, 09:45 · 50 marks
          </p>
        </div>
        <Link href="/app/exams?exam=x_mid" className="inline-flex min-h-10 w-fit items-center justify-center rounded-[10px] border border-current/40 px-5 text-[15px] font-medium transition hover:bg-bg-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bg-primary">
          See what it covers
        </Link>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-[14px] border border-border p-4">
          <p className="text-[13px] text-text-muted">Your average so far</p>
          <p className="mt-3 font-display text-[32px] font-semibold leading-none">—</p>
          <p className="mt-4 text-[13px] text-text-muted">over 0 published results</p>
        </article>
        <article className="rounded-[14px] border border-border-strong p-4">
          <p className="text-[13px] text-text-muted">Chapters still red</p>
          <p className="mt-3 font-display text-[32px] font-semibold leading-none">6</p>
          <p className="mt-4 text-[13px] text-text-muted">across all your subjects</p>
        </article>
      </section>

      <section className="mt-[26px]">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="font-display text-lg font-semibold">Worth an hour today</h2>
          <p className="text-[13px] text-text-muted">your weakest chapters</p>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {weakChapters.map((topic) => (
            <article key={topic.name} className="rounded-[14px] border border-border-strong px-4 py-[15px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[13px] text-text-muted">
                  <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />
                  Struggling
                </p>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
                  {topic.chapter}
                </span>
              </div>
              <h3 className="mt-2 font-display text-[16.5px] font-semibold">{topic.name}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/app/exams?exam=x_mock&mode=sit" className="inline-flex min-h-10 items-center rounded-lg bg-text-primary px-3 text-[13px] font-medium text-text-inverse transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2">
                  Practise
                </Link>
                <Link href={chatHref(topic.name)} className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-[13px] font-medium transition hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2">
                  Ask a doubt
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-[26px]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold">Exams coming up</h2>
          <Link href="/app/exams" className="text-[13px] text-text-secondary underline-offset-4 hover:underline">All exams</Link>
        </div>
        <article className="mt-3 max-w-[300px] rounded-[14px] border border-border-strong px-4 py-[15px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">Engineering Physics I</span>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">practice</span>
          </div>
          <h3 className="mt-2 font-display text-[16.5px] font-semibold">My practice test 1</h3>
          <p className="mt-1 text-[13px] text-text-muted">20 marks · 60 minutes</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/app/exams?exam=x_mock&mode=sit" className="inline-flex min-h-10 items-center rounded-lg bg-text-primary px-3 text-[13px] font-medium text-text-inverse transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2">Start</Link>
            <span className="rounded-full border border-border px-2.5 py-2 text-xs text-text-secondary">Whenever you like</span>
          </div>
        </article>
      </section>

      {joinOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button type="button" tabIndex={-1} aria-label="Close join dialog" className="absolute inset-0 bg-black/45" onClick={closeJoin} />
          <div role="dialog" aria-modal="true" aria-labelledby="join-title" className="relative w-full max-w-md rounded-2xl border border-border bg-bg-primary p-6 shadow-xl">
            <h2 id="join-title" className="font-display text-2xl font-semibold">Join with a code</h2>
            <p className="mt-2 text-sm text-text-secondary">Enter the classroom code your teacher shared.</p>
            <form className="mt-6" onSubmit={submitJoin}>
              <label htmlFor="classroom-code" className="text-sm font-medium">Classroom code</label>
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
                placeholder="BEI-A81F"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={joinError ? "true" : undefined}
                aria-describedby={joinError ? "classroom-code-error" : joinMessage ? "classroom-code-message" : undefined}
              />
              {joinError ? <p id="classroom-code-error" className="mt-2 text-sm text-destructive">{joinError}</p> : null}
              {joinMessage ? <p id="classroom-code-message" className="mt-2 text-sm text-text-secondary">{joinMessage}</p> : null}
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeJoin}>Cancel</Button>
                <Button type="submit">Join</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
