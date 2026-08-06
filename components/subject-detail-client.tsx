"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StudentSubjectDetail } from "@/lib/data/student-subject";
import type { PracticeTopicStatus } from "@/lib/tenant/client";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const button = `inline-flex min-h-10 items-center justify-center rounded-[10px] border px-4 text-sm font-medium transition ${focusRing}`;

type PracticeTopic = {
  topic_key: string;
  title: string;
  blurb?: string;
  weight: number;
  qb_question_count: number;
};

/** A chapter with whatever the student has actually shown on it. */
type Chapter = PracticeTopic & {
  status: PracticeTopicStatus;
  percentage: number;
  attempts: number;
};

const STATUS_WORD: Record<PracticeTopicStatus, string> = {
  strong: "Solid",
  developing: "Getting there",
  weak: "Struggling",
  not_attempted: "Not started",
};

const STATUS_DOT: Record<PracticeTopicStatus, string> = {
  strong: "bg-emerald-600",
  developing: "bg-amber-500",
  weak: "bg-destructive",
  not_attempted: "bg-bg-tertiary",
};

function Dot({ status }: { status: PracticeTopicStatus }) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full border border-border-strong/30 ${STATUS_DOT[status]}`}
      aria-hidden="true"
    />
  );
}

function chatHref(subject: string, topic: string) {
  const params = new URLSearchParams({
    subject,
    prompt: `I have a doubt about ${topic}. Please help me understand it.`,
  });
  return `/app/chat?${params.toString()}`;
}

type Material = {
  name: string;
  shelf: string;
  path: string;
  indexed: boolean;
  documentId: string;
  sizeBytes: number;
};

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SubjectExam = {
  id: string;
  title: string;
  classroomName: string;
  totalMarks: number;
  submitted: boolean;
  score: number | null;
  outOf: number | null;
};

export function SubjectDetailClient({ detail }: { detail: StudentSubjectDetail }) {
  const [tab, setTab] = useState<"progress" | "exams" | "syllabus" | "material" | "bank">("progress");
  const [exams, setExams] = useState<SubjectExam[]>([]);
  const [examsState, setExamsState] = useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (tab !== "exams" || examsState !== "idle") return;

    let active = true;
    setExamsState("loading");

    const load = async () => {
      try {
        const response = await fetch("/api/student/teacher-exams", { headers: { Accept: "application/json" } });
        const payload = (await response.json()) as {
          assignments?: Array<{
            id: string;
            subjectName: string;
            classroomName: string;
            submitted?: boolean;
            grade?: { total_score?: number; total_marks?: number } | null;
            paper: { title: string; totalMarks: number };
          }>;
        };
        if (!active) return;

        setExams(
          (payload.assignments ?? [])
            .filter((item) => item.subjectName?.toLowerCase() === detail.name.toLowerCase())
            .map((item) => ({
              id: item.id,
              title: item.paper.title,
              classroomName: item.classroomName,
              totalMarks: item.paper.totalMarks,
              submitted: Boolean(item.submitted),
              score: item.grade?.total_score ?? null,
              outOf: item.grade?.total_marks ?? null,
            })),
        );
      } catch {
        // The tab simply shows nothing if the list cannot be loaded.
      } finally {
        if (active) setExamsState("ready");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [detail.name, examsState, tab]);
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [topicsState, setTopicsState] = useState<"loading" | "ready" | "error">("loading");
  const [topicsError, setTopicsError] = useState("");
  const [bankQuestions, setBankQuestions] = useState(0);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialState, setMaterialState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [materialError, setMaterialError] = useState("");

  useEffect(() => {
    if ((tab !== "material" && tab !== "bank") || materialState !== "idle") return;

    let active = true;
    setMaterialState("loading");

    const load = async () => {
      try {
        const response = await fetch(
          `/api/student/materials?subject=${encodeURIComponent(detail.name)}`,
          { headers: { Accept: "application/json" } },
        );
        const payload = (await response.json()) as { materials?: Material[]; error?: string };
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || "Could not load the material.");

        setMaterials(Array.isArray(payload.materials) ? payload.materials : []);
        setMaterialState("ready");
      } catch (error) {
        if (!active) return;
        setMaterialError(error instanceof Error ? error.message : "Could not load the material.");
        setMaterialState("error");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [detail.name, materialState, tab]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/student/practice/topics?subject=${encodeURIComponent(detail.name)}`,
          { headers: { Accept: "application/json" } },
        );
        const payload = (await response.json()) as {
          topics?: PracticeTopic[];
          questionBankQuestions?: number;
          error?: string;
        };
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || "Could not load the syllabus.");

        setTopics(Array.isArray(payload.topics) ? payload.topics : []);
        setBankQuestions(Number(payload.questionBankQuestions ?? 0));
        setTopicsState("ready");
      } catch (error) {
        if (!active) return;
        setTopicsError(error instanceof Error ? error.message : "Could not load the syllabus.");
        setTopicsState("error");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [detail.name]);

  // The chapter list comes from the syllabus; mastery only colours it in. A
  // chapter with no attempt stays "not started" rather than being guessed at.
  const chapters: Chapter[] = useMemo(() => {
    const masteryByTopic = new Map(detail.mastery.map((row) => [row.topicKey, row]));

    return topics.map((topic) => {
      const mastery = masteryByTopic.get(topic.topic_key);
      return {
        ...topic,
        status: mastery?.status ?? "not_attempted",
        percentage: mastery?.percentage ?? 0,
        attempts: mastery?.attempts ?? 0,
      };
    });
  }, [detail.mastery, topics]);

  const needsWork = useMemo(
    () =>
      chapters
        .filter((chapter) => chapter.status === "weak" || chapter.status === "developing")
        .sort((left, right) => left.percentage - right.percentage)
        .slice(0, 4),
    [chapters],
  );

  const attemptedCount = chapters.filter((chapter) => chapter.attempts > 0).length;

  // The prototype kept the question bank on its own tab; the teacher files it on
  // its own shelf, so the split is theirs, not ours.
  const isBankShelf = (shelf: string) => shelf.toLowerCase().includes("question");
  const notes = materials.filter((item) => !isBankShelf(item.shelf));
  const bankFiles = materials.filter((item) => isBankShelf(item.shelf));

  return (
    <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
      <p className="mb-4 text-[13px] text-text-muted">
        <Link href="/app/explore" className={`hover:underline ${focusRing}`}>
          Subjects
        </Link>{" "}
        / <b className="text-text-secondary">{detail.name}</b>
      </p>

      <div className="mb-7 flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3 font-mono-ui text-xs uppercase tracking-[0.12em] text-text-secondary">
            <span>{detail.providerName}</span>
          </div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.04em]">{detail.name}</h1>
          <p className="mt-3 text-sm text-text-secondary">
            {topicsState === "ready" ? `${chapters.length} chapters · ` : ""}
            {detail.documentCount} file{detail.documentCount === 1 ? "" : "s"}
            {attemptedCount ? ` · ${attemptedCount} attempted` : ""}
          </p>
        </div>
        <span className="flex-1" />
        <Link href={`/app/exams?subject=${encodeURIComponent(detail.name)}`} className={`${button} border-border-strong bg-text-primary text-text-inverse`}>
          Practise
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Subject sections"
        className="mb-[18px] flex gap-[3px] overflow-x-auto border-b border-border"
      >
        {(
          [
            ["progress", "My progress", undefined],
            ["exams", "Exams", examsState === "ready" ? exams.length : undefined],
            ["syllabus", "Syllabus", topicsState === "ready" ? chapters.length : undefined],
            ["material", "Material", materialState === "ready" ? notes.length : undefined],
            ["bank", "Question bank", bankQuestions || undefined],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            type="button"
            onClick={() => setTab(value)}
            className={`shrink-0 border-b-2 px-[14px] py-[10px] text-sm transition ${focusRing} ${
              tab === value
                ? "border-border-strong font-semibold text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            {label}
            {count !== undefined ? <span className="ml-1.5 text-xs opacity-65">{count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "exams" ? (
        <div>
          {examsState === "loading" ? (
            <p className="text-sm text-text-secondary">Loading exams…</p>
          ) : null}

          {examsState === "ready" && !exams.length ? (
            <div className="rounded-[14px] border border-border px-4 py-5">
              <p className="text-[15px] font-medium">No exams set for this subject</p>
              <p className="mt-1 text-[13px] text-text-muted">
                Anything {detail.providerName} assigns to your classroom shows up here.
              </p>
              <Link
                href={`/app/exams?subject=${encodeURIComponent(detail.name)}`}
                className={`${button} mt-4 border-border-strong bg-text-primary text-text-inverse`}
              >
                Practise instead
              </Link>
            </div>
          ) : null}

          {exams.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
              {exams.map((exam) => (
                <article key={exam.id} className="rounded-[14px] border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
                      {exam.classroomName}
                    </span>
                    <span className="flex-1" />
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
                      {exam.submitted ? "handed in" : "to sit"}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-[17px] font-semibold">{exam.title}</h3>
                  <p className="mt-1 text-[13px] text-text-muted">{exam.totalMarks} marks</p>
                  {exam.score !== null ? (
                    <p className="mt-3 font-display text-2xl font-semibold">
                      {exam.score}
                      <small className="ml-1 text-sm text-text-muted">of {exam.outOf}</small>
                    </p>
                  ) : null}
                  <Link href="/app/exams" className={`${button} mt-4 border-border bg-bg-primary`}>
                    Open in Exams
                  </Link>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "bank" ? (
        <div>
          {materialState === "idle" || materialState === "loading" ? (
            <p className="text-sm text-text-secondary">Loading the question bank…</p>
          ) : null}

          {topicsState === "ready" ? (
            <section className="rounded-[14px] border border-border p-4">
              <h2 className="font-display text-lg font-semibold">
                {bankQuestions} question{bankQuestions === 1 ? "" : "s"} in the bank
              </h2>
              <p className="mt-1 text-[13px] text-text-muted">
                How heavily each chapter is examined comes from these. Practice papers are drawn the
                same way.
              </p>
              <ul className="mt-4 space-y-2">
                {[...chapters]
                  .sort((left, right) => right.weight - left.weight)
                  .map((chapter) => (
                    <li key={chapter.topic_key} className="flex items-center gap-3 text-sm">
                      <Dot status={chapter.status} />
                      <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                      <span className="text-text-muted">{chapter.qb_question_count} q</span>
                      <span className="w-16 shrink-0 text-right text-xs text-text-muted">
                        {Math.round(chapter.weight * 100)}%
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          {materialState === "ready" && bankFiles.length ? (
            <section className="mt-3 rounded-[14px] border border-border p-4">
              <p className="font-mono-ui text-xs uppercase tracking-[0.12em] text-text-muted">
                Question bank files
              </p>
              <ul className="mt-3 space-y-2">
                {bankFiles.map((item) => (
                  <li key={item.path} className="flex flex-wrap items-center gap-2 text-sm">
                    {item.documentId ? (
                      <a
                        href={`/api/student/materials/${encodeURIComponent(item.documentId)}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`min-w-0 flex-1 truncate underline-offset-4 hover:underline ${focusRing}`}
                      >
                        {item.name}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    )}
                    {item.sizeBytes ? (
                      <span className="text-xs text-text-muted">{formatSize(item.sizeBytes)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {materialState === "ready" && !bankFiles.length ? (
            <p className="mt-3 text-[13px] text-text-muted">
              {detail.providerName} has not uploaded a question bank file for this subject.
            </p>
          ) : null}

          <div className="mt-4">
            <Link
              href={`/app/exams?subject=${encodeURIComponent(detail.name)}`}
              className={`${button} border-border-strong bg-text-primary text-text-inverse`}
            >
              Practise from this bank
            </Link>
          </div>
        </div>
      ) : null}

      {tab === "material" ? (
        <div>
          {materialState === "loading" ? (
            <p className="text-sm text-text-secondary">Loading the material…</p>
          ) : null}

          {materialState === "error" ? (
            <div className="rounded-[14px] border border-border p-4">
              <p className="text-sm font-medium">Could not load the material</p>
              <p className="mt-1 text-sm text-text-secondary">{materialError}</p>
            </div>
          ) : null}

          {materialState === "ready" && !notes.length ? (
            <p className="text-sm text-text-secondary">
              {detail.providerName} has not uploaded any files for this subject yet.
            </p>
          ) : null}

          {materialState === "ready" && notes.length ? (
            <div className="space-y-3">
              {Object.entries(
                notes.reduce<Record<string, Material[]>>((groups, item) => {
                  const shelf = item.shelf || "Files";
                  groups[shelf] = [...(groups[shelf] ?? []), item];
                  return groups;
                }, {}),
              ).map(([shelf, items]) => (
                <section key={shelf} className="rounded-[14px] border border-border p-4">
                  <p className="font-mono-ui text-xs uppercase tracking-[0.12em] text-text-muted">
                    {shelf}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {items.map((item) => (
                      <li key={item.path} className="flex flex-wrap items-center gap-2 text-sm">
                        {item.documentId ? (
                          <a
                            href={`/api/student/materials/${encodeURIComponent(item.documentId)}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`min-w-0 flex-1 truncate underline-offset-4 hover:underline ${focusRing}`}
                          >
                            {item.name}
                          </a>
                        ) : (
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        )}
                        {item.sizeBytes ? (
                          <span className="text-xs text-text-muted">{formatSize(item.sizeBytes)}</span>
                        ) : null}
                        <span className="text-xs text-text-muted">
                          {item.indexed ? "searchable" : "not indexed yet"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="text-[13px] text-text-muted">
                Uploaded by {detail.providerName}. Answers and practice questions are drawn from these
                files.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab !== "material" && tab !== "exams" && tab !== "bank" && topicsState === "loading" ? (
        <p className="text-sm text-text-secondary">Reading the syllabus…</p>
      ) : null}

      {tab !== "material" && tab !== "exams" && tab !== "bank" && topicsState === "error" ? (
        <div className="rounded-[14px] border border-border p-4">
          <p className="text-sm font-medium">Could not load the syllabus</p>
          <p className="mt-1 text-sm text-text-secondary">{topicsError}</p>
        </div>
      ) : null}

      {topicsState === "ready" && tab === "progress" ? (
        <>
          {!attemptedCount ? (
            <div className="mb-6 rounded-[14px] border border-border px-4 py-5">
              <p className="text-[15px] font-medium">Nothing measured yet</p>
              <p className="mt-1 text-[13px] text-text-muted">
                Sit a practice paper and each chapter below fills in with how you actually did.
              </p>
            </div>
          ) : null}

          <section className="mb-6 rounded-[14px] border border-border p-4">
            <h2 className="font-display text-lg font-semibold">Where you stand</h2>
            <ul className="mt-3 space-y-1">
              {(["strong", "developing", "weak", "not_attempted"] as const).map((status) => (
                <li
                  key={status}
                  className="flex items-center gap-2 border-b border-border-strong/10 py-2 text-sm last:border-b-0"
                >
                  <Dot status={status} />
                  <span className="flex-1">{STATUS_WORD[status]}</span>
                  <b>{chapters.filter((chapter) => chapter.status === status).length}</b>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-text-muted">
              Measured from the practice papers and exams you have sat in this subject.
            </p>
          </section>

          <section>
            <div className="mb-[11px] flex items-baseline gap-[10px]">
              <h2 className="font-display text-lg font-semibold">Every chapter</h2>
              <span className="text-[13px] text-text-muted">
                percentage is its share of the question bank
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
              {chapters.map((chapter) => (
                <article
                  key={chapter.topic_key}
                  className="rounded-[14px] border border-border bg-bg-primary p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Dot status={chapter.status} />
                    <span className="text-[13px] text-text-muted">{STATUS_WORD[chapter.status]}</span>
                    <span className="flex-1" />
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
                      {Math.round(chapter.weight * 100)}% of exam
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-[17px] font-semibold">{chapter.title}</h3>
                  <p className="mt-1 text-[13px] text-text-muted">
                    {chapter.attempts
                      ? `${Math.round(chapter.percentage * 100)}% over ${chapter.attempts} attempt${chapter.attempts === 1 ? "" : "s"}`
                      : `${chapter.qb_question_count} questions in the bank`}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/app/exams?subject=${encodeURIComponent(detail.name)}&topic=${encodeURIComponent(chapter.topic_key)}`}
                      className={`${button} min-h-9 border-border-strong bg-text-primary px-3 text-xs text-text-inverse`}
                    >
                      Practise
                    </Link>
                    <Link
                      href={chatHref(detail.name, chapter.title)}
                      className={`${button} min-h-9 border-border bg-bg-primary px-3 text-xs`}
                    >
                      Ask a doubt
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {needsWork.length ? (
            <section className="mt-8">
              <div className="mb-[11px] flex items-baseline gap-[10px]">
                <h2 className="font-display text-lg font-semibold">Needs work</h2>
                <span className="text-[13px] text-text-muted">
                  weakest {needsWork.length} chapter{needsWork.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
                {needsWork.map((chapter) => (
                  <article
                    key={chapter.topic_key}
                    className="rounded-[14px] border border-border-strong bg-bg-primary p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Dot status={chapter.status} />
                      <span className="text-[13px] text-text-muted">{STATUS_WORD[chapter.status]}</span>
                      <span className="flex-1" />
                      <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
                        {Math.round(chapter.percentage * 100)}%
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-[17px] font-semibold">{chapter.title}</h3>
                    <div className="mt-4 flex gap-2">
                      <Link
                        href={`/app/exams?subject=${encodeURIComponent(detail.name)}&topic=${encodeURIComponent(chapter.topic_key)}`}
                        className={`${button} min-h-9 border-border-strong bg-text-primary px-3 text-xs text-text-inverse`}
                      >
                        Practise
                      </Link>
                      <Link
                        href={chatHref(detail.name, chapter.title)}
                        className={`${button} min-h-9 border-border bg-bg-primary px-3 text-xs`}
                      >
                        Ask a doubt
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {topicsState === "ready" && tab === "syllabus" ? (
        <div className="space-y-3">
          {chapters.map((chapter, index) => (
            <section key={chapter.topic_key} className="rounded-[14px] border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono-ui text-xs text-text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-[17px] font-semibold">{chapter.title}</h3>
                <span className="flex-1" />
                <Dot status={chapter.status} />
                <span className="text-[13px] text-text-muted">{STATUS_WORD[chapter.status]}</span>
              </div>
              {chapter.blurb ? (
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{chapter.blurb}</p>
              ) : null}
            </section>
          ))}
          {!chapters.length ? (
            <p className="text-sm text-text-secondary">
              No syllabus has been indexed for this subject yet.
            </p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
