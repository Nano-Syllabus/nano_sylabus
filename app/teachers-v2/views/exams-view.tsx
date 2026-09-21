"use client";

import { useCallback, useEffect, useState, FormEvent, MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { aheadOfCount, gradeTopicEvaluation, scoreDistribution } from "@/lib/teacher-score-insights";
import { cn, titleCase } from "@/lib/utils";
import {
  WorkspaceState,
  DashboardState,
  TeacherSubject,
  TeacherDashboard,
  interactive,
  asRecord,
  text,
  numberValue,
  list,
  responsePayload,
  SkeletonBlock,
  ExamWorkspaceSkeleton,
  DashboardError,
} from "@/app/teachers-v2/workspace-shared";
import {
  ExamPaper,
  ExamBandDraft,
  ExamSubmission,
  SubmissionAnnotation,
  inputClass,
  fallbackExamBands,
  weightageBands,
  fullDate,
  normalizeExamPaper,
  normalizeSubmission,
  SubmissionsSkeleton,
  namedItems,
  insightName,
} from "@/app/teachers-v2/views/workspace-view-shared";

export function ExamsView({
  subjects,
  classrooms,
  initialPaperId,
  onAddSubject,
  onClassrooms,
  onDashboardRefresh,
}: {
  subjects: TeacherSubject[];
  classrooms: TeacherDashboard["classrooms"];
  initialPaperId?: string;
  onAddSubject: () => void;
  onClassrooms: () => void;
  onDashboardRefresh: () => void;
}) {
  const [state, setState] = useState<DashboardState>("loading");
  const [error, setError] = useState("");
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedId, setSelectedId] = useState(initialPaperId || "");
  const [creating, setCreating] = useState(false);
  const [subjectSlug, setSubjectSlug] = useState(subjects[0]?.slug || "");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [passMarks, setPassMarks] = useState(8);
  const [kind, setKind] = useState<ExamPaper["kind"]>("exam");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [suggestedBands, setSuggestedBands] = useState<ExamBandDraft[]>(fallbackExamBands);
  const [bands, setBands] = useState<ExamBandDraft[]>(fallbackExamBands);
  const [mimicQuestionBank, setMimicQuestionBank] = useState(true);
  const [availableChapters, setAvailableChapters] = useState<string[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [patternState, setPatternState] = useState<WorkspaceState>("loading");
  const [patternMessage, setPatternMessage] = useState("");
  const [paperDetailState, setPaperDetailState] = useState<WorkspaceState>("ready");
  const [paperDetailError, setPaperDetailError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/exams", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      );
      const next = list(payload.papers)
        .map(normalizeExamPaper)
        .filter((paper): paper is ExamPaper => paper !== null);
      setPapers(next);
      setSelectedId((current) =>
        current && next.some((paper) => paper.id === current) ? current : "",
      );
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load generated papers.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (initialPaperId) setSelectedId(initialPaperId);
  }, [initialPaperId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!subjectSlug) return;
    let cancelled = false;
    const activeSubject = subjects.find((subject) => subject.slug === subjectSlug);
    if (activeSubject) setTitle(`${activeSubject.name} — internal exam`);
    setPatternState("loading");
    setPatternMessage("");
    void fetch(`/api/teacher/subjects/${encodeURIComponent(subjectSlug)}/insights`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(responsePayload)
      .then((payload) => {
        if (cancelled) return;
        const weightage = asRecord(payload.weightage);
        const topicsPayload = asRecord(payload.topics);
        const chaptersPayload = asRecord(payload.chapters);
        const rawTopics = namedItems(topicsPayload, ["topics", "chapters", "items"]);
        const rawChapters = namedItems(chaptersPayload, ["chapters", "items"]);
        const nextChapters = [...rawTopics, ...rawChapters]
          .map(insightName)
          .filter(Boolean)
          .filter((name, index, values) => values.indexOf(name) === index);
        setAvailableChapters(nextChapters);
        setSelectedChapters([]);
        const nextBands = weightageBands(weightage);
        setSuggestedBands(nextBands);
        setBands(nextBands.map((band) => ({ ...band })));
        const suggestedPassMarks = numberValue(weightage.pass_marks);
        if (suggestedPassMarks > 0) setPassMarks(suggestedPassMarks);
        setPatternMessage(
          text(weightage.note) ||
            (weightage.grounded === false
              ? "No measured past-paper pattern yet. These are conventional defaults."
              : "Question mix and pass marks are grounded in this subject's Question Bank."),
        );
        setPatternState("ready");
      })
      .catch((caught) => {
        if (cancelled) return;
        setAvailableChapters([]);
        setSelectedChapters([]);
        setPatternMessage(
          caught instanceof Error ? caught.message : "Could not load the question-bank pattern.",
        );
        setPatternState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [subjectSlug, subjects]);

  const selectedSubject = subjects.find((subject) => subject.slug === subjectSlug) || null;
  const visiblePapers = papers.filter(
    (paper) =>
      paper.subjectSlug === subjectSlug ||
      (!!selectedSubject && paper.subject.toLowerCase() === selectedSubject.name.toLowerCase()),
  );
  const totalQuestions = bands.reduce((total, band) => total + band.count, 0);
  const totalMarks = bands.reduce((total, band) => total + band.count * band.marksEach, 0);

  function resetBands() {
    setBands(suggestedBands.map((band) => ({ ...band })));
    setError("");
  }

  function updateBand(id: string, update: Partial<Omit<ExamBandDraft, "id">>) {
    setBands((current) => current.map((band) => (band.id === id ? { ...band, ...update } : band)));
  }

  function addBand() {
    setBands((current) =>
      current.length >= 6
        ? current
        : [
            ...current,
            {
              id: crypto.randomUUID(),
              label: "New question band",
              questionType: "Short answer",
              count: 1,
              marksEach: 5,
            },
          ],
    );
  }

  const loadPaperDetail = useCallback(async (paperId: string) => {
    if (!paperId) return;
    setPaperDetailState("loading");
    setPaperDetailError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paperId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      );
      const detailed = normalizeExamPaper(payload.paper);
      if (!detailed) throw new Error("The paper detail response was incomplete.");
      setPapers((current) => [detailed, ...current.filter((paper) => paper.id !== detailed.id)]);
      setPaperDetailState("ready");
    } catch (caught) {
      setPaperDetailError(caught instanceof Error ? caught.message : "Could not load the paper.");
      setPaperDetailState("error");
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadPaperDetail(selectedId);
  }, [selectedId, loadPaperDetail]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !bands.length ||
      bands.some(
        (band) =>
          !band.label.trim() || !band.questionType.trim() || band.count < 1 || band.marksEach < 0.5,
      )
    ) {
      setError("Keep at least one complete band with a label, type, count, and marks.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const payload = await responsePayload(
        await fetch("/api/teacher/exams/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            subjectSlug,
            title,
            instruction,
            passMarks,
            kind,
            timeLimitMinutes,
            chapters: selectedChapters,
            mimicQuestionBank,
            useSuggestedWeightage: false,
            bands: bands.map(({ label, questionType, count, marksEach }) => ({
              label,
              questionType,
              count,
              marksEach,
            })),
          }),
        }),
      );
      const paper = normalizeExamPaper(payload.paper);
      if (!paper) throw new Error("The generated paper response was incomplete.");
      setPapers((current) => [paper, ...current.filter((item) => item.id !== paper.id)]);
      setSelectedId(paper.id);
      setTitle(`${selectedSubject?.name || "Subject"} — internal exam`);
      setInstruction("");
      onDashboardRefresh();
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : "Could not generate the exam.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (selectedId) {
    const paper = papers.find((item) => item.id === selectedId);
    if (paper) {
      if (paperDetailState === "loading" && !paper.questions.length)
        return <ExamWorkspaceSkeleton />;
      if (paperDetailState === "error" && !paper.questions.length)
        return (
          <DashboardError
            message={paperDetailError}
            onRetry={() => void loadPaperDetail(selectedId)}
          />
        );
      return (
        <ExamPaperView
          paper={paper}
          classrooms={classrooms.filter((classroom) => classroom.subjectSlug === paper.subjectSlug)}
          onBack={() => setSelectedId("")}
          onChanged={async (archived) => {
            await load();
            if (archived) setSelectedId("");
            onDashboardRefresh();
          }}
          onClassrooms={onClassrooms}
        />
      );
    }
  }

  if (state === "loading" && !papers.length) return <ExamWorkspaceSkeleton />;
  if (state === "error" && !papers.length)
    return <DashboardError message={error} onRetry={() => void load()} />;

  return (
    <>
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
          Practice API · teacher material
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold">Exams</h1>
        <p className="mt-2 text-text-secondary">
          Generate from indexed subjects, inspect reference answers, and publish to a matching
          classroom.
        </p>
      </div>

      {subjects.length ? (
        <form onSubmit={generate} className="mt-8 rounded-lg border border-border p-5 md:p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="exam-subject" className="text-sm font-medium">
                Subject
              </label>
              <select
                id="exam-subject"
                value={subjectSlug}
                onChange={(event) => setSubjectSlug(event.target.value)}
                className={cn(inputClass, "mt-2")}
              >
                {subjects.map((subject) => (
                  <option key={subject.slug} value={subject.slug}>
                    {titleCase(subject.name)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="exam-title" className="text-sm font-medium">
                Title
              </label>
              <input
                id="exam-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                autoComplete="off"
                placeholder="Midterm exam"
                className={cn(inputClass, "mt-2")}
              />
            </div>
          </div>
          <fieldset className="mt-5 rounded-lg border border-border p-4">
            <legend className="px-2 text-sm font-medium">Marks distribution</legend>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="font-display text-xl font-semibold">
                  {totalQuestions} question(s) · {totalMarks} marks
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Suggested from the Question Bank. Change anything—the suggestion is evidence, not
                  a rule.
                </p>
              </div>
              <span className="flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={resetBands}
                disabled={patternState === "loading"}
              >
                Reset to suggested
              </Button>
            </div>
            {patternState === "loading" ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <SkeletonBlock key={index} className="h-20" />
                ))}
              </div>
            ) : (
              <>
                <p
                  className={cn(
                    "mt-4 rounded-lg border p-3 text-sm",
                    patternState === "error"
                      ? "border-warning/40 text-warning"
                      : "border-border text-text-secondary",
                  )}
                >
                  {patternMessage}
                </p>
                <div className="mt-4 space-y-3">
                  {bands.map((band, index) => (
                    <div
                      key={band.id}
                      className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.35fr)_110px_120px_44px] md:items-end"
                    >
                      <div>
                        <label
                          htmlFor={`exam-band-label-${band.id}`}
                          className="text-xs font-medium uppercase tracking-wider text-text-muted"
                        >
                          Band
                        </label>
                        <input
                          id={`exam-band-label-${band.id}`}
                          value={band.label}
                          maxLength={40}
                          onChange={(event) => updateBand(band.id, { label: event.target.value })}
                          className={cn(inputClass, "mt-2")}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`exam-band-type-${band.id}`}
                          className="text-xs font-medium uppercase tracking-wider text-text-muted"
                        >
                          Type
                        </label>
                        <input
                          id={`exam-band-type-${band.id}`}
                          value={band.questionType}
                          maxLength={120}
                          onChange={(event) =>
                            updateBand(band.id, { questionType: event.target.value })
                          }
                          className={cn(inputClass, "mt-2")}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`exam-band-count-${band.id}`}
                          className="text-xs font-medium uppercase tracking-wider text-text-muted"
                        >
                          Count
                        </label>
                        <input
                          id={`exam-band-count-${band.id}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={band.count}
                          onChange={(event) =>
                            updateBand(band.id, {
                              count: Math.max(0, Math.min(20, Number(event.target.value) || 0)),
                            })
                          }
                          className={cn(inputClass, "mt-2")}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`exam-band-marks-${band.id}`}
                          className="text-xs font-medium uppercase tracking-wider text-text-muted"
                        >
                          Marks each
                        </label>
                        <input
                          id={`exam-band-marks-${band.id}`}
                          type="text"
                          inputMode="decimal"
                          value={band.marksEach}
                          onChange={(event) =>
                            updateBand(band.id, {
                              marksEach: Math.max(
                                0,
                                Math.min(100, Number(event.target.value) || 0),
                              ),
                            })
                          }
                          className={cn(inputClass, "mt-2")}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 px-0"
                        aria-label={`Remove band ${index + 1}`}
                        onClick={() =>
                          setBands((current) => current.filter((item) => item.id !== band.id))
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
                {!bands.length ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
                  >
                    Add at least one question band before generating.
                  </p>
                ) : null}
                <Button
                  className="mt-4"
                  type="button"
                  variant="outline"
                  onClick={addBand}
                  disabled={bands.length >= 6}
                >
                  Add band
                </Button>
              </>
            )}
          </fieldset>
          {availableChapters.length ? (
            <fieldset className="mt-5">
              <legend className="text-sm font-medium">
                Chapters{" "}
                <span className="font-normal text-text-muted">
                  (leave all unchecked for the whole subject)
                </span>
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableChapters.map((chapter) => {
                  const checked = selectedChapters.includes(chapter);
                  return (
                    <label
                      key={chapter}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm",
                        checked ? "border-border-strong bg-bg-secondary" : "border-border",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedChapters((current) =>
                            current.includes(chapter)
                              ? current.filter((item) => item !== chapter)
                              : [...current, chapter],
                          )
                        }
                      />
                      <span>{chapter}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={mimicQuestionBank}
              onChange={(event) => setMimicQuestionBank(event.target.checked)}
              className="mt-1 h-5 w-5 rounded border-border"
            />
            <span>
              <span className="block text-sm font-medium">Match my past-paper style</span>
              <span className="mt-1 block text-xs text-text-muted">
                Uses Question Bank examples for style, scope, and difficulty while answers stay
                grounded in Notes.
              </span>
            </span>
          </label>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-[180px_220px_180px_1fr]">
            <div>
              <label htmlFor="exam-pass-marks" className="text-sm font-medium">
                Pass marks
              </label>
              <input
                id="exam-pass-marks"
                type="text"
                inputMode="decimal"
                value={passMarks}
                onChange={(event) => setPassMarks(Math.max(0, Number(event.target.value) || 0))}
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="exam-kind" className="text-sm font-medium">
                Kind
              </label>
              <select
                id="exam-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as ExamPaper["kind"])}
                className={cn(inputClass, "mt-2")}
              >
                <option value="exam">Exam</option>
                <option value="class-test">Class test</option>
                <option value="assignment">Assignment</option>
                <option value="quiz">Quiz</option>
              </select>
            </div>
            <div>
              <label htmlFor="exam-time-limit" className="text-sm font-medium">
                Time limit (minutes)
              </label>
              <input
                id="exam-time-limit"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={timeLimitMinutes}
                onChange={(event) =>
                  setTimeLimitMinutes(Math.max(5, Math.min(300, Number(event.target.value) || 5)))
                }
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="exam-instruction" className="text-sm font-medium">
                Extra instruction <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="exam-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                maxLength={1000}
                placeholder="Focus on units 1–3 and include one worked calculation"
                className={cn(inputClass, "mt-2")}
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={creating || patternState === "loading" || !bands.length}
              aria-busy={creating}
            >
              {creating
                ? "Writing questions from your material…"
                : `Generate ${selectedSubject?.name || "subject"} paper`}
            </Button>
            <p className="text-xs text-text-muted">
              Uses the subject-safe Collection Generate API. Generation can take a little time.
            </p>
          </div>
        </form>
      ) : (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <h2 className="font-display text-xl font-semibold">Create a subject first</h2>
          <p className="mt-2 text-sm text-text-secondary">
            An exam must use one subject from your collection.
          </p>
          <Button className="mt-5" onClick={onAddSubject}>
            Add the subject first
          </Button>
        </div>
      )}

      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl font-semibold">Papers you have set</h2>
          <span className="text-sm text-text-muted">{visiblePapers.length}</span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Every paper generated for {selectedSubject?.name || "this subject"}, newest first. Open
          one to read, print, share, or publish.
        </p>
        {visiblePapers.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePapers.map((paper) => (
              <button
                key={paper.id}
                type="button"
                onClick={() => setSelectedId(paper.id)}
                className={cn(
                  "min-h-48 rounded-lg border border-border p-5 text-left transition hover:border-border-strong",
                  interactive,
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    {paper.subject}
                  </span>
                  <span className="flex-1" />
                  <span className="text-xs text-text-muted">{paper.totalMarks} marks</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{paper.title}</h3>
                <p className="mt-2 text-sm text-text-muted">
                  {paper.questions.length
                    ? `${paper.questions.length} generated questions`
                    : "Open to load full questions"}{" "}
                  · {paper.timeLimitMinutes} min · pass {paper.passMarks}
                </p>
                <p className="mt-6 text-sm font-medium">Open paper →</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
            <h3 className="font-display text-xl font-semibold">
              No {selectedSubject?.name || "subject"} papers yet
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              Generate one above—it lands here with its student link.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

export function ExamPaperView({
  paper,
  classrooms,
  onBack,
  onChanged,
  onClassrooms,
}: {
  paper: ExamPaper;
  classrooms: TeacherDashboard["classrooms"];
  onBack: () => void;
  onChanged: (archived?: boolean) => Promise<void>;
  onClassrooms: () => void;
}) {
  const [title, setTitle] = useState(paper.title);
  const [passMarks, setPassMarks] = useState(paper.passMarks);
  const [kind, setKind] = useState<ExamPaper["kind"]>(paper.kind);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(paper.timeLimitMinutes);
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id || "");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmPublishAll, setConfirmPublishAll] = useState(false);
  const usedMarks = paper.questions.reduce((sum, question) => sum + question.marks, 0);

  async function updatePaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ title, passMarks, kind, timeLimitMinutes }),
        }),
      );
      setMessage("Paper details saved");
      await onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the paper.");
    } finally {
      setSaving(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            classroomId,
            opensAt: opensAt ? new Date(opensAt).toISOString() : null,
            closesAt: closesAt ? new Date(closesAt).toISOString() : null,
            maxAttempts,
          }),
        }),
      );
      setMessage("Exam published to the classroom");
      await onChanged();
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Could not publish the exam.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishToAllClassrooms() {
    if (!classrooms.length) return;
    setSaving(true);
    setError("");
    setMessage("");
    const dates = {
      opensAt: opensAt ? new Date(opensAt).toISOString() : null,
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
    };
    try {
      const results = await Promise.allSettled(
        classrooms.map(async (classroom) =>
          responsePayload(
            await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/publish`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ classroomId: classroom.id, maxAttempts, ...dates }),
            }),
          ),
        ),
      );
      const published = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - published;
      if (failed)
        throw new Error(
          `Published to ${published} classrooms; ${failed} could not be updated. You can safely try again.`,
        );
      setMessage(`Exam published to all ${published} matching classrooms`);
      setConfirmPublishAll(false);
      await onChanged();
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Could not publish to every classroom.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    setSaving(true);
    setError("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
      await onChanged(true);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "Could not archive the paper.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className={cn("min-h-10 text-sm text-text-secondary hover:text-text-primary", interactive)}
      >
        ← Generated papers
      </button>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            {paper.subject}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold">{paper.title}</h1>
          <p className="mt-2 text-text-secondary">
            {paper.kind.replace("-", " ")} · {paper.totalMarks} marks · {paper.questions.length}{" "}
            questions · {paper.timeLimitMinutes} minutes · pass {paper.passMarks}
          </p>
        </div>
        <span className="flex-1" />
        {paper.shareUrl ? (
          <a
            href={paper.shareUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex min-h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium",
              interactive,
            )}
          >
            Open shareable paper
          </a>
        ) : null}
        <a
          href={`/teachers/print/${encodeURIComponent(paper.id)}`}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex min-h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium",
            interactive,
          )}
        >
          Print or save PDF
        </a>
      </div>

      {message ? (
        <div
          role="status"
          className="mt-6 rounded-lg border border-success/30 p-4 text-sm text-success"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-2xl font-semibold">Questions</h2>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                usedMarks === paper.totalMarks
                  ? "border-success/30 text-success"
                  : "border-warning/40 text-text-secondary",
              )}
            >
              {usedMarks} of {paper.totalMarks} marks used
            </span>
          </div>
          {usedMarks !== paper.totalMarks ? (
            <p role="status" className="mt-3 text-sm text-text-secondary">
              The Practice API returned questions worth {usedMarks} marks for a {paper.totalMarks}
              -mark paper.
            </p>
          ) : null}
          <div className="mt-5 space-y-4">
            {paper.questions.map((question, index) => (
              <article key={question.id} className="rounded-lg border border-border p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    Question {index + 1}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    {question.bandLabel || question.questionType}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    {question.marks} marks
                  </span>
                </div>
                <h3 className="mt-4 text-base font-medium leading-7">{question.text}</h3>
                {question.referenceAnswer ? (
                  <details className="mt-4 rounded-lg bg-bg-secondary p-4">
                    <summary className={cn("cursor-pointer text-sm font-medium", interactive)}>
                      Teacher reference answer
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                      {question.referenceAnswer}
                    </p>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <form onSubmit={publish} className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Publish to a classroom</h2>
            {classrooms.length ? (
              <>
                <label htmlFor="publish-classroom" className="mt-5 block text-sm font-medium">
                  Classroom
                </label>
                <select
                  id="publish-classroom"
                  value={classroomId}
                  onChange={(event) => setClassroomId(event.target.value)}
                  className={cn(inputClass, "mt-2")}
                >
                  {classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
                <label htmlFor="publish-opens" className="mt-4 block text-sm font-medium">
                  Opens <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="publish-opens"
                  type="datetime-local"
                  value={opensAt}
                  onChange={(event) => setOpensAt(event.target.value)}
                  className={cn(inputClass, "mt-2")}
                />
                <label htmlFor="publish-closes" className="mt-4 block text-sm font-medium">
                  Closes <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="publish-closes"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(event) => setClosesAt(event.target.value)}
                  className={cn(inputClass, "mt-2")}
                />
                <label htmlFor="publish-attempts" className="mt-4 block text-sm font-medium">
                  Attempts allowed
                </label>
                <input
                  id="publish-attempts"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={maxAttempts}
                  onChange={(event) =>
                    setMaxAttempts(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
                  }
                  className={cn(inputClass, "mt-2")}
                />
                <Button
                  className="mt-5 w-full"
                  type="submit"
                  disabled={saving || !classroomId}
                  aria-busy={saving}
                >
                  {saving ? "Publishing…" : "Publish exam"}
                </Button>
                {classrooms.length > 1 ? (
                  confirmPublishAll ? (
                    <div className="mt-4 rounded-lg bg-bg-secondary p-4">
                      <p className="text-sm text-text-secondary">
                        Use the same open and close times for all {classrooms.length}{" "}
                        {paper.subject} classrooms?
                      </p>
                      <div className="mt-3 flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setConfirmPublishAll(false)}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void publishToAllClassrooms()}
                          disabled={saving}
                        >
                          {saving ? "Publishing…" : `Publish to all ${classrooms.length}`}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      className="mt-3 w-full"
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmPublishAll(true)}
                    >
                      Give to all {classrooms.length} classrooms
                    </Button>
                  )
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-text-secondary">
                  Create a classroom for {paper.subject} before publishing this paper.
                </p>
                <Button className="mt-5" type="button" variant="outline" onClick={onClassrooms}>
                  Open classrooms
                </Button>
              </>
            )}
          </form>

          <form onSubmit={updatePaper} className="rounded-lg border border-border p-5">
            <h2 className="font-display text-xl font-semibold">Paper settings</h2>
            <label htmlFor="paper-title" className="mt-5 block text-sm font-medium">
              Title
            </label>
            <input
              id="paper-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              className={cn(inputClass, "mt-2")}
            />
            <label htmlFor="paper-pass-marks" className="mt-4 block text-sm font-medium">
              Pass marks
            </label>
            <input
              id="paper-pass-marks"
              type="text"
              inputMode="decimal"
              value={passMarks}
              onChange={(event) => setPassMarks(Math.max(0, Number(event.target.value) || 0))}
              className={cn(inputClass, "mt-2")}
            />
            <label htmlFor="paper-kind" className="mt-4 block text-sm font-medium">
              Kind
            </label>
            <select
              id="paper-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as ExamPaper["kind"])}
              className={cn(inputClass, "mt-2")}
            >
              <option value="exam">Exam</option>
              <option value="class-test">Class test</option>
              <option value="assignment">Assignment</option>
              <option value="quiz">Quiz</option>
            </select>
            <label htmlFor="paper-time-limit" className="mt-4 block text-sm font-medium">
              Time limit (minutes)
            </label>
            <input
              id="paper-time-limit"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={timeLimitMinutes}
              onChange={(event) =>
                setTimeLimitMinutes(Math.max(5, Math.min(300, Number(event.target.value) || 5)))
              }
              className={cn(inputClass, "mt-2")}
            />
            <Button
              className="mt-5"
              type="submit"
              variant="outline"
              disabled={saving || !title.trim()}
              aria-busy={saving}
            >
              Save details
            </Button>
          </form>

          <div className="rounded-lg border border-destructive/30 p-5">
            <h2 className="font-display text-xl font-semibold">Archive paper</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Remove it from active history without deleting saved records.
            </p>
            {confirmArchive ? (
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setConfirmArchive(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={() => void archive()} disabled={saving}>
                  {saving ? "Archiving…" : "Archive now"}
                </Button>
              </div>
            ) : (
              <Button className="mt-4" variant="outline" onClick={() => setConfirmArchive(true)}>
                Archive paper
              </Button>
            )}
          </div>
        </aside>
      </div>
      <PaperSubmissionWorkflow paper={paper} onDashboardRefresh={() => void onChanged()} />
    </>
  );
}

export function PaperSubmissionWorkflow({
  paper,
  onDashboardRefresh,
}: {
  paper: ExamPaper;
  onDashboardRefresh: () => void;
}) {
  const [state, setState] = useState<DashboardState>("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [mode, setMode] = useState<"list" | "typed" | "file" | "bulk">("list");
  const [saving, setSaving] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [bulkQuestionId, setBulkQuestionId] = useState(paper.questions[0]?.id || "");
  const [bulkDelta, setBulkDelta] = useState(0);
  const [bulkFeedback, setBulkFeedback] = useState("");
  const [scoreGroup, setScoreGroup] = useState("all");
  const [attemptView, setAttemptView] = useState<"latest" | "all">("latest");
  const scoreGroups = Array.from(new Set(submissions.map((submission) => submission.groupName)));
  const scoreSubmissions =
    scoreGroup === "all"
      ? submissions
      : submissions.filter((submission) => submission.groupName === scoreGroup);
  const distribution = scoreDistribution(scoreSubmissions.map((submission) => submission.grade));
  const visibleSubmissions =
    attemptView === "all"
      ? submissions
      : Array.from(
          submissions
            .reduce((latest, submission) => {
              const key = `${submission.assignmentId || "unassigned"}:${submission.studentId || submission.studentName}`;
              const current = latest.get(key);
              if (!current || submission.attemptNo > current.attemptNo) latest.set(key, submission);
              return latest;
            }, new Map<string, ExamSubmission>())
            .values(),
        );

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/submissions`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      );
      setSubmissions(
        list(payload.submissions)
          .map(normalizeSubmission)
          .filter((submission): submission is ExamSubmission => submission !== null),
      );
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load submissions.");
      setState("error");
    }
  }, [paper.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function gradeTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payloadAnswers = paper.questions.map((question) => ({
      questionId: question.id,
      answerText: answers[question.id]?.trim() || "",
    }));
    if (!payloadAnswers.some((answer) => answer.answerText)) {
      setError("Enter at least one answer.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ studentName, instruction, answers: payloadAnswers }),
        }),
      );
      setMessage("Typed answers graded and saved for teacher review");
      setMode("list");
      setStudentName("");
      setInstruction("");
      setAnswers({});
      await load();
      onDashboardRefresh();
    } catch (gradeError) {
      setError(gradeError instanceof Error ? gradeError.message : "Could not grade typed answers.");
    } finally {
      setSaving(false);
    }
  }

  async function gradeFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose an answer sheet first.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("student_name", studentName);
      form.append("instruction", instruction);
      await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/grade-file`, {
          method: "POST",
          body: form,
        }),
      );
      setMessage("Answer sheet graded and saved for teacher review");
      setMode("list");
      setStudentName("");
      setInstruction("");
      setFile(null);
      await load();
      onDashboardRefresh();
    } catch (gradeError) {
      setError(
        gradeError instanceof Error ? gradeError.message : "Could not grade the answer sheet.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishAll() {
    const waiting = submissions.filter((submission) => submission.reviewStatus !== "published");
    if (!waiting.length) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await Promise.all(
        waiting.map((submission) =>
          fetch(
            `/api/teacher/exams/${encodeURIComponent(paper.id)}/submissions/${encodeURIComponent(submission.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                status: "published",
                teacherNote: text(asRecord(submission.grade._review).teacher_note),
              }),
            },
          ).then(responsePayload),
        ),
      );
      setMessage(
        `${waiting.length} ${waiting.length === 1 ? "result" : "results"} published to students`,
      );
      await load();
      onDashboardRefresh();
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Could not publish all results.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function bulkAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = await responsePayload(
        await fetch(`/api/teacher/exams/${encodeURIComponent(paper.id)}/submissions/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            questionId: bulkQuestionId,
            scoreDelta: bulkDelta,
            feedback: bulkFeedback || undefined,
          }),
        }),
      );
      setMessage(`${numberValue(payload.updated)} submissions adjusted`);
      setMode("list");
      setBulkDelta(0);
      setBulkFeedback("");
      await load();
      onDashboardRefresh();
    } catch (adjustError) {
      setError(
        adjustError instanceof Error ? adjustError.message : "Could not adjust the question.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-12 border-t border-border pt-10">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">Submissions</h2>
          <p className="mt-2 text-sm text-text-secondary">
            AI grades first. You review, adjust and publish when ready.
          </p>
        </div>
        <span className="flex-1" />
        {submissions.some((submission) => submission.reviewStatus !== "published") ? (
          <Button variant="outline" onClick={() => void publishAll()} disabled={saving}>
            {saving
              ? "Publishing…"
              : `Publish all ${submissions.filter((submission) => submission.reviewStatus !== "published").length}`}
          </Button>
        ) : null}
        {submissions.length ? (
          <Button variant="outline" onClick={() => setMode(mode === "bulk" ? "list" : "bulk")}>
            Adjust a question for all
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => setMode(mode === "typed" ? "list" : "typed")}>
          Grade typed answers
        </Button>
        <Button onClick={() => setMode(mode === "file" ? "list" : "file")}>
          Grade answer sheet
        </Button>
      </div>

      {message ? (
        <div
          role="status"
          className="mt-5 rounded-lg border border-success/30 p-4 text-sm text-success"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {submissions.length ? (
        <section
          className="mt-6 rounded-lg border border-border p-5"
          aria-labelledby="score-distribution-title"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h3 id="score-distribution-title" className="font-display text-xl font-semibold">
                Score distribution
              </h3>
              <p className="mt-1 text-sm text-text-muted">
                {distribution.total} graded{" "}
                {distribution.total === 1 ? "submission" : "submissions"} in this view
              </p>
            </div>
            {scoreGroups.length > 1 ? (
              <div>
                <label htmlFor="score-group" className="sr-only">
                  Classroom score group
                </label>
                <select
                  id="score-group"
                  value={scoreGroup}
                  onChange={(event) => setScoreGroup(event.target.value)}
                  className={cn(inputClass, "min-w-52")}
                >
                  <option value="all">All groups</option>
                  {scoreGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>
            ) : scoreGroups[0] ? (
              <span className="rounded-full border border-border px-3 py-2 text-xs">
                {scoreGroups[0]}
              </span>
            ) : null}
          </div>
          {distribution.total ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {distribution.bands.map((band) => {
                const width = Math.round((band.count / distribution.total) * 100);
                return (
                  <div key={band.label} className="rounded-lg bg-bg-secondary p-4">
                    <div className="flex items-baseline gap-3">
                      <p className="min-w-0 flex-1 text-sm text-text-secondary">{band.label}</p>
                      <strong className="font-display text-xl">{band.count}</strong>
                    </div>
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-bg-primary"
                      aria-label={`${band.count} submissions in ${band.label}`}
                    >
                      <div
                        className="h-full rounded-full bg-text-primary"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-sm text-text-muted">
              No graded submissions exist in this group yet.
            </p>
          )}
        </section>
      ) : null}

      {mode === "typed" ? (
        <form onSubmit={gradeTyped} className="mt-6 rounded-lg border border-border p-5">
          <h3 className="font-display text-xl font-semibold">Grade typed answers</h3>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="typed-student-name" className="text-sm font-medium">
                Student name
              </label>
              <input
                id="typed-student-name"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                maxLength={160}
                autoComplete="name"
                placeholder="Student name"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="typed-grade-instruction" className="text-sm font-medium">
                Grading instruction <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="typed-grade-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                maxLength={1000}
                placeholder="Be strict on derivations"
                className={cn(inputClass, "mt-2")}
              />
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {paper.questions.map((question, index) => (
              <div key={question.id}>
                <label htmlFor={`typed-answer-${question.id}`} className="text-sm font-medium">
                  Question {index + 1} · {question.marks} marks
                </label>
                <p className="mt-1 text-sm text-text-muted">{question.text}</p>
                <textarea
                  id={`typed-answer-${question.id}`}
                  value={answers[question.id] || ""}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                  }
                  maxLength={20000}
                  placeholder="Student's answer"
                  className={cn(inputClass, "mt-2 min-h-28 py-3")}
                />
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("list")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? "Grading…" : "Grade answers"}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "file" ? (
        <form onSubmit={gradeFile} className="mt-6 rounded-lg border border-border p-5">
          <h3 className="font-display text-xl font-semibold">Grade answer sheet</h3>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="file-student-name" className="text-sm font-medium">
                Student name
              </label>
              <input
                id="file-student-name"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                maxLength={160}
                autoComplete="name"
                placeholder="Student name"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="answer-sheet-file" className="text-sm font-medium">
                PDF, JPG or PNG answer sheet
              </label>
              <input
                id="answer-sheet-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className={cn(inputClass, "mt-2 py-2")}
              />
            </div>
          </div>
          <label htmlFor="file-grade-instruction" className="mt-5 block text-sm font-medium">
            Grading instruction <span className="text-text-muted">(optional)</span>
          </label>
          <textarea
            id="file-grade-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            maxLength={1000}
            placeholder="Be strict on working steps"
            className={cn(inputClass, "mt-2 min-h-24 py-3")}
          />
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("list")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? "Reading and grading…" : "Upload and grade"}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "bulk" ? (
        <form onSubmit={bulkAdjust} className="mt-6 rounded-lg border border-border p-5">
          <h3 className="font-display text-xl font-semibold">
            Adjust one question for every submission
          </h3>
          <p className="mt-2 text-sm text-text-secondary">
            The change is bounded between zero and each question&apos;s maximum marks.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="bulk-question" className="text-sm font-medium">
                Question
              </label>
              <select
                id="bulk-question"
                value={bulkQuestionId}
                onChange={(event) => setBulkQuestionId(event.target.value)}
                className={cn(inputClass, "mt-2")}
              >
                {paper.questions.map((question, index) => (
                  <option key={question.id} value={question.id}>
                    Question {index + 1} · {question.marks} marks
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bulk-delta" className="text-sm font-medium">
                Add or remove marks
              </label>
              <input
                id="bulk-delta"
                type="text"
                inputMode="decimal"
                value={bulkDelta}
                onChange={(event) => setBulkDelta(Number(event.target.value) || 0)}
                className={cn(inputClass, "mt-2")}
              />
            </div>
          </div>
          <label htmlFor="bulk-feedback" className="mt-5 block text-sm font-medium">
            Replace feedback <span className="text-text-muted">(optional)</span>
          </label>
          <textarea
            id="bulk-feedback"
            value={bulkFeedback}
            onChange={(event) => setBulkFeedback(event.target.value)}
            maxLength={5000}
            className={cn(inputClass, "mt-2 min-h-20 py-3")}
          />{" "}
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("list")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !bulkQuestionId || bulkDelta === 0}
              aria-busy={saving}
            >
              {saving ? "Adjusting…" : "Apply to all"}
            </Button>
          </div>
        </form>
      ) : null}

      {state === "loading" && !submissions.length ? <SubmissionsSkeleton /> : null}
      {state === "error" && !submissions.length ? (
        <DashboardError message={error} onRetry={() => void load()} />
      ) : null}
      {state !== "loading" && submissions.length ? (
        <div className="mt-6 space-y-4">
          {submissions.some((submission) => submission.attemptCount > 1) ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-text-secondary">
                Showing {visibleSubmissions.length} of {submissions.length} saved attempts
              </p>
              <div className="inline-flex rounded-lg border border-border p-1">
                <button
                  type="button"
                  aria-pressed={attemptView === "latest"}
                  onClick={() => setAttemptView("latest")}
                  className={cn(
                    "min-h-10 rounded-md px-4 text-sm",
                    interactive,
                    attemptView === "latest"
                      ? "bg-text-primary text-text-inverse"
                      : "text-text-secondary",
                  )}
                >
                  Latest attempt
                </button>
                <button
                  type="button"
                  aria-pressed={attemptView === "all"}
                  onClick={() => setAttemptView("all")}
                  className={cn(
                    "min-h-10 rounded-md px-4 text-sm",
                    interactive,
                    attemptView === "all"
                      ? "bg-text-primary text-text-inverse"
                      : "text-text-secondary",
                  )}
                >
                  All attempts
                </button>
              </div>
            </div>
          ) : null}
          {visibleSubmissions.map((submission) => (
            <SubmissionReviewCard
              key={`${submission.id}-${submission.reviewStatus}-${numberValue(submission.grade.total_score)}`}
              paperId={paper.id}
              submission={submission}
              comparison={aheadOfCount(
                submissions
                  .filter((item) => item.groupName === submission.groupName)
                  .map((item) => item.grade),
                submission.grade,
              )}
              onSaved={async () => {
                await load();
                onDashboardRefresh();
              }}
            />
          ))}
        </div>
      ) : state !== "loading" && state !== "error" ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
          <h3 className="font-display text-xl font-semibold">No submissions yet</h3>
          <p className="mt-2 text-sm text-text-secondary">
            Publish this paper, grade typed answers, or upload an answer sheet.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function SubmissionReviewCard({
  paperId,
  submission,
  comparison,
  onSaved,
}: {
  paperId: string;
  submission: ExamSubmission;
  comparison: ReturnType<typeof aheadOfCount>;
  onSaved: () => Promise<void>;
}) {
  const results = list(submission.grade.results);
  const evaluation = gradeTopicEvaluation(submission.grade);
  const review = asRecord(submission.grade._review);
  const savedAnnotations = list(review.annotations).flatMap((item): SubmissionAnnotation[] => {
    const type = text(item.type);
    if (!text(item.id) || !["tick", "cross", "mark", "note"].includes(type)) return [];
    return [
      {
        id: text(item.id),
        type: type as SubmissionAnnotation["type"],
        page: Math.max(1, numberValue(item.page) || 1),
        x: Math.max(0, Math.min(1, numberValue(item.x))),
        y: Math.max(0, Math.min(1, numberValue(item.y))),
        value: text(item.value),
      },
    ];
  });
  const [status, setStatus] = useState<ExamSubmission["reviewStatus"]>(submission.reviewStatus);
  const [teacherNote, setTeacherNote] = useState(text(review.teacher_note));
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      results.map((result, index) => [
        text(result.question_id) || text(result.id) || String(index),
        numberValue(result.score),
      ]),
    ),
  );
  const [feedback, setFeedback] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      results.map((result, index) => [
        text(result.question_id) || text(result.id) || String(index),
        text(result.feedback),
      ]),
    ),
  );
  const [annotations, setAnnotations] = useState<SubmissionAnnotation[]>(savedAnnotations);
  const [annotationTool, setAnnotationTool] = useState<SubmissionAnnotation["type"]>("tick");
  const [annotationValue, setAnnotationValue] = useState("1");
  const [annotationPage, setAnnotationPage] = useState(1);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementInstruction, setReplacementInstruction] = useState("");
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(submission.reviewStatus !== "published");

  async function persistReview(nextStatus = status) {
    setSaving(true);
    setError("");
    try {
      await responsePayload(
        await fetch(
          `/api/teacher/exams/${encodeURIComponent(paperId)}/submissions/${encodeURIComponent(submission.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              status: nextStatus,
              teacherNote,
              annotations,
              results: results.map((result, index) => {
                const questionId = text(result.question_id) || text(result.id) || String(index);
                return {
                  questionId,
                  score: scores[questionId] || 0,
                  feedback: feedback[questionId] || "",
                };
              }),
            }),
          },
        ),
      );
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the review.");
    } finally {
      setSaving(false);
    }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistReview();
  }

  function addAnnotation(event: MouseEvent<HTMLButtonElement>) {
    if ((annotationTool === "mark" || annotationTool === "note") && !annotationValue.trim()) {
      setError(
        annotationTool === "mark"
          ? "Enter the mark to place on the scan."
          : "Write the page note first.",
      );
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setAnnotations((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: annotationTool,
        page: annotationPage,
        x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
        value:
          annotationTool === "tick"
            ? "✓"
            : annotationTool === "cross"
              ? "×"
              : annotationValue.trim(),
      },
    ]);
    setError("");
  }

  async function replaceScan() {
    if (!replacementFile) {
      setError("Choose a replacement answer sheet.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", replacementFile);
      form.append("instruction", replacementInstruction);
      await responsePayload(
        await fetch(
          `/api/teacher/exams/${encodeURIComponent(paperId)}/submissions/${encodeURIComponent(submission.id)}/replace-file`,
          { method: "POST", body: form },
        ),
      );
      setReplacementFile(null);
      setReplacementInstruction("");
      setConfirmReplacement(false);
      setAnnotations([]);
      setStatus("pending");
      await onSaved();
    } catch (replaceError) {
      setError(
        replaceError instanceof Error
          ? replaceError.message
          : "Could not replace the answer sheet.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn("flex min-h-16 w-full items-center gap-4 p-4 text-left", interactive)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-semibold">{submission.studentName}</h3>
          <p className="mt-1 text-xs text-text-muted">
            {submission.groupName} · Attempt {submission.attemptNo} of {submission.attemptCount} ·{" "}
            {submission.source} · {fullDate(submission.createdAt || null)}
            {comparison && comparison.comparedWith > 0
              ? ` · Ahead of ${comparison.aheadOf} of ${comparison.comparedWith} others in this group`
              : ""}
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs">
          {submission.reviewStatus}
        </span>
        <strong className="font-display text-lg">
          {numberValue(submission.grade.total_score)}/{numberValue(submission.grade.total_marks)}
        </strong>
      </button>
      {open ? (
        <form onSubmit={saveReview} className="border-t border-border p-5">
          {submission.answerSheetUrl ? (
            <section
              className="mb-5 rounded-lg border border-border p-4"
              aria-label="Answer sheet annotation workspace"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-lg font-semibold">Mark the answer sheet</h4>
                  <p className="mt-1 truncate text-xs text-text-muted">
                    {submission.answerSheetName || "Uploaded answer sheet"}
                  </p>
                </div>
                <a
                  href={submission.answerSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-lg border border-border-strong bg-bg-primary px-4 text-sm font-medium",
                    interactive,
                  )}
                >
                  Preview or download
                </a>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["tick", "cross", "mark", "note"] as const).map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    aria-pressed={annotationTool === tool}
                    onClick={() => setAnnotationTool(tool)}
                    className={cn(
                      "min-h-10 rounded-lg border px-4 text-sm capitalize",
                      interactive,
                      annotationTool === tool
                        ? "border-text-primary bg-text-primary text-text-inverse"
                        : "border-border text-text-secondary",
                    )}
                  >
                    {tool === "tick" ? "✓ Tick" : tool === "cross" ? "× Cross" : tool}
                  </button>
                ))}
                <span className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setAnnotations((current) => {
                      const index = current.map((item) => item.page).lastIndexOf(annotationPage);
                      return index < 0
                        ? current
                        : current.filter((_, itemIndex) => itemIndex !== index);
                    })
                  }
                  disabled={!annotations.some((item) => item.page === annotationPage)}
                >
                  Undo
                </Button>
              </div>
              {annotationTool === "mark" || annotationTool === "note" ? (
                <div className="mt-3">
                  <label
                    htmlFor={`annotation-value-${submission.id}`}
                    className="text-sm font-medium"
                  >
                    {annotationTool === "mark" ? "Mark to place" : "Page note"}
                  </label>
                  {annotationTool === "mark" ? (
                    <input
                      id={`annotation-value-${submission.id}`}
                      type="text"
                      inputMode="decimal"
                      value={annotationValue}
                      onChange={(event) => setAnnotationValue(event.target.value)}
                      maxLength={12}
                      className={cn(inputClass, "mt-2")}
                    />
                  ) : (
                    <textarea
                      id={`annotation-value-${submission.id}`}
                      value={annotationValue}
                      onChange={(event) => setAnnotationValue(event.target.value)}
                      maxLength={500}
                      rows={2}
                      className={cn(inputClass, "mt-2 py-3")}
                    />
                  )}
                </div>
              ) : null}
              <div className="mt-3 flex items-end gap-3">
                <div className="w-32">
                  <label
                    htmlFor={`annotation-page-${submission.id}`}
                    className="text-sm font-medium"
                  >
                    Page
                  </label>
                  <input
                    id={`annotation-page-${submission.id}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={annotationPage}
                    onChange={(event) =>
                      setAnnotationPage(Math.max(1, Math.min(500, Number(event.target.value) || 1)))
                    }
                    className={cn(inputClass, "mt-2")}
                  />
                </div>
                <p className="pb-3 text-xs text-text-muted">
                  Choose a tool, then click where it belongs.
                </p>
              </div>
              <button
                type="button"
                onClick={addAnnotation}
                className={cn(
                  "relative mt-4 block aspect-[3/4] w-full overflow-hidden rounded-lg border border-border bg-bg-secondary text-left",
                  interactive,
                )}
                aria-label={`Place ${annotationTool} annotation on page ${annotationPage}`}
              >
                {submission.answerSheetMimeType.startsWith("image/") ? (
                  <img
                    src={submission.answerSheetUrl}
                    alt="Student answer sheet"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <iframe
                    src={submission.answerSheetUrl}
                    title="Student answer sheet PDF"
                    className="pointer-events-none h-full w-full bg-white"
                  />
                )}
                {annotations
                  .filter((item) => item.page === annotationPage)
                  .map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold",
                        item.type === "tick"
                          ? "text-3xl text-success"
                          : item.type === "cross"
                            ? "text-4xl text-destructive"
                            : item.type === "mark"
                              ? "grid min-h-10 min-w-10 place-items-center rounded-full border-2 border-text-primary bg-bg-primary/90 px-2 text-lg"
                              : "max-w-48 rounded-lg border border-border-strong bg-bg-primary/95 p-2 text-sm font-medium",
                      )}
                      style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                    >
                      {item.value}
                    </span>
                  ))}
              </button>
              {annotations.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Saved marks ({annotations.length})</p>
                  {annotations.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg bg-bg-secondary px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        Page {item.page} · {item.type} · {item.value}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setAnnotations((current) =>
                            current.filter((annotation) => annotation.id !== item.id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-text-muted">
                  No handwritten-style annotations yet.
                </p>
              )}
              <div className="mt-5 border-t border-border pt-4">
                <h5 className="font-medium">Attach or replace scan</h5>
                <p className="mt-1 text-sm text-text-secondary">
                  The replacement is regraded with the existing Practice API. Previous scan
                  annotations are cleared.
                </p>
                <label
                  htmlFor={`replacement-file-${submission.id}`}
                  className="mt-3 block text-sm font-medium"
                >
                  PDF, JPG or PNG
                </label>
                <input
                  id={`replacement-file-${submission.id}`}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => {
                    setReplacementFile(event.target.files?.[0] || null);
                    setConfirmReplacement(false);
                  }}
                  className={cn(inputClass, "mt-2 py-2")}
                />
                <label
                  htmlFor={`replacement-instruction-${submission.id}`}
                  className="mt-3 block text-sm font-medium"
                >
                  Grading instruction <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id={`replacement-instruction-${submission.id}`}
                  value={replacementInstruction}
                  onChange={(event) => setReplacementInstruction(event.target.value)}
                  maxLength={1000}
                  className={cn(inputClass, "mt-2")}
                />
                {confirmReplacement ? (
                  <div className="mt-3 rounded-lg bg-bg-secondary p-4">
                    <p className="text-sm">
                      Replace the saved scan and reset this review to pending?
                    </p>
                    <div className="mt-3 flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConfirmReplacement(false)}
                        disabled={saving}
                      >
                        Keep current scan
                      </Button>
                      <Button type="button" onClick={() => void replaceScan()} disabled={saving}>
                        {saving ? "Replacing and grading…" : "Replace and regrade"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="mt-3"
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmReplacement(true)}
                    disabled={!replacementFile || saving}
                  >
                    Replace scan
                  </Button>
                )}
              </div>
            </section>
          ) : (
            <section className="mb-5 rounded-lg border border-dashed border-border p-4">
              <h4 className="font-medium">No scan attached</h4>
              <p className="mt-1 text-sm text-text-secondary">
                Attach a scan to this typed submission, then annotate it here.
              </p>
              <label
                htmlFor={`replacement-file-${submission.id}`}
                className="mt-3 block text-sm font-medium"
              >
                PDF, JPG or PNG
              </label>
              <input
                id={`replacement-file-${submission.id}`}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => {
                  setReplacementFile(event.target.files?.[0] || null);
                  setConfirmReplacement(false);
                }}
                className={cn(inputClass, "mt-2 py-2")}
              />
              {confirmReplacement ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmReplacement(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void replaceScan()} disabled={saving}>
                    {saving ? "Attaching and grading…" : "Attach and regrade"}
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-3"
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmReplacement(true)}
                  disabled={!replacementFile || saving}
                >
                  Attach scan
                </Button>
              )}
            </section>
          )}
          {evaluation.topics.length ||
          evaluation.strongTopics.length ||
          evaluation.weakTopics.length ? (
            <section
              className="mb-5 rounded-lg border border-border p-4"
              aria-label="Practice API chapter evaluation"
            >
              <h4 className="font-display text-lg font-semibold">Chapter evaluation</h4>
              <p className="mt-1 text-xs text-text-muted">
                Returned by the Practice API for this grading result.
              </p>
              {evaluation.topics.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {evaluation.topics.map((topic) => (
                    <div key={topic.name} className="rounded-lg bg-bg-secondary p-4">
                      <div className="flex items-baseline gap-3">
                        <p className="min-w-0 flex-1 truncate font-medium">{topic.name}</p>
                        <strong>
                          {topic.marks ? `${topic.earned}/${topic.marks}` : `${topic.percentage}%`}
                        </strong>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-primary">
                        <div
                          className="h-full rounded-full bg-text-primary"
                          style={{ width: `${topic.percentage}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs capitalize text-text-muted">
                        {topic.status.replaceAll("_", " ")}
                        {topic.lostWeightage ? ` · ${topic.lostWeightage}% paper weight lost` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {evaluation.strongTopics.length ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                      Strong topics
                    </p>
                    <p className="mt-2 text-sm">{evaluation.strongTopics.join(", ")}</p>
                  </div>
                ) : null}
                {evaluation.weakTopics.length ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                      Weak topics
                    </p>
                    <p className="mt-2 text-sm">{evaluation.weakTopics.join(", ")}</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
          <div className="space-y-4">
            {results.map((result, index) => {
              const questionId = text(result.question_id) || text(result.id) || String(index);
              return (
                <div key={questionId} className="rounded-lg bg-bg-secondary p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="font-medium">Question {index + 1}</h4>
                    <span className="flex-1" />
                    <label
                      htmlFor={`score-${submission.id}-${index}`}
                      className="text-xs text-text-muted"
                    >
                      Score / {numberValue(result.marks)}
                    </label>
                    <input
                      id={`score-${submission.id}-${index}`}
                      type="text"
                      inputMode="decimal"
                      value={scores[questionId] ?? 0}
                      onChange={(event) =>
                        setScores((current) => ({
                          ...current,
                          [questionId]: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className={cn(
                        "min-h-10 w-20 rounded-md border border-border bg-bg-primary px-3 text-sm",
                        interactive,
                      )}
                    />
                  </div>
                  {text(result.question) ? (
                    <p className="mt-3 text-sm">{text(result.question)}</p>
                  ) : null}
                  {text(result.student_answer) ? (
                    <details className="mt-3">
                      <summary className={cn("cursor-pointer text-sm", interactive)}>
                        Student answer
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                        {text(result.student_answer)}
                      </p>
                    </details>
                  ) : null}
                  <label
                    htmlFor={`feedback-${submission.id}-${index}`}
                    className="mt-3 block text-xs text-text-muted"
                  >
                    Feedback
                  </label>
                  <textarea
                    id={`feedback-${submission.id}-${index}`}
                    value={feedback[questionId] || ""}
                    onChange={(event) =>
                      setFeedback((current) => ({ ...current, [questionId]: event.target.value }))
                    }
                    maxLength={5000}
                    className={cn(inputClass, "mt-2 min-h-20 py-3")}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-[200px_1fr]">
            <div>
              <label htmlFor={`review-status-${submission.id}`} className="text-sm font-medium">
                Result visibility
              </label>
              <select
                id={`review-status-${submission.id}`}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ExamSubmission["reviewStatus"])
                }
                className={cn(inputClass, "mt-2")}
              >
                <option value="pending">Pending review</option>
                <option value="reviewed">Reviewed, keep private</option>
                <option value="published">Publish to student</option>
              </select>
            </div>
            <div>
              <label htmlFor={`teacher-note-${submission.id}`} className="text-sm font-medium">
                Draft teacher comment <span className="text-text-muted">(optional)</span>
              </label>
              <textarea
                id={`teacher-note-${submission.id}`}
                value={teacherNote}
                onChange={(event) => setTeacherNote(event.target.value)}
                maxLength={2000}
                className={cn(inputClass, "mt-2 min-h-20 py-3")}
              />
              <p className="mt-2 text-xs text-text-muted">
                Save as draft to keep it private. Publish when the result is ready.
              </p>
            </div>
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void persistReview("pending")}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? "Saving…" : "Save draft"}
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving
                ? "Saving review…"
                : status === "published"
                  ? "Save and publish"
                  : "Save review"}
            </Button>
          </div>
        </form>
      ) : null}
    </article>
  );
}
