"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ClassroomPreview = {
  name: string;
  subjectName: string;
  teacherHandle: string;
  memberCount: number;
  alreadyJoined: boolean;
};

/**
 * Confirmation step for a shared classroom link. The code is looked up first so
 * the student can see whose classroom and which subject it is before joining.
 */
export function JoinClassroomClient({ code }: { code: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<ClassroomPreview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/student/teacher-classrooms/join?code=${encodeURIComponent(code)}`,
          { headers: { Accept: "application/json" } },
        );
        const payload = (await response.json()) as { classroom?: ClassroomPreview; error?: string };
        if (!active) return;
        if (!response.ok || !payload.classroom) {
          throw new Error(payload.error || "That code does not work.");
        }

        setPreview(payload.classroom);
        setState("ready");
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "That code does not work.");
        setState("error");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [code]);

  async function confirmJoin() {
    setJoining(true);
    setError("");

    try {
      const response = await fetch("/api/student/teacher-classrooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not join the classroom.");

      router.replace("/app/today");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join the classroom.");
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[580px] px-4 py-14">
      <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
            Invitation
          </span>
          <span className="flex-1" />
          <span className="font-mono-ui text-[15px] tracking-[0.1em]">{code}</span>
        </div>

        {state === "loading" ? (
          <p className="mt-6 text-sm text-text-secondary">Checking that code…</p>
        ) : null}

        {state === "error" ? (
          <>
            <h1 className="mt-4 font-display text-2xl font-semibold">That code does not work</h1>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <div className="mt-6 flex gap-2">
              <Link href="/app/explore">
                <Button variant="outline">Back to subjects</Button>
              </Link>
            </div>
          </>
        ) : null}

        {state === "ready" && preview ? (
          <>
            <h1 className="mt-4 font-display text-2xl font-semibold">{preview.name}</h1>
            <p className="mt-2 text-sm text-text-secondary">
              {preview.teacherHandle ? `${preview.teacherHandle} · ` : ""}
              {preview.memberCount} student{preview.memberCount === 1 ? "" : "s"} already in
            </p>

            <hr className="my-5 border-border" />

            <p className="text-[13px] text-text-muted">Joining brings in this subject:</p>
            <p className="mt-2 rounded-[12px] border border-border px-4 py-3 text-sm font-medium">
              {preview.subjectName}
            </p>
            <p className="mt-3 text-[13px] text-text-muted">
              Your teacher&apos;s exams for this classroom will show up under Exams, and answers stay
              scoped to their material.
            </p>

            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Link href="/app/explore">
                <Button variant="ghost">Cancel</Button>
              </Link>
              {preview.alreadyJoined ? (
                <Link href="/app/today">
                  <Button>Already joined — go to Today</Button>
                </Link>
              ) : (
                <Button onClick={() => void confirmJoin()} disabled={joining}>
                  {joining ? "Joining…" : "Join this classroom"}
                </Button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
