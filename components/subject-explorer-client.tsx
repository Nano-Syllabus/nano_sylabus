"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  NANO_CATALOGUE,
  NANO_OWN_STUDY,
  NANO_STUDENT_SUBJECTS,
  type KnowledgeLevel,
  type NanoStudentSubject,
} from "@/lib/nano-student-subjects";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const button = `inline-flex min-h-10 items-center justify-center rounded-[10px] border px-4 text-sm font-medium transition ${focusRing}`;

function Dot({ level, label }: { level: KnowledgeLevel; label: string }) {
  const colour = {
    green: "bg-success",
    yellow: "bg-warning",
    red: "bg-destructive",
    grey: "bg-bg-tertiary",
  }[level];
  return <span role="img" aria-label={label} title={label} className={`h-2.5 w-2.5 shrink-0 rounded-full border border-border-strong/30 ${colour}`} />;
}

function SubjectCard({ subject }: { subject: NanoStudentSubject }) {
  const solid = subject.topics.filter((item) => item.level === "green").length;
  const overall = subject.topics.some((item) => item.level === "red")
    ? "red"
    : subject.topics.some((item) => item.level === "yellow")
      ? "yellow"
      : "green";

  return (
    <Link
      href={`/app/explore/${subject.slug}`}
      className={`flex flex-col gap-[7px] rounded-[14px] border bg-bg-primary px-4 py-[15px] text-left no-underline shadow-sm transition-transform hover:-translate-y-px hover:border-border-strong ${focusRing} ${subject.examLabel ? "border-border-strong shadow-[0_0_0_1px_var(--border-strong),var(--shadow)]" : "border-border"}`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-full border border-border bg-bg-primary px-2.5 py-1 text-xs text-text-secondary">
          {subject.code}
        </span>
        <span className="flex-1" />
        <Dot level={overall} label="Overall knowledge" />
      </div>
      <h2 className="font-display text-[16.5px] font-semibold leading-[1.28]">{subject.title}</h2>
      <p className="text-[13px] text-text-muted">{subject.teacher ? `Taught by ${subject.teacher}` : "Just for you"}</p>
      <div className="flex flex-wrap gap-1" aria-label="Chapter knowledge">
        {subject.topics.map((item) => (
          <Dot key={`${item.chapter}-${item.name}`} level={item.level} label={`${item.name}: ${item.level}`} />
        ))}
      </div>
      <p className="text-[13px] text-text-muted">{solid} of {subject.topics.length} chapters solid</p>
      <div className="mt-auto flex flex-wrap pt-[9px]">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${subject.examLabel ? "border-border-strong bg-text-primary text-text-inverse" : "border-border text-text-secondary"}`}>
          {subject.examLabel ?? "no exam coming"}
        </span>
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

type OwnSpace = Pick<NanoStudentSubject, "slug" | "title">;

export function SubjectExplorerClient() {
  const [tab, setTab] = useState<"course" | "own">("course");
  const [modal, setModal] = useState<"browse" | "join" | "space" | null>(null);
  const [ownSpaces, setOwnSpaces] = useState<OwnSpace[]>([]);
  const [spaceName, setSpaceName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [browseQuery, setBrowseQuery] = useState("");
  const [university, setUniversity] = useState("All");
  const [program, setProgram] = useState("All");
  const [joined, setJoined] = useState<string[]>([]);

  useEffect(() => {
    try {
      setOwnSpaces(JSON.parse(localStorage.getItem("nano:student-study-spaces") || "[]") as OwnSpace[]);
      setJoined(JSON.parse(localStorage.getItem("nano:joined-open-courses") || "[]") as string[]);
    } catch {
      setOwnSpaces([]);
      setJoined([]);
    }
  }, []);

  const ownSubjects = useMemo<NanoStudentSubject[]>(() => [
    NANO_OWN_STUDY,
    ...ownSpaces.map((space) => ({ ...NANO_OWN_STUDY, ...space, topics: [], blurb: "Private to you." })),
  ], [ownSpaces]);

  const catalogue = useMemo(() => {
    const query = browseQuery.trim().toLowerCase();
    return NANO_CATALOGUE.filter(([title, code, courseProgram, courseUniversity]) =>
      (university === "All" || university === courseUniversity) &&
      (program === "All" || program === courseProgram) &&
      (!query || `${title} ${code} ${courseProgram}`.toLowerCase().includes(query)),
    );
  }, [browseQuery, program, university]);

  function createSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = spaceName.trim() || "My study space";
    const next = [...ownSpaces, { title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `study-${Date.now()}` }];
    setOwnSpaces(next);
    localStorage.setItem("nano:student-study-spaces", JSON.stringify(next));
    setSpaceName("");
    setTab("own");
    setModal(null);
  }

  function useCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code !== "BEI-4K2M") {
      setJoinError("Nothing has that code. Check it and try again.");
      return;
    }
    setJoinError("");
    setModal(null);
  }

  function joinCourse(title: string) {
    const next = joined.includes(title) ? joined : [...joined, title];
    setJoined(next);
    localStorage.setItem("nano:joined-open-courses", JSON.stringify(next));
  }

  const visible = tab === "course" ? NANO_STUDENT_SUBJECTS : ownSubjects;

  return (
    <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.04em]">Subjects</h1>
        <span className="flex-1" />
        {tab === "own" ? (
          <button type="button" onClick={() => setModal("space")} className={`${button} border-border-strong bg-text-primary text-text-inverse hover:opacity-85`}>New study space</button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setModal("browse")} className={`${button} border-border bg-bg-primary text-text-primary hover:bg-bg-secondary`}>Browse courses</button>
            <button type="button" onClick={() => setModal("join")} className={`${button} border-border-strong bg-text-primary text-text-inverse hover:opacity-85`}>Join with a code</button>
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Subject type" className="mb-4 inline-flex w-full rounded-xl border border-border bg-bg-primary p-1 shadow-sm sm:w-auto">
        <button role="tab" aria-selected={tab === "course"} type="button" onClick={() => setTab("course")} className={`min-h-10 flex-1 rounded-[9px] px-5 text-sm transition sm:flex-none ${focusRing} ${tab === "course" ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary hover:bg-bg-secondary"}`}>My subjects <span className="ml-1.5 text-xs opacity-70">{NANO_STUDENT_SUBJECTS.length}</span></button>
        <button role="tab" aria-selected={tab === "own"} type="button" onClick={() => setTab("own")} className={`min-h-10 flex-1 rounded-[9px] px-5 text-sm transition sm:flex-none ${focusRing} ${tab === "own" ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary hover:bg-bg-secondary"}`}>My own study <span className="ml-1.5 text-xs opacity-70">{ownSubjects.length}</span></button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
        {visible.map((subject) => <SubjectCard key={subject.slug} subject={subject} />)}
      </div>

      {modal === "space" ? (
        <Modal title="Your own study space" onClose={() => setModal(null)} footer={null}>
          <form onSubmit={createSpace}>
            <label htmlFor="study-space-name" className="mb-1.5 block text-[13px] font-medium text-text-secondary">What shall we call it?</label>
            <input id="study-space-name" type="text" autoComplete="off" value={spaceName} onChange={(event) => setSpaceName(event.target.value)} placeholder="My physics revision" className={`h-11 w-full rounded-[10px] border border-border bg-bg-primary px-3 text-sm ${focusRing}`} />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>Cancel</button>
              <button type="submit" className={`${button} border-border-strong bg-text-primary text-text-inverse`}>Create it</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === "join" ? (
        <Modal title="Join with a code" onClose={() => { setModal(null); setJoinError(""); }} footer={null}>
          <form onSubmit={useCode}>
            <label htmlFor="join-code" className="mb-1.5 block text-[13px] font-medium text-text-secondary">Type the code you were given</label>
            <input id="join-code" type="text" autoComplete="off" spellCheck={false} value={joinCode} onChange={(event) => { setJoinCode(event.target.value.toUpperCase()); setJoinError(""); }} placeholder="BEI-4K2M" aria-invalid={joinError ? true : undefined} aria-describedby={joinError ? "join-code-error" : undefined} className={`h-12 w-full rounded-[10px] border border-border bg-bg-primary px-3 font-mono-ui text-lg uppercase tracking-[0.1em] ${focusRing}`} />
            {joinError ? <p id="join-code-error" className="mt-2 text-sm text-destructive">{joinError}</p> : null}
            <div className="mt-4 rounded-[14px] border border-border bg-bg-secondary p-5 text-[13px]">Your class code brings in every subject at once. A single subject or a single exam may have its own code.</div>
            <hr className="my-4 border-border" />
            <p className="text-[13px] text-text-muted">No code? There are courses anyone can join.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModal("browse")} className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>Browse courses</button>
              <button type="submit" className={`${button} border-border-strong bg-text-primary text-text-inverse`}>Go</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === "browse" ? (
        <Modal wide title="Courses anyone can join" onClose={() => setModal(null)} footer={<><button type="button" onClick={() => setModal(null)} className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>Close</button><button type="button" onClick={() => setModal("join")} className={`${button} border-border-strong bg-text-primary text-text-inverse`}>I have a code</button></>}>
          <p className="mb-3 text-[13px] text-text-muted">No code needed. You get the notes, the practice and the chapter map. Marks in an open course don&apos;t go on your college record.</p>
          <label htmlFor="browse-subjects" className="sr-only">Search by subject, code or programme</label>
          <input id="browse-subjects" type="search" value={browseQuery} onChange={(event) => setBrowseQuery(event.target.value)} placeholder="Search by subject, code or programme" className={`mb-3 h-11 w-full rounded-[10px] border border-border bg-bg-primary px-3 text-sm ${focusRing}`} />
          <div className="mb-2 flex flex-wrap items-center gap-1.5"><span className="w-[88px] text-[13px] text-text-muted">University</span>{["All", "Tribhuvan University", "Pokhara University", "Purbanchal University", "Kathmandu University"].map((item) => <button type="button" key={item} onClick={() => setUniversity(item)} className={`min-h-10 rounded-full border px-3 text-xs ${focusRing} ${university === item ? "border-border-strong bg-text-primary text-text-inverse" : "border-border bg-bg-primary text-text-secondary"}`}>{item === "All" ? item : item.replace(" University", "")}</button>)}</div>
          <div className="mb-4 flex flex-wrap items-center gap-1.5"><span className="w-[88px] text-[13px] text-text-muted">Program</span>{["All", ...new Set(NANO_CATALOGUE.map((item) => item[2]))].map((item) => <button type="button" key={item} onClick={() => setProgram(item)} className={`min-h-10 rounded-full border px-3 text-xs ${focusRing} ${program === item ? "border-border-strong bg-text-primary text-text-inverse" : "border-border bg-bg-primary text-text-secondary"}`}>{item}</button>)}</div>
          <p className="mb-3 text-[13px] text-text-muted">{catalogue.length} course{catalogue.length === 1 ? "" : "s"}</p>
          {catalogue.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">{catalogue.map(([title, code, courseProgram, courseUniversity, semester, learners]) => <article key={title} className="flex min-h-[190px] flex-col gap-2 rounded-[14px] border border-border bg-bg-primary p-4"><div className="flex items-center"><span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{code}</span><span className="flex-1"/><span className="text-[13px] text-text-muted">{learners} learners</span></div><h3 className="font-display text-[17px] font-semibold">{title}</h3><p className="text-[13px] text-text-muted">{courseProgram} · semester {semester}</p><p className="text-[13px] text-text-muted">{courseUniversity} · 3 chapters · Ram Karki</p><div className="mt-auto pt-2">{joined.includes(title) ? <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">already yours</span> : <button type="button" onClick={() => joinCourse(title)} className={`${button} min-h-9 border-border-strong bg-text-primary px-3 text-xs text-text-inverse`}>Join this course</button>}</div></article>)}</div> : <div className="rounded-[14px] border border-dashed border-border p-10 text-center text-text-muted"><b className="block font-display text-base text-text-primary">Nothing matches</b>Clear a filter, or ask your teacher for a code.</div>}
        </Modal>
      ) : null}
    </main>
  );
}
