"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CourseInviteCodeEntry({
  id = "private-course-code",
  compact = false,
}: {
  id?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const errorId = `${id}-error`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{16,64}$/.test(normalized)) {
      setError("Enter the full invite code shared by your course creator.");
      inputRef.current?.focus();
      return;
    }
    setError("");
    router.push(`/join/course/${encodeURIComponent(normalized)}`);
  }

  return (
    <form
      className={cn(compact && "grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end")}
      onSubmit={submit}
      noValidate
    >
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          Course invite code
        </label>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (error) setError("");
          }}
          className="mt-2 min-h-11 w-full rounded-lg border border-border bg-bg-primary px-4 font-mono-ui text-sm uppercase tracking-wider text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
          placeholder="PASTE INVITE CODE"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        {error ? (
          <p id={errorId} className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Button className={cn(!compact && "mt-5 w-full", compact && "sm:min-w-28")} type="submit">
        {compact ? "Join" : "Review invitation"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}

export function CourseInviteCodeForm() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-72px)] w-full max-w-xl place-items-center px-4 py-12 sm:px-6">
      <section className="w-full rounded-2xl border border-border bg-bg-primary p-6 shadow-sm sm:p-9">
        <div className="grid size-11 place-items-center rounded-full border border-border bg-bg-secondary">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">
          Join a private course
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Paste the invitation code your course creator shared. You will review the course before
          joining.
        </p>

        <div className="mt-7">
          <CourseInviteCodeEntry />
        </div>
      </section>
    </main>
  );
}
