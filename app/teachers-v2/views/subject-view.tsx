"use client";

import { useCallback, useEffect, useMemo, useState, FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { subjectAccessLabel } from "@/lib/teacher-subject-access";
import { cn, titleCase } from "@/lib/utils";
import {
  ApiRecord,
  WorkspaceState,
  SubjectTab,
  Shelf,
  TeacherSubject,
  TeacherDocument,
  Workspace,
  SyllabusUnit,
  SyllabusState,
  ChatMessage,
  interactive,
  asRecord,
  text,
  numberValue,
  list,
  responsePayload,
  SkeletonCard,
} from "@/app/teachers-v2/workspace-shared";
import {
  SubjectInsights,
  inputClass,
  sourceTreeFolderPaths,
  bytesLabel,
  fullDate,
  StatusChip,
  namedItems,
  insightName,
} from "@/app/teachers-v2/views/workspace-view-shared";

export function SubjectsView({
  workspace,
  onCreate,
  onOpen,
  onCollectionOverview,
}: {
  workspace: Workspace;
  onCreate: () => void;
  onOpen: (subject: TeacherSubject) => void;
  onCollectionOverview: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            Teacher collection
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Reusable subject library</h1>
          <p className="mt-2 text-text-secondary">
            Your saved subjects and source files. Attach them to a community from its semester list.
          </p>
        </div>
        <span className="flex-1" />
        <Button onClick={onCreate}>Create subject</Button>
      </div>

      {workspace.subjects.length ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspace.subjects.map((subject) => {
            const documents = workspace.documents.filter(
              (document) =>
                document.path === subject.folderPath ||
                document.path.startsWith(`${subject.folderPath}/`),
            );
            const missing = !documents.some((document) => document.shelf === "Syllabus")
              ? "Add a syllabus"
              : !documents.some((document) => document.shelf === "Notes")
                ? "Add study material"
                : !documents.some((document) => document.shelf === "Question Bank")
                  ? "Add past papers"
                  : "Ready for teaching";
            return (
              <button
                key={subject.slug}
                type="button"
                onClick={() => onOpen(subject)}
                className={cn(
                  "min-h-44 rounded-lg border border-border p-5 text-left transition hover:border-border-strong",
                  interactive,
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      subject.communities.length || subject.visibility === "public"
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-border bg-bg-secondary text-text-secondary",
                    )}
                  >
                    {subjectAccessLabel(subject.communities, subject.visibility)}
                  </span>
                  {subject.code ? (
                    <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs">
                      {subject.code}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border px-3 py-1 font-mono text-xs">
                    {documents.length} files
                  </span>
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold">
                  {titleCase(subject.name)}
                </h2>
                {subject.communities.length ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Shared in{" "}
                    {subject.communities.map((community) => titleCase(community.name)).join(", ")}
                  </p>
                ) : null}
                {subject.programme || subject.university ? (
                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {[subject.programme, subject.university].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-text-muted">{missing}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <section className="mt-8 rounded-lg border border-dashed border-border p-10 text-center">
          <h2 className="font-display text-xl font-semibold">No subjects created yet</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Create your first subject, then add its syllabus and material. Add it to a community
            semester to make it available to that community&apos;s members.
          </p>
          <Button className="mt-5" onClick={onCreate}>
            Create first subject
          </Button>
        </section>
      )}
    </>
  );
}

export function SubjectView({
  subject,
  documents,
  sourceTree,
  tab,
  onTab,
  onBack,
  onUpload,
  onCreateFolder,
  onDocument,
  onIndexDocument,
  indexingNames,
  syllabus,
  setSyllabus,
  chat,
  setChat,
  onSubjectRemoved,
}: {
  subject: TeacherSubject;
  documents: TeacherDocument[];
  sourceTree: ApiRecord;
  tab: SubjectTab;
  onTab: (tab: SubjectTab) => void;
  onBack: () => void;
  onUpload: (shelf: Shelf) => void;
  onCreateFolder: (shelf: Shelf) => void;
  onDocument: (document: TeacherDocument) => void;
  onIndexDocument: (document: TeacherDocument) => Promise<void>;
  indexingNames: Set<string>;
  syllabus: SyllabusState;
  setSyllabus: (next: SyllabusState) => void;
  chat: ChatMessage[];
  setChat: (next: ChatMessage[]) => void;
  onSubjectRemoved: (message: string) => void;
}) {
  const tabs: [SubjectTab, string, number | null][] = [
    ["overview", "Overview", null],
    ["syllabus", "Syllabus", documents.filter((document) => document.shelf === "Syllabus").length],
    ["material", "Material", documents.filter((document) => document.shelf === "Notes").length],
    [
      "bank",
      "Question bank",
      documents.filter((document) => document.shelf === "Question Bank").length,
    ],
    ["source-search", "Search sources", null],
    ["test-chat", "Test chat", null],
    ["config", "Config", null],
  ];
  const shelf = tab === "syllabus" ? "Syllabus" : tab === "material" ? "Notes" : "Question Bank";
  const chapterFolders = sourceTreeFolderPaths(sourceTree, subject, shelf);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className={cn("min-h-10 text-sm text-text-secondary hover:text-text-primary", interactive)}
      >
        ← Subjects
      </button>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{titleCase(subject.name)}</h1>
          <p className="mt-2 text-text-secondary">{documents.length} source files</p>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Subject workspace"
        className="mt-8 flex gap-2 overflow-x-auto border-b border-border"
      >
        {tabs.map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => onTab(value)}
            className={cn(
              "min-h-12 shrink-0 border-b-2 px-4 text-sm font-medium",
              interactive,
              tab === value
                ? "border-text-primary text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary",
            )}
          >
            {label}
            {count !== null ? ` ${count}` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <SubjectIntelligence subject={subject} />
      ) : tab === "test-chat" ? (
        <TestChat subject={subject} messages={chat} setMessages={setChat} syllabus={syllabus} />
      ) : tab === "source-search" ? (
        <SourceSearch subject={subject} />
      ) : tab === "config" ? (
        <SubjectConfig
          subject={subject}
          documentCount={documents.length}
          onRemoved={onSubjectRemoved}
        />
      ) : (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => onUpload(shelf)}>
              {tab === "syllabus"
                ? "Upload syllabus"
                : tab === "material"
                  ? "Add material"
                  : "Add past paper"}
            </Button>
          </div>
          {chapterFolders.length ? (
            <div className="mt-4 flex flex-wrap gap-2" aria-label={`${shelf} chapter folders`}>
              {chapterFolders.map((path) => (
                <span
                  key={path}
                  className="rounded-full border border-border bg-bg-primary px-3 py-2 font-mono text-xs text-text-secondary"
                >
                  {path.slice(`${subject.folderPath}/${shelf}/`.length)}
                </span>
              ))}
            </div>
          ) : null}
          <DocumentList
            documents={documents.filter((document) => document.shelf === shelf)}
            onIndex={onIndexDocument}
            indexingNames={indexingNames}
            emptyTitle={
              tab === "syllabus"
                ? "No syllabus file yet"
                : tab === "material"
                  ? "No study material yet"
                  : "No past papers yet"
            }
            onUpload={() => onUpload(shelf)}
            onOpen={onDocument}
          />
          {tab === "syllabus" ? (
            <SyllabusEditor subject={subject} syllabus={syllabus} setSyllabus={setSyllabus} />
          ) : null}
        </div>
      )}
    </>
  );
}

export function metricLabel(value: number) {
  if (Math.abs(value) < 1000) return value.toLocaleString();
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(value)
    .toLowerCase();
}

export function captureKindLabel(kind: string) {
  return (
    (
      {
        syllabus: "Syllabus",
        notes: "Notes",
        question_bank: "Question Bank",
        answer_key: "Answer Key",
      } as Record<string, string>
    )[kind] || kind.replaceAll("_", " ")
  );
}

export function stringItems(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

export function SubjectIntelligence({ subject }: { subject: TeacherSubject }) {
  const [state, setState] = useState<WorkspaceState>("loading");
  const [data, setData] = useState<SubjectInsights | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setState("loading");
      setError("");
      try {
        const payload = await responsePayload(
          await fetch(
            `/api/teacher/subjects/${encodeURIComponent(subject.slug)}/insights${refresh ? "?refresh=1" : ""}`,
            { headers: { Accept: "application/json" }, cache: "no-store" },
          ),
        );
        setData({
          readiness: asRecord(payload.readiness),
          capture: asRecord(payload.capture),
          weightage: asRecord(payload.weightage),
          topics: asRecord(payload.topics),
          chapters: asRecord(payload.chapters),
          usage: asRecord(payload.usage),
          partialErrors: asRecord(payload.partialErrors) as Record<string, string>,
        });
        setState("ready");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load subject intelligence.");
        setState("error");
      } finally {
        setRefreshing(false);
      }
    },
    [subject.slug],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonCard key={index} lines={2} className="h-36" />
        ))}
      </div>
    );
  }
  if (state === "error" || !data) {
    return (
      <div className="mt-6 rounded-lg border border-destructive/30 p-5">
        <h2 className="font-display text-xl font-semibold">Couldn&apos;t inspect this subject</h2>
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const readiness = data.readiness;
  const capture = data.capture;
  const weightage = data.weightage;
  const usage = data.usage;
  const topicItems = namedItems(data.topics, ["topics", "chapters", "items"]);
  const chapterItems = namedItems(data.chapters, ["chapters", "items"]);
  const topics = topicItems.length ? topicItems : chapterItems;
  const bands = namedItems(weightage, ["bands", "suggested_bands", "distribution"]);
  const checks = namedItems(readiness, ["checks", "requirements", "actions"]);
  const units = namedItems(readiness, ["units", "chapters"]);
  const ready = readiness.ready === true || readiness.publishable === true;
  const coverage = namedItems(capture, ["coverage", "shelves", "kinds"]);
  const misfiled = namedItems(capture, ["misfiled", "misfiled_documents"]);
  const notesCoverage = numberValue(readiness.notes_coverage);
  const bankCoverage = numberValue(readiness.bank_coverage);
  const unitCount = numberValue(readiness.unit_count) || units.length;
  const usageRows = namedItems(usage, ["by_endpoint", "endpoints", "breakdown"]);
  const totalTokens = numberValue(usage.total_tokens || asRecord(usage.totals).total_tokens);
  const promptTokens = numberValue(
    usage.prompt_tokens ||
      usage.input_tokens ||
      asRecord(usage.totals).prompt_tokens ||
      asRecord(usage.totals).input_tokens,
  );
  const completionTokens = numberValue(
    usage.completion_tokens ||
      usage.output_tokens ||
      asRecord(usage.totals).completion_tokens ||
      asRecord(usage.totals).output_tokens,
  );
  const calls = numberValue(usage.calls || asRecord(usage.totals).calls);
  const partialErrors = Object.entries(data.partialErrors).filter(
    ([, message]) => typeof message === "string" && message,
  );

  return (
    <section className="mt-6" aria-labelledby="subject-intelligence-title">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="subject-intelligence-title" className="font-display text-2xl font-semibold">
            Subject intelligence
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Live checks from the teacher collection—not guesses from filenames.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh syllabus map"}
        </Button>
      </div>

      {partialErrors.length ? (
        <div className="mt-5 rounded-lg border border-warning/40 p-4">
          <p className="font-medium">Some checks are temporarily unavailable</p>
          <ul className="mt-2 space-y-1 text-sm text-text-secondary">
            {partialErrors.map(([name, message]) => (
              <li key={name}>
                <span className="font-medium capitalize">{name}:</span> {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <article className="mt-5 rounded-lg border border-border p-5">
        <h3 className="font-display text-xl font-semibold">What was captured</h3>
        {coverage.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {coverage.map((item, index) => {
              const kind = text(item.kind || item.name) || `shelf-${index}`;
              return (
                <div key={kind} className="rounded-lg border border-border bg-bg-secondary p-4">
                  <p className="text-xs uppercase tracking-wider text-text-muted">
                    {captureKindLabel(kind)}
                  </p>
                  <p className="mt-3 font-display text-xl font-semibold">
                    {numberValue(item.documents || item.document_count).toLocaleString()} docs
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {numberValue(item.chunks || item.chunk_count).toLocaleString()} sections
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-muted">No shelf-level capture data was returned.</p>
        )}

        {misfiled.length ? (
          <div className="mt-4 rounded-lg border border-warning/40 p-4">
            <p className="font-medium text-warning">Files may be on the wrong shelf</p>
            <ul className="mt-2 space-y-1 text-sm text-text-secondary">
              {misfiled.map((item, index) => (
                <li key={index}>
                  {text(item.path) || text(item.name) || `Misfiled item ${index + 1}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>

      <article className="mt-5 rounded-lg border border-border p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-semibold">Ready for the marketplace?</h3>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-2 text-sm font-medium",
              ready ? "border-success/30 text-success" : "border-warning/40 text-warning",
            )}
          >
            {ready ? "Ready to publish" : "Not published"}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-text-secondary">
          {text(readiness.summary) ||
            text(readiness.message) ||
            (ready
              ? "This subject is publishable."
              : "Complete the checks below before publishing.")}
        </p>

        {checks.length ? (
          <div className="mt-4 space-y-3">
            {checks.map((check, index) => {
              const ok = check.ok === true || check.passed === true;
              return (
                <div
                  key={text(check.id) || index}
                  className={cn(
                    "rounded-lg border p-4",
                    ok ? "border-success/30" : "border-warning/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn("mt-0.5 font-semibold", ok ? "text-success" : "text-warning")}
                      aria-hidden="true"
                    >
                      {ok ? "✓" : "×"}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {text(check.detail) || insightName(check) || `Readiness check ${index + 1}`}
                      </p>
                      {text(check.remedy || check.action || check.message) ? (
                        <p className="mt-1 text-sm leading-6 text-text-secondary">
                          {text(check.remedy || check.action || check.message)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-muted">No readiness checks were returned.</p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Units", unitCount],
            ["With notes", `${notesCoverage}%`],
            ["With past questions", `${bankCoverage}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-bg-secondary p-4">
              <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
              <p className="mt-2 font-display text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {units.length ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-border">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-bg-secondary text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="w-2/5 px-5 py-3.5 text-left font-medium">Unit</th>
                  <th className="w-1/5 px-5 py-3.5 text-center font-medium">Notes</th>
                  <th className="w-1/5 px-5 py-3.5 text-center font-medium">Past questions</th>
                  <th className="w-1/5 px-5 py-3.5 text-center font-medium">Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {units.map((unit, index) => {
                  const notes = numberValue(unit.notes_chunks || unit.notes);
                  const questions = numberValue(unit.bank_questions || unit.past_questions);
                  const marks = numberValue(unit.bank_marks || unit.marks);
                  return (
                    <tr
                      key={`${text(unit.number)}-${insightName(unit)}-${index}`}
                      className="transition-colors hover:bg-bg-secondary/40"
                    >
                      <td className="w-2/5 truncate px-5 py-3.5 font-medium text-text-primary">
                        {[text(unit.number), insightName(unit)].filter(Boolean).join(" ") ||
                          `Unit ${index + 1}`}
                      </td>
                      <td className="w-1/5 px-5 py-3.5 text-center font-mono text-xs text-text-secondary">
                        {notes}
                      </td>
                      <td className="w-1/5 px-5 py-3.5 text-center font-mono text-xs text-text-secondary">
                        {questions}
                      </td>
                      <td className="w-1/5 px-5 py-3.5 text-center font-mono text-xs text-text-secondary">
                        {marks || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center">
            <p className="font-medium">No syllabus units yet</p>
            <p className="mt-2 text-sm text-text-secondary">
              Upload and index a syllabus to build the unit coverage map.
            </p>
          </div>
        )}
      </article>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <article className="flex flex-col justify-between rounded-lg border border-border p-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">This collection key</p>
            <h3 className="mt-2 font-display text-xl font-semibold">Token spend</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Every AI call made for asking, generating, grading, and parsing is recorded for this
              teacher collection only.
            </p>
            <p className="mt-4 font-display text-2xl font-semibold">
              {metricLabel(totalTokens)} total
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Calls", calls],
              ["Prompt", metricLabel(promptTokens)],
              ["Completion", metricLabel(completionTokens)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-bg-secondary p-4">
                <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
                <p className="mt-2 font-display text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="flex flex-col rounded-lg border border-border p-5">
          <h3 className="font-display text-xl font-semibold">Exam weightage</h3>
          <p className="mt-2 text-sm text-text-secondary">
            The grounded paper generator can use this measured mix.
          </p>
          {bands.length ? (
            <div className="mt-4 space-y-3">
              {bands.map((band, index) => {
                const label = insightName(band) || `Band ${index + 1}`;
                const count = numberValue(band.count || band.question_count);
                const marks = numberValue(band.marks_each || band.marks);
                return (
                  <div
                    key={`${label}-${index}`}
                    className="flex items-center gap-3 rounded-lg bg-bg-secondary p-3"
                  >
                    <span className="min-w-0 flex-1 font-medium">{label}</span>
                    <span className="text-sm text-text-secondary">
                      {count ? `${count} × ` : ""}
                      {marks ? `${marks} marks` : "Suggested"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-sm text-text-muted">
              No measured bands yet. Upload marked past papers to Question Bank.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

export function SourceSearch({ subject }: { subject: TeacherSubject }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; where: string; content: string; score: number | null }[]
  >([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = query.trim();
    if (!clean) {
      setError("Describe what you want to find.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/query", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: clean, subjectSlug: subject.slug, topK: 8 }),
        }),
      );
      setResults(
        list(payload.results).map((result, index) => ({
          id: text(result.id) || `source-${index}`,
          name: text(result.name) || "Indexed source",
          where: text(result.where) || "indexed material",
          content: text(result.content),
          score: typeof result.score === "number" ? result.score : null,
        })),
      );
      setSearched(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not search the indexed sources.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6">
      <div className="max-w-3xl">
        <h2 className="font-display text-2xl font-semibold">Search the indexed source text</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Uses the teacher-scoped collection query API and returns the closest passages without
          generating an answer.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="source-query" className="sr-only">
            Search source material
          </label>
          <input
            id="source-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={2000}
            placeholder="Search a topic from your uploaded notes"
            className={cn(inputClass, "flex-1")}
          />
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Searching…" : "Search sources"}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {results.length ? (
        <div className="mt-7 space-y-4" aria-live="polite">
          {results.map((result, index) => (
            <article key={result.id} className="rounded-lg border border-border p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span className="rounded-full border border-border px-3 py-1">
                  Match {index + 1}
                </span>
                <span>{result.name}</span>
                <span>·</span>
                <span>{result.where}</span>
                {result.score !== null ? (
                  <>
                    <span className="flex-1" />
                    <span>{Math.round(result.score * 100)}% relevance</span>
                  </>
                ) : null}
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                {result.content || "The API returned source metadata without a text excerpt."}
              </p>
            </article>
          ))}
        </div>
      ) : searched && !busy ? (
        <div className="mt-7 rounded-lg border border-dashed border-border p-8 text-center">
          <h3 className="font-display text-lg font-semibold">No matching passages</h3>
          <p className="mt-2 text-sm text-text-secondary">
            Try a topic name, formula, or phrase that appears in the uploaded material.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Exported for tests: what a shelf says about a file it cannot search yet. */
export function DocumentList({
  documents,
  emptyTitle,
  onUpload,
  onOpen,
  onIndex,
  indexingNames,
}: {
  documents: TeacherDocument[];
  emptyTitle: string;
  onUpload: () => void;
  onOpen: (document: TeacherDocument) => void;
  /** Queue this file for indexing and follow the job. */
  onIndex: (document: TeacherDocument) => Promise<void>;
  /** Files with an indexing job this session is already watching. The tenant API
   *  cannot say which documents have work queued, so a job started here is the
   *  one thing that distinguishes "indexing" from "never indexed". */
  indexingNames: Set<string>;
}) {
  if (!documents.length) {
    return (
      <section className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
        <h2 className="font-display text-lg font-semibold">{emptyTitle}</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Add a supported file to this collection folder.
        </p>
        <Button className="mt-5" variant="outline" onClick={onUpload}>
          Choose a file
        </Button>
      </section>
    );
  }
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          document={document}
          indexing={indexingNames.has(document.name)}
          onOpen={onOpen}
          onIndex={onIndex}
        />
      ))}
    </div>
  );
}

export function DocumentCard({
  document,
  indexing,
  onOpen,
  onIndex,
}: {
  document: TeacherDocument;
  indexing: boolean;
  onOpen: (document: TeacherDocument) => void;
  onIndex: (document: TeacherDocument) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = indexing ? "processing" : document.status;
  const needsIndexing = status === "unindexed" || status === "error";

  return (
    <article className="rounded-lg border border-border p-5">
      <div className="flex items-center gap-2">
        <StatusChip status={status} />
        <span className="flex-1" />
        <span className="text-xs text-text-muted">{bytesLabel(document.sizeBytes)}</span>
      </div>
      <h2 className="mt-4 break-words font-display text-lg font-semibold">{document.name}</h2>
      {/* A section count of zero is not the news on a file that was never
          indexed — what it is waiting for is. */}
      <p className="mt-2 text-sm text-text-muted">
        {status === "unindexed"
          ? "Stored, but nothing from it is searchable yet"
          : status === "error"
            ? "Indexing did not finish — nothing from it is searchable"
            : `${document.chunks} indexed sections`}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onOpen(document)}>
          {document.previewAvailable ? "Preview document" : "Document details"}
        </Button>
        {needsIndexing ? (
          <Button
            variant="outline"
            disabled={busy}
            aria-busy={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onIndex(document);
              } catch (caught) {
                setError(
                  caught instanceof Error ? caught.message : "Could not queue this file for indexing.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Queueing…" : status === "error" ? "Retry indexing" : "Index now"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function SyllabusEditor({
  subject,
  syllabus,
  setSyllabus,
}: {
  subject: TeacherSubject;
  syllabus: SyllabusState;
  setSyllabus: (next: SyllabusState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SyllabusUnit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function extract() {
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/subjects/${encodeURIComponent(subject.slug)}/syllabus`, {
          method: "POST",
          headers: { Accept: "application/json" },
        }),
      );
      const structure = Array.isArray(payload.structure)
        ? (payload.structure as SyllabusUnit[])
        : [];
      setSyllabus({
        state: "ready",
        structure,
        updatedAt: text(payload.updatedAt) || null,
        error: "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not extract the syllabus.");
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setDraft(
      syllabus.structure.map((unit) => ({
        title: unit.title,
        topics: unit.topics.map((topic) => ({ name: topic.name })),
      })),
    );
    setEditing(true);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = draft.flatMap((unit) => {
      const titleValue = unit.title.trim();
      if (!titleValue) return [];
      return [
        {
          title: titleValue,
          topics: unit.topics
            .filter((topic) => topic.name.trim())
            .map((topic) => ({ name: topic.name.trim() })),
        },
      ];
    });
    if (!clean.length) {
      setError("Add at least one named unit.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/subjects/${encodeURIComponent(subject.slug)}/syllabus`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(clean),
        }),
      );
      setSyllabus({
        state: "ready",
        structure: clean,
        updatedAt: text(payload.updatedAt) || null,
        error: "",
      });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the syllabus.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 border-t border-border pt-8">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Editable syllabus structure</h2>
          <p className="mt-2 text-sm text-text-muted">Last saved: {fullDate(syllabus.updatedAt)}</p>
        </div>
        <span className="flex-1" />
        <Button variant="outline" onClick={() => void extract()} disabled={busy} aria-busy={busy}>
          {busy && !editing ? "Extracting…" : "Extract from indexed syllabus"}
        </Button>
        {syllabus.structure.length && !editing ? (
          <Button onClick={startEditing}>Edit structure</Button>
        ) : null}
      </div>

      {syllabus.state === "loading" ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <SkeletonCard key={index} lines={2} className="h-28" />
          ))}
        </div>
      ) : null}
      {syllabus.state === "error" ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {syllabus.error}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {editing ? (
        <form className="mt-6 space-y-4" onSubmit={save}>
          {draft.map((unit, unitIndex) => (
            <fieldset key={unitIndex} className="rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-medium">Unit {unitIndex + 1}</legend>
              <label className="block text-sm font-medium" htmlFor={`unit-title-${unitIndex}`}>
                Unit title
              </label>
              <input
                id={`unit-title-${unitIndex}`}
                className={cn(inputClass, "mt-2")}
                value={unit.title}
                onChange={(event) =>
                  setDraft((current) =>
                    current.map((item, index) =>
                      index === unitIndex ? { ...item, title: event.target.value } : item,
                    ),
                  )
                }
              />
              <label
                className="mt-4 block text-sm font-medium"
                htmlFor={`unit-topics-${unitIndex}`}
              >
                Topics
              </label>
              <textarea
                id={`unit-topics-${unitIndex}`}
                className={cn(inputClass, "mt-2 min-h-28 resize-y py-3")}
                value={unit.topics.map((topic) => topic.name).join("\n")}
                onChange={(event) =>
                  setDraft((current) =>
                    current.map((item, index) =>
                      index === unitIndex
                        ? {
                            ...item,
                            topics: event.target.value.split("\n").map((name) => ({ name })),
                          }
                        : item,
                    ),
                  )
                }
                aria-describedby={`unit-topics-hint-${unitIndex}`}
              />
              <p id={`unit-topics-hint-${unitIndex}`} className="mt-2 text-xs text-text-muted">
                One topic per line.
              </p>
              <Button
                className="mt-4"
                type="button"
                variant="danger"
                onClick={() =>
                  setDraft((current) => current.filter((_, index) => index !== unitIndex))
                }
              >
                Remove unit
              </Button>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft((current) => [...current, { title: "", topics: [] }])}
            >
              Add unit
            </Button>
            <span className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Saving…" : "Save structure"}
            </Button>
          </div>
        </form>
      ) : syllabus.state === "ready" && syllabus.structure.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {syllabus.structure.map((unit, index) => (
            <article key={`${unit.title}-${index}`} className="rounded-lg border border-border p-5">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
                Unit {index + 1}
              </p>
              <h3 className="mt-3 font-display text-lg font-semibold">{unit.title}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {unit.topics.map((topic) => (
                  <span
                    key={topic.name}
                    className="rounded-full border border-border px-3 py-1 text-xs"
                  >
                    {topic.name}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : syllabus.state === "ready" ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-6 text-center">
          <h3 className="font-display text-lg font-semibold">No editable units yet</h3>
          <p className="mt-2 text-sm text-text-secondary">
            Upload and index a syllabus, then extract its structure.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function TestChat({
  subject,
  messages,
  setMessages,
  syllabus,
}: {
  subject: TeacherSubject;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  syllabus: SyllabusState;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const suggestions = useMemo(() => {
    const topics = syllabus.structure
      .flatMap((unit) => unit.topics)
      .map((topic) => topic.name)
      .filter(Boolean);
    if (topics.length) {
      return topics.slice(0, 3).map((name) => `Explain ${name.toLowerCase()} simply`);
    }
    return ["What should a student learn first?", "Summarise the most important concept"];
  }, [syllabus.structure]);

  function fillSuggestion(prompt: string) {
    setQuestion(prompt);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = question.trim();
    if (!clean) {
      setError("Write a question first.");
      return;
    }
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: clean };
    const next = [...messages, userMessage];
    setMessages(next);
    setQuestion("");
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            question: clean,
            subjectSlug: subject.slug,
            history: messages
              .slice(-10)
              .map((message) => ({ role: message.role, content: message.content })),
          }),
        }),
      );
      const sources = list(payload.sources).map((source) => ({
        name: text(source.name) || "Source",
        where: text(source.where) || "Indexed material",
      }));
      setMessages([
        ...next,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: text(payload.answer) || "No answer was returned.",
          sources,
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not answer from this subject.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="rounded-lg border border-border">
        <div className="min-h-[360px] space-y-4 p-5" aria-live="polite">
          {messages.length ? (
            messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  "max-w-2xl rounded-lg p-4",
                  message.role === "user"
                    ? "ml-auto bg-text-primary text-text-inverse"
                    : "border border-border",
                )}
              >
                <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                {message.sources?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {message.sources.map((source, index) => (
                      <span
                        key={`${source.name}-${index}`}
                        className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary"
                      >
                        {source.name} · {source.where}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="flex min-h-[320px] items-center justify-center text-center">
              <div>
                <h2 className="font-display text-xl font-semibold">Test the student experience</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                  Ask a question and verify that the answer stays grounded in{" "}
                  {titleCase(subject.name)}.
                </p>
              </div>
            </div>
          )}
          {busy ? (
            <div className="rounded-lg border border-border p-4 text-sm text-text-muted">
              Answering from indexed material…
            </div>
          ) : null}
        </div>
        <form className="border-t border-border p-4" onSubmit={submit}>
          <label htmlFor="teacher-test-question" className="text-sm font-medium">
            Ask as a student
          </label>
          {!messages.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => fillSuggestion(prompt)}
                  className={cn(
                    "rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary transition hover:border-border-strong hover:bg-bg-secondary",
                    interactive,
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="teacher-test-question"
              className={inputClass}
              value={question}
              maxLength={2000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Explain the hardest idea in this subject."
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "teacher-test-question-error" : undefined}
            />
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
          {error ? (
            <p
              id="teacher-test-question-error"
              role="alert"
              className="mt-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </form>
      </div>
      <aside className="rounded-lg border border-border p-5">
        <h2 className="font-display text-lg font-semibold">Grounding check</h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Answers use only this subject&apos;s indexed material. Sources appear under each response.
        </p>
        {messages.length ? (
          <Button className="mt-5" variant="outline" onClick={() => setMessages([])}>
            Clear chat
          </Button>
        ) : null}
      </aside>
    </section>
  );
}

export function SubjectConfig({
  subject,
  documentCount,
  onRemoved,
}: {
  subject: TeacherSubject;
  documentCount: number;
  onRemoved: (message: string) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"delete" | "">("");
  const [error, setError] = useState("");

  async function remove() {
    if (confirmation.trim() !== subject.name) {
      setError("Type the exact subject name before permanent deletion.");
      return;
    }
    setBusy("delete");
    setError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/subjects/${encodeURIComponent(subject.slug)}?deleteFiles=1`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
      onRemoved(`${titleCase(subject.name)} and its files deleted`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the subject.");
      setBusy("");
    }
  }

  return (
    <div className="mt-6 max-w-2xl">
      <div>
        <h2 className="font-display text-xl font-semibold">Subject settings</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Review this subject and manage its stored source files.
        </p>
      </div>
      <div className="mt-5 rounded-lg border border-border p-4">
        <p className="font-medium">{titleCase(subject.name)}</p>
        <p className="mt-1 text-sm text-text-muted">
          {documentCount} files in {subject.folderPath}
        </p>
      </div>
      <section className="mt-6">
        <h3 className="font-display text-lg font-semibold text-destructive">
          Delete subject and files
        </h3>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Permanently removes the source folder, documents, cleaned text, and indexed sections.
        </p>
        <label htmlFor="subject-delete-confirmation" className="mt-4 block text-sm font-medium">
          Type {subject.name} to confirm
        </label>
        <input
          id="subject-delete-confirmation"
          className={cn(inputClass, "mt-2")}
          value={confirmation}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "subject-config-error" : undefined}
        />
        {error ? (
          <p id="subject-config-error" role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          className="mt-4"
          variant="danger"
          onClick={() => void remove()}
          disabled={Boolean(busy)}
        >
          {busy === "delete" ? "Deleting…" : "Delete subject and files"}
        </Button>
      </section>
    </div>
  );
}
