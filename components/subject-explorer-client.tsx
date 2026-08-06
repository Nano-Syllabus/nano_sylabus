"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { SubjectExplorerSummary } from "@/lib/types";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const button = `inline-flex min-h-10 items-center justify-center rounded-[10px] border px-4 text-sm font-medium transition ${focusRing}`;

/** One teacher's published shelf, as /api/tenant/catalog returns it. */
type PublishedProvider = {
  namespace: string;
  providerName: string;
  subjects: Array<{
    name: string;
    slug: string;
    documentCount: number;
    unitCount: number;
  }>;
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

function SubjectCard({ subject }: { subject: SubjectExplorerSummary }) {
  const level = subjectLevel(subject);
  const slug = slugify(subject.subject);

  return (
    <Link
      href={`/app/explore/${slug}`}
      className={`flex flex-col gap-[7px] rounded-[14px] border bg-bg-primary px-4 py-[15px] text-left no-underline shadow-sm transition-transform hover:-translate-y-px hover:border-border-strong ${focusRing} ${subject.inProfile ? "border-border-strong shadow-[0_0_0_1px_var(--border-strong),var(--shadow)]" : "border-border"}`}
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
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${subject.inProfile ? "border-border-strong bg-text-primary text-text-inverse" : "border-border text-text-secondary"}`}>
          {subject.inProfile ? "in your profile" : formatLastActivity(subject.lastActivityAt)}
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

export function SubjectExplorerClient({
  subjects,
}: {
  subjects: SubjectExplorerSummary[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"join" | "browse" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [joining, setJoining] = useState(false);
  const [providers, setProviders] = useState<PublishedProvider[]>([]);
  const [browseState, setBrowseState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [browseError, setBrowseError] = useState("");
  const [addingSubject, setAddingSubject] = useState("");
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseProvider, setBrowseProvider] = useState("");

  useEffect(() => {
    if (modal !== "browse" || browseState !== "idle") return;

    let active = true;
    setBrowseState("loading");

    const load = async () => {
      try {
        const response = await fetch("/api/tenant/catalog", { cache: "no-store" });
        const payload = (await response.json()) as { providers?: PublishedProvider[]; error?: string };
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || "Could not load published courses.");

        setProviders(Array.isArray(payload.providers) ? payload.providers : []);
        setBrowseState("ready");
      } catch (error) {
        if (!active) return;
        setBrowseError(error instanceof Error ? error.message : "Could not load published courses.");
        setBrowseState("error");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [browseState, modal]);

  async function addSubject(name: string) {
    setAddingSubject(name);
    setBrowseError("");

    try {
      const response = await fetch("/api/student/profile/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ subject: name, action: "add" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not add that subject.");

      setModal(null);
      router.refresh();
    } catch (error) {
      setBrowseError(error instanceof Error ? error.message : "Could not add that subject.");
    } finally {
      setAddingSubject("");
    }
  }

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

  const visible = useMemo(() => subjects, [subjects]);

  const visibleProviders = useMemo(() => {
    const needle = browseQuery.trim().toLowerCase();

    return providers
      .filter((provider) => !browseProvider || provider.namespace === browseProvider)
      .map((provider) => ({
        ...provider,
        subjects: needle
          ? provider.subjects.filter(
              (subject) =>
                subject.name.toLowerCase().includes(needle) ||
                provider.providerName.toLowerCase().includes(needle),
            )
          : provider.subjects,
      }))
      .filter((provider) => provider.subjects.length);
  }, [browseProvider, browseQuery, providers]);

  return (
    <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.04em]">Subjects</h1>
        <span className="flex-1" />
        <button type="button" onClick={() => setModal("browse")} className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>Browse courses</button>
        <button type="button" onClick={() => setModal("join")} className={`${button} border-border-strong bg-text-primary text-text-inverse hover:opacity-85`}>Join with a code</button>
      </div>

      <p className="mb-4 text-sm text-text-secondary">
        Your subjects, and the chapters and papers behind them, come from the teachers who published them.
      </p>

      {visible.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
          {visible.map((subject) => <SubjectCard key={subject.subject} subject={subject} />)}
        </div>
      ) : (
        <section className="rounded-[18px] border border-dashed border-border px-6 py-16 text-center">
          <h2 className="font-display text-xl font-semibold">No real subjects yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
            Join a teacher classroom with a code, or complete your profile subjects. We are not showing static demo subjects here.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setModal("join")} className={`${button} border-border-strong bg-text-primary text-text-inverse`}>Join with a code</button>
            <button type="button" onClick={() => setModal("browse")} className={`${button} border-border bg-bg-primary`}>Browse courses</button>
          </div>
        </section>
      )}

      {modal === "browse" ? (
        <Modal title="Courses anyone can join" onClose={() => setModal(null)} footer={null}>
          {browseState === "loading" ? (
            <p className="text-sm text-text-secondary">Loading published courses…</p>
          ) : null}

          {browseState === "error" ? (
            <p className="text-sm text-destructive">{browseError}</p>
          ) : null}

          {browseState === "ready" && !providers.length ? (
            <p className="text-sm text-text-secondary">No teacher has published a course yet.</p>
          ) : null}

          {browseState === "ready" && providers.length ? (
            <div className="mb-5 flex flex-wrap gap-2">
              <input
                type="search"
                value={browseQuery}
                onChange={(event) => setBrowseQuery(event.target.value)}
                placeholder="Search a subject or teacher"
                className={`h-10 min-w-[200px] flex-1 rounded-[10px] border border-border bg-bg-primary px-3 text-sm ${focusRing}`}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setBrowseProvider("")}
                  className={`inline-flex min-h-10 items-center rounded-full border px-3 text-[13px] ${!browseProvider ? "border-border-strong bg-text-primary text-text-inverse" : "border-border text-text-secondary"}`}
                >
                  All teachers
                </button>
                {providers.map((provider) => (
                  <button
                    key={provider.namespace}
                    type="button"
                    onClick={() => setBrowseProvider(provider.namespace)}
                    className={`inline-flex min-h-10 items-center rounded-full border px-3 text-[13px] ${browseProvider === provider.namespace ? "border-border-strong bg-text-primary text-text-inverse" : "border-border text-text-secondary"}`}
                  >
                    {provider.providerName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {browseState === "ready" ? (
            <div className="space-y-5">
              {visibleProviders.map((provider) => (
                <section key={provider.namespace}>
                  <p className="font-mono-ui text-xs uppercase tracking-[0.12em] text-text-muted">
                    {provider.providerName}
                  </p>
                  <div className="mt-2 space-y-2">
                    {provider.subjects.map((item) => {
                      const already = subjects.some(
                        (subject) => subject.subject.toLowerCase() === item.name.toLowerCase(),
                      );
                      return (
                        <div
                          key={item.slug}
                          className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{item.name}</p>
                            <p className="mt-0.5 text-[13px] text-text-muted">
                              {item.documentCount} file{item.documentCount === 1 ? "" : "s"} · {item.unitCount} unit
                              {item.unitCount === 1 ? "" : "s"}
                            </p>
                          </div>
                          {already ? (
                            <span className="text-[13px] text-text-muted">Added</span>
                          ) : (
                            <button
                              type="button"
                              className={`${button} border-border-strong bg-text-primary text-text-inverse`}
                              disabled={addingSubject === item.name}
                              onClick={() => void addSubject(item.name)}
                            >
                              {addingSubject === item.name ? "Adding…" : "Add"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
              {browseError ? <p className="text-sm text-destructive">{browseError}</p> : null}
            </div>
          ) : null}
        </Modal>
      ) : null}

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
    </main>
  );
}
