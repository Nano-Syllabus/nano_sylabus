"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Classroom = {
  id: string;
  name: string;
  subjectName: string;
  joinCode: string;
  examCount: number;
  memberCount: number;
  archived: boolean;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2";
const button = `inline-flex min-h-10 items-center justify-center rounded-[10px] border px-4 text-sm font-medium transition ${focusRing}`;

function ClassroomCard({ classroom }: { classroom: Classroom }) {
  return (
    <article className="rounded-[14px] border border-border bg-bg-primary p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          {classroom.subjectName}
        </span>
        <span className="flex-1" />
        <span className="text-[13px] text-text-muted">
          {classroom.memberCount} student{classroom.memberCount === 1 ? "" : "s"}
        </span>
      </div>
      <h2 className="mt-3 font-display text-[17px] font-semibold">{classroom.name}</h2>
      <p className="mt-1 text-[13px] text-text-muted">
        {classroom.examCount} exam{classroom.examCount === 1 ? "" : "s"} set
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/app/exams" className={`${button} border-border-strong bg-text-primary text-text-inverse`}>
          See exams
        </Link>
        <Link
          href={`/app/explore/${encodeURIComponent(classroom.subjectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))}`}
          className={`${button} border-border bg-bg-primary`}
        >
          Subject
        </Link>
      </div>
    </article>
  );
}

export function StudentClassroomsClient() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/student/classrooms", { headers: { Accept: "application/json" } });
        const payload = (await response.json()) as { classrooms?: Classroom[]; error?: string };
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || "Could not load your classrooms.");

        setClassrooms(Array.isArray(payload.classrooms) ? payload.classrooms : []);
        setState("ready");
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load your classrooms.");
        setState("error");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const active = classrooms.filter((classroom) => !classroom.archived);
  const earlier = classrooms.filter((classroom) => classroom.archived);

  return (
    <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.04em]">Classrooms</h1>
        <span className="flex-1" />
        {/* <Link href="/app/explore" className={`${button} border-border-strong bg-text-primary text-text-inverse`}>
          Join with a code
        </Link> */}
      </div>

      {state === "loading" ? <p className="text-sm text-text-secondary">Loading your classrooms…</p> : null}

      {state === "error" ? (
        <div className="rounded-[14px] border border-border p-4">
          <p className="text-sm font-medium">Could not load your classrooms</p>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
        </div>
      ) : null}

      {state === "ready" && !classrooms.length ? (
        <section className="rounded-[18px] border border-dashed border-border px-6 py-16 text-center">
          <h2 className="font-display text-xl font-semibold">No classrooms yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
            When your teacher adds you to a classroom, it will appear here.
          </p>
        </section>
      ) : null}

      {active.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
          {active.map((classroom) => (
            <ClassroomCard key={classroom.id} classroom={classroom} />
          ))}
        </div>
      ) : null}

      {earlier.length ? (
        <>
          <p className="mt-8 font-mono-ui text-xs uppercase tracking-[0.12em] text-text-muted">
            Earlier classrooms
          </p>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3 opacity-70">
            {earlier.map((classroom) => (
              <ClassroomCard key={classroom.id} classroom={classroom} />
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}
